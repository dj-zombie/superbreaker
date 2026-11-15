import { describe, expect, it } from 'vitest';
import {
  ABILITY_IDS,
  MAX_ABILITY_TIER,
  STARTER_ABILITIES,
  abilityCost,
  abilityStats,
  defaultAbilityTiers,
  rollAbility,
  unlockedAbilities,
} from '../src/core/Abilities';
import { MAX_BALLS } from '../src/core/Difficulty';
import {
  DROP_WEIGHTS,
  DropDirector,
  FIRST_DROP_BY,
  MAX_UPGRADE_LEVEL,
  PITY_BREAKS,
  UPGRADES,
  canPurchase,
  dropWeights,
  heat,
  powerupStats,
  rollDrop,
  upgradeCost,
  type DropContext,
} from '../src/core/Economy';
import type { PowerupId } from '../src/core/types';

describe('powerupStats', () => {
  it('matches the original base durations at tier 1', () => {
    const s = powerupStats({ magnet: 1, fireball: 1, laser: 1 });
    expect(s.magnetDurationMs).toBe(10_000);
    expect(s.fireballDurationMs).toBe(10_000);
    expect(s.magnetCharges).toBe(1);
  });

  it('adds magnet charges at tiers 3 and 5', () => {
    const charges = [1, 2, 3, 4, 5].map(
      (m) => powerupStats({ magnet: m, fireball: 1, laser: 1 }).magnetCharges,
    );
    expect(charges).toEqual([1, 1, 2, 2, 3]);
  });

  it('makes the laser last longer, hit harder and fire faster with each tier', () => {
    const tiers = [1, 2, 3, 4, 5].map((laser) => powerupStats({ magnet: 1, fireball: 1, laser }));
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.laserDurationMs).toBeGreaterThan(tiers[i - 1]!.laserDurationMs);
      expect(tiers[i]!.laserBudget).toBeGreaterThan(tiers[i - 1]!.laserBudget);
      expect(tiers[i]!.laserRate).toBeGreaterThan(tiers[i - 1]!.laserRate);
    }
    expect(tiers[0]!.laserRate).toBe(1);
  });
});

describe('canPurchase', () => {
  const levels = { magnet: 1, fireball: 5, laser: 1 };
  it('checks coins and max tier', () => {
    expect(canPurchase('magnet', levels, 8)).toBe('ok');
    expect(canPurchase('magnet', levels, 7)).toBe('insufficient');
    expect(canPurchase('fireball', levels, 9999)).toBe('maxed');
  });
});

describe('rollDrop', () => {
  it('covers the whole table deterministically', () => {
    expect(rollDrop(() => 0)).toBe(DROP_WEIGHTS[0]![0]);
    expect(rollDrop(() => 0.999999)).toBe(DROP_WEIGHTS[DROP_WEIGHTS.length - 1]![0]);
  });
});

describe('drop director', () => {
  type Table = ReadonlyArray<readonly [PowerupId | null, number]>;
  const total = (t: Table) => t.reduce((s, [, w]) => s + w, 0);
  const weightOf = (t: Table, id: PowerupId | null) => t.find(([p]) => p === id)![1];
  const powerupShare = (t: Table) =>
    t.filter(([p]) => p !== null && p !== 'coin').reduce((s, [, w]) => s + w, 0) / total(t);
  const calm: DropContext = { balls: 1, effects: 0, fever: false };
  const hot: DropContext = { balls: 8, effects: 3, fever: true };
  const nothing = () => 0;

  it('measures heat from balls, effects and Fever', () => {
    expect(heat(calm)).toBe(0);
    expect(heat({ ...calm, balls: 6 })).toBeCloseTo(0.6);
    expect(heat({ ...calm, fever: true })).toBeCloseTo(0.35);
    expect(heat(hot)).toBe(1);
  });

  it('drops more powerups while calm and far fewer at a peak', () => {
    const base = powerupShare(DROP_WEIGHTS);
    expect(powerupShare(dropWeights(calm))).toBeGreaterThan(base * 1.2);
    expect(powerupShare(dropWeights(hot))).toBeLessThan(base * 0.4);
  });

  it('keeps the coin share and the total weight unchanged', () => {
    for (const ctx of [calm, hot, { ...calm, balls: MAX_BALLS }]) {
      const t = dropWeights(ctx);
      expect(total(t)).toBeCloseTo(total(DROP_WEIGHTS));
      expect(weightOf(t, 'coin')).toBe(weightOf(DROP_WEIGHTS, 'coin'));
      for (const [, w] of t) expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('fades multiball out toward the ball cap', () => {
    const two = weightOf(dropWeights({ ...calm, balls: 2 }), 'balls');
    const five = weightOf(dropWeights({ ...calm, balls: 5 }), 'balls');
    expect(five).toBeLessThan(two);
    expect(weightOf(dropWeights({ ...calm, balls: MAX_BALLS }), 'balls')).toBe(0);
  });

  it(`guarantees the first powerup by break ${FIRST_DROP_BY}`, () => {
    const d = new DropDirector();
    for (let i = 1; i < FIRST_DROP_BY; i++) expect(d.roll(calm, nothing)).toBeNull();
    const id = d.roll(calm, nothing);
    expect(id).not.toBeNull();
    expect(id).not.toBe('coin');
    expect(id).not.toBe('smaller');
  });

  it(`then guarantees one after ${PITY_BREAKS} dry breaks`, () => {
    const d = new DropDirector();
    expect(d.roll(calm, () => 0.999999)).toBe('mystery');
    for (let i = 1; i < PITY_BREAKS; i++) expect(d.roll(calm, nothing)).toBeNull();
    expect(d.roll(calm, nothing)).not.toBeNull();
  });

  it('never forces drops during a peak', () => {
    const d = new DropDirector();
    for (let i = 0; i < 30; i++) expect(d.roll(hot, nothing)).toBeNull();
  });
});

describe('upgrade pricing', () => {
  it('gets more expensive each tier and stays cheap overall', () => {
    for (const id of ['magnet', 'fireball', 'laser'] as const) {
      let total = 0;
      let prev = 0;
      for (let t = 1; t < MAX_UPGRADE_LEVEL; t++) {
        const c = upgradeCost(id, t)!;
        expect(c).toBeGreaterThan(prev);
        prev = c;
        total += c;
      }
      expect(upgradeCost(id, MAX_UPGRADE_LEVEL)).toBeNull();
      expect(total).toBeLessThanOrEqual(UPGRADES[id].baseCost * 10);
      expect(total).toBeLessThan(150);
    }
  });

  it('lets fireballs plow more bricks with upgrades', () => {
    const a = powerupStats({ magnet: 1, fireball: 1, laser: 1 });
    const b = powerupStats({ magnet: 1, fireball: 5, laser: 1 });
    expect(a.fireballPlow).toBeGreaterThanOrEqual(3);
    expect(b.fireballPlow).toBeGreaterThan(a.fireballPlow);
  });
});

describe('ability shop', () => {
  it('starts with the starter abilities unlocked', () => {
    const tiers = defaultAbilityTiers();
    expect(unlockedAbilities(tiers).sort()).toEqual([...STARTER_ABILITIES].sort());
  });

  it('prices unlocks and tiers, and stops at the max tier', () => {
    for (const id of ABILITY_IDS) {
      expect(abilityCost(id, 0)).toBeGreaterThanOrEqual(0);
      expect(abilityCost(id, 1)).toBeGreaterThan(0);
      expect(abilityCost(id, 2)!).toBeGreaterThan(abilityCost(id, 1)!);
      expect(abilityCost(id, MAX_ABILITY_TIER)).toBeNull();
    }
  });

  it('only rolls owned abilities', () => {
    const unlocked = ['bomb'] as const;
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(
        rollAbility({ remaining: 50, remainingFraction: 0.5, struggle: 0.5, unlocked }, () => r),
      ).toBe('bomb');
    }
  });

  it('makes every ability stronger with tiers', () => {
    const lo = abilityStats(defaultAbilityTiers());
    const all = Object.fromEntries(ABILITY_IDS.map((id) => [id, MAX_ABILITY_TIER])) as ReturnType<
      typeof defaultAbilityTiers
    >;
    const hi = abilityStats(all);
    for (const k of Object.keys(lo) as Array<keyof typeof lo>) expect(hi[k]).toBeGreaterThan(lo[k]);
  });

  it('never lets a laser sweep wipe a big level', () => {
    expect(abilityStats(defaultAbilityTiers()).sweepKillShare).toBeLessThan(0.7);
  });
});
