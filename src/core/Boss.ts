import type { MusicMood } from './MusicMood';
import type { Rng } from './Rng';
import { BRICK_HEALTH } from './procgen/grid';
import { FIELD_WIDTH, type DifficultyId } from './types';

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

/** Where the fight is in its attack cycle: calm, warning, hurting, then open to be hit. */
export type AttackWindow = 'gap' | 'windup' | 'live' | 'recover';

/** The numbers BossState runs on. BossDirector derives one from a BossDef. */
export interface BossSpec {
  phases: Array<{
    /** The phase's pool, in plain ball hits on Normal. */
    hits: number;
    /** Length of the phase's entry cutscene, in ms. Without one the fight never stops for it. */
    enterMs?: number;
    /** The calm between attacks at a full and at an empty pool, in ms on Normal. */
    gapMs?: [number, number];
    /** The phase's attacks, played in order and wrapping. Without any the phase never attacks. */
    deck?: AttackTiming[];
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
/** Coins for the kill. */
export const BOSS_DEFEAT_COINS = 25;
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
/** Black and silence before the entrance, in ms: long enough for the screen to go fully dark. */
export const HUSH_MS = 1600;
/** How black the screen goes from the hush until the boss is unveiled, 0..1. Skipped under reduced motion. */
export const HUSH_DARK = 1;
/** How far above rest the sprite starts its entrance, in px. */
export const ENTRANCE_DROP = 40;
/** The shortest the title card and the swell last, in ms. A longer title sound holds them longer. */
export const REVEAL_MS = 3600;
/** The boss track plays this long after the title's sound has ended before play begins, in ms. */
export const MUSIC_LEAD_MS = 1000;
/** The award stays up this long before the level ends by itself, in ms. */
export const AFTERMATH_MS = 12_000;
/** Taps are ignored this long after the award goes up, in ms, so it is seen before it is left. */
export const AWARD_GUARD_MS = 1800;
/** The keepsake lands this long after the award goes up, in ms. The award's chime plays with it. */
export const AWARD_TROPHY_MS = 900;
/** The quiet between the ending phrase ringing out and the award going up, in ms. */
export const AWARD_BREAK_MS = 1000;
/** Taps are ignored this long into the intro or a phase scene, in ms: a stray tap skips nothing. */
export const SKIP_GUARD_MS = 400;
/** The letterbox bars take this long to come in or to go out, in ms. */
export const BARS_MS = 450;
/** Seconds the boss track takes to come in. Short: the song opens on its loudest notes. */
export const BOSS_SWELL_S = 0.05;
/** Sound key of the ending phrase, played once the boss is dead: a placeholder theme. */
export const BOSS_STINGER = 'boss_victory';
/** The calm between attacks at a full and at an empty pool for a phase that names none, in ms. */
export const DEFAULT_GAP_MS: readonly [number, number] = [2600, 1600];
/** Shortest wind-up after difficulty scaling, in ms: a warning nobody can read is no warning. */
export const MIN_WINDUP_MS = 500;
/** Shortest flight of a shot, in ms. */
export const MIN_FLIGHT_MS = 700;
/** Shortest flight of a skull, in ms: it costs a life, so it is slow enough to walk away from. */
export const MIN_SKULL_FLIGHT_MS = 1600;
/** Most skulls in one plan. */
export const MAX_SKULLS = 2;
/** Longest one hazard may jam the paddle, in ms. */
export const MAX_JAM_MS = 900;
/** Calm after a lost life before the next wind-up, in ms. */
export const REGROUP_MS = 1200;
/** Most hazards one plan may hold. */
export const MAX_HAZARDS = 48;
/** Paddle line that stays free at every moment, in px: the widest paddle (104 x 1.7) and a margin. */
export const SAFE_GAP = 200;
/** Half-width of a shot on the paddle line, in px. */
export const SHOT_RADIUS = 10;
/** Half-width of a skull on the paddle line, in px. */
export const SKULL_RADIUS = 16;
/** A shot or skull holds its landing spot this long either side of landing, in ms. */
export const LAND_MS = 150;
/** A ball this close to a flying skull's centre breaks it, in px: the skull's half-width and the ball's. */
export const SKULL_POP_RADIUS = 26;
/** The least a shrink may leave of the paddle's width: the floor Paddle.resize keeps. */
const MIN_SHRINK = 0.6;

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

/**
 * How far in something staged is, 0..1, at `ms` into a stretch `lengthMs` long: it comes in over
 * the first `inMs` and goes out over the last `outMs`. Either may be 0, for a full start or end.
 */
export function envelope(ms: number, lengthMs: number, inMs: number, outMs: number): number {
  const rise = inMs > 0 ? ms / inMs : 1;
  const fall = outMs > 0 ? (lengthMs - ms) / outMs : 1;
  // Written this way round so a NaN comes out as 0.
  const k = Math.min(1, rise, fall);
  return k > 0 ? k : 0;
}

/**
 * How far in the letterbox bars are, 0..1, `stepMs` into a step `lengthMs` long. They close for
 * every scene and are never on the field while the ball is live.
 */
export function letterbox(step: BossStep, stepMs: number, lengthMs: number): number {
  switch (step) {
    case 'hush':
    case 'finale':
      return envelope(stepMs, lengthMs, BARS_MS, 0);
    case 'entrance':
    case 'aftermath':
      return 1;
    case 'reveal':
      return envelope(stepMs, lengthMs, 0, BARS_MS);
    case 'transition':
      return envelope(stepMs, lengthMs, BARS_MS, BARS_MS);
    case 'fight':
    case 'done':
      return 0;
  }
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

/** What happens to the paddle a hazard lands on. */
export type PaddleEffect =
  /** The paddle holds still for `ms`. It still bounces the ball. */
  | { kind: 'jam'; ms: number }
  /** The paddle narrows by `factor`, as the `smaller` pickup narrows it. */
  | { kind: 'shrink'; factor: number };

/**
 * One thing an attack throws at the paddle line. `x` is where it lands, in field px; `at` is ms
 * after the live window opens. A shot or skull is written by `flightMs`, the time from leaving
 * its part to reaching the line, so the time to react is the same in a short and a tall arena.
 */
export type HazardSpec =
  | { kind: 'shot'; from: string; x: number; at: number; flightMs: number; onPaddle: PaddleEffect }
  | { kind: 'beam'; x: number; width: number; at: number; liveMs: number; onPaddle: PaddleEffect }
  /** Takes a life. */
  | { kind: 'skull'; from: string; x: number; at: number; flightMs: number };

/** Everything one attack will do, decided when its wind-up starts. Warnings are drawn from it. */
export interface AttackPlan {
  hazards: HazardSpec[];
}

/** What an attack may look at to make its plan: the field as the wind-up starts. */
export interface BossView {
  rng: Rng;
  /** 0 at a full pool, 1 at an empty one. */
  phaseProgress: number;
  paddle: { x: number; width: number };
  /** Balls in flight. */
  balls: Array<{ x: number; y: number; vx: number; vy: number }>;
  /** Centre and size of every part still on the field, by part id. */
  parts: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface AttackDef {
  id: string;
  /** Warning time before anything can hurt, in ms on Normal. */
  windupMs: number;
  /** Every hazard in the plan ends inside this, in ms. */
  liveMs: number;
  /** The opening after the attack, in ms. */
  recoverMs: number;
  /** Sound of the wind-up. The `tell` animation always plays. */
  tell?: { sfx?: string };
  /** What the boss gives away while it recovers: a pose to hold and a part to mark. */
  opening?: { pose?: string; lock?: string };
  plan(v: BossView): AttackPlan;
}

/** What the attack cycle needs of an attack: its id and how long each of its windows lasts. */
export type AttackTiming = Pick<AttackDef, 'id' | 'windupMs' | 'liveMs' | 'recoverMs'>;

/** How long an attack warns on a difficulty, in ms: never under the floor, however hard. */
export function windupFor(attack: { windupMs: number }, tuning: BossTuning): number {
  return Math.max(MIN_WINDUP_MS, attack.windupMs * tuning.windup);
}

export type BossEvent =
  | { type: 'step'; step: BossStep }
  | { type: 'phase'; phase: number }
  /** The attack cycle moved on. `attack` is the attack's id, or null in the gap. */
  | { type: 'window'; window: AttackWindow; attack: string | null };

/** The rules of a boss fight, without the engine: the step, the phase, its pool and its attacks. */
export class BossState {
  /** Every phase's pool in hits, scaled for the difficulty. */
  private readonly pools: number[];
  private readonly total: number;
  /** Every phase's entry cutscene length, in ms. */
  private readonly enters: number[];
  /** Every phase's attacks. An empty deck never attacks. */
  private readonly decks: AttackTiming[][];
  /** Every phase's calm between attacks at a full and at an empty pool, in ms on Normal. */
  private readonly gaps: Array<readonly [number, number]>;
  private readonly entranceMs: number;
  private readonly deathMs: number;
  private at: BossStep;
  private index: number;
  private left: number;
  private inStep = 0;
  /** The current step lasts at least this long, in ms. */
  private held = 0;
  /** How far into the aftermath the award goes up, in ms. */
  private awardAt = 0;
  /** Time since the state was created, in ms. The intro's skip guard counts from here. */
  private age = 0;
  private win: AttackWindow = 'gap';
  /** The attack being played. None in the gap. */
  private current: AttackTiming | null = null;
  /** Where in the phase's deck the next attack comes from. */
  private next = 0;
  /** Time spent in the current window with a ball in play, in ms. */
  private inWindow = 0;
  /** How long the current gap lasts after a lost life, in ms. Null is the phase's own gap. */
  private regroup: number | null = null;

  /** Starts in 'fight' at `phase`, or in 'hush' when `intro` is set. */
  constructor(
    spec: BossSpec,
    private readonly tuning: BossTuning,
    opts: { phase?: number; intro?: boolean } = {},
  ) {
    if (spec.phases.length === 0) throw new Error('BossState needs at least one phase');
    this.pools = spec.phases.map((p) => Math.max(1, Math.round(p.hits * tuning.health)));
    this.total = this.pools.reduce((sum, pool) => sum + pool, 0);
    this.enters = spec.phases.map((p) => Math.max(0, p.enterMs ?? 0));
    this.decks = spec.phases.map((p) => p.deck ?? []);
    this.gaps = spec.phases.map((p) => p.gapMs ?? DEFAULT_GAP_MS);
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

  /** How long the current step lasts, in ms. Infinity for the fight and the end, which time never ends. */
  get stepLength(): number {
    return this.timed()?.ms ?? Infinity;
  }

  /** Where the attack cycle is. Always 'gap' outside the fight. */
  get window(): AttackWindow {
    return this.win;
  }

  /** Id of the attack being played, or null in the gap. */
  get attack(): string | null {
    return this.current?.id ?? null;
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
    // An attack belongs to the pool it began in: it ends with it, and the next deck starts fresh.
    const events = this.calm();
    this.next = 0;
    if (this.index === this.pools.length - 1) {
      events.push(this.enter('finale'));
      return events;
    }
    this.index++;
    this.left = this.poolMax;
    events.push({ type: 'phase', phase: this.index });
    // A phase without an entry scene starts at once: the fight never stops for it.
    if (this.enters[this.index]! > 0) events.push(this.enter('transition'));
    return events;
  }

  /**
   * Advances the fight clock by `dt` ms and moves on from every step whose time is up. In the
   * fight it also runs the attack cycle, which waits while no ball is in play.
   */
  tick(dt: number, ballInPlay: boolean): BossEvent[] {
    // Written this way round so a NaN leaves the clocks alone.
    const passed = dt > 0 ? dt : 0;
    this.age += passed;
    this.inStep += passed;
    // How much of this tick was spent in the fight: all of it, unless the fight began part-way.
    let fought = passed;
    const events: BossEvent[] = [];
    // Time left over carries on, so a step with no length is entered and left in the same tick.
    for (let timed = this.timed(); timed && this.inStep >= timed.ms; timed = this.timed()) {
      const over = this.inStep - timed.ms;
      events.push(this.enter(timed.next));
      this.inStep = over;
      fought = over;
    }
    if (this.at === 'fight' && ballInPlay) this.cycle(fought, events);
    return events;
  }

  /**
   * A life was lost: any attack ends, and the next wind-up is at least REGROUP_MS of play away.
   * The attack that was cut short is not played again; the deck carries on after it.
   */
  onLifeLost(): BossEvent[] {
    if (this.at !== 'fight') return [];
    if (this.win === 'gap') {
      // Already calm: the gap runs on, for no less than the breather from here.
      this.regroup = Math.max(this.windowLength(), this.inWindow + REGROUP_MS);
      return [];
    }
    const events = this.calm();
    this.regroup = REGROUP_MS;
    return events;
  }

  /**
   * A tap: jumps to the fight from the intro or a phase scene, and goes on from the award, once
   * the step's guard has passed. The death scene is never cut short.
   */
  skip(): BossEvent[] {
    if (this.at === 'aftermath') return this.awardMs < AWARD_GUARD_MS ? [] : [this.enter('done')];
    const intro = this.at === 'hush' || this.at === 'entrance' || this.at === 'reveal';
    if (!intro && this.at !== 'transition') return [];
    // The intro's guard counts from its very start, a phase scene's from the scene's.
    if ((intro ? this.age : this.inStep) < SKIP_GUARD_MS) return [];
    return [this.enter('fight')];
  }

  /**
   * The current step, if time ends it, lasts at least `ms` from its start: a sound it played can
   * ring out. Never shortens a step; the next step starts with no hold.
   */
  holdUntil(ms: number): void {
    if (ms > this.held) this.held = ms;
  }

  /**
   * In the aftermath, the award goes up `ms` in rather than at once: the ending phrase is heard on
   * its own first. Its guard and its time on screen count from then.
   */
  delayAward(ms: number): void {
    if (this.at === 'aftermath' && ms > this.awardAt) this.awardAt = ms;
  }

  /** Time the award has been up, in ms. Negative while it waits, and outside the aftermath. */
  get awardMs(): number {
    return this.at === 'aftermath' ? this.inStep - this.awardAt : -Infinity;
  }

  /** How long the current step lasts and what follows it; null for a step time does not end. */
  private timed(): { ms: number; next: BossStep } | null {
    const timed = this.baseTimed();
    return timed && { ms: Math.max(timed.ms, this.held), next: timed.next };
  }

  private baseTimed(): { ms: number; next: BossStep } | null {
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
        return { ms: this.awardAt + AFTERMATH_MS, next: 'done' };
      case 'fight':
      case 'done':
        return null;
    }
  }

  private enter(step: BossStep): BossEvent {
    this.at = step;
    this.inStep = 0;
    this.held = 0;
    this.awardAt = 0;
    return { type: 'step', step };
  }

  /** Runs the attack cycle for `dt` ms of fight with a ball in play, adding to `events`. */
  private cycle(dt: number, events: BossEvent[]): void {
    const deck = this.decks[this.index]!;
    // A tick without an end would never leave the loop below.
    if (deck.length === 0 || !Number.isFinite(dt)) return;
    this.inWindow += dt;
    // Time left over carries on, as it does between steps. A wind-up is never empty, so this ends.
    for (let ms = this.windowLength(); this.inWindow >= ms; ms = this.windowLength()) {
      this.inWindow -= ms;
      events.push(this.advance(deck));
    }
  }

  /** How long the current window lasts, in ms. */
  private windowLength(): number {
    const attack = this.current;
    if (this.win === 'gap' || !attack) {
      if (this.regroup !== null) return this.regroup;
      const [full, empty] = this.gaps[this.index]!;
      const drained = 1 - this.left / this.poolMax;
      return Math.max(0, (full + (empty - full) * drained) * this.tuning.gap);
    }
    if (this.win === 'windup') return windupFor(attack, this.tuning);
    return Math.max(0, this.win === 'live' ? attack.liveMs : attack.recoverMs);
  }

  /** Moves to the window after this one, taking the deck's next attack on the way out of a gap. */
  private advance(deck: readonly AttackTiming[]): BossEvent {
    switch (this.win) {
      case 'gap':
        this.current = deck[this.next % deck.length]!;
        this.next = (this.next + 1) % deck.length;
        this.regroup = null;
        this.win = 'windup';
        break;
      case 'windup':
        this.win = 'live';
        break;
      case 'live':
        this.win = 'recover';
        break;
      case 'recover':
        this.win = 'gap';
        this.current = null;
        break;
    }
    return { type: 'window', window: this.win, attack: this.attack };
  }

  /** Ends any attack and starts the gap over. An event only when an attack was under way. */
  private calm(): BossEvent[] {
    const was = this.win;
    this.win = 'gap';
    this.current = null;
    this.inWindow = 0;
    this.regroup = null;
    return was === 'gap' ? [] : [{ type: 'window', window: 'gap', attack: null }];
  }
}

/** Where on the paddle line a hazard is, and from when to when, for the fairness checks. */
function occupancy(h: HazardSpec): { lo: number; hi: number; from: number; to: number } {
  if (h.kind === 'beam') {
    return { lo: h.x - h.width / 2, hi: h.x + h.width / 2, from: h.at, to: h.at + h.liveMs };
  }
  const radius = h.kind === 'skull' ? SKULL_RADIUS : SHOT_RADIUS;
  const land = h.at + h.flightMs;
  return { lo: h.x - radius, hi: h.x + radius, from: land - LAND_MS, to: land + LAND_MS };
}

/** The narrowest the widest free stretch of the paddle line gets while the plan is live, in px. */
export function safeGap(plan: AttackPlan): number {
  const spans = plan.hazards.map(occupancy);
  let narrowest = FIELD_WIDTH;
  // The line only gets more crowded at the moment a hazard arrives, so those moments are enough.
  for (const { from: now } of spans) {
    const there = spans.filter((s) => s.from <= now && now <= s.to).sort((a, b) => a.lo - b.lo);
    let widest = 0;
    let edge = 0;
    for (const s of there) {
      widest = Math.max(widest, Math.min(s.lo, FIELD_WIDTH) - edge);
      edge = Math.max(edge, s.hi);
    }
    narrowest = Math.min(narrowest, Math.max(widest, FIELD_WIDTH - edge));
  }
  return narrowest;
}

/** Every content rule a plan breaks, in words. Empty when the plan is fair. */
export function planProblems(
  plan: AttackPlan,
  attack: { liveMs: number },
  partIds: readonly string[],
): string[] {
  const { hazards } = plan;
  const problems: string[] = [];
  if (hazards.length > MAX_HAZARDS) {
    problems.push(`${hazards.length} hazards, and the most is ${MAX_HAZARDS}`);
  }
  let skulls = 0;
  let jams = 0;
  // Every comparison is written so that a NaN fails it.
  hazards.forEach((h, i) => {
    const name = `${h.kind} ${i}`;
    const end = h.at + (h.kind === 'beam' ? h.liveMs : h.flightMs);
    if (!(h.at >= 0)) problems.push(`${name} starts at ${h.at} ms, before the attack is live`);
    if (!(end <= attack.liveMs)) {
      problems.push(`${name} ends at ${end} ms, after the attack's ${attack.liveMs} ms`);
    }
    if (!(h.x >= 0 && h.x <= FIELD_WIDTH)) problems.push(`${name} is at x ${h.x}, off the field`);
    if (h.kind !== 'beam' && !partIds.includes(h.from)) {
      problems.push(`${name} comes from "${h.from}", which is not a part`);
    }
    if (h.kind === 'shot' && !(h.flightMs >= MIN_FLIGHT_MS)) {
      problems.push(`${name} flies ${h.flightMs} ms, under ${MIN_FLIGHT_MS}`);
    }
    if (h.kind === 'skull') {
      skulls++;
      if (!(h.flightMs >= MIN_SKULL_FLIGHT_MS)) {
        problems.push(`${name} flies ${h.flightMs} ms, under ${MIN_SKULL_FLIGHT_MS}`);
      }
      return;
    }
    const effect = h.onPaddle;
    if (effect.kind === 'jam') {
      jams++;
      if (!(effect.ms <= MAX_JAM_MS)) {
        problems.push(`${name} jams for ${effect.ms} ms, over ${MAX_JAM_MS}`);
      }
    } else if (!(effect.factor >= MIN_SHRINK && effect.factor <= 1)) {
      problems.push(`${name} shrinks by ${effect.factor}, outside ${MIN_SHRINK} to 1`);
    }
  });
  if (skulls > MAX_SKULLS) problems.push(`${skulls} skulls, and the most is ${MAX_SKULLS}`);
  // A jammed paddle cannot walk away from a skull.
  if (skulls > 0 && jams > 0) problems.push('a skull together with a jam');
  const gap = safeGap(plan);
  if (gap < SAFE_GAP) problems.push(`only ${gap} px of the paddle line is free, under ${SAFE_GAP}`);
  return problems;
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
