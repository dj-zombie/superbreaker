import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { save } from '../services';

export type HapticStrength = 'light' | 'medium' | 'heavy';

const STYLE: Record<HapticStrength, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const VIBRATE_MS: Record<HapticStrength, number> = { light: 8, medium: 18, heavy: 35 };
/** Quiet time after each strength. Every call is a native bridge round trip on device. */
const GAP_MS: Record<HapticStrength, number> = { light: 40, medium: 70, heavy: 120 };
const RANK: Record<HapticStrength, number> = { light: 0, medium: 1, heavy: 2 };

const native = Capacitor.isNativePlatform();
let lastAt = -Infinity;
let last: HapticStrength = 'light';

export function haptic(strength: HapticStrength = 'light'): void {
  if (!save.state.settings.haptics) return;
  // Rapid chains would otherwise buzz continuously. A stronger pulse may still cut in.
  const now = performance.now();
  if (RANK[strength] <= RANK[last] && now - lastAt < GAP_MS[last]) return;
  lastAt = now;
  last = strength;
  if (native) {
    void Haptics.impact({ style: STYLE[strength] }).catch(() => {});
  } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(VIBRATE_MS[strength]);
    } catch {
      // Some browsers throw without a user gesture.
    }
  }
}
