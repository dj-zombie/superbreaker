import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../src/core/Difficulty';
import {
  BOSS_EVERY_TIERS,
  DARK_CHANCE,
  DARK_FROM_TIER,
  DEFAULT_ROUNDS,
  DEFAULT_TIME_MS,
  DESCENT_CATCH_UP,
  DESCENT_FIRST_STEP_MS,
  DESCENT_MIN_STEP_MS,
  DESCENT_ROWS_PER_TIER,
  ONE_HIT_TIERS,
  RunState,
  WAVE_TIME_BONUS_MS,
  descentStepMs,
  isBossTier,
  isDarkTier,
  goalFor,
  reachLabel,
  runHitDamage,
  runKey,
  scaleDifficulty,
  type RunConfig,
} from '../src/core/Run';

const run = (loop: RunConfig['loop'], kind: 'endless' | 'rounds' | 'timed') =>
  new RunState({ loop, goal: goalFor(kind), seed: 1 });

describe('RunState: Waves', () => {
  it('goes up a tier per wave and never ends on Endless', () => {
    const s = run('waves', 'endless');
    for (let i = 0; i < 40; i++) s.onWaveCleared();
    expect(s.tier).toBe(41);
    expect(s.reach).toBe(40);
    expect(s.outcome).toBe('playing');
  });

  it('gives an extra life each time the tier passes a multiple of five', () => {
    const s = run('waves', 'endless');
    const lives: number[] = [];
    for (let i = 0; i < 15; i++) if (s.onWaveCleared().extraLife) lives.push(s.tier);
    expect(lives).toEqual([6, 11, 16]);
  });

  it('completes a Rounds run on the last wave', () => {
    const s = run('waves', 'rounds');
    for (let i = 1; i < DEFAULT_ROUNDS; i++) s.onWaveCleared();
    expect(s.outcome).toBe('playing');
    const last = s.onWaveCleared();
    expect(s.outcome).toBe('complete');
    expect(last.tierUp).toBe(false);
    expect(s.reach).toBe(DEFAULT_ROUNDS);
  });

  it('runs the clock down and adds time per wave on Timed', () => {
    const s = run('waves', 'timed');
    s.tick(10_000);
    expect(s.timeLeftMs).toBe(DEFAULT_TIME_MS - 10_000);
    s.onWaveCleared();
    expect(s.timeLeftMs).toBe(DEFAULT_TIME_MS - 10_000 + WAVE_TIME_BONUS_MS);
    s.tick(DEFAULT_TIME_MS * 2);
    expect(s.timeLeftMs).toBe(0);
    expect(s.outcome).toBe('complete');
  });

  it('stops counting once the run is over', () => {
    const s = run('waves', 'timed');
    s.onOutOfLives();
    expect(s.outcome).toBe('over');
    s.tick(DEFAULT_TIME_MS * 2);
    s.onWaveCleared();
    expect(s.outcome).toBe('over');
    expect(s.reach).toBe(0);
  });

  it('has no clock without a Timed goal', () => {
    const s = run('waves', 'endless');
    s.tick(DEFAULT_TIME_MS * 10);
    expect(s.timeLeftMs).toBeNull();
    expect(s.outcome).toBe('playing');
  });
});

describe('RunState: Descent', () => {
  it('goes up a tier every DESCENT_ROWS_PER_TIER rows', () => {
    const s = run('descent', 'endless');
    let ups = 0;
    for (let i = 0; i < DESCENT_ROWS_PER_TIER * 3; i++) if (s.onRowSurvived().tierUp) ups++;
    expect(ups).toBe(3);
    expect(s.tier).toBe(4);
    expect(s.reach).toBe(DESCENT_ROWS_PER_TIER * 3);
  });

  it('counts a Descent round as a tier', () => {
    const s = run('descent', 'rounds');
    for (let i = 0; i < DESCENT_ROWS_PER_TIER * DEFAULT_ROUNDS - 1; i++) s.onRowSurvived();
    expect(s.outcome).toBe('playing');
    s.onRowSurvived();
    expect(s.outcome).toBe('complete');
  });

  it('steps faster each tier down to a floor', () => {
    expect(descentStepMs(1)).toBe(DESCENT_FIRST_STEP_MS);
    expect(descentStepMs(2)).toBeLessThan(descentStepMs(1));
    expect(descentStepMs(100)).toBe(DESCENT_MIN_STEP_MS);
  });

  it('opens with a row every few seconds, so a tier of rows takes under a minute', () => {
    expect(descentStepMs(1) * DESCENT_ROWS_PER_TIER).toBeLessThan(60_000);
  });

  it('steps sooner while the field is thin, down to a share of the full wait', () => {
    expect(descentStepMs(1, 1)).toBe(descentStepMs(1));
    expect(descentStepMs(1, 2)).toBe(descentStepMs(1));
    expect(descentStepMs(1, 0.5)).toBe(descentStepMs(1) * 0.5);
    expect(descentStepMs(1, 0)).toBe(descentStepMs(1) * DESCENT_CATCH_UP);
    expect(descentStepMs(100, 0)).toBe(DESCENT_MIN_STEP_MS * DESCENT_CATCH_UP);
  });
});

describe('Arcade boss and dark rounds', () => {
  it('makes every fifth tier a boss round, and no other', () => {
    const bosses = Array.from({ length: 30 }, (_, i) => i + 1).filter(isBossTier);
    expect(bosses).toEqual([5, 10, 15, 20, 25, 30]);
    expect(BOSS_EVERY_TIERS).toBe(5);
    expect(isBossTier(0)).toBe(false);
  });

  it('never goes dark before DARK_FROM_TIER or on a boss round', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (let tier = 1; tier < DARK_FROM_TIER; tier++) expect(isDarkTier(seed, tier)).toBe(false);
      for (let tier = BOSS_EVERY_TIERS; tier <= 60; tier += BOSS_EVERY_TIERS) {
        expect(isDarkTier(seed, tier)).toBe(false);
      }
    }
  });

  it('goes dark on about DARK_CHANCE of the other rounds, the same way for the same seed', () => {
    let dark = 0;
    let rounds = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (let tier = DARK_FROM_TIER; tier < 40; tier++) {
        if (isBossTier(tier)) continue;
        rounds++;
        if (isDarkTier(seed, tier)) dark++;
        expect(isDarkTier(seed, tier)).toBe(isDarkTier(seed, tier));
      }
    }
    expect(dark / rounds).toBeGreaterThan(DARK_CHANCE - 0.05);
    expect(dark / rounds).toBeLessThan(DARK_CHANCE + 0.05);
  });
});

describe('runHitDamage', () => {
  const hitsToBreak = (damage: number) => Math.ceil(100 / damage);

  it('breaks plain bricks in one hit on Normal, and two on Hard, through the early tiers', () => {
    expect(hitsToBreak(runHitDamage(DIFFICULTY.normal.hitDamage, 1))).toBe(1);
    expect(hitsToBreak(runHitDamage(DIFFICULTY.normal.hitDamage, ONE_HIT_TIERS))).toBe(1);
    expect(hitsToBreak(runHitDamage(DIFFICULTY.hard.hitDamage, 1))).toBe(2);
  });

  it('goes back to the difficulty damage after them', () => {
    expect(runHitDamage(DIFFICULTY.normal.hitDamage, ONE_HIT_TIERS + 1)).toBe(DIFFICULTY.normal.hitDamage);
  });
});

describe('run helpers', () => {
  it('keys bests by loop and goal', () => {
    expect(runKey('descent', 'timed')).toBe('descent-timed');
  });

  it('labels reach in the loop unit', () => {
    expect(reachLabel('waves', 1)).toBe('1 wave');
    expect(reachLabel('waves', 0)).toBe('0 waves');
    expect(reachLabel('descent', 12)).toBe('12 rows');
  });

  it('scales ball speed with the tier without touching other settings', () => {
    const base = DIFFICULTY.normal;
    expect(scaleDifficulty(base, 1)).toEqual(base);
    const fast = scaleDifficulty(base, 30);
    expect(fast.minSpeed).toBeGreaterThan(base.minSpeed);
    expect(fast.maxSpeed / base.maxSpeed).toBeLessThanOrEqual(1.2);
    expect(fast.hitDamage).toBe(base.hitDamage);
  });
});
