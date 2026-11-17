import { describe, expect, it } from 'vitest';
import { stickSensitivityGain } from '../src/systems/stickSensitivity';

describe('stickSensitivityGain', () => {
  it('maps the slider so the center is current speed and the ends are half and double', () => {
    expect(stickSensitivityGain(0)).toBe(0.5);
    expect(stickSensitivityGain(0.5)).toBe(1);
    expect(stickSensitivityGain(1)).toBe(2);
  });
});
