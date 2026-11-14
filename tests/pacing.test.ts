import { describe, expect, it } from 'vitest';
import { collapseThreshold } from '../src/core/Difficulty';
import {
  COLLAPSE_IDLE_MS,
  COLLAPSE_MAX_BALLS,
  DEFAULT_FEVER,
  FeverMeter,
  PacingDirector,
  collapseReady,
  type Intervention,
} from '../src/core/Pacing';

/** Steps the director in 100ms ticks and records every intervention. */
function run(d: PacingDirector, ms: number, remaining = 100, inPlay = true): Intervention[] {
  const out: Intervention[] = [];
  for (let t = 0; t < ms; t += 100) {
    const i = d.update(100, remaining, inPlay);
    if (i) out.push(i);
  }
  return out;
}

/** Breaks a brick every `everyMs`, recording interventions. */
function busy(d: PacingDirector, ms: number, everyMs: number): Intervention[] {
  const out: Intervention[] = [];
  for (let t = 0; t < ms; t += 100) {
    if (t % everyMs === 0) d.onBreak();
    const i = d.update(100, 100, true);
    if (i) out.push(i);
  }
  return out;
}

describe('PacingDirector', () => {
  it('stays quiet while bricks break at a lively rate', () => {
    const d = new PacingDirector();
    expect(busy(d, 40_000, 1_000)).toEqual([]);
    expect(d.boredom).toBeLessThan(0.35);
  });

  it('escalates nudge -> gift -> surge during a long dry spell', () => {
    const d = new PacingDirector();
    expect(run(d, 30_000)).toEqual(['nudge', 'gift', 'surge']);
  });

  it('does not count time with the ball held on the paddle', () => {
    const d = new PacingDirector();
    expect(run(d, 60_000, 100, false)).toEqual([]);
    expect(d.boredom).toBe(0);
  });

  it('resets escalation when a brick breaks', () => {
    const d = new PacingDirector();
    expect(run(d, 9_000)).toEqual(['nudge']);
    d.onBreak();
    const next = run(d, 9_000);
    expect(next[0]).toBe('nudge');
  });

  it('respects the cooldown between interventions', () => {
    const d = new PacingDirector();
    const seen: number[] = [];
    for (let t = 0; t < 30_000; t += 100) if (d.update(100, 100, true)) seen.push(t);
    for (let i = 1; i < seen.length; i++)
      expect(seen[i]! - seen[i - 1]!).toBeGreaterThanOrEqual(3_500);
  });

  it('skips repeated gifts within the gift cooldown', () => {
    const d = new PacingDirector();
    for (let t = 0; t < 30_000; t += 100) if (d.update(100, 100, true) === 'gift') break;
    d.onBreak();
    const second = run(d, 12_000);
    expect(second).not.toContain('gift');
  });

  it('detects the ball looping off the paddle', () => {
    const d = new PacingDirector();
    for (let i = 0; i < 8; i++) d.onPaddleHit();
    expect(run(d, 2_000)).toContain('nudge');
  });

  it('gets bored faster on the last few bricks', () => {
    const lots = new PacingDirector();
    const few = new PacingDirector();
    run(lots, 4_500, 100);
    run(few, 4_500, 4);
    expect(few.boredom).toBeGreaterThan(lots.boredom);
  });

  it('turns on the endgame assist at three bricks or fewer', () => {
    const d = new PacingDirector();
    expect(d.endgameAssist(4)).toBe(false);
    expect(d.endgameAssist(3)).toBe(true);
    expect(d.endgameAssist(0)).toBe(false);
  });

  it('raises struggle when lives are lost', () => {
    const d = new PacingDirector();
    const before = d.struggle;
    d.onLifeLost();
    expect(d.struggle).toBeGreaterThan(before);
  });

  it('tracks idle time only while a ball is in play, and resets it on a break', () => {
    const d = new PacingDirector();
    run(d, 2_000);
    expect(d.idleMs).toBe(2_000);
    run(d, 5_000, 100, false);
    expect(d.idleMs).toBe(2_000);
    d.onBreak();
    expect(d.idleMs).toBe(0);
  });
});

describe('FeverMeter', () => {
  it('fills faster with combos', () => {
    const a = new FeverMeter();
    const b = new FeverMeter();
    a.onBreak(0);
    b.onBreak(10);
    expect(b.value).toBeGreaterThan(a.value);
  });

  it('starts Fever when full and runs for the configured time', () => {
    const f = new FeverMeter();
    let started = false;
    for (let i = 0; i < 100 && !started; i++) started = f.onBreak(i);
    expect(started).toBe(true);
    expect(f.active).toBe(true);
    expect(f.update(DEFAULT_FEVER.durationMs - 100)).toBeNull();
    expect(f.update(200)).toBe('end');
    expect(f.active).toBe(false);
    expect(f.value).toBe(0);
  });

  it('holds briefly, then drains without breaks', () => {
    const f = new FeverMeter();
    f.boost(0.5);
    f.update(DEFAULT_FEVER.holdMs - 100);
    expect(f.value).toBeCloseTo(0.5);
    f.update(2_000);
    expect(f.value).toBeLessThan(0.5);
  });

  it('ignores breaks while active', () => {
    const f = new FeverMeter();
    expect(f.boost(1)).toBe(true);
    expect(f.onBreak(5)).toBe(false);
  });

  it('fills slower per break with more balls in flight', () => {
    const one = new FeverMeter();
    const four = new FeverMeter();
    one.onBreak(5, 1);
    four.onBreak(5, 4);
    expect(four.value).toBeCloseTo(one.value / 2);
  });

  it('takes several times more breaks to fill with a full field of balls', () => {
    const breaksToFill = (balls: number) => {
      const f = new FeverMeter();
      let n = 0;
      while (!f.onBreak(0, balls)) n++;
      return n;
    };
    expect(breaksToFill(9)).toBeGreaterThanOrEqual(breaksToFill(1) * 3 - 1);
  });
});

describe('collapseThreshold', () => {
  it('scales with level size within bounds', () => {
    expect(collapseThreshold(10)).toBe(6);
    expect(collapseThreshold(60)).toBe(9);
    expect(collapseThreshold(100)).toBe(15);
    expect(collapseThreshold(300)).toBe(18);
  });
});

describe('collapseReady', () => {
  const lull = { fever: false, balls: 1, idleMs: COLLAPSE_IDLE_MS };

  it('lets the collapse rescue a slow ending', () => {
    expect(collapseReady(lull)).toBe(true);
    expect(collapseReady({ ...lull, balls: COLLAPSE_MAX_BALLS })).toBe(true);
  });

  it('holds it back during a peak', () => {
    expect(collapseReady({ ...lull, fever: true })).toBe(false);
    expect(collapseReady({ ...lull, balls: COLLAPSE_MAX_BALLS + 1 })).toBe(false);
    expect(collapseReady({ ...lull, idleMs: COLLAPSE_IDLE_MS - 1 })).toBe(false);
  });
});
