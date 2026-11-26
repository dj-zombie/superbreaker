import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { FX_PALETTES } from '../src/fx/palettes';
import { feverColor, feverPulse } from '../src/systems/FeverSystem';

describe('Fever look', () => {
  it('peaks on the beat and has fallen away by the next one', () => {
    expect(feverPulse(3)).toBeCloseTo(1);
    expect(feverPulse(3.5)).toBeLessThan(0.1);
    expect(feverPulse(3.999)).toBeLessThan(0.01);
    expect(feverPulse(4)).toBeCloseTo(1);
  });

  it.each(Object.keys(FX_PALETTES) as Array<keyof typeof FX_PALETTES>)(
    'burns in the %s palette, from its accent to its hot tone',
    (world) => {
      const pal = FX_PALETTES[world];
      expect(feverColor(pal, 0)).toBe(pal.accent);
      expect(feverColor(pal, 1)).toBe(pal.hot);
      expect(feverColor(pal, 2)).toBe(pal.hot);
    },
  );
});
