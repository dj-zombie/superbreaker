import Phaser from 'phaser';
import { SCENERY_IDS, type SceneryId } from '../art/backdrops';
import { dropSheet, loadSheet } from '../art/sheets';
import { BOSSES } from '../bosses';
import { RENDER_ZOOM, HEIGHT, SCENES, WIDTH } from '../config';
import { sceneBetween, type CampaignStep, type SceneEntry } from '../core/Campaign';
import { compile, type CutsceneDef } from '../core/cutscene';
import { cutsceneDef } from '../cutscenes';
import { FxEngine } from '../fx';
import { onPadButton, PadButton } from '../platform/gamepad';
import { save } from '../services';
import { CutsceneDirector } from '../systems/cutscene/CutsceneDirector';
import { ParallaxBackdrop, type BackdropSnapshot } from '../systems/ParallaxBackdrop';
import { FrameMonitor } from '../systems/Quality';
import { transitionTo, transitioning } from '../ui/fx/transitions';
import { onBack } from '../ui/nav';
import { BaseScene } from './BaseScene';

/** Where a finished cutscene goes: a scene and what to start it with. The handoff is added. */
export interface CutsceneNext {
  scene: string;
  data?: Record<string, unknown>;
}

export interface CutsceneData {
  id: string;
  then?: CutsceneNext;
  /** The backdrop of the screen it was started from, to carry on without a cut. */
  handoff?: BackdropSnapshot;
  /** Dev: start this far in, in ms, or at a label. */
  at?: number | string;
}

/** The registry key Preload stores the index file's cutscene entries under. */
export const CUTSCENES_REG = 'cutscenes';

/** The cutscene not yet seen that plays between two campaign steps, if any. */
export function storyBetween(
  scene: Phaser.Scene,
  from: CampaignStep | undefined,
  to: CampaignStep | undefined,
): string | undefined {
  const entries = (scene.registry.get(CUTSCENES_REG) as SceneEntry[] | undefined) ?? [];
  return sceneBetween(from, to, entries, (id) => save.state.seenScenes.includes(id));
}

/**
 * Leaves `scene` for `next` through the cutscene `id`. `handoff` is the backdrop on screen, for
 * a scene that takes it over without a cut; without one it starts behind the world's transition.
 */
export function playCutscene(
  scene: Phaser.Scene,
  id: string,
  next: CutsceneNext,
  opts: { handoff?: BackdropSnapshot; stop?: string[] } = {},
): void {
  const data: CutsceneData = { id, then: next, handoff: opts.handoff };
  transitionTo(scene, SCENES.cutscene, data, {
    stop: opts.stop,
    style: opts.handoff ? 'continuous' : 'theme',
  });
}

/** A press shorter than this is a tap; holding past it starts filling the skip ring. */
const TAP_MS = 220;
/** How long the ring takes to fill once it starts. */
const SKIP_HOLD_MS = 600;

/** The dev handle, like `window.fxLab`. */
export interface CutsceneDevApi {
  play(id: string, at?: number | string): void;
  seek(to: number | string): number;
  pause(): void;
  resume(): void;
  step(ms: number): number;
  skip(): void;
  labels(): Record<string, number>;
  time(): number;
  length(): number;
}

/**
 * Plays one cutscene over the parallax backdrop. The picture is drawn through the main camera,
 * which the script moves and grades; letterbox, text and controls through a second camera that
 * never moves. A tap hurries the line on screen; holding skips the whole scene, when allowed.
 */
export class Cutscene extends BaseScene {
  private def!: CutsceneDef;
  private info!: CutsceneData;
  private director?: CutsceneDirector;
  private backdrop!: ParallaxBackdrop;
  private fx!: FxEngine;
  private frameMonitor!: FrameMonitor;
  private pressAt = -1;
  private leaving = false;
  private skippable = false;

  constructor() {
    super(SCENES.cutscene);
  }

  init(data: CutsceneData): void {
    this.info = data;
    const def = cutsceneDef(data.id);
    if (!def) throw new Error(`no cutscene "${data.id}"`);
    this.def = def;
    this.director = undefined;
    this.pressAt = -1;
    this.leaving = false;
  }

  /** The scenery on screen when it starts. */
  private opening(): SceneryId {
    const o = this.def.opens.scenery;
    if (o !== 'inherit') return o;
    const w = this.info.handoff?.world;
    if (w && (SCENERY_IDS as readonly string[]).includes(w)) return w;
    return compile(this.def).scenery[0]?.value.id ?? this.def.closes.scenery;
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.opening());
    const a = this.def.assets ?? {};
    const at = (path: string) => `assets/${path}`;
    for (const img of a.images ?? [])
      if (!this.textures.exists(img.key)) this.load.image(img.key, at(img.path));
    // The scene's own animation frames are big; it lets go of the ones it loaded when it ends.
    const sheets: string[] = [];
    const sheet = (key: string, path: string, frame?: { frameWidth?: number; frameHeight?: number }) => {
      if (this.textures.exists(key)) return;
      loadSheet(this.load, key, at(path), frame);
      sheets.push(key);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of sheets) dropSheet(this, key);
    });
    for (const s of a.sheets ?? []) sheet(s.key, s.path, s);
    for (const list of [a.voice, a.sfx, a.music]) {
      for (const s of list ?? [])
        if (!this.cache.audio.exists(s.key)) this.load.audio(s.key, at(s.path));
    }
    for (const actor of Object.values(this.def.cast ?? {})) {
      const m = /^boss:(.+)$/.exec(actor.sprite ?? '');
      const boss = m ? BOSSES[m[1] as keyof typeof BOSSES]?.sprite : undefined;
      if (boss) sheet(boss.key, boss.path, boss);
    }
  }

  create(): void {
    this.frameMonitor = new FrameMonitor(this.game);
    const world = this.setupCamera();
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'cutscene-ui');
    const layout = () => {
      ui.setSize(this.scale.width, this.scale.height)
        .setZoom(RENDER_ZOOM)
        .centerOn(WIDTH / 2, HEIGHT / 2);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, layout, this),
    );

    const open = this.opening();
    this.backdrop = new ParallaxBackdrop(
      this,
      open,
      this.def.opens.pace ?? this.info.handoff?.pace ?? 1,
    );
    if (this.info.handoff) this.backdrop.restore(this.info.handoff);
    this.fx = new FxEngine(this, {
      world: open,
      hooks: { scenery: (k) => this.backdrop.flash(k) },
    });

    this.director = new CutsceneDirector(
      {
        scene: this,
        backdrop: this.backdrop,
        fx: this.fx,
        world,
        ui,
        done: (r) => this.leave(r.skipped, r.handoff),
      },
      this.def,
    );
    const later = new Set<SceneryId>(this.director.timeline.scenery.map((m) => m.value.id));
    later.add(this.def.closes.scenery);
    later.delete(open);
    this.backdrop.prefetch([...later]);

    this.skippable = this.director.canSkip(save.state.seenScenes.includes(this.def.id));
    this.wireInput();
    if (this.info.at !== undefined) this.director.seek(this.info.at);
    if (import.meta.env.DEV) this.exposeDev();
  }

  private wireInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.press());
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
    const kb = this.input.keyboard;
    for (const key of ['SPACE', 'ENTER']) {
      kb?.on(`keydown-${key}`, (e: KeyboardEvent) => !e.repeat && this.press());
      kb?.on(`keyup-${key}`, () => this.release());
    }
    onBack(this, () => this.trySkip());
    const off = onPadButton((button, down) => {
      if (!this.sys.isActive()) return;
      if (button === PadButton.south) {
        if (down) this.press();
        else this.release();
      } else if (down && (button === PadButton.start || button === PadButton.east)) this.trySkip();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private press(): void {
    if (this.leaving || transitioning(this)) return;
    this.pressAt = this.time.now;
    if (this.skippable) this.director?.skipControl.poke();
  }

  private release(): void {
    if (this.pressAt < 0) return;
    const held = this.time.now - this.pressAt;
    this.pressAt = -1;
    this.director?.skipControl.setFill(0);
    if (held < TAP_MS && !this.director?.advance() && this.skippable)
      this.director?.skipControl.poke();
  }

  private trySkip(): void {
    if (!this.skippable || this.leaving) return;
    this.director?.skip();
  }

  override update(_time: number, delta: number): void {
    this.frameMonitor.update();
    const d = this.director;
    if (!d) return;
    if (this.pressAt >= 0 && this.skippable && !this.leaving) {
      const k = (this.time.now - this.pressAt - TAP_MS) / SKIP_HOLD_MS;
      d.skipControl.setFill(Math.max(0, k));
      if (k >= 1) {
        this.pressAt = -1;
        d.skip();
        return;
      }
    }
    this.fx.world = this.backdrop.current;
    d.update(Math.min(delta, 50));
  }

  /** Marks the scene seen and hands over to what comes next, carrying the backdrop. */
  private leave(skipped: boolean, handoff: BackdropSnapshot): void {
    if (this.leaving) return;
    this.leaving = true;
    if (!save.state.seenScenes.includes(this.def.id))
      save.update((s) => s.seenScenes.push(this.def.id));
    const next = this.info.then ?? { scene: SCENES.title };
    const style = skipped ? 'dissolve' : this.def.closes.handoff;
    transitionTo(this, next.scene, { ...next.data, handoff }, { style });
  }

  private exposeDev(): void {
    const api: CutsceneDevApi = {
      play: (id, at) => this.scene.restart({ id, then: this.info.then, at } satisfies CutsceneData),
      seek: (to) => this.director?.seek(to) ?? 0,
      pause: () => {
        if (this.director) this.director.paused = true;
      },
      resume: () => {
        if (this.director) this.director.paused = false;
      },
      step: (ms) => {
        const d = this.director;
        if (!d) return 0;
        return d.seek(d.time + ms);
      },
      skip: () => this.director?.skip(),
      labels: () => Object.fromEntries(this.director?.timeline.labels ?? []),
      time: () => this.director?.time ?? 0,
      length: () => this.director?.timeline.lengthMs ?? 0,
    };
    (window as unknown as { cutscene?: CutsceneDevApi }).cutscene = api;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete (window as unknown as { cutscene?: CutsceneDevApi }).cutscene;
    });
  }
}
