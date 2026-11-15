import Phaser from 'phaser';
import type { WorldId } from '../art/backdrops';
import { fgTexture } from '../art/foreground';
import { PADDLE_Y, WIDTH } from '../config';

export const PADDLE_BASE_WIDTH = 104;
const PADDLE_HEIGHT = 24;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.7;

export class Paddle extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  /** Where input wants the paddle; the paddle eases toward it. */
  targetX = WIDTH / 2;
  /** Sideways speed over the last step, in px/s. Laser bolts inherit some of it. */
  vx = 0;
  private factor = 1;

  constructor(scene: Phaser.Scene, world: WorldId) {
    super(scene, WIDTH / 2, PADDLE_Y, ...fgTexture(world, 'paddle'));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setImmovable(true);
    this.body.setAllowGravity(false);
    this.body.pushable = false;
    this.applySize();
  }

  get halfWidth(): number {
    return this.displayWidth / 2;
  }

  /** Multiplies the width (wide/tiny powerups) within limits. */
  resize(mult: number, animate = true): void {
    this.factor = Phaser.Math.Clamp(this.factor * mult, MIN_FACTOR, MAX_FACTOR);
    if (!animate) {
      this.applySize();
      return;
    }
    this.scene.tweens.add({
      targets: this,
      displayWidth: PADDLE_BASE_WIDTH * this.factor,
      duration: 260,
      ease: 'Back.Out',
      onComplete: () => this.applySize(),
    });
  }

  resetSize(): void {
    this.factor = 1;
    this.applySize();
  }

  step(dtMs: number): void {
    const clamped = Phaser.Math.Clamp(this.targetX, this.halfWidth, WIDTH - this.halfWidth);
    this.targetX = clamped;
    // Frame-rate independent ease: closes 99% of the gap in 60ms, so it tracks the finger closely.
    const t = 1 - Math.pow(0.01, dtMs / 60);
    const prev = this.x;
    this.x = Phaser.Math.Linear(this.x, clamped, t);
    this.vx = dtMs > 0 ? ((this.x - prev) * 1000) / dtMs : 0;
  }

  squash(): void {
    const sy = this.scaleY;
    this.scene.tweens.add({
      targets: this,
      scaleY: sy * 0.65,
      duration: 60,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => this.setScale(this.scaleX, sy),
    });
  }

  private applySize(): void {
    this.setDisplaySize(PADDLE_BASE_WIDTH * this.factor, PADDLE_HEIGHT);
  }
}
