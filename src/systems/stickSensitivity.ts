/**
 * Settings slider 0..1 to a paddle-stick speed. The center notch (0.5) is the speed the
 * stick shipped with; the ends are half and double. The menu cursor does not use this.
 */
export function stickSensitivityGain(value: number): number {
  return 2 ** (2 * value - 1);
}
