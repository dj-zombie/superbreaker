import type { DifficultyId } from './types';

export interface DifficultyConfig {
  label: string;
  /** Ball speed in px/s. */
  minSpeed: number;
  maxSpeed: number;
  /** Speed added to the ball each time it breaks a brick. */
  speedStep: number;
  /** Damage a normal ball hit deals; bricks start with 100 health by default. */
  hitDamage: number;
  /** Horizontal speed per pixel of offset from the paddle center. */
  paddleSpin: number;
  /** Hard mode slowly shrinks the paddle on each brick hit. */
  shrinkPaddleOnHit: boolean;
}

export const DIFFICULTY: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    label: 'Easy',
    minSpeed: 300,
    maxSpeed: 430,
    speedStep: 15,
    hitDamage: 500,
    paddleSpin: 7,
    shrinkPaddleOnHit: false,
  },
  normal: {
    label: 'Normal',
    minSpeed: 490,
    maxSpeed: 760,
    speedStep: 30,
    hitDamage: 50,
    paddleSpin: 8,
    shrinkPaddleOnHit: false,
  },
  hard: {
    label: 'Hard',
    minSpeed: 540,
    maxSpeed: 1200,
    speedStep: 40,
    hitDamage: 34,
    paddleSpin: 10,
    shrinkPaddleOnHit: true,
  },
};

export const FIREBALL_DAMAGE = 200;
/** A pierce shot breaks a standard brick. Laser bolts use upgrade damage instead. */
export const PIERCE_DAMAGE = 100;
export const BRICK_SCORE = 80;
export const LASER_BRICK_SCORE = 55;
export const START_LIVES = 3;
export const MAX_LIVES = 5;
/** Multiball and Ball Frenzy stop adding balls here. */
export const MAX_BALLS = 10;
/** Paid when a multiball or frenzy would go over the ball cap. */
export const BALL_OVERFLOW_SCORE = 250;
/** The rest of the level may collapse once this many breakable bricks remain. */
export function collapseThreshold(initialBreakables: number): number {
  return Math.max(6, Math.min(18, Math.round(initialBreakables * 0.15)));
}

export function starsForLives(livesLeft: number): number {
  return Math.max(1, Math.min(3, livesLeft));
}

/** By the end of a level the cruise speed has climbed this share of the way from min to max. */
export const CRUISE_SHARE = 0.55;
/** How fast a ball above cruise speed slows back down, in px/s per second. */
export const SPEED_RELAX_PER_SEC = 40;

type SpeedRange = Pick<DifficultyConfig, 'minSpeed' | 'maxSpeed'>;

/** The speed balls settle back to between bursts. `cleared` is the share of the level broken, 0..1. */
export function cruiseSpeed(diff: SpeedRange, cleared: number): number {
  const t = Math.max(0, Math.min(1, cleared));
  return diff.minSpeed + (diff.maxSpeed - diff.minSpeed) * CRUISE_SHARE * t;
}

/** Eases a speed above cruise back down. Speeds at or below cruise are left alone. */
export function relaxSpeed(speed: number, cruise: number, dtMs: number): number {
  if (speed <= cruise) return speed;
  return Math.max(cruise, speed - (SPEED_RELAX_PER_SEC * dtMs) / 1000);
}

/** The same difficulty with both ball speeds multiplied by `s`. */
export function scaleSpeeds(diff: DifficultyConfig, s: number): DifficultyConfig {
  return { ...diff, minSpeed: diff.minSpeed * s, maxSpeed: diff.maxSpeed * s };
}

export const LEVELS_PER_WORLD = 10;
const LAST_WORLD = 2;

/**
 * Campaign ball speed multiplier, a sawtooth: it rises through each world's ten levels, and each
 * world opens a little easier than the last one ended. Hell 0.94-1.06, Crypt 0.98-1.10,
 * Mainframe 1.02-1.14.
 */
export function campaignSpeedScale(level: number): number {
  const i = Math.max(0, Math.floor(level) - 1);
  const world = Math.min(LAST_WORLD, Math.floor(i / LEVELS_PER_WORLD));
  const step = (i % LEVELS_PER_WORLD) / (LEVELS_PER_WORLD - 1);
  return 0.94 + world * 0.04 + step * 0.12;
}
