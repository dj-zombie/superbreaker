import type { PowerupId } from '../types';
import { MAX_ROW } from './grid';

/** Switches and gates stay in the campaign: generated switch puzzles are rarely good ones. */
export const MECHANICS = [
  'steel',
  'explosive',
  'fuse',
  'armored',
  'mover',
  'phantom',
  'regen',
  'portal',
  'virus',
] as const;
export type Mechanic = (typeof MECHANICS)[number];

/** First tier each mechanic can appear, in the order the campaign teaches them. */
export const MECHANIC_UNLOCK: Record<Mechanic, number> = {
  steel: 3,
  explosive: 5,
  fuse: 6,
  armored: 7,
  mover: 9,
  phantom: 10,
  regen: 11,
  portal: 13,
  virus: 15,
};

/** A mechanic is the board's lesson for this many tiers after it unlocks. */
export const FRESH_TIERS = 2;

/** Drops every board can carry. Coins are placed separately: exactly one per board. */
export const BASE_POWERUPS: readonly PowerupId[] = [
  'balls',
  'bigger',
  'magnet',
  'fireball',
  'laser',
  'shield',
  'mystery',
];

/** Later drops, gated like the campaign gates them. */
export const POWERUP_UNLOCK: Partial<Record<PowerupId, number>> = {
  extraLife: 5,
  smaller: 6,
  hyper: 8,
  pierce: 10,
};

/** Smallest formation height, from the campaign's shape rules. */
export const MIN_SPAN = 16;

export interface GenParams {
  tier: number;
  /** Breakable bricks on a board, inclusive. */
  breakables: readonly [number, number];
  /** Rows the formation spans, top of the structure to the bottom of the near band. */
  span: readonly [number, number];
  unlocked: readonly Mechanic[];
  /** Steel accent cells (placed in mirrored pairs). */
  steel: number;
  explosives: number;
  armored: number;
  /** Extra hits armored bricks take before their health goes down. */
  armor: number;
  movers: number;
  regenClusters: number;
  regenDelay: number;
  /** Fuse cords (placed in mirrored pairs). */
  fuseCords: number;
  phantoms: number;
  /** Portal links: each is a low end on one side and a high end on the other, mirrored. */
  portalLinks: number;
  virusCores: number;
  /** Powerups besides the coin. */
  powerups: number;
  powerupPool: readonly PowerupId[];
  /** Multiplies the difficulty's ball speeds. */
  speedScale: number;
}

export function isUnlocked(m: Mechanic, tier: number): boolean {
  return tier >= MECHANIC_UNLOCK[m];
}

export function powerupPool(tier: number): PowerupId[] {
  const later = (Object.entries(POWERUP_UNLOCK) as Array<[PowerupId, number]>)
    .filter(([, t]) => tier >= t)
    .map(([id]) => id);
  return [...BASE_POWERUPS, ...later];
}

/** How many of a mechanic a tier allows: `start` when it unlocks, plus `per` each tier after. */
function ramp(tier: number, m: Mechanic, start: number, per: number, cap: number): number {
  if (!isUnlocked(m, tier)) return 0;
  return Math.min(cap, Math.floor(start + per * (tier - MECHANIC_UNLOCK[m])));
}

/** Everything the generator needs to know about a tier. Tiers past the table keep the caps. */
export function tierParams(tier: number): GenParams {
  const t = Math.max(1, Math.floor(tier));
  const lo = Math.min(76, 38 + 3 * (t - 1));
  return {
    tier: t,
    breakables: [lo, lo + 14],
    span: [MIN_SPAN, Math.min(MAX_ROW + 1, 18 + Math.floor(t / 2))],
    unlocked: unlockedMechanics(t),
    steel: ramp(t, 'steel', 2, 1, 12),
    explosives: ramp(t, 'explosive', 1, 1 / 3, 5),
    armored: ramp(t, 'armored', 4, 1, 14),
    armor: t >= 15 ? 3 : 2,
    movers: ramp(t, 'mover', 1, 1 / 3, 4),
    regenClusters: ramp(t, 'regen', 1, 1 / 5, 3),
    regenDelay: Math.max(4, 6 - 0.25 * Math.max(0, t - MECHANIC_UNLOCK.regen)),
    fuseCords: ramp(t, 'fuse', 2, 1 / 6, 4),
    phantoms: ramp(t, 'phantom', 6, 1, 16),
    portalLinks: ramp(t, 'portal', 2, 0, 2),
    virusCores: ramp(t, 'virus', 1, 1 / 8, 2),
    powerups: 2 + (t >= 6 ? 1 : 0) + (t >= 12 ? 1 : 0),
    powerupPool: powerupPool(t),
    speedScale: Math.min(1.2, 1 + 0.015 * (t - 1)),
  };
}

export function unlockedMechanics(tier: number): Mechanic[] {
  return MECHANICS.filter((m) => isUnlocked(m, tier));
}
