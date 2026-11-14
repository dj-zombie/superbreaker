import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../src/core/Difficulty';
import {
  DEFAULT_ROUNDS,
  DEFAULT_TIME_MS,
  DESCENT_ROWS_PER_TIER,
  RunState,
  WAVE_TIME_BONUS_MS,
  descentStepMs,
  goalFor,
  reachLabel,
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
    expect(descentStepMs(1)).toBe(9000);
    expect(descentStepMs(2)).toBeLessThan(descentStepMs(1));
    expect(descentStepMs(100)).toBe(3500);
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
