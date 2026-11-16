import { describe, expect, it } from 'vitest';
import {
  CRUISE_SHARE,
  DIFFICULTY,
  IDLE_BOOST_GRACE_MS,
  IDLE_BOOST_MAX,
  IDLE_BOOST_RAMP_MS,
  LEVELS_PER_WORLD,
  SPEED_CHASE_PER_SEC,
  SPEED_RELAX_PER_SEC,
  campaignSpeedScale,
  chaseSpeed,
  cruiseSpeed,
  idleSpeedBoost,
  relaxSpeed,
  scaleSpeeds,
} from '../src/core/Difficulty';

const normal = DIFFICULTY.normal;

describe('cruiseSpeed', () => {
  it('starts at the minimum and climbs part of the way to the maximum', () => {
    expect(cruiseSpeed(normal, 0)).toBe(normal.minSpeed);
    const end = normal.minSpeed + (normal.maxSpeed - normal.minSpeed) * CRUISE_SHARE;
    expect(cruiseSpeed(normal, 1)).toBeCloseTo(end);
    expect(cruiseSpeed(normal, 1)).toBeLessThan(normal.maxSpeed);
  });

  it('clamps progress outside 0..1', () => {
    expect(cruiseSpeed(normal, -0.5)).toBe(cruiseSpeed(normal, 0));
    expect(cruiseSpeed(normal, 2)).toBe(cruiseSpeed(normal, 1));
  });
});

describe('idleSpeedBoost', () => {
  it('leaves the ball alone through the grace period', () => {
    expect(idleSpeedBoost(0)).toBe(1);
    expect(idleSpeedBoost(IDLE_BOOST_GRACE_MS)).toBe(1);
  });

  it('ramps up to the cap and holds there', () => {
    const half = idleSpeedBoost(IDLE_BOOST_GRACE_MS + IDLE_BOOST_RAMP_MS / 2);
    expect(half).toBeCloseTo(1 + (IDLE_BOOST_MAX - 1) / 2);
    expect(idleSpeedBoost(IDLE_BOOST_GRACE_MS + IDLE_BOOST_RAMP_MS)).toBeCloseTo(IDLE_BOOST_MAX);
    expect(idleSpeedBoost(60_000)).toBeCloseTo(IDLE_BOOST_MAX);
  });
});

describe('chaseSpeed', () => {
  it('speeds a slow ball up at the chase rate without passing the target', () => {
    expect(chaseSpeed(400, 600, 1_000)).toBeCloseTo(400 + SPEED_CHASE_PER_SEC);
    expect(chaseSpeed(590, 600, 1_000)).toBe(600);
  });

  it('leaves a ball at or above the target alone', () => {
    expect(chaseSpeed(600, 600, 1_000)).toBe(600);
    expect(chaseSpeed(700, 600, 1_000)).toBe(700);
  });
});

describe('relaxSpeed', () => {
  it('slows a fast ball at the relax rate', () => {
    expect(relaxSpeed(700, 500, 1_000)).toBeCloseTo(700 - SPEED_RELAX_PER_SEC);
  });

  it('never drops below cruise, and leaves slower balls alone', () => {
    expect(relaxSpeed(510, 500, 10_000)).toBe(500);
    expect(relaxSpeed(450, 500, 1_000)).toBe(450);
  });

  it('brings a ball at top speed back to cruise within a few seconds', () => {
    const cruise = cruiseSpeed(normal, 0.5);
    let speed = normal.maxSpeed;
    for (let t = 0; t < 8_000; t += 16) speed = relaxSpeed(speed, cruise, 16);
    expect(speed).toBe(cruise);
  });
});

describe('scaleSpeeds', () => {
  it('scales both ball speeds and nothing else', () => {
    const fast = scaleSpeeds(normal, 1.1);
    expect(fast.minSpeed).toBeCloseTo(normal.minSpeed * 1.1);
    expect(fast.maxSpeed).toBeCloseTo(normal.maxSpeed * 1.1);
    expect(fast.hitDamage).toBe(normal.hitDamage);
    expect(fast.speedStep).toBe(normal.speedStep);
  });
});

describe('campaignSpeedScale', () => {
  it('rises through each world', () => {
    for (let world = 0; world < 3; world++) {
      const first = world * LEVELS_PER_WORLD + 1;
      for (let i = 1; i < LEVELS_PER_WORLD; i++) {
        expect(campaignSpeedScale(first + i)).toBeGreaterThan(campaignSpeedScale(first + i - 1));
      }
    }
  });

  it('opens each world a little easier than the last one ended', () => {
    expect(campaignSpeedScale(11)).toBeLessThan(campaignSpeedScale(10));
    expect(campaignSpeedScale(21)).toBeLessThan(campaignSpeedScale(20));
    expect(campaignSpeedScale(11)).toBeGreaterThan(campaignSpeedScale(1));
    expect(campaignSpeedScale(21)).toBeGreaterThan(campaignSpeedScale(11));
  });

  it('stays in a gentle range', () => {
    expect(campaignSpeedScale(1)).toBeCloseTo(0.94);
    expect(campaignSpeedScale(10)).toBeCloseTo(1.06);
    expect(campaignSpeedScale(30)).toBeCloseTo(1.14);
    expect(campaignSpeedScale(45)).toBeLessThanOrEqual(1.14);
  });
});
