import Phaser from 'phaser';
import { EXPLOSION_RADIUS, FALL_SHATTER_Y } from '../config';
import { collapseThreshold } from '../core/Difficulty';
import type { LevelSpec } from '../core/types';
import { Brick, type HitResult } from '../entities/Brick';

export type DestroyCause = 'ball' | 'laser' | 'explosion' | 'fall' | 'ability';

export interface BrickEvents {
  onDestroyed(brick: Brick, cause: DestroyCause, chain: number): void;
  onExplosion(x: number, y: number, chain: number): void;
  onRegrow(brick: Brick): void;
  onCollapseStart(): void;
  /** True while a ball is close enough that a regrowing brick would trap it. */
  regrowBlocked(brick: Brick): boolean;
}

/** Owns every brick in the level: building, movement, regen clusters, explosions, collapse. */
export class BrickSystem {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly bricks: Brick[] = [];
  private collapsing = false;
  private fallThreshold: number;
  private elapsedMs = 0;
  private remainingCache = -1;
  private targetsCache: Brick[] | null = null;

  constructor(
    private scene: Phaser.Scene,
    level: LevelSpec,
    private events: BrickEvents,
  ) {
    this.group = scene.physics.add.group({ allowGravity: false, immovable: true });
    for (const spec of level.bricks) {
      const b = new Brick(scene, spec);
      this.group.add(b);
      b.body.pushable = false;
      if (spec.moveX !== 0) b.body.setVelocityX(Math.sign(spec.moveX) * spec.moveSpeed);
      // Static bricks skip motion integration until the collapse drops them.
      else b.body.moves = false;
      this.bricks.push(b);
    }
    this.assignRegenClusters();
    const initial = this.remaining;
    this.fallThreshold = Math.min(collapseThreshold(initial), initial - 1);
    this.introAnimation();
  }

  /** Breakable bricks still standing, including dormant regen bricks that may grow back. */
  get remaining(): number {
    if (this.remainingCache < 0) {
      let n = 0;
      for (const b of this.bricks) if (b.breakable && b.life !== 'dead') n++;
      this.remainingCache = n;
    }
    return this.remainingCache;
  }

  /** Call whenever a brick's life changes. */
  private invalidate(): void {
    this.remainingCache = -1;
    this.targetsCache = null;
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    for (const b of this.bricks) {
      if (b.life === 'dead') continue;
      if (b.spec.moveX !== 0 && !b.falling && b.isAlive) this.updateMover(b);
      if (b.life === 'dormant' && this.elapsedMs >= b.regrowAt) this.tryRegrow(b);
      if (b.falling && b.isAlive && b.y >= FALL_SHATTER_Y) this.destroy(b, 'fall', 0);
      if (b.spec.moveX !== 0 || b.falling) b.syncOverlay();
    }
  }

  /** Applies damage and handles destruction side effects. */
  hit(
    b: Brick,
    damage: number,
    cause: DestroyCause,
    opts: { lethal?: boolean; stripArmor?: boolean } = {},
  ): HitResult {
    const res = b.takeHit(damage, opts);
    if (res === 'destroyed') this.destroy(b, cause, 0);
    else if (res !== 'immune') b.flash();
    return res;
  }

  /** Breakable bricks left when the rest of the level collapses. */
  get collapseAt(): number {
    return this.fallThreshold;
  }

  /**
   * Breakable bricks currently standing (excludes steel and dormant regen bricks). The array is
   * shared until the next change, so copy it before sorting or shuffling.
   */
  get targets(): readonly Brick[] {
    this.targetsCache ??= this.bricks.filter((b) => b.isAlive && b.breakable);
    return this.targetsCache;
  }

  /** Instantly destroys a breakable brick, ignoring health and armor. Steel is immune. */
  kill(b: Brick, cause: DestroyCause): boolean {
    if (!b.isAlive || !b.breakable) return false;
    b.takeHit(0, { lethal: true });
    this.destroy(b, cause, 0);
    return true;
  }

  private destroy(b: Brick, cause: DestroyCause, chain: number): void {
    if (!b.isAlive) return;
    this.invalidate();
    if (b.spec.kind === 'regen' && !this.collapsing) {
      b.setDormant();
      b.regrowAt = this.elapsedMs + b.spec.regenDelay * 1000;
      this.settleCluster(b.cluster);
    } else {
      b.markDead();
      this.scene.tweens.add({
        targets: b,
        alpha: 0,
        scaleX: b.scaleX * 1.3,
        scaleY: b.scaleY * 0.2,
        duration: 140,
        onComplete: () => b.setVisible(false),
      });
    }
    this.events.onDestroyed(b, cause, chain);
    if (b.spec.kind === 'explosive') this.explode(b, chain + 1);
    this.checkCollapse();
  }

  private explode(src: Brick, chain: number): void {
    const x = src.x;
    const y = src.y;
    this.scene.time.delayedCall(70, () => {
      this.events.onExplosion(x, y, chain);
      for (const b of this.bricks) {
        if (!b.isAlive || !b.breakable) continue;
        const dx = Math.max(Math.abs(b.x - x) - b.displayWidth / 2, 0);
        const dy = Math.max(Math.abs(b.y - y) - b.displayHeight / 2, 0);
        if (dx * dx + dy * dy <= EXPLOSION_RADIUS * EXPLOSION_RADIUS) {
          b.takeHit(0, { lethal: true });
          this.destroy(b, 'explosion', chain);
        }
      }
    });
  }

  private updateMover(b: Brick): void {
    const lo = Math.min(b.homeX, b.homeX + b.spec.moveX);
    const hi = Math.max(b.homeX, b.homeX + b.spec.moveX);
    if (b.x <= lo && b.body.velocity.x < 0) b.body.setVelocityX(b.spec.moveSpeed);
    else if (b.x >= hi && b.body.velocity.x > 0) b.body.setVelocityX(-b.spec.moveSpeed);
  }

  private tryRegrow(b: Brick): void {
    if (this.events.regrowBlocked(b)) {
      b.regrowAt = this.elapsedMs + 300;
      return;
    }
    b.regrow();
    this.invalidate();
    this.events.onRegrow(b);
  }

  /** A regen cluster is gone for good once every member is down at the same time. */
  private settleCluster(cluster: number): void {
    const members = this.bricks.filter((m) => m.cluster === cluster && m.life !== 'dead');
    if (members.every((m) => m.life === 'dormant')) {
      for (const m of members) m.markDead();
    }
  }

  private checkCollapse(): void {
    if (this.collapsing) return;
    const left = this.remaining;
    if (left === 0 || left > this.fallThreshold) return;
    this.collapsing = true;
    this.events.onCollapseStart();
    for (const b of this.bricks) {
      if (b.life === 'dormant') b.markDead();
      if (!b.isAlive) continue;
      b.falling = true;
      b.body.moves = true;
      b.body.setImmovable(true);
      b.body.setVelocityX(0);
      b.body.setAllowGravity(true);
      b.body.setGravityY(10 + Math.random() * 100);
    }
    this.invalidate();
  }

  /** Union-find over regen bricks that touch (including diagonally). */
  private assignRegenClusters(): void {
    const regen = this.bricks.filter((b) => b.spec.kind === 'regen');
    const parent = regen.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    const touches = (a: Brick, b: Brick) =>
      Math.abs(a.homeX - b.homeX) <= (a.displayWidth + b.displayWidth) / 2 + 2 &&
      Math.abs(a.homeY - b.homeY) <= (a.displayHeight + b.displayHeight) / 2 + 2;
    for (let i = 0; i < regen.length; i++) {
      for (let j = i + 1; j < regen.length; j++) {
        if (touches(regen[i]!, regen[j]!)) parent[find(i)] = find(j);
      }
    }
    regen.forEach((b, i) => (b.cluster = find(i)));
  }

  private introAnimation(): void {
    for (const b of this.bricks) {
      const y = b.y;
      const sx = b.scaleX;
      const sy = b.scaleY;
      b.setY(y - 30)
        .setAlpha(0)
        .setScale(sx * 0.6, sy * 0.6);
      this.scene.tweens.add({
        targets: b,
        y,
        alpha: 1,
        scaleX: sx,
        scaleY: sy,
        delay: (b.spec.y / 600) * 380 + (b.spec.x / 600) * 120,
        duration: 380,
        ease: 'Back.Out',
      });
    }
  }
}
