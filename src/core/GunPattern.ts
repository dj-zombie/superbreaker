/**
 * Where a gun's bolts leave the paddle, shot by shot, and how they fly. Every bolt of a weaving
 * pattern swings the same way at the same age, so the stream draws a standing shape up the field:
 * one swing is a sine wave, two mirrored ones a double helix.
 */

export const GUN_PATTERN_IDS = ['twin', 'wave', 'helix', 'braid', 'sprinkler', 'crossfire'] as const;
export type GunPatternId = (typeof GUN_PATTERN_IDS)[number];

/** A sideways swing in flight: the bolt's x moves `amp * (cos(phase) - cos(ωt + phase))`. */
export interface Weave {
  /** In half paddles, signed: positive swings right first. */
  amp: number;
  hz: number;
  phase: number;
}

/** One shot. */
export interface Muzzle {
  /** Along the paddle: -1 is the left pod, 1 the right one, 0 the middle. */
  at: number;
  /** Radians off straight up; positive leans right. */
  angle: number;
  weave?: Weave;
}

export interface GunPatternDef {
  label: string;
  /** The shot fired `t` ms into the pattern, as its `i`th shot. Pure. */
  shot(t: number, i: number): Muzzle;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/**
 * Half paddles either side of the middle the wave and the helix swing, and how often. Every
 * pattern stays about a paddle wide, so a stream aimed at a duck misses the cat next to it.
 */
const SWING_AMP = 1.1;
const SWING_HZ = 2.1;
/** Starting a swing a quarter turn in puts it at the middle at launch, heading out. */
const FROM_MIDDLE = -Math.PI / 2;
const BRAID_HZ = 2.4;
const SPRINKLER_MS = 700;
const SPRINKLER_DEG = 5;
/** The two streams lean in and cross about a pop-up row's distance up. */
const CROSS_DEG = 6;

const side = (i: number): -1 | 1 => (i % 2 === 0 ? -1 : 1);

export const GUN_PATTERNS: Record<GunPatternId, GunPatternDef> = {
  twin: { label: 'Twin Guns', shot: (_t, i) => ({ at: side(i), angle: 0 }) },
  wave: {
    label: 'Sine Wave',
    shot: () => ({ at: 0, angle: 0, weave: { amp: SWING_AMP, hz: SWING_HZ, phase: FROM_MIDDLE } }),
  },
  // Two mirrored waves out of the middle, crossing every half swing.
  helix: {
    label: 'Double Helix',
    shot: (_t, i) => ({
      at: 0,
      angle: 0,
      weave: { amp: side(i) * SWING_AMP, hz: SWING_HZ, phase: FROM_MIDDLE },
    }),
  },
  // From each pod, swinging across to the other and back, so the two streams plait tightly.
  braid: {
    label: 'Braid',
    shot: (_t, i) => ({ at: side(i), angle: 0, weave: { amp: -side(i), hz: BRAID_HZ, phase: 0 } }),
  },
  sprinkler: {
    label: 'Sprinkler',
    shot: (t) => ({ at: 0, angle: SPRINKLER_DEG * DEG * Math.sin((TAU * t) / SPRINKLER_MS) }),
  },
  crossfire: { label: 'Crossfire', shot: (_t, i) => ({ at: side(i), angle: -side(i) * CROSS_DEG * DEG }) },
};

/** Ms of fire each pattern gets before the next one takes over. */
export const PATTERN_MS = 3_200;

/** A pattern other than `current`, at random. `random` returns 0..1. */
export function nextPattern(current: GunPatternId | null, random: () => number): GunPatternId {
  const pool = GUN_PATTERN_IDS.filter((id) => id !== current);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** How far a weaving bolt has swung sideways, in half paddles, `t` ms into its flight. */
export function weaveOffset(w: Weave, t: number): number {
  return w.amp * (Math.cos(w.phase) - Math.cos((TAU * w.hz * t) / 1000 + w.phase));
}

/** Its sideways speed then, in half paddles per second. */
export function weaveSpeed(w: Weave, t: number): number {
  const omega = TAU * w.hz;
  return w.amp * omega * Math.sin((omega * t) / 1000 + w.phase);
}
