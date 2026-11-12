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
import {
  DROP_WEIGHTS,
  MAX_UPGRADE_LEVEL,
  UPGRADES,
  canPurchase,
  laserClearCeiling,
  powerupStats,
  rollDrop,
  upgradeCost,
} from '../src/core/Economy';

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

  it('makes the laser fire faster with upgrades', () => {
    const a = powerupStats({ magnet: 1, fireball: 1, laser: 1 });
    const b = powerupStats({ magnet: 1, fireball: 1, laser: 5 });
    expect(b.laserIntervalMs).toBeLessThan(a.laserIntervalMs);
    expect(b.laserDurationMs).toBeGreaterThan(a.laserDurationMs);
    expect(b.laserDamage).toBeGreaterThan(a.laserDamage);
  });

  it('keeps a full laser from clearing a small level, even fully upgraded', () => {
    const tiers = [1, 2, 3, 4, 5].map((laser) =>
      laserClearCeiling(powerupStats({ magnet: 1, fireball: 1, laser })),
    );
    expect(tiers[0]).toBeGreaterThanOrEqual(4);
    expect(tiers[0]).toBeLessThan(12);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThan(tiers[i - 1]!);
    expect(tiers[4]).toBeGreaterThan(tiers[0]! * 2);
    expect(tiers[4]).toBeLessThan(30);
    expect(powerupStats({ magnet: 1, fireball: 1, laser: 5 }).laserDamage).toBeLessThan(100);
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
