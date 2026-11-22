import type Phaser from 'phaser';
import type { Rect } from '../core/bricks/cells';
import type { Channel } from '../core/bricks/gates';
import type { BrickKind } from '../core/types';
import type { Brick, DestroyCause, HitOptions, HitResult } from '../entities/Brick';

/** What a behavior needs of a ball: where it is and its body, to move it. */
export interface BallLike {
  x: number;
  y: number;
  displayWidth: number;
  body: Phaser.Physics.Arcade.Body;
}

/** A level element doing its thing, for Play to dress with sound, light and score. */
export type ElementEvent =
  | { type: 'fuseLit'; brick: Brick }
  | { type: 'fuseStep'; brick: Brick }
  | { type: 'phantom'; brick: Brick; solid: boolean }
  | { type: 'switch'; brick: Brick; channel: Channel }
  | { type: 'gate'; brick: Brick; open: boolean }
  | { type: 'portal'; from: Brick; to: Brick; ball: BallLike }
  | { type: 'infecting'; brick: Brick; core: Brick }
  | { type: 'infected'; brick: Brick }
  | { type: 'purged'; x: number; y: number; infections: number; bonus: number };

/** BrickSystem, as the behaviors see it. */
export interface BrickHost {
  readonly scene: Phaser.Scene;
  readonly bricks: readonly Brick[];
  /** Level time in ms, which stops with the bricks (hit stop, pause). */
  now(): number;
  /** A ball is in flight: clocks that would punish aiming wait while it is on the paddle. */
  live(): boolean;
  /** True while a ball is close enough that the brick turning solid would trap it. */
  occupied(b: Brick): boolean;
  /** Breaks a breakable brick outright, with all its consequences. */
  destroy(b: Brick, cause: DestroyCause, chain: number): void;
  emit(e: ElementEvent): void;
  /** A brick's life or kind changed outside a hit. */
  changed(): void;
}

/**
 * One kind's rules. BrickSystem calls whichever hooks a behavior has, for bricks of its kinds.
 * A behavior is made fresh for each board, so it can keep that board's state.
 */
export interface BrickBehavior {
  readonly kinds: readonly BrickKind[];
  /** Bricks of its kinds were built, at the start or added later (Descent). */
  added?(bricks: readonly Brick[], host: BrickHost): void;
  update?(dtMs: number, host: BrickHost): void;
  /** A hit on a live brick. A result replaces the usual damage. */
  hit?(
    b: Brick,
    damage: number,
    cause: DestroyCause,
    opts: HitOptions,
    host: BrickHost,
  ): HitResult | undefined;
  destroyed?(b: Brick, cause: DestroyCause, chain: number, host: BrickHost): void;
  /** An explosion reached a brick it can't break. */
  blast?(b: Brick, host: BrickHost): void;
  /** A ball touched a live brick. False lets it through. */
  contact?(b: Brick, ball: BallLike, host: BrickHost): boolean;
  /** The last bricks are falling. */
  collapse?(host: BrickHost): void;
}

/** A brick's box where it is now. */
export function rectOf(b: Brick): Rect {
  return {
    x: b.x - b.spec.width / 2,
    y: b.y - b.spec.height / 2,
    width: b.spec.width,
    height: b.spec.height,
  };
}
