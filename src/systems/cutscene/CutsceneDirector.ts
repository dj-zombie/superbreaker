import Phaser from 'phaser';
import { WORLD_IDS, type WorldId } from '../../art/backdrops';
import { HEIGHT, WIDTH } from '../../config';
import {
  Playhead,
  compile,
  pointAt,
  sampleFrame,
  type CompiledLine,
  type Cue,
  type CutsceneDef,
  type CutsceneFrame,
  type Timeline,
  type TransitionKind,
} from '../../core/cutscene';
import type { FxEngine } from '../../fx/FxEngine';
import { haptic } from '../../platform/haptics';
import { CardView } from '../../ui/cutscene/CardView';
import { DialogView } from '../../ui/cutscene/DialogView';
import { LetterboxView } from '../../ui/cutscene/LetterboxView';
import { SkipControl } from '../../ui/cutscene/SkipControl';
import { SceneWipes, type WipeStyle } from '../../ui/fx/wipes';
import { calm, richFx, themeFor } from '../../ui/theme';
import { audio, type VoiceHandle } from '../AudioSystem';
import type { BackdropSnapshot, ParallaxBackdrop } from '../ParallaxBackdrop';
import { ActorStage } from './ActorStage';
import { AmbientFields } from './AmbientFields';
import { CameraRig } from './CameraRig';
import { GradeFx } from './GradeFx';
import { PlateLayer } from './PlateLayer';

/** Objects at or above this depth draw on the UI camera; the rest on the world camera. */
export const UI_DEPTH = 1000;
/** Over the actors (ACTOR_DEPTH) and under the front ambient fields. */
const PLATE_DEPTH = 10;
/** A spoken line's hold lets go this long after the clip ends, so the next line doesn't crowd it. */
const VOICE_TAIL_MS = 250;
/** Letters per typing blip. */
const BLIP_EVERY = 2;

function multiply(a: number, b: number): number {
  const r = (((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255;
  const g = (((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255;
  const bl = ((a & 0xff) * (b & 0xff)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** A steady pitch per speaker, so blips tell voices apart. */
function voiceDetune(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 110;
}

export interface DirectorHost {
  scene: Phaser.Scene;
  backdrop: ParallaxBackdrop;
  fx: FxEngine;
  /** The camera the picture is drawn through: zoomed, rolled and graded. */
  world: Phaser.Cameras.Scene2D.Camera;
  /** The camera the frame, text and controls are drawn through: never moves. */
  ui: Phaser.Cameras.Scene2D.Camera;
  /** Called once, when the scene has played out or been skipped. */
  done(result: { skipped: boolean; handoff: BackdropSnapshot }): void;
}

/**
 * Runs one cutscene: compiles the script, keeps the playhead, and every frame samples the
 * timeline and hands each part of the frame to what draws it. Cues fire as the playhead passes
 * them. Seeking and skipping apply the sampled frame straight away, so the picture is always
 * exactly what the script says for that moment.
 */
export class CutsceneDirector {
  readonly timeline: Timeline;
  readonly playhead: Playhead;
  paused = false;
  private readonly camera: CameraRig;
  private readonly grade: GradeFx;
  private readonly stage: ActorStage;
  private readonly plates: PlateLayer;
  private readonly fields: AmbientFields;
  private readonly letterbox: LetterboxView;
  private readonly dialog: DialogView;
  private readonly card: CardView;
  readonly skipControl: SkipControl;
  private readonly wipes: SceneWipes;
  private readonly voices = new Map<CompiledLine, VoiceHandle>();
  private frame: CutsceneFrame;
  private heldMs = 0;
  private blipAcc = 0;
  private lowTint = 0xffffff;
  private backdropTint = -1;
  private music: CutsceneFrame['music'] = null;
  private lastFall = 0;
  private finished = false;

  constructor(
    private readonly host: DirectorHost,
    readonly def: CutsceneDef,
  ) {
    const { scene, world, ui, backdrop, fx } = host;
    this.timeline = compile(def, { calm: calm() });
    this.playhead = new Playhead(this.timeline);
    this.camera = new CameraRig(world);
    this.grade = new GradeFx(world, ui, UI_DEPTH, (tint) => {
      this.lowTint = tint;
      this.stage.tint(tint);
    });
    this.stage = new ActorStage(scene, def.cast ?? {}, { world: () => backdrop.current });
    // A story plate covers the stage; front fields still drift over it.
    this.plates = new PlateLayer(scene, world, () => PLATE_DEPTH);
    this.fields = new AmbientFields(fx, world, (b) => backdrop.bandDepth(b));
    this.letterbox = new LetterboxView(scene, ui, UI_DEPTH + 1);
    this.card = new CardView(scene, () => this.worldTheme(), UI_DEPTH + 20);
    this.dialog = new DialogView(scene, ui, def.cast ?? {}, () => this.worldTheme(), UI_DEPTH + 10);
    this.skipControl = new SkipControl(scene, ui, UI_DEPTH + 40);
    this.wipes = new SceneWipes(scene, { camera: ui, depth: UI_DEPTH + 30 });
    this.frame = sampleFrame(this.timeline, 0, { calm: calm() });
    this.apply(0);
  }

  /** The skip policy, with the save's record of what was seen. */
  canSkip(seen: boolean): boolean {
    if (this.def.skip === 'never') return false;
    if (this.def.skip === 'after-seen') return seen;
    return true;
  }

  /** The UI theme for the world on screen now. */
  private worldTheme(): WorldId {
    const id = this.host.backdrop.current;
    return (WORLD_IDS as readonly string[]).includes(id) ? (id as WorldId) : 'hell';
  }

  get time(): number {
    return this.playhead.time;
  }

  /** The current hold asks for a tap. */
  get waiting(): boolean {
    return this.playhead.held?.kind === 'tap';
  }

  update(dtMs: number): void {
    if (this.finished) return;
    if (!this.paused) {
      this.releaseVoiceHold(dtMs);
      for (const cue of this.playhead.tick(dtMs)) this.fire(cue);
    }
    this.frame = sampleFrame(this.timeline, this.playhead.time, { calm: calm() });
    this.apply(dtMs);
    if (this.playhead.done && !this.paused) this.finish(false);
  }

  /**
   * A tap: let a held line go, or finish typing the line on screen, or cut a lingering line short.
   * Returns false when there was nothing to hurry, so the caller can show the skip hint.
   */
  advance(): boolean {
    if (this.finished) return false;
    const held = this.playhead.held;
    const d = this.frame.dialog;
    if (held) {
      if (held.line) this.voices.get(held.line)?.stop();
      this.playhead.release();
      this.heldMs = 0;
      return true;
    }
    if (d && !d.complete) {
      this.fireAll(this.playhead.advanceTo(d.line.at + d.line.line.revealMs));
      return true;
    }
    if (d && this.playhead.time < d.line.doneAt) {
      this.voices.get(d.line)?.stop();
      this.fireAll(this.playhead.advanceTo(d.line.doneAt));
      return true;
    }
    return false;
  }

  /** Jumps to the end: everything the scene leaves behind is put in place at once. */
  skip(): void {
    if (this.finished) return;
    this.playhead.skip();
    this.stopVoices();
    this.wipes.clear();
    this.frame = sampleFrame(this.timeline, this.playhead.time, { calm: calm() });
    this.apply(0);
    this.finish(true);
  }

  /** Dev: to a time in ms, or a label. No cues fire on the way. */
  seek(to: number | string): number {
    const t = typeof to === 'string' ? (this.timeline.labels.get(to) ?? this.playhead.time) : to;
    this.stopVoices();
    this.wipes.clear();
    this.playhead.seek(t);
    this.heldMs = 0;
    this.frame = sampleFrame(this.timeline, this.playhead.time, { calm: calm() });
    this.apply(0);
    return this.playhead.time;
  }

  private releaseVoiceHold(dtMs: number): void {
    const held = this.playhead.held;
    if (!held) {
      this.heldMs = 0;
      return;
    }
    this.heldMs += dtMs;
    if (held.kind !== 'voice') return;
    const v = held.line ? this.voices.get(held.line) : undefined;
    const ok =
      v && v.durationMs > 0
        ? v.ended && this.heldMs >= VOICE_TAIL_MS
        : this.heldMs >= held.fallbackMs;
    if (ok) {
      this.playhead.release();
      this.heldMs = 0;
    }
  }

  private fireAll(cues: Cue[]): void {
    for (const c of cues) this.fire(c);
  }

  private fire(cue: Cue): void {
    const tl = this.timeline;
    switch (cue.kind) {
      case 'sfx':
        audio.sfx(cue.step.key, cue.step.volume ?? 0.5, cue.step.detune ?? 0);
        return;
      case 'voice': {
        const h = audio.voice(cue.step.key, cue.step.volume ?? 1);
        if (cue.line) this.voices.set(cue.line, h);
        return;
      }
      case 'fx': {
        const [x, y] = pointAt(tl, cue.step.at, cue.at);
        this.host.fx.play(cue.step.fx, x * WIDTH, y * HEIGHT, {
          scale: cue.step.scale,
          tint: cue.step.tint,
          intensity: cue.step.intensity,
          angle: cue.step.angle,
          quiet: true,
        });
        return;
      }
      case 'shake':
        this.camera.shake(cue.step.ms, cue.step.intensity);
        return;
      case 'flash':
        this.letterbox.flash(cue.step.ms, cue.step.color, cue.step.amount);
        return;
      case 'punch':
        this.camera.punch(cue.amount, cue.ms);
        return;
      case 'whip':
        this.camera.whip(cue.ms);
        return;
      case 'emote':
        this.stage.emote(cue.id, cue.emote);
        return;
      case 'transition':
        this.transition(cue.step.kind, cue.step.ms ?? 600, cue.step.color);
        return;
      case 'haptic':
        haptic(cue.step.kind);
        return;
      case 'label':
        return;
    }
  }

  /** A change drawn over the picture. The world styles fall back to a dip on a plain setup. */
  private transition(kind: TransitionKind, ms: number, color?: number): void {
    const t = themeFor(this.worldTheme());
    if (kind === 'flash') {
      this.letterbox.flash(ms, color ?? 0xffffff, 0.9);
      return;
    }
    const plain = calm() || !richFx();
    const style: WipeStyle = plain && kind !== 'dip' ? 'dip' : kind;
    this.wipes.play(style, t, color ?? t.palette.base, ms);
  }

  private apply(dtMs: number): void {
    const f = this.frame;
    const backdrop = this.host.backdrop;

    if (f.scenery && f.scenery.id !== backdrop.current)
      backdrop.switchTo(f.scenery.id, f.scenery.pace ?? f.backdrop.pace);
    if (f.backdrop.fall > 0 && f.backdrop.fall !== this.lastFall) backdrop.fall(f.backdrop.fall);
    this.lastFall = f.backdrop.fall;
    backdrop.drive(f.backdrop.pace);
    backdrop.setSway(f.backdrop.sway);
    backdrop.setGlow(f.backdrop.glow);

    this.grade.apply(f.grade);
    const tint = multiply(f.backdrop.tint, this.lowTint);
    if (tint !== this.backdropTint) {
      this.backdropTint = tint;
      backdrop.setTint(tint);
    }

    this.camera.apply(f.camera, dtMs);
    this.stage.apply(f.actors, dtMs);
    this.plates.apply(f.plates);
    this.fields.apply(f.ambient);

    if (f.music !== this.music) {
      this.music = f.music;
      if (f.music) audio.sceneBed(f.music.bed, { fadeMs: f.music.ms, volume: f.music.volume });
    }

    this.letterbox.apply(f.letterbox, f.fade, dtMs);
    const revealed = this.dialog.apply(
      f.dialog,
      this.waiting,
      this.letterbox.reach,
      (id) => this.anchor(id),
      dtMs,
    );
    if (revealed > 0 && f.dialog) this.blip(f.dialog.line, revealed);
    this.card.apply(f.card);
    this.skipControl.apply(dtMs, this.letterbox.reach);
    this.sortCameras();
  }

  /** Where an actor's head is on the UI camera, for a speech bubble. */
  private anchor(id: string): { x: number; y: number } | undefined {
    const at = this.stage.where(id);
    if (!at) return undefined;
    const world = this.host.world;
    const ui = this.host.ui;
    // Through the moving camera to the screen (about its middle), then back through the still one.
    const dx = at.x - world.midPoint.x;
    const dy = at.top - world.midPoint.y;
    const roll = (world as unknown as { rotation: number }).rotation;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const sx = (dx * cos - dy * sin) * world.zoom;
    const sy = (dx * sin + dy * cos) * world.zoom;
    return { x: ui.midPoint.x + sx / ui.zoom, y: ui.midPoint.y + sy / ui.zoom };
  }

  private blip(line: CompiledLine, letters: number): void {
    if (line.voice || line.blip === false || calm()) return;
    const who = line.who === 'narrator' ? undefined : this.def.cast?.[line.who];
    const key =
      typeof line.blip === 'string'
        ? line.blip
        : (who?.blip ?? (line.who === 'narrator' ? undefined : 'ui_pip'));
    if (!key) return;
    this.blipAcc += letters;
    if (this.blipAcc < BLIP_EVERY) return;
    this.blipAcc = 0;
    audio.blip(key, 0.1, voiceDetune(line.who));
  }

  /**
   * The world camera skips the UI and the UI camera skips the world. New objects appear all the
   * time (particles, actors, the backdrop's crossfades), so the split is by depth, every frame.
   */
  private sortCameras(): void {
    const world = this.host.world;
    const ui = this.host.ui;
    for (const o of this.host.scene.children.list) {
      const go = o as Phaser.GameObjects.GameObject & { depth: number };
      const cam = go.depth >= UI_DEPTH ? world : ui;
      if ((go.cameraFilter & cam.id) === 0) cam.ignore(go);
    }
  }

  private stopVoices(): void {
    for (const v of this.voices.values()) v.stop(0);
    this.voices.clear();
  }

  private finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.fields.stopAll();
    this.host.done({ skipped, handoff: this.host.backdrop.snapshot() });
  }

  destroy(): void {
    this.stopVoices();
    this.camera.destroy();
    this.grade.destroy();
    this.stage.destroy();
    this.plates.destroy();
    this.dialog.destroy();
    this.card.destroy();
    this.skipControl.destroy();
    this.wipes.destroy();
  }
}
