import Phaser from 'phaser';
import type { WorldId } from '../art/backdrops';
import { fgKey } from '../art/foreground';

export const BALL_SIZE = 22;

export type BallMode = 'normal' | 'fireball' | 'pierce';

const TRAIL_TINT: Record<BallMode, number> = {
  normal: 0x7fe9ff,
  fireball: 0xffa53c,
  pierce: 0xd6ff3c,
};

export class Ball extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  /** Desired speed in px/s; velocity is renormalized to this after every bounce. */
  speed = 0;
  /** Stuck to the paddle at this x offset, or null when free. */
  attachedOffset: number | null = null;
  /** Brick ids recently pierced, so one brick isn't hit every physics step. */
  readonly pierced = new Map<number, number>();
  /** Bricks a fireball can still smash through before it has to bounce. */
  plowLeft = 0;
  /** Trail and fire settings, drawn by the shared emitters in BallFx. */
  trailOn = false;
  fireOn = false;
  trailTint = TRAIL_TINT.normal;
  trailEvery = 18;
  trailLife = 260;
  trailAcc = 0;
  fireAcc = 0;
  private hyper = false;
  private mode: BallMode = 'normal';

  constructor(scene: Phaser.Scene, x: number, y: number, world: WorldId) {
    super(scene, x, y, fgKey(world, 'ball'));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const frameSize = Math.min(this.width, this.height);
    this.setScale(BALL_SIZE / frameSize);
    this.body.setCircle(frameSize / 2, (this.width - frameSize) / 2, (this.height - frameSize) / 2);
    this.body.setAllowGravity(false);
    this.body.setBounce(1, 1);
    this.body.setCollideWorldBounds(true);
    this.body.onWorldBounds = true;
    this.setDepth(5);
  }

  get attached(): boolean {
    return this.attachedOffset !== null;
  }

  launch(angleRad: number, speed: number): void {
    this.attachedOffset = null;
    this.speed = speed;
    this.scene.physics.velocityFromRotation(angleRad, speed, this.body.velocity);
    this.trailOn = true;
    this.setMode(this.mode);
  }

  attach(offset: number): void {
    this.attachedOffset = offset;
    this.body.setVelocity(0, 0);
    this.trailOn = false;
    this.fireOn = false;
  }

  setMode(mode: BallMode): void {
    this.mode = mode;
    this.trailTint = TRAIL_TINT[mode];
    this.fireOn = mode === 'fireball' && !this.attached;
    if (mode === 'normal') this.clearTint();
    else this.setTint(TRAIL_TINT[mode]);
  }

  /** Longer, denser streak while Hyperspeed is on. */
  setHyper(on: boolean): void {
    if (on === this.hyper) return;
    this.hyper = on;
    this.trailEvery = on ? 6 : 18;
    this.trailLife = on ? 420 : 260;
    if (on) this.trailTint = 0xffe14d;
    else this.setMode(this.mode);
  }

  setTrailTint(color: number): void {
    this.trailTint = color;
  }

  /** Bends the velocity toward a point while moving up, keeping the speed. `turnRate` is rad/s. */
  steerToward(x: number, y: number, turnRate: number, dtMs: number): void {
    const v = this.body.velocity;
    if (this.attached || v.y >= 0) return;
    const current = Math.atan2(v.y, v.x);
    const wanted = Math.atan2(y - this.y, x - this.x);
    const next = Phaser.Math.Angle.RotateTo(current, wanted, turnRate * (dtMs / 1000));
    const speed = v.length();
    v.set(Math.cos(next) * speed, Math.sin(next) * speed);
  }

  /** Keeps speed constant and stops near-horizontal paths that never come back down. */
  normalize(minSpeed: number, maxSpeed: number): void {
    const v = this.body.velocity;
    this.speed = Phaser.Math.Clamp(this.speed, minSpeed, maxSpeed);
    if (v.lengthSq() < 1) v.set(0, -1);
    v.normalize();
    const minVy = 0.28;
    if (Math.abs(v.y) < minVy) {
      v.y = (v.y < 0 ? -1 : 1) * minVy;
      v.x = Math.sign(v.x || 1) * Math.sqrt(1 - minVy * minVy);
    }
    v.scale(this.speed);
  }
}
