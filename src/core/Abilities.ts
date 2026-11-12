export const ABILITY_IDS = ['meteor', 'lightning', 'bomb', 'sweep', 'blackhole', 'frenzy'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

/** Area abilities clear big chunks; targeted ones hunt down scattered bricks. */
export const AREA_ABILITIES: ReadonlySet<AbilityId> = new Set([
  'meteor',
  'bomb',
  'sweep',
  'blackhole',
]);

const BASE_WEIGHT: Record<AbilityId, number> = {
  meteor: 1,
  lightning: 1,
  bomb: 1,
  sweep: 0.8,
  blackhole: 0.7,
  frenzy: 0.9,
};

/** Few enough bricks left that area abilities would mostly hit empty space. */
export const FEW_BRICKS = 12;

/** Tier 0 = locked. Tiers 1..MAX_ABILITY_TIER make the ability stronger. */
export const MAX_ABILITY_TIER = 3;
export type AbilityTiers = Record<AbilityId, number>;

/** Unlocked from the start so the roulette always has something to roll. */
export const STARTER_ABILITIES: readonly AbilityId[] = ['meteor', 'lightning', 'frenzy'];

export interface AbilityShopDef {
  description: string;
  /** Coins to unlock (0 for starters). */
  unlockCost: number;
  /** Coins for tier 2 and tier 3. */
  tierCosts: readonly [number, number];
}

export const ABILITY_SHOP: Record<AbilityId, AbilityShopDef> = {
  meteor: { description: 'Fireballs rain on the bricks', unlockCost: 0, tierCosts: [20, 40] },
  lightning: { description: 'Arcs jump from brick to brick', unlockCost: 0, tierCosts: [20, 40] },
  frenzy: { description: 'Burst of piercing balls', unlockCost: 0, tierCosts: [20, 40] },
  bomb: { description: 'Launches a huge blast', unlockCost: 25, tierCosts: [25, 45] },
  sweep: { description: 'A beam cuts through the field', unlockCost: 35, tierCosts: [30, 50] },
  blackhole: { description: 'Swallows the densest cluster', unlockCost: 45, tierCosts: [30, 55] },
};

export function defaultAbilityTiers(): AbilityTiers {
  const out = {} as AbilityTiers;
  for (const id of ABILITY_IDS) out[id] = STARTER_ABILITIES.includes(id) ? 1 : 0;
  return out;
}

/** Price to unlock or upgrade from `tier`, or null when maxed. */
export function abilityCost(id: AbilityId, tier: number): number | null {
  const def = ABILITY_SHOP[id];
  if (tier <= 0) return def.unlockCost;
  if (tier >= MAX_ABILITY_TIER) return null;
  return def.tierCosts[tier - 1]!;
}

export function unlockedAbilities(tiers: AbilityTiers): AbilityId[] {
  return ABILITY_IDS.filter((id) => tiers[id] > 0);
}

export interface AbilityStats {
  meteorCount: number;
  meteorRadius: number;
  lightningHops: number;
  bombRadius: number;
  /** Share of the bricks a laser sweep destroys. */
  sweepKillShare: number;
  holeRadius: number;
  holeMs: number;
  frenzyBalls: number;
}

/** Ability power by tier; tier 0 (locked) uses tier 1 numbers if it ever fires. */
export function abilityStats(tiers: AbilityTiers): AbilityStats {
  const t = (id: AbilityId) => Math.max(1, Math.min(MAX_ABILITY_TIER, tiers[id] || 1)) - 1;
  return {
    meteorCount: [6, 8, 10][t('meteor')]!,
    meteorRadius: [26, 30, 34][t('meteor')]!,
    lightningHops: [6, 8, 11][t('lightning')]!,
    bombRadius: [95, 115, 135][t('bomb')]!,
    sweepKillShare: [0.45, 0.55, 0.65][t('sweep')]!,
    holeRadius: [70, 85, 100][t('blackhole')]!,
    holeMs: [2_000, 2_300, 2_600][t('blackhole')]!,
    frenzyBalls: [3, 4, 6][t('frenzy')]!,
  };
}

export interface RollContext {
  /** Breakable bricks still standing. */
  remaining: number;
  /** remaining / initial breakables, 0..1. */
  remainingFraction: number;
  /** How much the player is struggling or bored, 0..1 (from the pacing director). */
  struggle: number;
  /** Abilities the player owns; defaults to all of them. */
  unlocked?: readonly AbilityId[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Mario Kart style rubber-banding: the more the player struggles and the more of the level is left,
 * the more likely the big area abilities are. Near the end, targeted abilities take over.
 */
export function abilityWeights(ctx: RollContext): Record<AbilityId, number> {
  const struggle = clamp01(ctx.struggle);
  const left = clamp01(ctx.remainingFraction);
  const few = ctx.remaining <= FEW_BRICKS;
  const areaBoost = few ? 0.35 : 0.6 + left * 0.8 + struggle * 1.2;
  const targetBoost = few ? 2.5 : 1;
  const owned = ctx.unlocked ?? ABILITY_IDS;
  const out = {} as Record<AbilityId, number>;
  for (const id of ABILITY_IDS) {
    const w = BASE_WEIGHT[id] * (AREA_ABILITIES.has(id) ? areaBoost : targetBoost);
    out[id] = owned.includes(id) ? w : 0;
  }
  return out;
}

export function rollAbility(ctx: RollContext, rand: () => number = Math.random): AbilityId {
  const weights = abilityWeights(ctx);
  const pool = ABILITY_IDS.filter((id) => weights[id] > 0);
  if (pool.length === 0) return STARTER_ABILITIES[0]!;
  const total = pool.reduce((s, id) => s + weights[id], 0);
  let r = rand() * total;
  for (const id of pool) {
    r -= weights[id];
    if (r < 0) return id;
  }
  return pool[pool.length - 1]!;
}
