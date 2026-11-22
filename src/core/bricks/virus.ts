import { touches, type Rect } from './cells';

/** Time between infections, unless a core sets its own `spreadMs`. */
export const VIRUS_SPREAD_MS = 4500;
export const VIRUS_MIN_SPREAD_MS = 1500;
/** How long a brick shows the veins before it turns. */
export const VIRUS_INCUBATE_MS = 1000;
/** Most bricks one core infects. */
export const VIRUS_CAP = 10;
/** Three plain hits on Normal. */
export const VIRUS_CORE_HEALTH = 150;
/** An infected brick's extra hit. */
export const VIRUS_ARMOR = 1;
/** The infection's glow. */
export const VIRUS_COLOR = 0x9dff3c;

/** What clearing a colony pays: the fewer bricks it took, the more. */
export const PURGE_MAX = 1200;
export const PURGE_PER_INFECTION = 100;
export const PURGE_MIN = 200;

export function purgeBonus(infections: number): number {
  return Math.max(PURGE_MIN, PURGE_MAX - PURGE_PER_INFECTION * Math.max(0, infections));
}

export function spreadInterval(ms: number | undefined): number {
  return Math.max(VIRUS_MIN_SPREAD_MS, ms ?? VIRUS_SPREAD_MS);
}

/**
 * Bricks the colony can infect next: those in `others` that `eligible` allows and that share an
 * edge with a member. Corners don't spread it, so a player can wall it off with one gap.
 */
export function spreadCandidates<T extends Rect>(
  colony: readonly Rect[],
  others: readonly T[],
  eligible: (b: T) => boolean,
): T[] {
  return others.filter((b) => eligible(b) && colony.some((m) => touches(m, b, false)));
}
