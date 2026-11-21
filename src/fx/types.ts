import type { SceneryId } from '../art/backdrops';
import type { LightingTier } from '../systems/Quality';
import type { Fade, Range, SizeEase } from './math';
import type { ColorRef } from './palettes';
import type { FxForce } from './processors';

/**
 * Pooled emitters, one per blend mode and depth band. Every emitter draws from the one `fx`
 * texture, so adding effects never adds a texture to a batch.
 */
export type ChannelId = 'sky' | 'low' | 'smoke' | 'debris' | 'glow' | 'top' | 'front';

export type Zone =
  | { circle: number }
  | { ring: number }
  | { rect: readonly [number, number] }
  | { line: number }
  /** The caller's box (`opts.w` by `opts.h`), e.g. the brick that broke. */
  | 'box';

/** One layer of particles in an effect. */
export interface EmitSpec {
  channel: ChannelId;
  /** Frame names in the fx atlas; one is picked per particle. */
  frames: string | readonly string[];
  /** Plays these frames over each particle's life (or at `fps`), instead of a fixed frame. */
  anim?: { frames: readonly string[]; fps?: number; loop?: boolean };
  /** Particles per play (bursts). */
  count?: Range;
  /** Particles per second, for attached effects and fields. */
  rate?: number;
  life: Range;
  /** Per-particle wait before it appears, in ms. */
  delay?: Range;
  zone?: Zone;
  /** Velocity points away from the zone's center. */
  radial?: boolean;
  speed?: Range;
  /** Degrees, 0 = right, 90 = down. Relative to `opts.angle` when `aim` is set. */
  angle?: Range;
  aim?: boolean;
  gravity?: number;
  gravityX?: number;
  /** Exponential slow-down per second: 0 none, 3 stops most motion in a second. */
  drag?: number;
  forces?: readonly FxForce[];
  /** Also feel the forces the caller passes (`opts.forces`), e.g. a moving black hole. */
  useForces?: boolean;
  /** Moves with the attached target, as an aura does. */
  follow?: boolean;
  /** Bounces off `opts.floor` with this restitution. */
  bounce?: number;
  /** Start scale (texture scale). */
  size: Range;
  /** End scale as a multiple of the start. */
  grow?: number;
  sizeEase?: SizeEase;
  /** Velocity-aligned stretch: scaleX grows by speed * stretch. Streaks and rain. */
  stretch?: number;
  /** Thins a stretched particle across its length. */
  thin?: number;
  /** Rotate to face the velocity without stretching. */
  align?: boolean;
  rotate?: Range;
  /** Degrees per second; decays with `drag`. */
  spin?: Range;
  /** Randomly mirror, so a few frames make many shapes. */
  mirror?: boolean;
  /** Peak alpha. */
  alpha?: Range;
  fade?: Fade;
  /** Color over life, or one color. */
  color?: ColorRef | readonly ColorRef[];
  /** One color per particle, picked from these (confetti). Wins over `color`. */
  pick?: readonly ColorRef[];
  /** Paper flipping: scaleY swings at this many turns per second. */
  flutter?: number;
  /** Skipped below this tier. */
  minTier?: LightingTier;
  /** Only in these worlds (a layer that swaps per world). */
  only?: readonly SceneryId[];
  /** Survives the budget and reduced motion with at least one particle. */
  essential?: boolean;
  /** Effect played where each particle dies (a firework's burst). */
  onDeath?: string;
  /** Chance per particle of `onDeath`, 0..1. */
  deathChance?: number;
}

/** A pooled image from the fx atlas that scales and fades: rings, shockwaves, flares, decals. */
export interface SpriteSpec {
  frame: string;
  blend?: 'add' | 'normal';
  depth?: number;
  life: number;
  delay?: number;
  /** Width in px at the start and the end. */
  from: Range;
  to: Range;
  /** Height as a fraction of width, when the frame's own aspect is not wanted. */
  aspect?: number;
  ease?: SizeEase;
  alpha?: number;
  fade?: Fade;
  color?: ColorRef | readonly ColorRef[];
  rotate?: Range;
  spin?: Range;
  /** Align to `opts.angle`. */
  aim?: boolean;
  dx?: Range;
  dy?: Range;
  minTier?: LightingTier;
  only?: readonly SceneryId[];
}

export interface FxDef {
  layers?: readonly EmitSpec[];
  sprites?: readonly SpriteSpec[];
  /** A short light in the light map, when the scene has lighting. */
  light?: { color: ColorRef; radius: number; life: number; intensity?: number; grow?: number };
  shake?: readonly [ms: number, intensity: number];
  punch?: readonly [ms: number, intensity: number];
  hitStop?: number;
  /** Brightens the parallax backdrop's glows, 0..1. */
  scenery?: number;
  /** Follow-up effects, for staged sequences (a boss coming apart). */
  then?: ReadonlyArray<{ at: number; fx: string; dx?: Range; dy?: Range; scale?: number; angle?: Range }>;
  /** High-tier screen distortion ring. */
  distort?: { radius: number; life: number; strength?: number };
  /** Where `fx.weather` spawns this preset relative to the bounds it is given. */
  spawn?: 'top' | 'bottom' | 'fill';
}

export interface FxOpts {
  /** What `@tint` resolves to: the brick's, ball's or ability's color. Defaults to the world's accent. */
  tint?: number;
  world?: SceneryId;
  /** Scales size, speed, zones and sprite sizes. */
  scale?: number;
  /** Degrees, for aimed layers and sprites. */
  angle?: number;
  /** Multiplies particle counts. */
  intensity?: number;
  /** The caller's box for `zone: 'box'`. */
  w?: number;
  h?: number;
  /** Y that bouncing particles land on. */
  floor?: number;
  forces?: readonly FxForce[];
  /** Skip the camera and hit-stop hooks (e.g. menus). */
  quiet?: boolean;
}

/** What the engine may reach for outside itself. All optional: the FX Lab has no light map. */
export interface FxHooks {
  light?(x: number, y: number, color: number, radius: number, lifeMs: number, intensity: number, grow: number): void;
  shake?(ms: number, intensity: number): void;
  punch?(ms: number, intensity: number): void;
  hitStop?(ms: number): void;
  scenery?(amount: number): void;
}
