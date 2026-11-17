import { BRICK_HEALTH } from './procgen/grid';
import type { DifficultyId } from './types';

export const BOSS_IDS = ['warden'] as const;
export type BossId = (typeof BOSS_IDS)[number];

/** The fight flow, in order. A fight starts in `fight` until the intro steps are built. */
export type BossStep =
  | 'hush'
  | 'entrance'
  | 'reveal'
  | 'fight'
  | 'transition'
  | 'finale'
  | 'aftermath'
  | 'done';

/** The numbers BossState runs on. BossDirector derives one from a BossDef. */
export interface BossSpec {
  phases: Array<{
    /** The phase's pool, in plain ball hits on Normal. */
    hits: number;
  }>;
}

/** Multipliers by difficulty: pool size, wind-up time and the calm between attacks. */
export interface BossTuning {
  health: number;
  windup: number;
  gap: number;
}

export const BOSS_TUNING: Record<DifficultyId, BossTuning> = {
  easy: { health: 0.8, windup: 1.25, gap: 1.25 },
  normal: { health: 1, windup: 1, gap: 1 },
  hard: { health: 1.25, windup: 0.85, gap: 0.8 },
};

/** Boss hits from one explosion. */
export const EXPLOSION_HITS = 3;
/** Boss hits from one ability kill. */
export const ABILITY_HITS = 2;
/** A part takes at most one lethal hit in this long, in ms. The black hole pulls every 120 ms. */
export const LETHAL_GAP_MS = 1000;
/** First brick id the framework hands out, far above any level's own ids. */
export const BOSS_ID_BASE = 100_000;
/** Score for emptying a pool. */
export const BOSS_PHASE_BONUS = 500;
/** Score for the kill. */
export const BOSS_DEFEAT_BONUS = 2000;
/** Fastest a part may move while the world is live, in px/s. A ball never travels slower. */
export const BODY_MAX_SPEED = 120;
/** Fastest a part may move while the ball is held or the world is frozen, in px/s. */
export const BODY_SCENE_SPEED = 600;
/** The sprite's depth: above the bricks, below the ball. */
export const SPRITE_DEPTH = 1;
/** Length of the flinch after a counted hit, in ms. */
export const HURT_MS = 180;
/** The least time between two flinches, in ms, so a stream of laser hits does not strobe. */
export const HURT_GAP_MS = 250;

export const BOSS_ANIMS = ['idle', 'tell', 'open', 'hurt', 'death'] as const;
export type BossAnim = (typeof BOSS_ANIMS)[number];

/** A boss's picture: one sheet of equal frames, and the frames each animation plays. */
export interface SpriteDef {
  /** Texture key. */
  key: string;
  /** Under public/assets. */
  path: string;
  /** Size of one frame in the sheet, in px. */
  frameWidth: number;
  frameHeight: number;
  /** Size on the field, in px. */
  width: number;
  height: number;
  /** The sprite's centre from the centre of the parts at rest, in px. */
  dx?: number;
  dy?: number;
  anims: Record<BossAnim, { frames: number[]; fps: number }>;
}

/** Body motion: an offset from rest for the whole body at a fight-clock time. */
export type Motion = (clockMs: number) => { x: number; y: number };

/** Side to side: `amplitude` px either way, one full swing every `periodMs`. */
export function sway(amplitude: number, periodMs: number): Motion {
  return (clockMs) => ({ x: amplitude * Math.sin((2 * Math.PI * clockMs) / periodMs), y: 0 });
}

export type BossEvent = { type: 'step'; step: BossStep } | { type: 'phase'; phase: number };

/** The rules of a boss fight, without the engine: the step, the phase and its pool. */
export class BossState {
  /** Every phase's pool in hits, scaled for the difficulty. */
  private readonly pools: number[];
  private readonly total: number;
  private at: BossStep = 'fight';
  private index: number;
  private left: number;

  /** Starts in 'fight' at `phase`. */
  constructor(spec: BossSpec, tuning: BossTuning, opts: { phase?: number } = {}) {
    if (spec.phases.length === 0) throw new Error('BossState needs at least one phase');
    this.pools = spec.phases.map((p) => Math.max(1, Math.round(p.hits * tuning.health)));
    this.total = this.pools.reduce((sum, pool) => sum + pool, 0);
    this.index = Math.max(0, Math.min(this.pools.length - 1, Math.floor(opts.phase ?? 0)));
    this.left = this.poolMax;
  }

  get step(): BossStep {
    return this.at;
  }

  /** The current phase, counted from 0. */
  get phase(): number {
    return this.index;
  }

  /** Hits left in this phase. */
  get pool(): number {
    return this.left;
  }

  get poolMax(): number {
    return this.pools[this.index]!;
  }

  /** Hits dealt over the total of all pools: 0 at the start, 1 at the finale. */
  get progress(): number {
    let dealt = this.poolMax - this.left;
    for (let i = 0; i < this.index; i++) dealt += this.pools[i]!;
    return dealt / this.total;
  }

  /** Only in 'fight'. Never carries past a phase boundary. Emptying the last pool is 'finale'. */
  damage(hits: number): BossEvent[] {
    // Written this way round so a NaN is turned away too.
    if (this.at !== 'fight' || !(hits > 0)) return [];
    this.left = Math.max(0, this.left - hits);
    if (this.left > 0) return [];
    if (this.index === this.pools.length - 1) {
      this.at = 'finale';
      return [{ type: 'step', step: 'finale' }];
    }
    this.index++;
    this.left = this.poolMax;
    return [{ type: 'phase', phase: this.index }];
  }
}

/** One hit on a part, in BrickSystem's units. */
export interface BossHit {
  cause: string;
  damage: number;
  lethal?: boolean;
  stripArmor?: boolean;
}

/** Brick damage as boss hits, so health means the same on every difficulty. */
export function hitsFor(hit: BossHit, hitDamage: number): number {
  if (hit.lethal) return hit.cause === 'explosion' ? EXPLOSION_HITS : ABILITY_HITS;
  // A plain ball hit is one hit whatever the difficulty deals; Hyperspeed's double damage is two.
  if (hit.cause === 'ball' && !hit.stripArmor) return hit.damage / hitDamage;
  // Fireballs, lasers and abilities deal fixed damage, measured against a default brick.
  return hit.damage / BRICK_HEALTH;
}
