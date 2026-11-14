/**
 * How far across the stereo field a sound at the play field's edge sits. Short of hard left and
 * right, which sounds detached on TV speakers and tires on headphones.
 */
export const PAN_SPREAD = 0.6;

/** Stereo pan (-PAN_SPREAD..PAN_SPREAD) for a sound at play-field `x` in a field `width` wide. */
export function panAt(x: number, width: number): number {
  if (!Number.isFinite(x) || width <= 0) return 0;
  const p = Math.min(1, Math.max(-1, (x / width) * 2 - 1));
  return p * PAN_SPREAD;
}

/** Cents of random pitch spread for sounds that repeat often enough to sound mechanical. */
const SPREAD_CENTS: Record<string, number> = {
  wall: 40,
  sfx_coin: 40,
  brick_steel: 40,
  brick_armor: 40,
  ab_blackhole_swallow: 40,
  laser_shot: 40,
};
const BREAK_CENTS = 30;
/** Varied sounds play between this share of their volume and full. */
const MIN_VOLUME = 0.85;

export interface Variation {
  /** Cents to add to the sound's own detune. */
  readonly detune: number;
  /** Multiplier for the sound's volume. */
  readonly volume: number;
}

const NONE: Variation = { detune: 0, volume: 1 };

/**
 * A small random pitch and volume change for a frequent sound. The bounce notes walk a melody, so
 * they, and anything not listed, play exactly as asked.
 */
export function variation(key: string, rand: () => number = Math.random): Variation {
  const cents = key.startsWith('break') ? BREAK_CENTS : SPREAD_CENTS[key];
  if (!cents) return NONE;
  return {
    detune: (rand() * 2 - 1) * cents,
    volume: MIN_VOLUME + rand() * (1 - MIN_VOLUME),
  };
}
