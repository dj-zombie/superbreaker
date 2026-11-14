import { MAX_BALLS } from './Difficulty';
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

type DropTable = ReadonlyArray<readonly [PowerupId | null, number]>;

function pick(table: DropTable, rand: () => number): PowerupId | null {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [id, w] of table) {
    r -= w;
    if (r < 0) return id;
  }
  return null;
}

export function rollDrop(rand: () => number = Math.random): PowerupId | null {
  return pick(DROP_WEIGHTS, rand);
}

/** What the drop director reads from the field when a brick breaks. */
export interface DropContext {
  /** Balls in flight. */
  balls: number;
  /** Timed powerups running: fireball, pierce, laser, magnet, hyper. */
  effects: number;
  fever: boolean;
}

/** Powerup weights scale from the calm multiplier at heat 0 to the hot one at heat 1. */
export const CALM_DROP_MULT = 1.3;
export const HOT_DROP_MULT = 0.3;
/** The first powerup of a level is guaranteed by this break. */
export const FIRST_DROP_BY = 3;
/** After the first, a powerup is guaranteed once this many breaks in a row dropped none. */
export const PITY_BREAKS = 8;
/** Bad-luck protection only steps in while the field is calmer than this. */
export const PITY_MAX_HEAT = 0.5;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** How much is going on, 0..1. One ball with nothing running is 0; six balls is about 0.6. */
export function heat(ctx: DropContext): number {
  const balls = (Math.max(0, ctx.balls - 1) / 5) * 0.6;
  return clamp01(balls + ctx.effects * 0.12 + (ctx.fever ? 0.35 : 0));
}

const isPowerup = (id: PowerupId | null): id is PowerupId => id !== null && id !== 'coin';

/**
 * The drop table for this moment. Powerups get more likely while calm and rarer at a peak, and
 * multiball fades out as the ball cap nears. "No drop" absorbs the difference, so coins keep
 * their share and the total weight never changes.
 */
export function dropWeights(ctx: DropContext): Array<[PowerupId | null, number]> {
  const mult = CALM_DROP_MULT + (HOT_DROP_MULT - CALM_DROP_MULT) * heat(ctx);
  const room = clamp01(1 - (ctx.balls - 1) / (MAX_BALLS - 1));
  let shift = 0;
  const out = DROP_WEIGHTS.map(([id, w]): [PowerupId | null, number] => {
    if (!isPowerup(id)) return [id, w];
    const scaled = w * mult * (id === 'balls' ? room : 1);
    shift += w - scaled;
    return [id, scaled];
  });
  const none = out.find(([id]) => id === null)!;
  none[1] = Math.max(0, none[1] + shift);
  return out;
}

/**
 * Rolls brick drops: generous while the field is calm, stingy at a peak, and never dry for long.
 * One director per level, so the first-drop guarantee applies to each level.
 */
export class DropDirector {
  private sincePowerup = 0;
  private dropped = false;

  roll(ctx: DropContext, rand: () => number = Math.random): PowerupId | null {
    const table = dropWeights(ctx);
    let id = pick(table, rand);
    if (!isPowerup(id)) {
      this.sincePowerup++;
      const due = this.dropped ? PITY_BREAKS : FIRST_DROP_BY;
      if (this.sincePowerup < due || heat(ctx) >= PITY_MAX_HEAT) return id;
      // A guaranteed drop should be good news, so it never picks the tiny paddle.
      id = pick(
        table.filter(([p]) => isPowerup(p) && p !== 'smaller'),
        rand,
      );
      if (!id) return null;
    }
    this.dropped = true;
    this.sincePowerup = 0;
    return id;
  }
}
