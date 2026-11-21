export const BONUS_IDS = ['gallery', 'pinata'] as const;
export type BonusId = (typeof BONUS_IDS)[number];

/** Arcade: the bonus round after the run's `n`th boss, counted from 1. The stages take turns. */
export function arcadeBonusFor(n: number): BonusId {
  return BONUS_IDS[Math.max(0, Math.floor(n) - 1) % BONUS_IDS.length]!;
}

/** The stage flow, in order. A stage without an intro starts in `play`. */
export type BonusStep = 'intro' | 'play' | 'scoring' | 'tally' | 'done';

export const MEDALS = ['bronze', 'silver', 'gold'] as const;
export type Medal = 'none' | (typeof MEDALS)[number];

/** The intro's title band and rules card stay up this long, in ms. */
export const INTRO_MS = 2800;
/** Taps are ignored this long into the intro and the tally, in ms: a stray tap skips nothing. */
export const BONUS_SKIP_GUARD_MS = 400;
/** The timer is out: everything left on the field is pulled in over this long, in ms. */
export const SCORING_MS = 1600;
/** The tally stays up this long after the medal has landed before the stage ends by itself, in ms. */
export const TALLY_HOLD_MS = 9000;
/** The quiet before the first row counts, in ms, so the dim lands first. */
export const TALLY_LEAD_MS = 500;
/** Each row starts this long after the one before has finished counting, in ms. */
export const TALLY_ROW_GAP_MS = 220;
/** One count-up tick takes this long, in ms. */
export const TALLY_TICK_MS = 48;
/** A row counts up in at most this many ticks, however large its number. */
export const TALLY_MAX_TICKS = 18;
/** The medal slams in this long after the last row has counted, in ms. */
export const MEDAL_PAUSE_MS = 500;
/** The medal takes this long to land, in ms. A tap goes on from then. */
export const MEDAL_LAND_MS = 650;
/** How far one row's ticks climb in pitch, in cents, and how much higher each row starts. */
export const TALLY_ROW_CLIMB = 700;
export const TALLY_ROW_STEP = 100;
/** The combo multiplies points by this much from each of these combos on. */
export const COMBO_STEPS: ReadonlyArray<readonly [combo: number, multiplier: number]> = [
  [20, 3],
  [10, 2],
  [5, 1.5],
];

export type MedalBy = 'score' | 'coins';

/** What a slip costs. Nothing in a bonus stage costs a life, and nothing ends it early. */
export interface Penalty {
  /** Points taken off, never below zero. */
  score?: number;
  /** Coins taken back from the stage's haul, never below zero. */
  coins?: number;
  /** What happens to the combo. Left out, it is kept. */
  combo?: 'reset' | 'halve';
}

/** What a penalty took. */
export interface PenaltyTaken {
  score: number;
  coins: number;
  combo: number;
}

/** One line of the tally: a stat the stage counted, as it reads on the card. */
export interface TallyRow {
  label: string;
  value: number;
  /** Shown after the number, e.g. "%". */
  suffix?: string;
  /** Shown before the number, e.g. "x" for a combo. */
  prefix?: string;
  /** How the row sounds as it counts: the stage's own stats tick, the score rolls, coins chime. */
  kind?: 'stat' | 'score' | 'coins';
}

/** Everything a stage counted, for its tally rows and the medal. */
export interface BonusStats {
  score: number;
  coins: number;
  bestCombo: number;
  /** The stage's own counters, by name. */
  counts: Readonly<Record<string, number>>;
}

/** The numbers BonusState runs on. BonusDirector derives one from a BonusDef. */
export interface BonusSpec {
  /** Length of the timed part, in ms of the stage clock. */
  durationMs: number;
  /** Bronze, silver and gold, in whatever `medalBy` counts. */
  medals: readonly [number, number, number];
  /** What the medals count: the score, or the coins caught. The score when left out. */
  medalBy?: MedalBy;
  /** What a lost ball costs. */
  ballLost: Penalty;
  /** The stage's rows on the tally, before the score and the coins. */
  tally(stats: BonusStats): TallyRow[];
}

/** What the stage earns at the end, on top of the coins caught in it. */
export interface BonusReward {
  coins: number;
  /** One-use ability charges stocked for the next level. */
  abilityCharges: number;
}

export const MEDAL_REWARDS: Record<Medal, BonusReward> = {
  none: { coins: 0, abilityCharges: 0 },
  bronze: { coins: 5, abilityCharges: 0 },
  silver: { coins: 10, abilityCharges: 0 },
  gold: { coins: 20, abilityCharges: 1 },
};

export function rewardFor(medal: Medal): BonusReward {
  return MEDAL_REWARDS[medal];
}

/** The best medal `score` reaches. */
export function medalFor(score: number, thresholds: readonly [number, number, number]): Medal {
  for (let i = MEDALS.length - 1; i >= 0; i--) if (score >= thresholds[i]!) return MEDALS[i]!;
  return 'none';
}

/** Stars a cleared bonus stage records: one for taking part, one more for each medal above bronze. */
export function starsFor(medal: Medal): number {
  return medal === 'none' ? 1 : MEDALS.indexOf(medal) + 1;
}

/** What the combo multiplies points by. */
export function comboMultiplier(combo: number): number {
  for (const [from, mult] of COMBO_STEPS) if (combo >= from) return mult;
  return 1;
}

/** One sound of the count-up: the row it belongs to, the number it shows, and its pitch in cents. */
export interface TallyTick {
  at: number;
  row: number;
  value: number;
  pitch: number;
}

/** When one row counts, in ms into the tally. */
export interface TallyRowTime {
  start: number;
  end: number;
}

/** The whole count-up, worked out once when the tally starts. */
export interface TallyTimeline {
  rows: TallyRowTime[];
  ticks: TallyTick[];
  /** The medal slams in. */
  medalAt: number;
  /** The medal has landed: a tap goes on from here. */
  readyAt: number;
  /** The stage ends by itself. */
  endAt: number;
}

/** Ticks a row of `value` counts up in: one per unit for small numbers, never more than the cap. */
export function tallyTicks(value: number): number {
  const v = Math.max(0, Math.floor(value));
  return Math.min(v, TALLY_MAX_TICKS);
}

/** When every row counts, every tick sounds, and the medal lands. Pure, so the feel can be tested. */
export function tallyTimeline(rows: readonly TallyRow[]): TallyTimeline {
  const times: TallyRowTime[] = [];
  const ticks: TallyTick[] = [];
  let t = TALLY_LEAD_MS;
  rows.forEach((row, i) => {
    const n = tallyTicks(row.value);
    const start = t;
    const end = start + n * TALLY_TICK_MS;
    for (let k = 1; k <= n; k++) {
      ticks.push({
        at: start + k * TALLY_TICK_MS,
        row: i,
        value: Math.round((row.value * k) / n),
        pitch: i * TALLY_ROW_STEP + (TALLY_ROW_CLIMB * k) / n,
      });
    }
    times.push({ start, end });
    t = end + TALLY_ROW_GAP_MS;
  });
  const last = times[times.length - 1]?.end ?? TALLY_LEAD_MS;
  const medalAt = last + MEDAL_PAUSE_MS;
  const readyAt = medalAt + MEDAL_LAND_MS;
  return { rows: times, ticks, medalAt, readyAt, endAt: readyAt + TALLY_HOLD_MS };
}

/** The number a row shows `ms` into the tally: nothing before it starts, all of it once counted. */
export function tallyValue(timeline: TallyTimeline, rows: readonly TallyRow[], i: number, ms: number): number {
  const time = timeline.rows[i];
  const row = rows[i];
  if (!time || !row || ms < time.start) return 0;
  if (ms >= time.end) return row.value;
  const n = tallyTicks(row.value);
  const k = Math.floor((ms - time.start) / TALLY_TICK_MS);
  return n > 0 ? Math.round((row.value * k) / n) : row.value;
}

export type BonusEvent = { type: 'step'; step: BonusStep };

/** The rules of a bonus stage, without the engine: the step, the timer, the score, the combo, the tally. */
export class BonusState {
  private at: BonusStep;
  private inStep = 0;
  /** Time since the state was created, in ms. The intro's skip guard counts from here. */
  private age = 0;
  private played = 0;
  private points = 0;
  private chain = 0;
  private best = 0;
  private caught = 0;
  private readonly counters: Record<string, number> = {};
  private rows: TallyRow[] = [];
  private timeline?: TallyTimeline;

  /** Starts in 'intro', or in 'play' when `intro` is false. */
  constructor(
    private readonly spec: BonusSpec,
    opts: { intro?: boolean } = {},
  ) {
    this.at = opts.intro === false ? 'play' : 'intro';
  }

  get step(): BonusStep {
    return this.at;
  }

  /** Time spent in the current step, in ms. */
  get stepMs(): number {
    return this.inStep;
  }

  /** Time played, in ms of the stage clock. */
  get clock(): number {
    return this.played;
  }

  get durationMs(): number {
    return this.spec.durationMs;
  }

  get timeLeftMs(): number {
    return Math.max(0, this.spec.durationMs - this.played);
  }

  /** 0 at the start of play, 1 when the timer is out. */
  get progress(): number {
    return this.spec.durationMs > 0 ? Math.min(1, this.played / this.spec.durationMs) : 1;
  }

  get score(): number {
    return this.points;
  }

  get combo(): number {
    return this.chain;
  }

  get multiplier(): number {
    return comboMultiplier(this.chain);
  }

  get bestCombo(): number {
    return this.best;
  }

  get coins(): number {
    return this.caught;
  }

  get counts(): Readonly<Record<string, number>> {
    return this.counters;
  }

  get medalBy(): MedalBy {
    return this.spec.medalBy ?? 'score';
  }

  /** What the medals are measured on: the score or the coins. */
  get medalValue(): number {
    return this.medalBy === 'coins' ? this.caught : this.points;
  }

  get medal(): Medal {
    return medalFor(this.medalValue, this.spec.medals);
  }

  get medals(): readonly [number, number, number] {
    return this.spec.medals;
  }

  get stats(): BonusStats {
    return { score: this.points, coins: this.caught, bestCombo: this.best, counts: { ...this.counters } };
  }

  /** The tally's rows, from the moment it starts. Empty before. */
  get tallyRows(): readonly TallyRow[] {
    return this.rows;
  }

  /** The count-up, from the moment the tally starts. */
  get tally(): TallyTimeline | undefined {
    return this.timeline;
  }

  /** How long the current step lasts, in ms. Infinity for the end, which time never ends. */
  get stepLength(): number {
    switch (this.at) {
      case 'intro':
        return INTRO_MS;
      case 'play':
        return this.spec.durationMs;
      case 'scoring':
        return SCORING_MS;
      case 'tally':
        return this.timeline?.endAt ?? Infinity;
      case 'done':
        return Infinity;
    }
  }

  /** Advances the stage clock by `dt` ms and moves on from every step whose time is up. */
  tick(dt: number): BonusEvent[] {
    // Written this way round so a NaN leaves the clocks alone.
    const passed = dt > 0 ? dt : 0;
    this.age += passed;
    this.inStep += passed;
    if (this.at === 'play') this.played = Math.min(this.spec.durationMs, this.played + passed);
    const events: BonusEvent[] = [];
    // Time left over carries on, so a step with no length is entered and left in the same tick.
    while (this.at !== 'done' && this.inStep >= this.stepLength) {
      const over = this.inStep - this.stepLength;
      events.push(this.enter(this.next()));
      this.inStep = over;
    }
    return events;
  }

  /**
   * Scores `base` points, times the combo multiplier when it `combo`s, which also adds one to the
   * combo. Only in play. Returns the points given.
   */
  award(base: number, opts: { combo?: boolean } = {}): number {
    if (this.at !== 'play' || !(base > 0)) return 0;
    const combo = opts.combo ?? true;
    if (combo) {
      this.chain++;
      this.best = Math.max(this.best, this.chain);
    }
    const given = Math.round(base * (combo ? comboMultiplier(this.chain) : 1));
    this.points += given;
    return given;
  }

  /** Takes off what `p` costs. Never ends the stage. Returns what it took. */
  penalty(p: Penalty): PenaltyTaken {
    if (this.at !== 'play') return { score: 0, coins: 0, combo: 0 };
    const score = Math.min(this.points, Math.max(0, Math.round(p.score ?? 0)));
    this.points -= score;
    const coins = Math.min(this.caught, Math.max(0, Math.floor(p.coins ?? 0)));
    this.caught -= coins;
    const was = this.chain;
    if (p.combo === 'reset') this.chain = 0;
    else if (p.combo === 'halve') this.chain = Math.floor(this.chain / 2);
    return { score, coins, combo: was - this.chain };
  }

  /** A ball was lost. It costs what the stage says and nothing else: the stage cannot be failed. */
  onBallLost(): PenaltyTaken {
    if (this.at !== 'play') return { score: 0, coins: 0, combo: 0 };
    this.count('ballsLost');
    return this.penalty(this.spec.ballLost);
  }

  /** Coins caught. The stage holds them, and they are banked when it ends. */
  addCoins(n: number): void {
    if (n > 0 && this.at !== 'done') this.caught += Math.floor(n);
  }

  /** Adds `n` to one of the stage's own counters. */
  count(key: string, n = 1): void {
    if (this.at !== 'play' && this.at !== 'scoring') return;
    this.counters[key] = (this.counters[key] ?? 0) + n;
  }

  /**
   * A tap. Skips the intro once its guard has passed. In the tally the first tap finishes the
   * count, and a tap once the medal has landed ends the stage.
   */
  skip(): BonusEvent[] {
    if (this.at === 'intro') {
      return this.age < BONUS_SKIP_GUARD_MS ? [] : [this.enter('play')];
    }
    if (this.at !== 'tally' || !this.timeline || this.inStep < BONUS_SKIP_GUARD_MS) return [];
    if (this.inStep >= this.timeline.readyAt) return [this.enter('done')];
    this.inStep = Math.max(this.inStep, this.timeline.medalAt);
    return [];
  }

  /** Dev tools: runs the timer out. */
  endTimer(): BonusEvent[] {
    const events: BonusEvent[] = this.at === 'intro' ? [this.enter('play')] : [];
    if (this.at !== 'play') return events;
    this.played = this.spec.durationMs;
    events.push(this.enter('scoring'));
    return events;
  }

  /** Dev tools: fills the stage's numbers as if it had been played, for a look at the tally. */
  debugFill(stats: BonusStats): void {
    this.points = Math.max(0, Math.round(stats.score));
    this.caught = Math.max(0, Math.floor(stats.coins));
    this.best = Math.max(0, Math.floor(stats.bestCombo));
    Object.assign(this.counters, stats.counts);
  }

  private next(): BonusStep {
    switch (this.at) {
      case 'intro':
        return 'play';
      case 'play':
        return 'scoring';
      case 'scoring':
        return 'tally';
      case 'tally':
      case 'done':
        return 'done';
    }
  }

  private enter(step: BonusStep): BonusEvent {
    this.at = step;
    this.inStep = 0;
    if (step === 'tally') {
      const stats = this.stats;
      this.rows = [
        ...this.spec.tally(stats).map((r) => ({ kind: 'stat' as const, ...r })),
        { label: 'Score', value: stats.score, kind: 'score' },
        { label: 'Coins', value: stats.coins, kind: 'coins' },
      ];
      this.timeline = tallyTimeline(this.rows);
    }
    return { type: 'step', step };
  }
}
