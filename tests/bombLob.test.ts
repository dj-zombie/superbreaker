import { describe, expect, it } from 'vitest';
import { bombLob } from '../src/systems/bombLob';

describe('bomb lob', () => {
  it('starts and lands on the shadow', () => {
    for (const t of [0, 1]) {
      const lob = bombLob(t);
      expect(lob.lift).toBeCloseTo(0);
      expect(lob.scale).toBeCloseTo(0.78);
      expect(lob.shadow).toBeCloseTo(1);
    }
  });

  it('peaks at the apex', () => {
    const lob = bombLob(0.5);
    expect(lob.lift).toBeCloseTo(1);
    expect(lob.scale).toBeCloseTo(1.65);
    expect(lob.shadow).toBeCloseTo(0.55);
  });

  it('clamps time outside the flight', () => {
    expect(bombLob(-0.4)).toEqual(bombLob(0));
    expect(bombLob(1.4).lift).toBeCloseTo(0);
    expect(bombLob(1.4).scale).toBeCloseTo(0.78);
  });
});
