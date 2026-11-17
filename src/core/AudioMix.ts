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
  laser_missile: 60,
  laser_ricochet: 60,
  laser_impact: 60,
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

/** A sound is heard until its last sample this loud (-30 dB of full scale); after that is a tail nobody notices. */
export const AUDIBLE_FLOOR = 10 ** (-30 / 20);
/** The floor as a sample holds it, so a sample stored at the floor counts as heard. */
const SAMPLE_FLOOR = Math.fround(AUDIBLE_FLOOR);

/** How long a recording is heard for, in ms: up to its last sample at AUDIBLE_FLOOR or louder. */
export function audibleMs(channels: readonly Float32Array[], sampleRate: number): number {
  if (!(sampleRate > 0)) return 0;
  let last = -1;
  for (const data of channels) {
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i]!) >= SAMPLE_FLOOR) {
        last = i;
        break;
      }
    }
  }
  return ((last + 1) / sampleRate) * 1000;
}

/** How long a sound heard for `ms` at its own pitch is heard for when played `detune` cents off. */
export function detunedMs(ms: number, detune: number): number {
  return ms / 2 ** (detune / 1200);
}
