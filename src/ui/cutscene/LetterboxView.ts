import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../../config';
import { calm } from '../theme';

/** The visible part of the board on a camera at the scene's own zoom, in world units. */
export function viewRect(cam: Phaser.Cameras.Scene2D.Camera): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const width = cam.width / cam.zoom;
  const height = cam.height / cam.zoom;
  return { left: WIDTH / 2 - width / 2, top: HEIGHT / 2 - height / 2, width, height };
}

/** Bar height for a view, so the picture keeps a wide frame on phones and desktops alike. */
export function barHeight(viewH: number): number {
  return Phaser.Math.Clamp(Math.round(viewH * 0.1), 44, 104);
}

/**
 * The cinema frame: black bars that slide in from the edges, a fade to a color over the whole
 * picture, and flashes. Under reduced motion the bars fade instead of sliding, and flashes are
 * softened.
 */
export class LetterboxView {
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;
  private readonly fade: Phaser.GameObjects.Rectangle;
  private readonly flashRect: Phaser.GameObjects.Rectangle;
  private flashLeft = 0;
  private flashMs = 1;
  private flashAmount = 0;
  private amount = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    depth = 0,
  ) {
    this.fade = scene.add
      .rectangle(0, 0, 10, 10, 0x000000)
      .setOrigin(0)
      .setDepth(depth)
      .setAlpha(0);
    this.top = scene.add
      .rectangle(0, 0, 10, 10, 0x000000)
      .setOrigin(0)
      .setDepth(depth + 1);
    this.bottom = scene.add
      .rectangle(0, 0, 10, 10, 0x000000)
      .setOrigin(0)
      .setDepth(depth + 1);
    this.flashRect = scene.add
      .rectangle(0, 0, 10, 10, 0xffffff)
      .setOrigin(0)
      .setDepth(depth + 3)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.fade, this.top, this.bottom, this.flashRect];
  }

  /** How far the bars reach into the view now, in world units. */
  get reach(): number {
    return barHeight(viewRect(this.cam).height) * this.amount;
  }

  /** The full height of one bar, in or out. */
  get bar(): number {
    return barHeight(viewRect(this.cam).height);
  }

  /** How far in the bars are, 0..1. */
  get letterbox(): number {
    return this.amount;
  }

  flash(ms: number, color = 0xffffff, amount = 0.8): void {
    this.flashRect.setFillStyle(color);
    this.flashAmount = calm() ? Math.min(amount, 0.25) : amount;
    this.flashMs = this.flashLeft = Math.max(1, calm() ? Math.max(ms, 300) : ms);
  }

  apply(letterbox: number, fade: { v: number; color: number }, dtMs: number): void {
    const v = viewRect(this.cam);
    const pad = 8;
    const h = barHeight(v.height);
    const k = Phaser.Math.Clamp(letterbox, 0, 1);
    this.amount = k;
    const slide = !calm();
    this.top
      .setPosition(v.left - pad, slide ? v.top - h + h * k : v.top)
      .setSize(v.width + pad * 2, h + 1)
      .setAlpha(slide ? 1 : k)
      .setVisible(k > 0.001);
    this.bottom
      .setPosition(v.left - pad, slide ? v.top + v.height - h * k : v.top + v.height - h)
      .setSize(v.width + pad * 2, h + 1)
      .setAlpha(slide ? 1 : k)
      .setVisible(k > 0.001);
    this.fade
      .setPosition(v.left - pad, v.top - pad)
      .setSize(v.width + pad * 2, v.height + pad * 2)
      .setFillStyle(fade.color)
      .setAlpha(Phaser.Math.Clamp(fade.v, 0, 1))
      .setVisible(fade.v > 0.001);

    if (this.flashLeft > 0) this.flashLeft = Math.max(0, this.flashLeft - dtMs);
    const f = this.flashLeft / this.flashMs;
    this.flashRect
      .setPosition(v.left - pad, v.top - pad)
      .setSize(v.width + pad * 2, v.height + pad * 2)
      .setAlpha(this.flashAmount * f * f)
      .setVisible(this.flashLeft > 0);
  }
}
