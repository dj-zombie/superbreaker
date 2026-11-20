import type Phaser from 'phaser';
import { LOSE_Y } from '../config';
import { magnet, type Path, type Point } from '../core/Motion';
import type { Paddle } from '../entities/Paddle';
import type { Light, LightingSystem } from './LightingSystem';

/** What one kind of collectible looks like and what catching it does. */
export interface CollectibleKind {
  texture: string;
  /** Size on the field, in px. */
  size: number;
  /** An animation the sprite loops, like the coin's spin. */
  anim?: string;
  tint?: number;
  /**
   * A coin is a coin to the player. A penalty is something to dodge. A custom catch is the
   * stage's own to decide.
   */
  onCatch: 'coin' | 'penalty' | 'custom';
  /** Coins for a coin; points for anything else. */
  value: number;
  /** The colour of its little light. None when left out. */
  light?: number;
  /** The magnet pulls it in when the timer runs out. Coins are magnetic unless they say not. */
  magnetic?: boolean;
  /** It flies to the paddle by itself this long after it appeared, in ms: nothing to chase. */
  homeAfterMs?: number;
}

/** A coin that sprays out and then flies home to the paddle by itself. */
export const COIN: CollectibleKind = {
  texture: 'coin',
  size: 24,
  anim: 'coin-spin',
  onCatch: 'coin',
  value: 1,
  light: 0xffc93c,
  homeAfterMs: 380,
};

/** A collectible on the field. */
export interface Collectible {
  readonly id: string;
  readonly kind: CollectibleKind;
  x: number;
  y: number;
  /** Time since it appeared, in ms of the stage clock. */
  age: number;
  /** True while the magnet has it. */
  pulled: boolean;
}

export interface CollectibleHost {
  readonly scene: Phaser.Scene;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  /** The paddle caught one. */
  caught(item: Collectible): void;
}

/** Most collectibles on the field. A full pool drops the new one rather than growing. */
const MAX_ITEMS = 64;
/** Most of them carrying a light at once. */
const MAX_LIGHTS = 8;
/** How hard the magnet pulls, per px of distance, per second. */
const VACUUM_STRENGTH = 5;
/** The paddle catches anything this close above or below its line, in px. */
const CATCH_REACH_Y = 14;
const DEPTH = 6;

interface Slot extends Collectible {
  sprite: Phaser.GameObjects.Sprite;
  path: Path;
  light?: Light;
  live: boolean;
}

/**
 * Things to catch in a bonus stage. They have no physics bodies: each follows its path on the
 * stage clock, and a catch is checked against the paddle line, the way the boss's hazards are.
 */
export class CollectibleSystem {
  private readonly slots: Slot[] = [];
  private lights = 0;

  constructor(private host: CollectibleHost) {}

  /** Collectibles on the field. */
  get count(): number {
    let n = 0;
    for (const s of this.slots) if (s.live) n++;
    return n;
  }

  /** Puts one on the field, following `path` from where it starts. Undefined when the pool is full. */
  spawn(id: string, kind: CollectibleKind, path: Path): Collectible | undefined {
    const slot = this.slots.find((s) => !s.live) ?? this.grow();
    if (!slot) return undefined;
    const at = path(0);
    Object.assign(slot, { id, kind, path, x: at.x, y: at.y, age: 0, pulled: false, live: true });
    const { sprite } = slot;
    sprite.setTexture(kind.texture).setPosition(at.x, at.y).setVisible(true).setActive(true).setAlpha(1);
    sprite.setDisplaySize(kind.size, kind.size);
    if (kind.tint !== undefined) sprite.setTint(kind.tint);
    else sprite.clearTint();
    if (kind.anim && sprite.scene.anims.exists(kind.anim)) sprite.play(kind.anim);
    else sprite.stop();
    if (kind.light !== undefined && this.lights < MAX_LIGHTS) {
      this.lights++;
      slot.light = this.host.lighting.addLight({
        follow: sprite,
        radius: kind.size * 1.6,
        color: kind.light,
        intensity: 0.4,
        halo: kind.size * 0.7,
        haloAlpha: 0.3,
        haloDepth: DEPTH - 0.1,
        priority: 6,
      });
    }
    return slot;
  }

  /** Moves everything on by `dtMs` of the stage clock, and catches what reached the paddle. */
  update(dtMs: number): void {
    const { paddle } = this.host;
    const target: Point = { x: paddle.x, y: paddle.y };
    for (const s of this.slots) {
      if (!s.live) continue;
      s.age += dtMs;
      if (!s.pulled && s.kind.homeAfterMs !== undefined && s.age >= s.kind.homeAfterMs) s.pulled = true;
      const at = s.pulled ? magnet(s, target, VACUUM_STRENGTH, dtMs) : s.path(s.age);
      s.x = at.x;
      s.y = at.y;
      s.sprite.setPosition(at.x, at.y);
      const reach = s.kind.size / 2;
      const onLine = Math.abs(s.y - paddle.y) <= reach + CATCH_REACH_Y;
      if (onLine && Math.abs(s.x - paddle.x) <= paddle.halfWidth + reach) {
        this.free(s);
        this.host.caught(s);
      } else if (s.y > LOSE_Y + reach) {
        this.free(s);
      }
    }
  }

  /** The timer is out: the magnet pulls every magnetic collectible into the paddle. */
  vacuum(): void {
    for (const s of this.slots) {
      if (s.live && (s.kind.magnetic ?? s.kind.onCatch === 'coin')) s.pulled = true;
    }
  }

  /** Takes away everything the magnet will not bring in. */
  dropUnpulled(): void {
    for (const s of this.slots) if (s.live && !s.pulled) this.free(s);
  }

  clear(): void {
    for (const s of this.slots) if (s.live) this.free(s);
  }

  destroy(): void {
    this.clear();
    for (const s of this.slots) s.sprite.destroy();
    this.slots.length = 0;
  }

  private grow(): Slot | undefined {
    if (this.slots.length >= MAX_ITEMS) return undefined;
    const sprite = this.host.scene.add.sprite(0, 0, '__DEFAULT').setDepth(DEPTH).setVisible(false);
    const slot = { sprite, live: false } as Slot;
    this.slots.push(slot);
    return slot;
  }

  private free(s: Slot): void {
    s.live = false;
    s.sprite.stop();
    s.sprite.setVisible(false).setActive(false);
    if (s.light) {
      s.light.kill();
      s.light = undefined;
      this.lights--;
    }
  }
}
