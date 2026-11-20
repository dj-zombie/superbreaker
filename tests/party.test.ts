import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMBO_STEPS, comboMultiplier } from '../src/core/Bonus';
import { MOODS } from '../src/core/Lighting';
import {
  PARTY_DARK,
  PARTY_HUES,
  PARTY_PULSE,
  PARTY_TOP,
  barHue,
  beamAngle,
  bulbLevel,
  kick,
  partyAmbient,
  partyTier,
} from '../src/core/Party';
import { dreamSeconds } from '../src/systems/MusicEngine';

describe('party tiers', () => {
  it('steps up exactly where the combo multiplier does', () => {
    for (let combo = 1; combo <= 40; combo++) {
      const stepped = comboMultiplier(combo) !== comboMultiplier(combo - 1);
      expect(partyTier(combo) !== partyTier(combo - 1)).toBe(stepped);
    }
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(partyTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(PARTY_TOP).toBe(COMBO_STEPS.length);
  });
});

describe('the beat', () => {
  it('kicks on every beat and dies away before the next', () => {
    for (const b of [0, 1, 7, 31]) expect(kick(b)).toBeCloseTo(1);
    expect(kick(0.5)).toBeLessThan(0.15);
    expect(kick(0.99)).toBeLessThan(kick(0.5));
  });

  it('changes hue each bar and cycles through every hue', () => {
    expect(barHue(0)).toBe(barHue(3.9));
    expect(barHue(4)).not.toBe(barHue(3.9));
    const seen = new Set(Array.from({ length: PARTY_HUES.length }, (_, bar) => barHue(bar * 4)));
    expect(seen.size).toBe(PARTY_HUES.length);
    expect(barHue(0, 1)).toBe(barHue(4));
  });
});

describe('bulbs', () => {
  const string = (beats: number, tier: number, dir: 1 | -1 = 1, calm = false) =>
    Array.from({ length: 12 }, (_, i) => bulbLevel(i, 12, beats, tier, dir, calm));

  it('burn steady before the party starts and with reduced motion', () => {
    for (const beats of [0, 1.3, 15.5]) {
      expect(new Set(string(beats, 0)).size).toBe(1);
      expect(new Set(string(beats, 3, 1, true)).size).toBe(1);
    }
  });

  it('chase every third bulb, a step each eighth note, each string its own way', () => {
    const lit = (levels: number[]) => levels.flatMap((k, i) => (k === 1 ? [i] : []));
    expect(lit(string(0, 1))).toEqual([0, 3, 6, 9]);
    expect(lit(string(0.5, 1))).toEqual([1, 4, 7, 10]);
    expect(lit(string(0, 1, -1))).toEqual([2, 5, 8, 11]);
    expect(lit(string(0.5, 1, -1))).toEqual([1, 4, 7, 10]);
  });

  it('sweep the whole string across the last beat of every four bars', () => {
    const lit = (levels: number[]) => levels.filter((k) => k === 1).length;
    expect(lit(string(15.05, 1))).toBeLessThan(3);
    expect(lit(string(15.5, 1))).toBe(7);
    expect(lit(string(15.99, 1))).toBe(12);
    expect(lit(string(16, 1))).toBe(4);
  });
});

describe('moving heads', () => {
  it('hold still with reduced motion, and otherwise scissor past their neighbours every two bars', () => {
    for (let i = 0; i < 4; i++) expect(beamAngle(i, 3, true)).toBe(beamAngle(i, 0, true));
    for (let i = 0; i < 3; i++) {
      const sides = new Set<number>();
      for (let b = 0; b < 8; b += 0.25)
        sides.add(Math.sign(beamAngle(i + 1, b, false) - beamAngle(i, b, false)));
      expect(sides).toEqual(new Set([1, -1]));
    }
    expect(beamAngle(0, 8, false)).toBeCloseTo(beamAngle(0, 0, false));
  });
});

describe('the room', () => {
  it('never pulses as far as a flash, whatever the tier', () => {
    for (const [rave, wash] of [
      [0, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const lo = partyAmbient(rave, wash, 0, false);
      const hi = partyAmbient(rave, wash, 1, false);
      expect(hi / lo - 1).toBeLessThanOrEqual(PARTY_PULSE + 1e-9);
      expect(hi / lo - 1).toBeLessThan(0.1);
    }
  });

  it('goes dark for the rave and pulses less with reduced motion', () => {
    expect(partyAmbient(1, 1, 0, false)).toBeCloseTo(1 - PARTY_DARK - 0.1);
    expect(partyAmbient(0, 0, 0, false)).toBe(1);
    const swing = (calm: boolean) => partyAmbient(1, 1, 1, calm) - partyAmbient(1, 1, 0, calm);
    expect(swing(true)).toBeLessThan(swing(false) / 2);
  });

  it('is a mood a map can ask for, and the gallery does', () => {
    expect(MOODS).toContain('party');
    const project = JSON.parse(
      readFileSync(join(__dirname, '..', 'superbreaker.tiled-project'), 'utf8'),
    ) as { propertyTypes: Array<{ name: string; values?: string[] }> };
    expect(project.propertyTypes.find((t) => t.name === 'Mood')?.values).toEqual([...MOODS]);
  });
});

describe('the beat in bullet time', () => {
  it('slows with the dream, from full speed down to its rate', () => {
    expect(dreamSeconds(0)).toBeCloseTo(0);
    expect(dreamSeconds(0.01)).toBeCloseTo(0.01, 3);
    let last = 0;
    for (let s = 0.05; s < 3; s += 0.05) {
      const now = dreamSeconds(s);
      expect(now).toBeGreaterThan(last);
      expect(now).toBeLessThan(s);
      last = now;
    }
    const rate = (dreamSeconds(3) - dreamSeconds(2)) / 1;
    expect(rate).toBeCloseTo(2 ** (-500 / 1200), 5);
  });
});
