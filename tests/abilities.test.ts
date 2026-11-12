import { describe, expect, it } from 'vitest';
import {
  ABILITY_IDS,
  AREA_ABILITIES,
  FEW_BRICKS,
  abilityWeights,
  rollAbility,
  type RollContext,
} from '../src/core/Abilities';

const areaShare = (ctx: RollContext): number => {
  const w = abilityWeights(ctx);
  const total = ABILITY_IDS.reduce((s, id) => s + w[id], 0);
  return ABILITY_IDS.filter((id) => AREA_ABILITIES.has(id)).reduce((s, id) => s + w[id], 0) / total;
};

describe('abilities roulette', () => {
  it('always returns a valid ability', () => {
    const ctx = { remaining: 80, remainingFraction: 0.5, struggle: 0.3 };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      expect(ABILITY_IDS).toContain(rollAbility(ctx, () => r));
    }
  });

  it('gives struggling players more area abilities', () => {
    const calm = areaShare({ remaining: 80, remainingFraction: 0.6, struggle: 0 });
    const stuck = areaShare({ remaining: 80, remainingFraction: 0.6, struggle: 1 });
    expect(stuck).toBeGreaterThan(calm);
  });

  it('favors area abilities when much of the level is left', () => {
    const early = areaShare({ remaining: 150, remainingFraction: 1, struggle: 0 });
    const late = areaShare({ remaining: 40, remainingFraction: 0.2, struggle: 0 });
    expect(early).toBeGreaterThan(late);
  });

  it('switches to targeted abilities when only a few bricks remain', () => {
    const share = areaShare({ remaining: FEW_BRICKS, remainingFraction: 0.05, struggle: 1 });
    expect(share).toBeLessThan(0.3);
  });

  it('keeps every weight positive', () => {
    const w = abilityWeights({ remaining: 1, remainingFraction: 0, struggle: 0 });
    for (const id of ABILITY_IDS) expect(w[id]).toBeGreaterThan(0);
  });
});
