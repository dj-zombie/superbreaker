import { F } from '../atlas';
import type { FxDef } from '../types';
import { flutterAir } from './shared';

/** Celebrations. Colors come from the world's party palette. */
export const FANFARE_FX: Record<string, FxDef> = {
  /** A confetti cannon firing along `opts.angle`: flipping paper, ribbons and glitter. */
  'fanfare.cannon': {
    layers: [
      {
        channel: 'debris',
        frames: F.confetti,
        count: 60,
        aim: true,
        angle: [-13, 13],
        speed: [520, 940],
        drag: 1.7,
        gravity: 360,
        forces: [flutterAir],
        life: [1900, 2900],
        size: [0.65, 1.05],
        rotate: [0, 360],
        spin: [-600, 600],
        mirror: true,
        flutter: 2.2,
        pick: ['@party'],
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 18,
        aim: true,
        angle: [-16, 16],
        speed: [400, 820],
        drag: 2,
        gravity: 260,
        forces: [flutterAir],
        life: [800, 1500],
        size: [0.3, 0.55],
        pick: ['@party'],
        fade: 'flicker',
      },
    ],
    sprites: [{ frame: 'glow', from: 30, to: 110, life: 220, fade: 'quick', aim: true, color: '@core', alpha: 0.7 }],
  },

  /** A firework shell: rises as a streak and bursts at its peak (`fanfare.burst`). */
  'fanfare.firework': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 1,
        angle: [-96, -84],
        speed: [680, 780],
        gravity: 600,
        life: [880, 1020],
        size: 0.5,
        stretch: 0.004,
        thin: 0.6,
        pick: ['@party'],
        fade: 'none',
        onDeath: 'fanfare.burst',
        essential: true,
      },
    ],
  },

  /** The bloom of a firework, in the shell's color, with crackling stragglers. */
  'fanfare.burst': {
    layers: [
      {
        channel: 'glow',
        frames: 'ember',
        count: 70,
        speed: [190, 250],
        drag: 1.5,
        gravity: 110,
        life: [950, 1450],
        size: [0.45, 0.72],
        stretch: 0.0025,
        thin: 0.7,
        color: ['@core', '@tint', '@tint'],
        fade: 'late',
        onDeath: 'fanfare.crackle',
        deathChance: 0.22,
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'dot',
        count: 24,
        speed: [50, 140],
        drag: 1.4,
        gravity: 90,
        life: [700, 1100],
        size: [0.7, 1.1],
        color: ['@core', '@tint'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'core', from: 30, to: 170, life: 280, fade: 'quick', color: '@tint' },
      { frame: 'star6', from: 40, to: 150, life: 220, fade: 'quick', color: '@core', rotate: [0, 60] },
    ],
    light: { color: '@tint', radius: 180, life: 500, intensity: 1.2 },
  },

  'fanfare.crackle': {
    layers: [
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 3,
        speed: [10, 50],
        life: [120, 280],
        size: [0.25, 0.45],
        color: '@core',
        fade: 'flicker',
      },
    ],
  },

  /**
   * The full show, played at the center of the board: cannons from both bottom corners and a
   * volley of fireworks.
   */
  'fanfare.celebrate': {
    then: [
      { at: 0, fx: 'fanfare.cannon', dx: -265, dy: 380, angle: -62 },
      { at: 0, fx: 'fanfare.cannon', dx: 265, dy: 380, angle: -118 },
      { at: 150, fx: 'fanfare.firework', dx: [-200, -80], dy: 400 },
      { at: 380, fx: 'fanfare.firework', dx: [80, 200], dy: 400 },
      { at: 650, fx: 'fanfare.firework', dx: [-60, 60], dy: 400 },
      { at: 900, fx: 'fanfare.cannon', dx: -265, dy: 380, angle: -70 },
      { at: 900, fx: 'fanfare.cannon', dx: 265, dy: 380, angle: -110 },
      { at: 1050, fx: 'fanfare.firework', dx: [-220, 220], dy: 400 },
      { at: 1300, fx: 'fanfare.firework', dx: [-220, 220], dy: 400 },
    ],
  },
};
