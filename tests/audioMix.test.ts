import { describe, expect, it } from 'vitest';
import { PAN_SPREAD, panAt, variation } from '../src/core/AudioMix';

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
