import Phaser from 'phaser';
import { theme } from '../theme';
import { label } from '../type';
import { viewRect } from './LetterboxView';

/** How long the hint stays up after the last touch, in ms. */
const LINGER_MS = 2600;
const R = 11;

/**
 * "Hold to skip", in the top corner: it shows when the player touches anything and fills a ring
 * as they hold, so a stray tap never throws a scene away.
 */
export class SkipControl {
  private readonly root: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private shownMs = 0;
  private alpha = 0;
  private fill = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    depth = 0,
  ) {
    const t = theme();
    this.ring = scene.add.graphics();
    this.text = label(scene, -R - 10, 0, 'Hold to skip', 12, { originX: 1, color: t.palette.text });
    this.root = scene.add.container(0, 0, [this.ring, this.text]).setDepth(depth).setAlpha(0);
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.root];
  }

  /** Brings the hint up for a while. */
  poke(): void {
    this.shownMs = LINGER_MS;
  }

  /** How far the hold has got, 0..1. */
  setFill(k: number): void {
    this.fill = Phaser.Math.Clamp(k, 0, 1);
    if (k > 0) this.shownMs = LINGER_MS;
  }

  apply(dtMs: number, barReach: number): void {
    this.shownMs = Math.max(0, this.shownMs - dtMs);
    const want = this.shownMs > 0 ? 1 : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dtMs / 140);
    this.root.setAlpha(this.alpha).setVisible(this.alpha > 0.01);
    if (this.alpha <= 0.01) return;
    const v = viewRect(this.cam);
    const y = v.top + Math.max(26, barReach / 2);
    this.root.setPosition(v.left + v.width - 26, y);
    const t = theme();
    const g = this.ring;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, R);
    if (this.fill > 0) {
      g.lineStyle(3, t.palette.accentHi, 1);
      g.beginPath();
      g.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + this.fill * Math.PI * 2);
      g.strokePath();
    }
    g.fillStyle(0xffffff, 0.8).fillTriangle(-3, -5, -3, 5, 5, 0);
  }

  destroy(): void {
    this.root.destroy();
  }
}
