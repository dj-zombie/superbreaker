import { describe, expect, it } from 'vitest';
import { abilityCost } from '../src/core/Abilities';
import { upgradeCost } from '../src/core/Economy';
import {
  RunCarry,
  SESSION_ABILITY_COST,
  SESSION_POWERUP_COST,
  abilitiesCarryOver,
  normalizeStock,
  stockAbilityResult,
  stockPowerupResult,
} from '../src/core/Session';

describe('session stock', () => {
  it('sells a use for less than the permanent upgrade', () => {
    expect(SESSION_POWERUP_COST.laser).toBeLessThan(upgradeCost('laser', 1)!);
    expect(SESSION_ABILITY_COST.meteor).toBeLessThan(abilityCost('meteor', 1)!);
    expect(SESSION_ABILITY_COST.bomb).toBeLessThan(abilityCost('bomb', 0)!);
  });

  it('rejects a full pocket, a locked ability, and a short purse', () => {
    expect(stockPowerupResult('laser', 6, 4)).toBe('full');
    expect(stockPowerupResult('laser', 5, 0)).toBe('insufficient');
    expect(stockPowerupResult('laser', 6, 0)).toBe('ok');
    expect(stockAbilityResult('bomb', 100, 0, false)).toBe('locked');
    expect(stockAbilityResult('meteor', 8, 2, true)).toBe('full');
    expect(stockAbilityResult('meteor', 8, 0, true)).toBe('ok');
  });

  it('drops unknown ids and extra charges from a save', () => {
    expect(
      normalizeStock({
        powerups: ['laser', 'nope', 'smaller', 'shield', 'balls', 'pierce', 'hyper'],
        abilities: ['meteor', 'bogus', 'bomb', 'sweep'],
      }),
    ).toEqual({
      powerups: ['laser', 'shield', 'balls', 'pierce'],
      abilities: ['meteor', 'bomb'],
    });
  });
});

describe('ability carry', () => {
  it('carries held abilities to the next level except on hard', () => {
    expect(abilitiesCarryOver('easy')).toBe(true);
    expect(abilitiesCarryOver('normal')).toBe(true);
    expect(abilitiesCarryOver('hard')).toBe(false);

    const carry = new RunCarry();
    carry.stage(['meteor', 'bomb'], 3);
    expect(carry.take(3)).toEqual(['meteor', 'bomb']);
    expect(carry.take(3)).toEqual([]);

    carry.stage(['sweep'], 4);
    const staged = carry.take(4);
    expect(abilitiesCarryOver('hard') ? staged : []).toEqual([]);

    carry.stage(['frenzy'], 5);
    expect(carry.take(2)).toEqual([]);
  });
});
