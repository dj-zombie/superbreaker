import { describe, expect, it } from 'vitest';
import { MOVE_TRAVEL, Onboarding, helpfulPickup } from '../src/core/Onboarding';

describe('Onboarding', () => {
  it('walks through move, launch and catch', () => {
    const o = new Onboarding();
    expect(o.step).toBe('move');
    expect(o.holdServe).toBe(true);
    expect(o.moved(MOVE_TRAVEL / 2)).toBe(false);
    expect(o.moveProgress).toBeCloseTo(0.5);
    expect(o.moved(-MOVE_TRAVEL / 2)).toBe(true);
    expect(o.step).toBe('launch');
    expect(o.holdServe).toBe(false);
    expect(o.launched()).toBe(true);
    expect(o.step).toBe('catch');
    expect(o.pickupSpawned('fireball')).toBe(true);
    expect(o.pickupCaught('fireball')).toBe(true);
    expect(o.done).toBe(true);
  });

  it('skips the move step when the player launches first', () => {
    const o = new Onboarding();
    expect(o.launched()).toBe(true);
    expect(o.step).toBe('catch');
    expect(o.moved(MOVE_TRAVEL)).toBe(false);
  });

  it('points only at the first helpful pickup', () => {
    const o = new Onboarding();
    o.launched();
    expect(o.pickupSpawned('coin')).toBe(false);
    expect(o.pickupSpawned('smaller')).toBe(false);
    expect(o.pickupCaught('coin')).toBe(false);
    expect(o.pickupSpawned('balls')).toBe(true);
    expect(o.pickupSpawned('laser')).toBe(false);
    expect(o.step).toBe('catch');
  });

  it('ends when the pointed-at pickup is missed, but not before one is shown', () => {
    const o = new Onboarding();
    o.launched();
    expect(o.pickupMissed()).toBe(false);
    o.pickupSpawned('magnet');
    expect(o.pickupMissed()).toBe(true);
    expect(o.done).toBe(true);
  });

  it('ignores pickups before the ball is in play, and skip ends it anywhere', () => {
    const o = new Onboarding();
    expect(o.pickupSpawned('fireball')).toBe(false);
    o.skip();
    expect(o.done).toBe(true);
    expect(o.launched()).toBe(false);
  });

  it('treats coins and Smaller as unhelpful', () => {
    expect(helpfulPickup('coin')).toBe(false);
    expect(helpfulPickup('smaller')).toBe(false);
    expect(helpfulPickup('mystery')).toBe(true);
  });
});
