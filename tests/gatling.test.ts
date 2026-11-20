import { describe, expect, it } from 'vitest';
import { DEFAULT_GATLING, Gatling } from '../src/core/Gatling';

const STEP = 16;

function hold(g: Gatling, ms: number, held = true): number[] {
  const ups: number[] = [];
  for (let t = 0; t < ms; t += STEP) {
    const up = g.update(STEP, held);
    if (up !== null) ups.push(up);
  }
  return ups;
}

describe('gatling', () => {
  it('fires the moment the trigger is held, and never stops while it is', () => {
    const g = new Gatling();
    g.update(STEP, true);
    expect(g.firing).toBe(true);
    hold(g, 60_000);
    expect(g.firing).toBe(true);
    expect(g.spin).toBe(1);
  });

  it('fires faster and hits harder the longer it is held', () => {
    const g = new Gatling();
    const gaps: number[] = [];
    const damage: number[] = [];
    for (let i = 0; i < 8; i++) {
      hold(g, DEFAULT_GATLING.spinUpMs / 8);
      gaps.push(g.gapMs);
      damage.push(g.damage);
    }
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeLessThan(gaps[i - 1]!);
      expect(damage[i]).toBeGreaterThanOrEqual(damage[i - 1]!);
    }
    expect(g.gapMs).toBeCloseTo(DEFAULT_GATLING.fastGapMs, 0);
    expect(g.damage).toBe(3);
  });

  it('starts at the slow rate and one damage', () => {
    const g = new Gatling();
    expect(g.gapMs).toBe(DEFAULT_GATLING.slowGapMs);
    expect(g.damage).toBe(1);
  });

  it('says each step up in power once', () => {
    const g = new Gatling();
    expect(hold(g, DEFAULT_GATLING.spinUpMs + 200)).toEqual([2, 3]);
    expect(hold(g, 5_000)).toEqual([]);
  });

  it('coasts down when let go, and a quick re-grip keeps most of the spin', () => {
    const g = new Gatling();
    hold(g, DEFAULT_GATLING.spinUpMs);
    hold(g, 150, false);
    expect(g.firing).toBe(false);
    expect(g.spin).toBeGreaterThan(0.7);
    hold(g, DEFAULT_GATLING.spinDownMs, false);
    expect(g.spin).toBe(0);
    expect(g.damage).toBe(1);
  });

  it('resets cold', () => {
    const g = new Gatling();
    hold(g, 5_000);
    g.reset();
    expect(g.spin).toBe(0);
    expect(g.firing).toBe(false);
  });
});
