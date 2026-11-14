export type Intervention = 'nudge' | 'gift' | 'surge';

export interface PacingConfig {
  /** Breaks per second that feel lively; below this the level starts to drag. */
  expectedBreakRate: number;
  /** Rolling window for the break rate, in ms. */
  rateWindowMs: number;
  /** A gap without breaks shorter than this is normal play. */
  idleGraceMs: number;
  /** A gap this long (beyond the grace) counts as fully boring. */
  idleFullMs: number;
  /** Boredom needed to trigger each escalation step. */
  thresholds: Record<Intervention, number>;
  /** Minimum gap between any two interventions, in ms. */
  cooldownMs: number;
  /** Minimum gap between two gift boxes, in ms. */
  giftCooldownMs: number;
  /** At or below this many bricks the ball gets a permanent homing assist. */
  endgameBricks: number;
}

export const DEFAULT_PACING: PacingConfig = {
  expectedBreakRate: 0.5,
  rateWindowMs: 15_000,
  idleGraceMs: 3_000,
  idleFullMs: 9_000,
  thresholds: { nudge: 0.35, gift: 0.6, surge: 0.85 },
  cooldownMs: 3_500,
  giftCooldownMs: 18_000,
  endgameBricks: 3,
};

const ESCALATION: Intervention[] = ['nudge', 'gift', 'surge'];
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** The collapse waits for a spell this long without a break. */
export const COLLAPSE_IDLE_MS = 2_000;
/** More balls than this in flight hold the collapse back. */
export const COLLAPSE_MAX_BALLS = 2;

export interface CollapseState {
  fever: boolean;
  /** Balls in flight. */
  balls: number;
  /** Time since the last break while a ball was in play. */
  idleMs: number;
}

/**
 * The collapse only rescues a slow ending. During a multiball or Fever peak the player gets to
 * smash the last bricks themselves.
 */
export function collapseReady(s: CollapseState): boolean {
  return !s.fever && s.balls <= COLLAPSE_MAX_BALLS && s.idleMs >= COLLAPSE_IDLE_MS;
}

/**
 * Watches the flow of a level and decides when to step in. Boredom rises when nothing breaks for a
 * while, the break rate is low, the ball loops off the paddle without hitting anything, or the last
 * few bricks drag on. Each slow stretch escalates nudge -> gift -> surge; any break resets it.
 */
export class PacingDirector {
  private nowMs = 0;
  private sinceBreakMs = 0;
  private paddleHitsSinceBreak = 0;
  private breakTimes: number[] = [];
  private stage = 0;
  private cooldownMs = 0;
  private lastGiftAt = -Infinity;
  private livesLost = 0;
  private smoothed = 0;

  constructor(private readonly cfg: PacingConfig = DEFAULT_PACING) {}

  get boredom(): number {
    return this.smoothed;
  }

  /** Time since the last break, counting only time with a ball in play. */
  get idleMs(): number {
    return this.sinceBreakMs;
  }

  /** 0..1 rubber-band factor for the ability roulette. */
  get struggle(): number {
    return clamp01(this.smoothed * 0.7 + this.livesLost * 0.2);
  }

  onBreak(): void {
    this.sinceBreakMs = 0;
    this.paddleHitsSinceBreak = 0;
    this.breakTimes.push(this.nowMs);
    this.stage = 0;
  }

  onPaddleHit(): void {
    this.paddleHitsSinceBreak++;
  }

  onLifeLost(): void {
    this.livesLost++;
    this.sinceBreakMs = 0;
    this.paddleHitsSinceBreak = 0;
    this.stage = 0;
  }

  /** Homing that stays on while only a handful of bricks remain. */
  endgameAssist(remaining: number): boolean {
    return remaining > 0 && remaining <= this.cfg.endgameBricks;
  }

  /** Computes the raw boredom for the current moment, before smoothing. */
  rawBoredom(remaining: number): number {
    const c = this.cfg;
    const idle = clamp01((this.sinceBreakMs - c.idleGraceMs) / c.idleFullMs);
    const looping = clamp01((this.paddleHitsSinceBreak - 2) / 4);
    const endgame =
      remaining > 0 && remaining <= 6 ? clamp01((this.sinceBreakMs - 1_500) / 5_000) : 0;
    let slowRate = 0;
    if (this.nowMs >= c.rateWindowMs) {
      const recent = this.breakTimes.filter((t) => t >= this.nowMs - c.rateWindowMs).length;
      slowRate = clamp01(1 - recent / ((c.rateWindowMs / 1000) * c.expectedBreakRate));
    }
    return clamp01(Math.max(idle, looping, endgame) * 0.8 + slowRate * 0.3);
  }

  /**
   * Advances time while the ball is in play. Returns an intervention when one should fire.
   * Time with the ball held on the paddle doesn't count, so aiming never feels "boring".
   */
  update(dtMs: number, remaining: number, ballInPlay: boolean): Intervention | null {
    if (!ballInPlay) return null;
    this.nowMs += dtMs;
    this.sinceBreakMs += dtMs;
    this.cooldownMs = Math.max(0, this.cooldownMs - dtMs);
    const cutoff = this.nowMs - this.cfg.rateWindowMs;
    while (this.breakTimes.length && this.breakTimes[0]! < cutoff) this.breakTimes.shift();

    const raw = this.rawBoredom(remaining);
    const k = Math.min(1, dtMs / 400);
    this.smoothed += (raw - this.smoothed) * k;

    if (this.cooldownMs > 0 || this.stage >= ESCALATION.length) return null;
    let next = ESCALATION[this.stage]!;
    if (this.smoothed < this.cfg.thresholds[next]) return null;
    if (next === 'gift' && this.nowMs - this.lastGiftAt < this.cfg.giftCooldownMs) {
      next = 'surge';
      if (this.smoothed < this.cfg.thresholds.surge) return null;
      this.stage = ESCALATION.length;
    } else {
      this.stage++;
    }
    if (next === 'gift') this.lastGiftAt = this.nowMs;
    this.cooldownMs = this.cfg.cooldownMs;
    return next;
  }
}

export interface FeverConfig {
  /** Fill per break, plus a bonus per combo step. */
  fillPerBreak: number;
  fillPerCombo: number;
  maxComboBonus: number;
  /** The meter holds for this long after a break before draining. */
  holdMs: number;
  /** Drain per second once holding is over. */
  drainPerSec: number;
  durationMs: number;
}

export const DEFAULT_FEVER: FeverConfig = {
  fillPerBreak: 0.03,
  fillPerCombo: 0.004,
  maxComboBonus: 20,
  holdMs: 1_500,
  drainPerSec: 0.08,
  durationMs: 8_000,
};

/** Fills from fast consecutive breaks; when full, Fever runs for a fixed time. */
export class FeverMeter {
  value = 0;
  remainingMs = 0;
  private sinceBreakMs = 0;

  constructor(private readonly cfg: FeverConfig = DEFAULT_FEVER) {}

  get active(): boolean {
    return this.remainingMs > 0;
  }

  /** Meter fill for display: the charge, or the time left while Fever runs. */
  get display(): number {
    return this.active ? this.remainingMs / this.cfg.durationMs : this.value;
  }

  /**
   * Returns true when this break starts Fever. The fill shrinks with the square root of the balls
   * in flight, so a streak still pays but a field full of balls can't chain Fevers back to back.
   */
  onBreak(combo: number, balls = 1): boolean {
    if (this.active) return false;
    this.sinceBreakMs = 0;
    const bonus = Math.min(combo, this.cfg.maxComboBonus) * this.cfg.fillPerCombo;
    return this.add((this.cfg.fillPerBreak + bonus) / Math.sqrt(Math.max(1, balls)));
  }

  /** Adds charge directly (pacing surges). Returns true when this starts Fever. */
  boost(amount: number): boolean {
    if (this.active) return false;
    this.sinceBreakMs = 0;
    return this.add(amount);
  }

  /** Returns 'end' on the frame Fever finishes. */
  update(dtMs: number): 'end' | null {
    if (this.active) {
      this.remainingMs -= dtMs;
      if (this.remainingMs <= 0) {
        this.remainingMs = 0;
        this.value = 0;
        return 'end';
      }
      return null;
    }
    this.sinceBreakMs += dtMs;
    if (this.sinceBreakMs > this.cfg.holdMs) {
      this.value = Math.max(0, this.value - (this.cfg.drainPerSec * dtMs) / 1000);
    }
    return null;
  }

  reset(): void {
    this.value = 0;
    this.remainingMs = 0;
    this.sinceBreakMs = 0;
  }

  private add(amount: number): boolean {
    this.value = Math.min(1, this.value + amount);
    if (this.value < 1) return false;
    this.remainingMs = this.cfg.durationMs;
    return true;
  }
}
