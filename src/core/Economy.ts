import type { PowerupId, UpgradeId } from './types';

export const MAX_UPGRADE_LEVEL = 5;

export interface UpgradeDef {
  label: string;
  description: string;
  /** The next tier costs baseCost x current tier, so early upgrades are cheap. */
  baseCost: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  magnet: { label: 'Magnet', description: 'Longer magnet, more catches', baseCost: 8 },
  fireball: { label: 'Fireball', description: 'Burns longer, plows more bricks', baseCost: 10 },
  laser: { label: 'Machine Gun', description: 'Stronger, longer, faster shots', baseCost: 12 },
};

export type UpgradeLevels = Record<UpgradeId, number>;

/** Price of the next tier, or null when maxed. */
export function upgradeCost(id: UpgradeId, currentTier: number): number | null {
  const tier = clampLevel(currentTier);
  return tier >= MAX_UPGRADE_LEVEL ? null : UPGRADES[id].baseCost * tier;
}

export interface PowerupStats {
  magnetDurationMs: number;
  magnetCharges: number;
  fireballDurationMs: number;
  /** Bricks a fireball smashes through before it bounces. */
  fireballPlow: number;
  laserDurationMs: number;
  laserIntervalMs: number;
  /** Damage per bolt. Standard bricks have 100 health, so this stays under a one-shot. */
  laserDamage: number;
}

/** Derives powerup stats from upgrade tiers (1..5). */
export function powerupStats(levels: UpgradeLevels): PowerupStats {
  const m = clampLevel(levels.magnet);
  const f = clampLevel(levels.fireball);
  const l = clampLevel(levels.laser);
  return {
    magnetDurationMs: 10_000 + (m - 1) * 5_800,
    // One extra catch at tiers 3 and 5.
    magnetCharges: 1 + Math.floor((m - 1) / 2),
    fireballDurationMs: 10_000 + (f - 1) * 3_300,
    fireballPlow: 2 + f,
    // Tier 1 chips about 6 bricks. Tier 5 about 22. A small level has ~50, so it never clears the board.
    laserDurationMs: 4_200 + (l - 1) * 500,
    laserIntervalMs: 280 - (l - 1) * 25,
    laserDamage: 22 + (l - 1) * 6,
  };
}

/** Both barrels fire on every volley: -1 is the left muzzle, 1 is the right. */
export const LASER_BARREL_OFFSETS = [-1, 1] as const;

/**
 * Most standard bricks a full laser can break if every bolt hits a fresh brick.
 * Real levels waste shots on armor, gaps and overkill, so this is a ceiling.
 */
export function laserClearCeiling(stats: PowerupStats, brickHealth = 100): number {
  const shots =
    Math.floor(stats.laserDurationMs / stats.laserIntervalMs) * LASER_BARREL_OFFSETS.length;
  const hits = Math.ceil(brickHealth / Math.max(1, stats.laserDamage));
  return Math.floor(shots / hits);
}

export type PurchaseResult = 'ok' | 'maxed' | 'insufficient';

export function canPurchase(id: UpgradeId, levels: UpgradeLevels, coins: number): PurchaseResult {
  const cost = upgradeCost(id, levels[id]);
  if (cost === null) return 'maxed';
  if (coins < cost) return 'insufficient';
  return 'ok';
}

function clampLevel(n: number): number {
  return Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.floor(n) || 1));
}

/** Weighted random drop table for bricks without a fixed powerup. */
export const DROP_WEIGHTS: ReadonlyArray<[PowerupId | null, number]> = [
  [null, 21],
  ['coin', 16],
  ['bigger', 1],
  ['smaller', 1],
  ['balls', 1],
  ['laser', 1],
  ['fireball', 1],
  ['magnet', 0.6],
  ['shield', 0.8],
  ['hyper', 0.8],
  ['pierce', 0.8],
  ['extraLife', 0.25],
  ['mystery', 1.6],
];

export function rollDrop(rand: () => number = Math.random): PowerupId | null {
  const total = DROP_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [id, w] of DROP_WEIGHTS) {
    r -= w;
    if (r < 0) return id;
  }
  return null;
}
