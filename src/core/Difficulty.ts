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
/** The rest of the level collapses once this many breakable bricks remain. */
export function collapseThreshold(initialBreakables: number): number {
  return Math.max(8, Math.min(30, Math.round(initialBreakables * 0.3)));
}

export function starsForLives(livesLeft: number): number {
  return Math.max(1, Math.min(3, livesLeft));
}
