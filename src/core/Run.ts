import { scaleSpeeds, type DifficultyConfig } from './Difficulty';
import { tierParams } from './procgen/curve';

export const RUN_LOOPS = ['waves', 'descent'] as const;
export type RunLoop = (typeof RUN_LOOPS)[number];

export const GOAL_KINDS = ['endless', 'rounds', 'timed'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export type RunGoal =
  { kind: 'endless' } | { kind: 'rounds'; rounds: number } | { kind: 'timed'; ms: number };

/** Everything needed to start, or replay, an Arcade run. */
export interface RunConfig {
  loop: RunLoop;
  goal: RunGoal;
  seed: number;
}

export const DEFAULT_ROUNDS = 10;
export const DEFAULT_TIME_MS = 180_000;
/** Waves + Timed: clearing a wave adds this much time. */
export const WAVE_TIME_BONUS_MS = 15_000;
/** One extra life each time the tier passes a multiple of this. */
export const LIFE_EVERY_TIERS = 5;
/** Waves: score for clearing a wave, times its tier. */
export const WAVE_CLEAR_BONUS = 250;
export const DESCENT_ROWS_PER_TIER = 12;
/** Rows on the field when a Descent run starts. */
export const DESCENT_START_ROWS = 8;
/** Rows that shatter when a brick crosses the danger line. */
export const BREACH_ROWS = 4;

export function goalFor(kind: GoalKind): RunGoal {
  switch (kind) {
    case 'rounds':
      return { kind, rounds: DEFAULT_ROUNDS };
    case 'timed':
      return { kind, ms: DEFAULT_TIME_MS };
    default:
      return { kind: 'endless' };
  }
}

/** Saved bests are kept per loop and goal, e.g. `waves-timed`. */
export function runKey(loop: RunLoop, goal: GoalKind): string {
  return `${loop}-${goal}`;
}

export const LOOP_LABELS: Record<RunLoop, string> = { waves: 'Waves', descent: 'Descent' };
export const GOAL_LABELS: Record<GoalKind, string> = {
  endless: 'Endless',
  rounds: `${DEFAULT_ROUNDS} Rounds`,
  timed: `${DEFAULT_TIME_MS / 60_000} Minutes`,
};

/** "1 wave", "12 rows": how far a run got, in the loop's unit. */
export function reachLabel(loop: RunLoop, reach: number): string {
  const unit = loop === 'waves' ? 'wave' : 'row';
  return `${reach} ${unit}${reach === 1 ? '' : 's'}`;
}

/** Descent: time between steps. Faster each tier, with a floor. */
export function descentStepMs(tier: number): number {
  return Math.max(3500, 9000 - 400 * (Math.max(1, tier) - 1));
}

/** The difficulty's ball speeds, scaled up for a tier. */
export function scaleDifficulty(diff: DifficultyConfig, tier: number): DifficultyConfig {
  return scaleSpeeds(diff, tierParams(tier).speedScale);
}

export type RunOutcome = 'playing' | 'complete' | 'over';

export interface RunProgress {
  /** The tier went up. */
  tierUp: boolean;
  /** The new tier earns an extra life. */
  extraLife: boolean;
}

/** The rules of a run, without the engine: tier, reach, clock and outcome. */
export class RunState {
  tier = 1;
  /** Waves cleared, or rows survived in Descent. */
  reach = 0;
  /** Timed goal only; null otherwise. */
  timeLeftMs: number | null;
  outcome: RunOutcome = 'playing';

  constructor(readonly config: RunConfig) {
    this.timeLeftMs = config.goal.kind === 'timed' ? config.goal.ms : null;
  }

  get playing(): boolean {
    return this.outcome === 'playing';
  }

  /** Rounds goal: rounds finished so far (waves, or Descent tiers). */
  get round(): number {
    return this.config.loop === 'waves'
      ? this.reach
      : Math.floor(this.reach / DESCENT_ROWS_PER_TIER);
  }

  get stepMs(): number {
    return descentStepMs(this.tier);
  }

  /** Runs the clock. Callers pause it the same way they pause the game. */
  tick(dtMs: number): void {
    if (!this.playing || this.timeLeftMs === null) return;
    this.timeLeftMs = Math.max(0, this.timeLeftMs - dtMs);
    if (this.timeLeftMs === 0) this.outcome = 'complete';
  }

  /** Waves: the board is clear. Ends a Rounds run on its last round; otherwise the tier goes up. */
  onWaveCleared(): RunProgress {
    if (!this.playing) return { tierUp: false, extraLife: false };
    this.reach++;
    if (this.timeLeftMs !== null) this.timeLeftMs += WAVE_TIME_BONUS_MS;
    if (this.goalMet()) {
      this.outcome = 'complete';
      return { tierUp: false, extraLife: false };
    }
    return this.tierUp();
  }

  /** Descent: the formation stepped down one row. Every DESCENT_ROWS_PER_TIER rows is a tier. */
  onRowSurvived(): RunProgress {
    if (!this.playing) return { tierUp: false, extraLife: false };
    this.reach++;
    if (this.reach % DESCENT_ROWS_PER_TIER !== 0) return { tierUp: false, extraLife: false };
    if (this.goalMet()) {
      this.outcome = 'complete';
      return { tierUp: false, extraLife: false };
    }
    return this.tierUp();
  }

  onOutOfLives(): void {
    if (this.playing) this.outcome = 'over';
  }

  private goalMet(): boolean {
    const goal = this.config.goal;
    return goal.kind === 'rounds' && this.round >= goal.rounds;
  }

  private tierUp(): RunProgress {
    this.tier++;
    return { tierUp: true, extraLife: (this.tier - 1) % LIFE_EVERY_TIERS === 0 };
  }
}
