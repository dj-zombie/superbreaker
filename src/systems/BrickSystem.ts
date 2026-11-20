import Phaser from 'phaser';
import type { WorldId } from '../art/backdrops';
import { EXPLOSION_RADIUS, FALL_SHATTER_Y } from '../config';
import { MAX_REGROWS, collapseThreshold } from '../core/Difficulty';
import type { BrickSpec, LevelSpec } from '../core/types';
import {
  Brick,
  type BrickOwner,
  type DestroyCause,
  type HitOptions,
  type HitResult,
} from '../entities/Brick';

export type { DestroyCause };

export interface BrickSystemOptions {
  /** The last few bricks fall when the level is nearly clear. Descent turns it off. */
  collapse?: boolean;
}

export interface BrickEvents {
  onDestroyed(brick: Brick, cause: DestroyCause, chain: number): void;
  onExplosion(x: number, y: number, chain: number): void;
  onRegrow(brick: Brick): void;
  /** A hit that didn't destroy the brick: damage, armor or a steel ping. */
  onHit?(brick: Brick, result: HitResult, cause: DestroyCause): void;
  onCollapseStart(): void;
  /** True while a ball is close enough that a regrowing brick would trap it. */
  regrowBlocked(brick: Brick): boolean;
  /** Once few enough bricks remain, the collapse still waits until this says the level is slow. */
  collapseReady?(): boolean;
}

/** Owns every brick in the level: building, movement, regen clusters, explosions, collapse. */
export class BrickSystem {
  readonly group: Phaser.Physics.Arcade.Group;
  /** Kept as the same array for the whole scene; the lighting system holds on to it. */
  readonly bricks: Brick[] = [];
  private collapsing = false;
  private readonly collapse: boolean;
  private fallThreshold = -1;
  private elapsedMs = 0;
  private remainingCache = -1;
  private targetsCache: Brick[] | null = null;
  private nextCluster = 0;
  /** A live brick slid along its track on the last update. */
  moving = false;

  constructor(
    private scene: Phaser.Scene,
    level: LevelSpec,
    private events: BrickEvents,
    private world: WorldId,
    opts: BrickSystemOptions = {},
  ) {
    this.group = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.collapse = opts.collapse ?? true;
    this.load(level);
  }

  /** Replaces every brick with a new level's, e.g. the next wave of an Arcade run. */
  load(level: LevelSpec): void {
    for (const b of this.bricks) {
      this.scene.tweens.killTweensOf(b);
      b.markDead();
      b.destroy();
    }
    this.bricks.length = 0;
    this.collapsing = false;
    this.append(level.bricks);
    const initial = this.remaining;
    this.fallThreshold = this.collapse ? Math.min(collapseThreshold(initial), initial - 1) : -1;
  }

  /**
   * Adds bricks to the level, popping in like the level intro. Owned bricks skip the pop-in:
   * their owner brings them on.
   */
  append(specs: readonly BrickSpec[], owner?: BrickOwner): Brick[] {
    const added = specs.map((spec) => {
      const b = new Brick(this.scene, spec, this.world);
      b.owner = owner;
      this.group.add(b);
      b.body.pushable = false;
      if (spec.moveX !== 0) b.body.setVelocityX(Math.sign(spec.moveX) * spec.moveSpeed);
      // Static bricks skip motion integration until the collapse drops them.
      else b.body.moves = false;
      this.bricks.push(b);
      return b;
    });
    this.assignRegenClusters(added);
    if (!owner) this.introAnimation(added);
    this.invalidate();
    return added;
  }

  /** Removes bricks with no events: no score, no drops, no chain. */
  retire(bricks: readonly Brick[]): void {
    for (const b of bricks) {
      if (b.life === 'dead') continue;
      this.scene.tweens.killTweensOf(b);
      b.markDead();
      b.setVisible(false);
    }
    this.invalidate();
  }

  /**
   * Retires owned bricks and takes them off the scene for good, for owners that spawn bricks all
   * through a stage. Call it outside physics callbacks.
   */
  discard(bricks: readonly Brick[]): void {
    this.retire(bricks);
    for (const b of bricks) {
      const i = this.bricks.indexOf(b);
      if (i >= 0) this.bricks.splice(i, 1);
      b.destroy();
    }
  }

  /** Moves every standing brick down by `dy` px over `ms`. */
  shiftDown(dy: number, ms: number): void {
    for (const b of this.bricks) {
      if (b.life === 'dead') continue;
      b.homeY += dy;
      if (b.life === 'dormant') {
        b.setY(b.homeY);
        continue;
      }
      this.scene.tweens.add({
        targets: b,
        y: b.homeY,
        duration: ms,
        ease: 'Sine.InOut',
        onUpdate: () => b.syncOverlay(),
      });
    }
  }

  /** Bottom edge of the lowest standing brick once it settles, or -Infinity with none left. */
  lowestBottom(): number {
    let y = -Infinity;
    for (const b of this.bricks) {
      if (b.life !== 'dead') y = Math.max(y, b.homeY + b.displayHeight / 2);
    }
    return y;
  }

  /**
   * Destroys every brick whose bottom edge sits below `y`, steel included. Returns how many.
   * Owned bricks stay: only their owner removes them.
   */
  shatterBelow(y: number): number {
    let n = 0;
    for (const b of this.bricks) {
      if (b.owner || b.life === 'dead' || b.homeY + b.displayHeight / 2 <= y) continue;
      if (b.life === 'dormant') {
        b.markDead();
        continue;
      }
      b.takeHit(0, { lethal: true });
      this.destroy(b, 'breach', 0);
      n++;
    }
    this.invalidate();
    return n;
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
    let moving = false;
    for (const b of this.bricks) {
      if (b.life === 'dead') continue;
      if (b.spec.moveX !== 0 && !b.falling && b.isAlive) {
        this.updateMover(b);
        moving = true;
      }
      if (b.life === 'dormant' && this.elapsedMs >= b.regrowAt) this.tryRegrow(b);
      if (b.falling && b.isAlive && b.y >= FALL_SHATTER_Y) this.destroy(b, 'fall', 0);
      if (b.spec.moveX !== 0 || b.falling) b.syncOverlay();
    }
    this.moving = moving;
    this.checkCollapse();
  }

  /** Applies damage and handles destruction side effects. An owned brick's owner takes the hit. */
  hit(b: Brick, damage: number, cause: DestroyCause, opts: HitOptions = {}): HitResult {
    const wasAlive = b.isAlive;
    const res =
      b.owner && wasAlive && b.breakable
        ? b.owner.strike(b, damage, cause, opts)
        : b.takeHit(damage, opts);
    if (res === 'destroyed') this.destroy(b, cause, 0);
    else if (res !== 'immune') b.flash();
    if (res !== 'destroyed' && wasAlive) this.events.onHit?.(b, res, cause);
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

  /** Breaks every standing steel brick, for when the player is stuck behind it. Returns them. */
  shatterSteel(): Brick[] {
    const out: Brick[] = [];
    for (const b of this.bricks) {
      if (!b.isAlive || b.breakable) continue;
      b.markDead();
      this.scene.tweens.add({
        targets: b,
        alpha: 0,
        scaleX: b.scaleX * 1.4,
        scaleY: b.scaleY * 0.2,
        delay: out.length * 6,
        duration: 220,
        onComplete: () => b.setVisible(false),
      });
      out.push(b);
    }
    this.invalidate();
    return out;
  }

  /**
   * Instantly destroys a breakable brick, ignoring health and armor. Steel is immune. An owned
   * brick takes it as a lethal hit and stands, so nothing was killed.
   */
  kill(b: Brick, cause: DestroyCause): boolean {
    if (!b.isAlive || !b.breakable) return false;
    if (b.owner) {
      this.hit(b, 0, cause, { lethal: true });
      return false;
    }
    b.takeHit(0, { lethal: true });
    this.destroy(b, cause, 0);
    return true;
  }

  private destroy(b: Brick, cause: DestroyCause, chain: number): void {
    if (!b.isAlive) return;
    this.invalidate();
    const regen = b.spec.kind === 'regen';
    if (regen && !this.collapsing && b.regrows < MAX_REGROWS) {
      b.setDormant();
      b.regrowAt = this.elapsedMs + b.spec.regenDelay * 1000;
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
    if (regen) this.settleCluster(b.cluster);
    this.events.onDestroyed(b, cause, chain);
    if (b.spec.kind === 'explosive' && cause !== 'breach') this.explode(b, chain + 1);
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
          // An owned brick takes the blast as a lethal hit and stands.
          if (b.owner) {
            this.hit(b, 0, 'explosion', { lethal: true });
            continue;
          }
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

  /** A regen cluster is gone for good once every member is down at the same time, or worn out. */
  private settleCluster(cluster: number): void {
    const members = this.bricks.filter((m) => m.cluster === cluster && m.life !== 'dead');
    if (members.every((m) => m.life === 'dormant')) {
      for (const m of members) m.markDead();
    }
  }

  /** Dormant regen bricks don't count toward the threshold; the collapse clears them anyway. */
  private checkCollapse(): void {
    if (this.collapsing) return;
    if (this.remaining === 0 || this.targets.length > this.fallThreshold) return;
    if (this.events.collapseReady && !this.events.collapseReady()) return;
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

  /** Union-find over new regen bricks that touch (including diagonally). */
  private assignRegenClusters(bricks: readonly Brick[]): void {
    const regen = bricks.filter((b) => b.spec.kind === 'regen');
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
    const base = this.nextCluster;
    regen.forEach((b, i) => (b.cluster = base + find(i)));
    this.nextCluster += regen.length;
  }

  private introAnimation(bricks: readonly Brick[]): void {
    for (const b of bricks) {
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
