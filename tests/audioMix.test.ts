import { describe, expect, it } from 'vitest';
import { AUDIBLE_FLOOR, PAN_SPREAD, audibleMs, detunedMs, panAt, variation } from '../src/core/AudioMix';

describe('panAt', () => {
  it('centers a sound in the middle of the field', () => {
    expect(panAt(300, 600)).toBeCloseTo(0);
  });

  it('places the edges at the spread, not hard left and right', () => {
    expect(panAt(0, 600)).toBeCloseTo(-PAN_SPREAD);
    expect(panAt(600, 600)).toBeCloseTo(PAN_SPREAD);
    expect(PAN_SPREAD).toBeLessThan(1);
  });

  it('clamps sounds outside the field, such as the wide-screen wings', () => {
    expect(panAt(-200, 600)).toBeCloseTo(-PAN_SPREAD);
    expect(panAt(900, 600)).toBeCloseTo(PAN_SPREAD);
  });

  it('centers bad input', () => {
    expect(panAt(Number.NaN, 600)).toBe(0);
    expect(panAt(100, 0)).toBe(0);
  });
});

describe('variation', () => {
  it('never changes the bounce notes', () => {
    for (const key of ['c0', 'd1', 'f2', 'g3']) {
      expect(variation(key, () => 0)).toEqual({ detune: 0, volume: 1 });
      expect(variation(key, () => 1)).toEqual({ detune: 0, volume: 1 });
    }
  });

  it('leaves unlisted sounds alone', () => {
    expect(variation('combo', () => 0)).toEqual({ detune: 0, volume: 1 });
  });

  it('keeps brick breaks within 30 cents', () => {
    expect(variation('break3', () => 0).detune).toBeCloseTo(-30);
    expect(variation('break3', () => 1).detune).toBeCloseTo(30);
  });

  it('keeps frequent sounds within 40 cents and 85 to 100 percent volume', () => {
    const low = variation('wall', () => 0);
    const high = variation('wall', () => 1);
    expect(low.detune).toBeCloseTo(-40);
    expect(high.detune).toBeCloseTo(40);
    expect(low.volume).toBeCloseTo(0.85);
    expect(high.volume).toBeCloseTo(1);
  });
});

describe('audibleMs', () => {
  const RATE = 1000;
  /** One channel `n` samples long: loud for `loud` of them, then a tail just under the floor. */
  const take = (n: number, loud: number) =>
    Float32Array.from({ length: n }, (_, i) => (i < loud ? 0.8 : AUDIBLE_FLOOR * 0.9));

  it('ends a sound at its last sample at the floor, not at the end of a quiet tail', () => {
    expect(audibleMs([take(4000, 2500)], RATE)).toBe(2500);
  });

  it('counts a sample right at the floor as heard', () => {
    const data = take(100, 0);
    data[59] = -AUDIBLE_FLOOR;
    expect(audibleMs([data], RATE)).toBe(60);
  });

  it('takes the channel heard longest', () => {
    expect(audibleMs([take(3000, 1000), take(3000, 2200)], RATE)).toBe(2200);
  });

  it('is 0 for silence, no channels, or no sample rate', () => {
    expect(audibleMs([take(500, 0)], RATE)).toBe(0);
    expect(audibleMs([], RATE)).toBe(0);
    expect(audibleMs([take(500, 500)], 0)).toBe(0);
  });
});

describe('detunedMs', () => {
  it('halves the length an octave up and doubles it an octave down', () => {
    expect(detunedMs(1000, 1200)).toBeCloseTo(500);
    expect(detunedMs(1000, -1200)).toBeCloseTo(2000);
    expect(detunedMs(1000, 0)).toBe(1000);
  });
});
