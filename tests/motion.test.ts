import { describe, expect, it } from 'vitest';
import {
  MAGNET_MIN_SPEED,
  chain,
  fall,
  float,
  linear,
  magnet,
  orbit,
  shuttle,
  sine,
  still,
  swing,
} from '../src/core/Motion';

describe('paths', () => {
  it('stands still and moves straight', () => {
    expect(still(3, 4)(9_999)).toEqual({ x: 3, y: 4 });
    expect(linear(0, 0, 100, -50)(2_000)).toEqual({ x: 200, y: -100 });
  });

  it('falls on a parabola', () => {
    const p = fall(0, 0, 60, -200, 400);
    expect(p(0)).toEqual({ x: 0, y: 0 });
    // Peaks at vy / g = 0.5 s, 50 px up, and is back down at 1 s.
    expect(p(500).y).toBeCloseTo(-50);
    expect(p(1_000).y).toBeCloseTo(0);
    expect(p(1_000).x).toBeCloseTo(60);
  });

  it('floats within its amplitude, back where it began each period', () => {
    const p = float(10, 100, 8, 1_000);
    for (let t = 0; t <= 2_000; t += 37) {
      expect(p(t).x).toBe(10);
      expect(Math.abs(p(t).y - 100)).toBeLessThanOrEqual(8 + 1e-9);
    }
    expect(p(1_000).y).toBeCloseTo(100);
    expect(float(0, 0, 0, 1_000, -30)(2_000).y).toBeCloseTo(-60);
  });

  it('weaves square to its travel', () => {
    const across = sine(0, 50, 100, 0, 10, 400);
    expect(across(100)).toEqual({ x: 10, y: 60 });
    const down = sine(50, 0, 0, 100, 10, 400);
    expect(down(100).x).toBeCloseTo(40);
    expect(down(100).y).toBeCloseTo(10);
  });

  it('orbits at its radius and comes round each period', () => {
    const p = orbit(100, 100, 40, 2_000, Math.PI / 2);
    for (let t = 0; t < 2_000; t += 111) {
      expect(Math.hypot(p(t).x - 100, p(t).y - 100)).toBeCloseTo(40);
    }
    expect(p(0).y).toBeCloseTo(140);
    expect(p(2_000).x).toBeCloseTo(p(0).x);
    expect(p(2_000).y).toBeCloseTo(p(0).y);
  });

  it('shuttles between its ends and never past them', () => {
    const p = shuttle(100, 300, 50, 200);
    for (let t = 0; t < 5_000; t += 53) {
      expect(p(t).x).toBeGreaterThanOrEqual(100);
      expect(p(t).x).toBeLessThanOrEqual(300);
    }
    expect(p(1_000).x).toBeCloseTo(300);
    expect(p(2_000).x).toBeCloseTo(100);
  });

  it('swings on its rope, within its arc, slowest at the ends', () => {
    const amp = Math.PI / 6;
    const p = swing(300, 0, 100, amp, 2_000);
    expect(p(0).x).toBeCloseTo(300);
    expect(p(0).y).toBeCloseTo(100);
    // Swung out to the right, it leans back the other way, along its rope.
    expect(p(500).angle).toBeCloseTo(-amp);
    for (let t = 0; t < 4_000; t += 41) {
      expect(Math.hypot(p(t).x - 300, p(t).y)).toBeCloseTo(100);
      expect(Math.abs(p(t).x - 300)).toBeLessThanOrEqual(100 * Math.sin(amp) + 1e-9);
    }
    // A quarter period in, it is at the end of the arc.
    expect(p(500).x).toBeCloseTo(300 + 100 * Math.sin(amp));
    const step = (t: number) => Math.hypot(p(t + 20).x - p(t).x, p(t + 20).y - p(t).y);
    expect(step(990)).toBeGreaterThan(step(490) * 5);
  });

  it('hands over from one path to the next where the first left off', () => {
    const p = chain(still(5, 5), 300, (from) => linear(from.x, from.y, 100, 0));
    expect(p(299)).toEqual({ x: 5, y: 5 });
    expect(p(300)).toEqual({ x: 5, y: 5 });
    expect(p(1_300)).toEqual({ x: 105, y: 5 });
  });
});

describe('magnet', () => {
  it('pulls toward the target at least the least speed', () => {
    const at = magnet({ x: 0, y: 0 }, { x: 1_000, y: 0 }, 0, 100);
    expect(at.x).toBeCloseTo(MAGNET_MIN_SPEED / 10);
    expect(at.y).toBe(0);
  });

  it('pulls harder from further away', () => {
    const near = magnet({ x: 0, y: 0 }, { x: 100, y: 0 }, 3, 16).x;
    const far = magnet({ x: 0, y: 0 }, { x: 1_000, y: 0 }, 3, 16).x;
    expect(far).toBeGreaterThan(near);
  });

  it('never overshoots and always arrives', () => {
    let pos = { x: 0, y: 0 };
    const target = { x: 300, y: -400 };
    let last = Infinity;
    for (let i = 0; i < 200 && (pos.x !== target.x || pos.y !== target.y); i++) {
      pos = magnet(pos, target, 4, 16);
      const d = Math.hypot(target.x - pos.x, target.y - pos.y);
      expect(d).toBeLessThan(last);
      last = d;
    }
    expect(pos).toEqual(target);
  });

  it('stays put on no time', () => {
    expect(magnet({ x: 1, y: 2 }, { x: 50, y: 50 }, 5, 0)).toEqual({ x: 1, y: 2 });
  });
});
