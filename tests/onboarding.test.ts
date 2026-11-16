import { describe, expect, it } from 'vitest';
import {
  CATCH_WAIT_MS,
  MIN_READ_MS,
  MOVE_TRAVEL,
  Onboarding,
  helpfulPickup,
  pathToLine,
} from '../src/core/Onboarding';

/** A tutorial that has reached `step`, by the shortest route. */
function at(step: 'guard' | 'catch' | 'ability'): Onboarding {
  const o = new Onboarding();
  o.launched();
  if (step === 'guard') return o;
  o.ballFalling();
  o.tick(MIN_READ_MS);
  o.release();
  o.ballReturned();
  if (step === 'catch') return o;
  o.pickupCaught('fireball');
  return o;
}

describe('Onboarding', () => {
  it('walks through every step', () => {
    const o = new Onboarding();
    expect(o.step).toBe('move');
    expect(o.holdServe).toBe(true);
    expect(o.moved(MOVE_TRAVEL / 2)).toBe(false);
    expect(o.moveProgress).toBeCloseTo(0.5);
    expect(o.moved(-MOVE_TRAVEL / 2)).toBe(true);
    expect(o.step).toBe('launch');
    expect(o.holdServe).toBe(true);
    expect(o.launched()).toBe(true);
    expect(o.step).toBe('guard');
    expect(o.holdServe).toBe(false);

    expect(o.ballFalling()).toBe(true);
    expect(o.frozen).toBe(true);
    o.tick(MIN_READ_MS);
    expect(o.release()).toBe(true);
    expect(o.frozen).toBe(false);
    expect(o.ballReturned()).toBe(true);
    expect(o.step).toBe('catch');

    expect(o.pickupSpotted('fireball')).toBe(true);
    o.tick(MIN_READ_MS);
    expect(o.release()).toBe(true);
    expect(o.pickupCaught('fireball')).toBe(true);
    expect(o.step).toBe('ability');

    expect(o.abilityReady()).toBe(true);
    expect(o.frozen).toBe(true);
    expect(o.abilityFired()).toBe(true);
    expect(o.done).toBe(true);
    expect(o.frozen).toBe(false);
  });

  it('skips the move step when the player launches first', () => {
    const o = new Onboarding();
    expect(o.launched()).toBe(true);
    expect(o.step).toBe('guard');
    expect(o.moved(MOVE_TRAVEL)).toBe(false);
    expect(o.launched()).toBe(false);
  });

  it('keeps a freeze up until it has been readable for long enough', () => {
    const o = at('guard');
    o.ballFalling();
    expect(o.release()).toBe(false);
    o.tick(MIN_READ_MS - 1);
    expect(o.release()).toBe(false);
    o.tick(1);
    expect(o.release()).toBe(true);
    expect(o.release()).toBe(false);
  });

  it('freezes once per step', () => {
    const o = at('guard');
    expect(o.ballFalling()).toBe(true);
    o.tick(MIN_READ_MS);
    o.release();
    expect(o.ballFalling()).toBe(false);
    expect(o.frozen).toBe(false);
  });

  it('waits for the ball pointed at, not one that came back before the freeze', () => {
    const o = at('guard');
    expect(o.ballReturned()).toBe(false);
    o.ballFalling();
    expect(o.ballReturned()).toBe(false);
    o.tick(MIN_READ_MS);
    o.release();
    expect(o.ballReturned()).toBe(true);
  });

  it('points only at the first helpful pickup', () => {
    const o = at('catch');
    expect(o.pickupSpotted('coin')).toBe(false);
    expect(o.pickupSpotted('smaller')).toBe(false);
    expect(o.pickupCaught('coin')).toBe(false);
    expect(o.pickupSpotted('balls')).toBe(true);
    expect(o.pickupSpotted('laser')).toBe(false);
    expect(o.step).toBe('catch');
  });

  it('moves on when the pickup pointed at is missed, but not before one is shown', () => {
    const o = at('catch');
    expect(o.pickupMissed()).toBe(false);
    o.pickupSpotted('magnet');
    expect(o.pickupMissed()).toBe(false);
    o.tick(MIN_READ_MS);
    o.release();
    expect(o.pickupMissed()).toBe(true);
    expect(o.step).toBe('ability');
  });

  it('gives up waiting for a pickup after a while of play, but not while one is pointed at', () => {
    const o = at('catch');
    expect(o.tick(CATCH_WAIT_MS - 1)).toBe(false);
    expect(o.tick(1)).toBe(true);
    expect(o.step).toBe('ability');

    const watching = at('catch');
    watching.pickupSpotted('shield');
    watching.tick(MIN_READ_MS);
    watching.release();
    expect(watching.tick(CATCH_WAIT_MS)).toBe(false);
    expect(watching.step).toBe('catch');
  });

  it('counts a fired ability even before it was pointed at', () => {
    const o = at('ability');
    expect(o.abilityFired()).toBe(true);
    expect(o.done).toBe(true);
  });

  it('ignores events from other steps, and skip ends it anywhere, even frozen', () => {
    const o = new Onboarding();
    expect(o.pickupSpotted('fireball')).toBe(false);
    expect(o.ballFalling()).toBe(false);
    expect(o.abilityReady()).toBe(false);
    expect(o.abilityFired()).toBe(false);

    const frozen = at('guard');
    frozen.ballFalling();
    frozen.skip();
    expect(frozen.done).toBe(true);
    expect(frozen.frozen).toBe(false);
    expect(frozen.launched()).toBe(false);
  });

  it('treats coins and Smaller as unhelpful', () => {
    expect(helpfulPickup('coin')).toBe(false);
    expect(helpfulPickup('smaller')).toBe(false);
    expect(helpfulPickup('mystery')).toBe(true);
  });
});

describe('pathToLine', () => {
  it('goes straight down to the line', () => {
    expect(pathToLine({ x: 100, y: 0 }, 0, 100, 500, 0, 600)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 500 },
    ]);
  });

  it('bounces off the side walls on the way', () => {
    const path = pathToLine({ x: 500, y: 0 }, 100, 100, 400, 0, 600)!;
    expect(path).toHaveLength(3);
    expect(path[1]).toEqual({ x: 600, y: 100 });
    expect(path[2]!.x).toBeCloseTo(300);
    expect(path[2]!.y).toBe(400);
  });

  it('is null for a ball going up or already past the line', () => {
    expect(pathToLine({ x: 100, y: 0 }, 50, -100, 500, 0, 600)).toBeNull();
    expect(pathToLine({ x: 100, y: 600 }, 50, 100, 500, 0, 600)).toBeNull();
  });

  it('starts inside the walls and ends on the line even for a near-flat ball', () => {
    const path = pathToLine({ x: -20, y: 0 }, 1000, 1, 300, 10, 590)!;
    expect(path[0]!.x).toBe(10);
    const end = path[path.length - 1]!;
    expect(end.y).toBe(300);
    expect(end.x).toBeGreaterThanOrEqual(10);
    expect(end.x).toBeLessThanOrEqual(590);
  });
});
