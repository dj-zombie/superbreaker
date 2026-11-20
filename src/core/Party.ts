/**
 * The party mood's rules, without the engine: how far the party has got, where the beat is, and
 * how bright each bulb and beam is. The lights step up where a bonus stage's combo multiplier
 * does, so the room says what the score is doing.
 */
import { COMBO_STEPS } from './Bonus';

/** The last tier: the full rave. */
export const PARTY_TOP = COMBO_STEPS.length;
/** How fast the light of a kick dies away, per beat. */
const KICK_DECAY = 4.5;
/** A kick lifts the whole room by at most this much, under what counts as a flash. */
export const PARTY_PULSE = 0.08;
/** The dark of the full rave: the room drops this much and leans this far into its tint. */
export const PARTY_DARK = 0.3;
export const PARTY_TINT = 0.55;
/** A bulb between the lit ones of a chase still glows this much. */
const BULB_DIM = 0.18;
/** Before the party starts, the bulbs burn steady at this. */
const BULB_STEADY = 0.75;
/** Washes, floor and beams cycle through these, a bar each. */
export const PARTY_HUES = [0xff2bd6, 0x22d4ff, 0x7dff3a, 0xffb020] as const;
/** The bulbs: mostly warm, with a red and a teal every four. */
export const BULB_COLORS = [0xffd27f, 0xff5048, 0xffd27f, 0x4cd9ff] as const;

/** How far the party has got, 0..PARTY_TOP: one step for each combo step reached. */
export function partyTier(combo: number): number {
  let tier = 0;
  for (const [from] of COMBO_STEPS) if (combo >= from) tier++;
  return tier;
}

/** A kick drum's light: full on the beat, nearly gone by the next. */
export function kick(beats: number): number {
  return Math.exp(-(beats - Math.floor(beats)) * KICK_DECAY);
}

/**
 * The side washes' hue: magenta and cyan, swapping sides each bar. Cool against warm art, where
 * amber or lime would sink into it.
 */
export function washHue(beats: number, side: number): number {
  return PARTY_HUES[(Math.floor(beats / 4) + side) % 2 === 0 ? 0 : 1];
}

/** The hue of bar `beats / 4`, `offset` hues along. */
export function barHue(beats: number, offset = 0): number {
  const bar = Math.floor(beats / 4) + offset;
  return PARTY_HUES[((bar % PARTY_HUES.length) + PARTY_HUES.length) % PARTY_HUES.length]!;
}

/**
 * How bright bulb `i` of a string of `n` is, 0..1. Steady before the party starts or with reduced
 * motion; after, every third bulb lights and the pattern steps on each eighth note, in `dir`. The
 * last beat of every four bars sweeps the whole string on instead.
 */
export function bulbLevel(
  i: number,
  n: number,
  beats: number,
  tier: number,
  dir: 1 | -1,
  calm: boolean,
): number {
  if (tier === 0) return BULB_STEADY;
  if (calm) return 1;
  const at = dir === 1 ? i : n - 1 - i;
  const phrase = beats - Math.floor(beats / 16) * 16;
  if (phrase >= 15) return at <= (phrase - 15) * n ? 1 : BULB_DIM;
  const step = Math.floor(beats * 2);
  return (((at - step) % 3) + 3) % 3 === 0 ? 1 : BULB_DIM;
}

/**
 * The swing of moving head `i` of four, in radians from straight down. Neighbours swing against
 * each other, a full sweep every two bars. Reduced motion holds them still.
 */
export function beamAngle(i: number, beats: number, calm: boolean): number {
  const base = [-0.38, -0.14, 0.14, 0.38][i % 4]!;
  if (calm) return base;
  const swing = Math.sin((Math.PI * 2 * beats) / 8 + (i * Math.PI) / 2) * 0.42;
  return base + (i % 2 ? swing : -swing);
}

/**
 * The room's brightness as a multiple of its ambient, with `rave` and `wash` how far the top two
 * tiers have faded in, 0..1. A kick lifts it a little; more as the party gets going.
 */
export function partyAmbient(rave: number, wash: number, beat: number, calm: boolean): number {
  const lift = PARTY_PULSE * (0.4 + 0.3 * wash + 0.3 * rave) * beat * (calm ? 0.25 : 1);
  return (1 - PARTY_DARK * rave - 0.1 * wash) * (1 + lift);
}
