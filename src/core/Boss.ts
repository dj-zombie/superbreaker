import type { MusicMood } from './MusicMood';
import { BRICK_HEALTH } from './procgen/grid';
import type { DifficultyId } from './types';

export const BOSS_IDS = ['warden'] as const;
export type BossId = (typeof BOSS_IDS)[number];

/** The fight flow, in order. A fight without an intro starts in `fight`. */
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
    /** Length of the phase's entry cutscene, in ms. Without one the fight never stops for it. */
    enterMs?: number;
  }>;
  /** Length of the entrance cutscene, in ms. */
  entranceMs?: number;
  /** Length of the death cutscene, in ms. */
  deathMs?: number;
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
/** Silence before the entrance, in ms. */
export const HUSH_MS = 900;
/** `Backdrop.setDark` amount from the hush until the reveal. Skipped under reduced motion. */
export const HUSH_DARK = 0.45;
/** How far above rest the sprite starts its entrance, in px. */
export const ENTRANCE_DROP = 40;
/** Length of the title band and the swell, in ms. */
export const REVEAL_MS = 2400;
/** Calm after the death before the level ends, in ms. */
export const AFTERMATH_MS = 1800;
/** Taps are ignored this long into the intro or a phase scene, in ms: a stray tap skips nothing. */
export const SKIP_GUARD_MS = 400;
/** Seconds the boss track takes to fade in from silence. */
export const BOSS_SWELL_S = 1.6;
/** Sound key of the ending phrase: a placeholder until the boss song brings its own. */
export const BOSS_STINGER = 'fanfare_stab';

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

/** The boss track's moods. Boss code names these; the framework decides when each plays. */
export const BOSS_MOODS = ['rise', 'low', 'mid', 'high', 'rest'] as const;
export type BossMood = (typeof BOSS_MOODS)[number];
/** How hard the track plays during a phase. */
export type BossIntensity = 'low' | 'mid' | 'high';

/** Which mood of the level song stands in for each boss mood until the boss song exists. */
export const BOSS_MOOD_FALLBACK: Record<BossMood, MusicMood> = {
  rise: 'build',
  low: 'groove',
  mid: 'drive',
  high: 'fever',
  rest: 'menu',
};

export type BossEvent = { type: 'step'; step: BossStep } | { type: 'phase'; phase: number };

/** The rules of a boss fight, without the engine: the step, the phase and its pool. */
export class BossState {
  /** Every phase's pool in hits, scaled for the difficulty. */
  private readonly pools: number[];
  private readonly total: number;
  /** Every phase's entry cutscene length, in ms. */
  private readonly enters: number[];
  private readonly entranceMs: number;
  private readonly deathMs: number;
  private at: BossStep;
  private index: number;
  private left: number;
  private inStep = 0;
  /** Time since the state was created, in ms. The intro's skip guard counts from here. */
  private age = 0;

  /** Starts in 'fight' at `phase`, or in 'hush' when `intro` is set. */
  constructor(spec: BossSpec, tuning: BossTuning, opts: { phase?: number; intro?: boolean } = {}) {
    if (spec.phases.length === 0) throw new Error('BossState needs at least one phase');
    this.pools = spec.phases.map((p) => Math.max(1, Math.round(p.hits * tuning.health)));
    this.total = this.pools.reduce((sum, pool) => sum + pool, 0);
    this.enters = spec.phases.map((p) => Math.max(0, p.enterMs ?? 0));
    this.entranceMs = Math.max(0, spec.entranceMs ?? 0);
    this.deathMs = Math.max(0, spec.deathMs ?? 0);
    this.index = Math.max(0, Math.min(this.pools.length - 1, Math.floor(opts.phase ?? 0)));
    this.left = this.poolMax;
    this.at = opts.intro ? 'hush' : 'fight';
  }

  get step(): BossStep {
    return this.at;
  }

  /** Time spent in the current step, in ms. */
  get stepMs(): number {
    return this.inStep;
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
    if (this.index === this.pools.length - 1) return [this.enter('finale')];
    this.index++;
    this.left = this.poolMax;
    const events: BossEvent[] = [{ type: 'phase', phase: this.index }];
    // A phase without an entry scene starts at once: the fight never stops for it.
    if (this.enters[this.index]! > 0) events.push(this.enter('transition'));
    return events;
  }

  /** Advances the fight clock by `dt` ms and moves on from every step whose time is up. */
  tick(dt: number, _ballInPlay: boolean): BossEvent[] {
    // Written this way round so a NaN leaves the clocks alone.
    if (dt > 0) {
      this.age += dt;
      this.inStep += dt;
    }
    const events: BossEvent[] = [];
    // Time left over carries on, so a step with no length is entered and left in the same tick.
    for (let timed = this.timed(); timed && this.inStep >= timed.ms; timed = this.timed()) {
      const over = this.inStep - timed.ms;
      events.push(this.enter(timed.next));
      this.inStep = over;
    }
    return events;
  }

  /** A tap: jumps to the fight from the intro or a phase scene, once the guard has passed. */
  skip(): BossEvent[] {
    const intro = this.at === 'hush' || this.at === 'entrance' || this.at === 'reveal';
    if (!intro && this.at !== 'transition') return [];
    // The intro's guard counts from its very start, a phase scene's from the scene's.
    if ((intro ? this.age : this.inStep) < SKIP_GUARD_MS) return [];
    return [this.enter('fight')];
  }

  /** How long the current step lasts and what follows it; null for a step time does not end. */
  private timed(): { ms: number; next: BossStep } | null {
    switch (this.at) {
      case 'hush':
        return { ms: HUSH_MS, next: 'entrance' };
      case 'entrance':
        return { ms: this.entranceMs, next: 'reveal' };
      case 'reveal':
        return { ms: REVEAL_MS, next: 'fight' };
      case 'transition':
        return { ms: this.enters[this.index]!, next: 'fight' };
      case 'finale':
        return { ms: this.deathMs, next: 'aftermath' };
      case 'aftermath':
        return { ms: AFTERMATH_MS, next: 'done' };
      case 'fight':
      case 'done':
        return null;
    }
  }

  private enter(step: BossStep): BossEvent {
    this.at = step;
    this.inStep = 0;
    return { type: 'step', step };
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
