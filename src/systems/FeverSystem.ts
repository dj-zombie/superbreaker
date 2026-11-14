import Phaser from 'phaser';
import { ARENA_MID, HEIGHT, WIDTH } from '../config';
import { FeverMeter } from '../core/Pacing';
import { haptic } from '../platform/haptics';
import { save } from '../services';
import { audio } from './AudioSystem';
import type { Backdrop } from './Backdrop';
import type { JuiceSystem } from './JuiceSystem';

const GLOW_WIDTH = 46;

/** Fever mode: fireball balls, double score, rainbow trails, a color-cycling backdrop and edge glow. */
export class FeverSystem {
  readonly meter = new FeverMeter();
  private glow?: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private hue = 0;

  constructor(
    private scene: Phaser.Scene,
    private juice: JuiceSystem,
    private backdrop: Backdrop,
    private onChange: (active: boolean) => void,
    /** Edge glow brightness; lights-out levels keep it low so the walls don't light up. */
    private edgeAlpha = 1,
  ) {}

  get active(): boolean {
    return this.meter.active;
  }

  get scoreMultiplier(): number {
    return this.active ? 2 : 1;
  }

  /** Current rainbow color for ball trails. */
  get trailColor(): number {
    return Phaser.Display.Color.HSVToRGB(this.hue, 0.85, 1).color;
  }

  onBreak(combo: number, balls: number): void {
    if (this.meter.onBreak(combo, balls)) this.start();
  }

  boost(amount: number): void {
    if (this.meter.boost(amount)) this.start();
  }

  update(dtMs: number): void {
    this.hue = (this.hue + dtMs / 1200) % 1;
    if (this.meter.update(dtMs) === 'end') {
      this.stop();
      audio.sfx('fever_end', 0.45);
    }
    if (!this.glow) return;
    const color = this.trailColor;
    this.backdrop.setHue(color);
    const alpha = (0.55 + Math.sin(this.scene.time.now / 160) * 0.2) * this.edgeAlpha;
    for (const g of this.glow) {
      g.setTint(color).setAlpha(alpha);
      if (g.displayHeight !== HEIGHT) g.setDisplaySize(GLOW_WIDTH, HEIGHT).setY(HEIGHT / 2);
    }
  }

  reset(): void {
    if (this.active) this.stop();
    this.meter.reset();
  }

  private start(): void {
    this.juice.popText(WIDTH / 2, ARENA_MID - 40, 'FEVER!', '#ff5cf0', 44);
    this.juice.flash(200, 255, 92, 240);
    this.juice.shake(300, 0.008);
    audio.sfx('fever_start', 0.5);
    haptic('heavy');
    if (!save.state.settings.reducedMotion && !this.glow) {
      const edge = (x: number, flip: boolean) =>
        this.scene.add
          .image(x, HEIGHT / 2, 'edge_glow')
          .setOrigin(flip ? 1 : 0, 0.5)
          .setFlipX(flip)
          .setDisplaySize(GLOW_WIDTH, HEIGHT)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(3);
      this.glow = [edge(0, false), edge(WIDTH, true)];
    }
    this.onChange(true);
  }

  private stop(): void {
    if (this.glow) {
      for (const g of this.glow) g.destroy();
      this.glow = undefined;
      this.backdrop.setHue(undefined);
    }
    this.onChange(false);
  }
}
