import { describe, expect, it } from 'vitest';
import { powerupStats } from '../src/core/Economy';
import { laserClearCeiling } from '../src/core/Laser';
import { GUN_BUDGET, SKILLS, SkillCharge, gunBudget } from '../src/core/Skills';

const def = { label: 'Test', color: 0, cooldownMs: 10_000, perBreakMs: 500, durationMs: 2_000 };

describe('SkillCharge', () => {
  it('starts empty unless given a charge', () => {
    expect(new SkillCharge(def).ready).toBe(false);
    expect(new SkillCharge(def, 1).ready).toBe(true);
  });

  it('can be fired once when ready', () => {
    const s = new SkillCharge(def, 1);
    expect(s.ready).toBe(true);
    expect(s.use()).toBe(true);
    expect(s.active).toBe(true);
    expect(s.charge).toBe(0);
    expect(s.use()).toBe(false);
  });

  it('runs for its duration, then reports the end once', () => {
    const s = new SkillCharge(def, 1);
    s.use();
    expect(s.update(1_900, true)).toBeNull();
    expect(s.fraction).toBeCloseTo(0.05);
    expect(s.update(200, true)).toBe('end');
    expect(s.active).toBe(false);
    expect(s.update(100, true)).toBeNull();
  });

  it('does not recharge while running', () => {
    const s = new SkillCharge(def, 1);
    s.use();
    s.update(1_000, true);
    s.onBreak();
    expect(s.charge).toBe(0);
  });

  it('fills over the cooldown only while charging', () => {
    const s = new SkillCharge(def, 0);
    s.update(5_000, false);
    expect(s.charge).toBe(0);
    s.update(5_000, true);
    expect(s.charge).toBeCloseTo(0.5);
    s.update(6_000, true);
    expect(s.charge).toBe(1);
    expect(s.ready).toBe(true);
  });

  it('takes time off the cooldown for each break', () => {
    const s = new SkillCharge(def, 0);
    for (let i = 0; i < 4; i++) s.onBreak();
    expect(s.charge).toBeCloseTo(0.2);
    for (let i = 0; i < 30; i++) s.onBreak();
    expect(s.charge).toBe(1);
  });

  it('knocks any amount off the cooldown, but not while running', () => {
    const s = new SkillCharge(def, 0);
    s.knock(2_500);
    expect(s.charge).toBeCloseTo(0.25);
    s.knock(20_000);
    expect(s.ready).toBe(true);
    s.use();
    s.knock(5_000);
    expect(s.charge).toBe(0);
  });

  it('can be stopped early without giving the charge back', () => {
    const s = new SkillCharge(def, 1);
    s.use();
    s.stop();
    expect(s.active).toBe(false);
    expect(s.ready).toBe(false);
  });
});

describe('skill tuning', () => {
  it('readies the gun more often than bullet time', () => {
    expect(SKILLS.gun.cooldownMs).toBeLessThan(SKILLS.slowmo.cooldownMs);
  });

  it('grows the gun budget with the Armory laser tier', () => {
    expect(gunBudget(1)).toBe(GUN_BUDGET);
    expect(gunBudget(5)).toBeGreaterThan(gunBudget(1));
  });

  it('keeps a gun burst to a handful of bricks, well short of a laser pickup', () => {
    for (const tier of [1, 5]) {
      const pickup = powerupStats({ magnet: 1, fireball: 1, laser: tier });
      const burst = {
        ...pickup,
        laserDurationMs: SKILLS.gun.durationMs,
        laserBudget: gunBudget(tier),
      };
      const bricks = laserClearCeiling(burst, 'gun');
      expect(bricks).toBeGreaterThanOrEqual(3);
      expect(bricks).toBeLessThan(laserClearCeiling(pickup, 'gun'));
    }
  });
});
