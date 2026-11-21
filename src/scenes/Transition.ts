import Phaser from 'phaser';
import { SCENES } from '../config';
import { audio } from '../systems/AudioSystem';
import { SceneWipes } from '../ui/fx/wipes';
import { calm, theme } from '../ui/theme';
import { BaseScene } from './BaseScene';

/**
 * How the change looks. `theme` covers in the world's style. `continuous` and `dissolve` never
 * cover: the next scene starts under this one, which fades away over it. Use them when both
 * show the same backdrop (handed over with a BackdropSnapshot), so only what differs changes.
 */
export type TransitionStyle = 'theme' | 'continuous' | 'dissolve';

export interface TransitionRequest {
  from: Phaser.Scene;
  key: string;
  data?: object;
  /** Other scenes to stop while covered, e.g. the HUD under a results overlay. */
  stop?: string[];
  style?: TransitionStyle;
}

/** How long the outgoing scene takes to fade off the incoming one, by style (ms). */
const FADE_MS: Record<Exclude<TransitionStyle, 'theme'>, number> = { continuous: 260, dissolve: 900 };

/**
 * Always-on top layer that covers one screen and reveals the next in the world's style: a burn
 * wipe in Hell, a closing shroud in the Crypt, a pixelated glitch in the Mainframe.
 */
export class Transition extends BaseScene {
  private busy = false;
  private wipes!: SceneWipes;

  constructor() {
    super({ key: SCENES.transition, active: true });
  }

  create(): void {
    this.setupCamera();
    this.wipes = new SceneWipes(this).setColor(theme().palette.base);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.wipes.layout(), this);
  }

  get running(): boolean {
    return this.busy;
  }

  go(req: TransitionRequest): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.bringToTop();
    req.from.input.enabled = false;
    if (req.style && req.style !== 'theme' && req.key !== req.from.scene.key) {
      this.underlay(req, FADE_MS[req.style]);
      return;
    }
    const t = theme();
    this.wipes.setColor(t.palette.base);
    audio.whoosh(0.25);
    this.wipes.cover(SceneWipes.styleFor(t), t, req.from, () => this.swap(req));
  }

  private swap(req: TransitionRequest): void {
    for (const k of req.stop ?? []) {
      if (k !== req.from.scene.key && (this.scene.isActive(k) || this.scene.isPaused(k))) this.scene.stop(k);
    }
    const target = this.scene.get(req.key);
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      this.scene.bringToTop();
      const t = theme();
      this.wipes.setColor(t.palette.base);
      this.wipes.reveal(SceneWipes.styleFor(t), t, target, () => {
        this.busy = false;
      });
    };
    target.events.once(Phaser.Scenes.Events.CREATE, () => this.time.delayedCall(30, reveal));
    this.time.delayedCall(5000, reveal);
    req.from.scene.start(req.key, req.data);
  }

  /**
   * Starts the next scene under the current one and fades the current one (and the scenes it
   * asked to stop) off it. Under reduced motion the fade is a short cross with no movement.
   */
  private underlay(req: TransitionRequest, ms: number): void {
    const from = req.from;
    const fading = [from, ...(req.stop ?? []).map((k) => this.scene.get(k))].filter(
      (s): s is Phaser.Scene => !!s && s !== this && (s.sys.isActive() || s.sys.isPaused()),
    );
    const target = this.scene.get(req.key);
    let started = false;
    const sink = () => {
      // Under everything that is fading, so the new picture shows through as they go.
      const lowest = fading.reduce((lo, s) => (this.scene.getIndex(s) < this.scene.getIndex(lo) ? s : lo), from);
      this.scene.moveBelow(lowest.scene.key, req.key);
    };
    const fade = () => {
      if (started) return;
      started = true;
      const cams = fading.flatMap((s) => s.cameras.cameras);
      const state = { a: 1 };
      this.tweens.add({
        targets: state,
        a: 0,
        duration: calm() ? Math.min(ms, 200) : ms,
        ease: 'Sine.InOut',
        onUpdate: () => {
          for (const c of cams) c.setAlpha(state.a);
        },
        onComplete: () => {
          for (const s of fading) if (s.sys.isActive() || s.sys.isPaused()) s.scene.stop();
          this.busy = false;
        },
      });
    };
    target.events.once(Phaser.Scenes.Events.CREATE, () => {
      sink();
      this.time.delayedCall(30, fade);
    });
    this.time.delayedCall(5000, fade);
    this.scene.launch(req.key, req.data);
    sink();
  }
}
