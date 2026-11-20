import { describe, expect, it } from 'vitest';
import {
  GUN_PATTERNS,
  GUN_PATTERN_IDS,
  nextPattern,
  weaveOffset,
  weaveSpeed,
  type GunPatternId,
} from '../src/core/GunPattern';

const shots = (id: GunPatternId, n = 120, gapMs = 33) =>
  Array.from({ length: n }, (_, i) => GUN_PATTERNS[id].shot(i * gapMs, i));

describe('gun patterns', () => {
  it('keeps every shot on the paddle, and leaning no more than 30 degrees', () => {
    for (const id of GUN_PATTERN_IDS) {
      for (const m of shots(id)) {
        expect(Math.abs(m.at), id).toBeLessThanOrEqual(1);
        expect(Math.abs(m.angle), id).toBeLessThanOrEqual((30 * Math.PI) / 180);
      }
    }
  });

  it('stays narrow enough that the cat in the next slot is safe', () => {
    // A half paddle between the pods is 40 px; the pop-up row is up to 450 px above the paddle;
    // pop-up slots are 120 px apart and a cat's hit box is 54 px wide.
    const HALF = 40;
    const UP = 450;
    const SPEED = 820;
    const reach = 120 - 27 - 30;
    for (const id of GUN_PATTERN_IDS) {
      for (const m of shots(id)) {
        for (let up = 0; up <= UP; up += 15) {
          const t = (up / SPEED) * 1000;
          const swing = m.weave ? weaveOffset(m.weave, t) : 0;
          const x = (m.at + swing) * HALF + Math.tan(m.angle) * up;
          expect(Math.abs(x), `${id} at ${up} px`).toBeLessThanOrEqual(reach);
        }
      }
    }
  });

  it('alternates the twin guns between the two pods', () => {
    expect(shots('twin', 4).map((m) => m.at)).toEqual([-1, 1, -1, 1]);
  });

  it('swings the wave out of the middle to about each pod', () => {
    const w = shots('wave', 1)[0]!.weave!;
    expect(weaveOffset(w, 0)).toBeCloseTo(0, 6);
    const swing = Array.from({ length: 100 }, (_, k) => weaveOffset(w, (k * 1000) / (100 * w.hz)));
    expect(Math.min(...swing)).toBeLessThan(-0.9);
    expect(Math.max(...swing)).toBeGreaterThan(0.9);
  });

  it('mirrors the helix strands about the middle', () => {
    const [a, b] = shots('helix', 2).map((m) => m.weave!);
    for (const t of [0, 90, 200, 333, 610]) {
      expect(weaveOffset(a!, t) + weaveOffset(b!, t)).toBeCloseTo(0, 6);
    }
  });

  it('swings braid bolts across to the other pod and back', () => {
    const [left, right] = shots('braid', 2);
    const w = left!.weave!;
    const halfway = 1000 / (2 * w.hz);
    expect(left!.at + weaveOffset(w, halfway)).toBeCloseTo(1, 6);
    expect(right!.at + weaveOffset(right!.weave!, halfway)).toBeCloseTo(-1, 6);
    expect(weaveOffset(w, 0)).toBeCloseTo(0, 6);
    expect(weaveSpeed(w, 0)).toBeCloseTo(0, 6);
  });

  it('crosses the crossfire streams inward', () => {
    for (const m of shots('crossfire', 6)) expect(Math.sign(m.angle)).toBe(-Math.sign(m.at));
  });

  it('never picks the same pattern twice in a row', () => {
    for (const current of GUN_PATTERN_IDS) {
      for (const r of [0, 0.2, 0.5, 0.8, 0.9999, 1]) {
        const next = nextPattern(current, () => r);
        expect(next).not.toBe(current);
        expect(GUN_PATTERN_IDS).toContain(next);
      }
    }
  });
});
