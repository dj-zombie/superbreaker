import { F } from '../atlas';
import type { FxDef } from '../types';
import { GOLD, flutterAir } from './shared';

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

  /** A fountain of coins that arcs up, spins and bounces on `opts.floor`. */
  'fanfare.coins': {
    layers: [
      {
        channel: 'debris',
        frames: 'coin',
        count: 24,
        angle: [-115, -65],
        speed: [380, 640],
        gravity: 1100,
        flutter: 2.6,
        life: [1300, 1900],
        size: [0.6, 0.85],
        color: GOLD[1],
        bounce: 0.4,
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 14,
        angle: [-120, -60],
        speed: [200, 480],
        gravity: 700,
        drag: 0.6,
        life: [600, 1100],
        size: [0.25, 0.45],
        color: GOLD,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star4', from: 20, to: 90, life: 240, fade: 'quick', color: GOLD[0], rotate: 45 },
      { frame: 'glow', from: 30, to: 90, life: 260, fade: 'quick', alpha: 0.8, color: GOLD[1] },
    ],
    light: { color: GOLD[1], radius: 100, life: 300 },
  },

  /** A combo tick: a ring and a crown of streaks. Raise `intensity` and `scale` with the combo. */
  'fanfare.combo': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 12,
        zone: { ring: 8 },
        radial: true,
        speed: [200, 420],
        drag: 4,
        life: [160, 320],
        size: [0.26, 0.42],
        stretch: 0.004,
        thin: 0.6,
        color: ['@core', '@tint'],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 6,
        zone: { circle: 16 },
        speed: [20, 80],
        life: [300, 600],
        size: [0.24, 0.4],
        color: '@core',
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'ring', from: 14, to: 80, life: 280, ease: 'expo', alpha: 0.85, color: '@tint' },
      { frame: 'glow', from: 20, to: 60, life: 200, fade: 'quick', alpha: 0.7, color: '@tint' },
    ],
  },

  /** A big combo milestone: the combo tick, doubled, with a star and party glitter. */
  'fanfare.combo_big': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 26,
        zone: { ring: 12 },
        radial: true,
        speed: [320, 680],
        drag: 3.5,
        life: [200, 420],
        size: [0.32, 0.52],
        stretch: 0.004,
        thin: 0.6,
        color: ['@core', '@tint'],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 16,
        zone: { circle: 30 },
        speed: [60, 200],
        drag: 2,
        life: [500, 900],
        size: [0.3, 0.5],
        pick: ['@party'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star6', from: 30, to: 140, life: 300, fade: 'quick', color: '@core', rotate: [0, 60] },
      { frame: 'ring', from: 20, to: 140, life: 340, ease: 'expo', alpha: 0.9, color: '@tint' },
      { frame: 'ringThick', delay: 80, from: 20, to: 100, life: 300, ease: 'expo', alpha: 0.6, color: '@tint' },
      { frame: 'flare', from: 100, to: 260, life: 260, fade: 'quick', alpha: 0.7, color: '@tint' },
    ],
    light: { color: '@tint', radius: 130, life: 320 },
    shake: [100, 0.004],
  },

  /** Fever starts: speed lines rush out from the center and party glitter fills the air. */
  'fanfare.fever': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 50,
        zone: { ring: 60 },
        radial: true,
        speed: [700, 1200],
        drag: 1,
        life: [300, 520],
        size: [0.4, 0.66],
        stretch: 0.003,
        thin: 0.5,
        pick: ['@party'],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 30,
        zone: { circle: 260 },
        speed: [10, 50],
        life: [500, 1100],
        size: [0.3, 0.55],
        pick: ['@party'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'flare', from: 300, to: 900, life: 420, fade: 'quick', alpha: 0.8, color: '@accent' },
      { frame: 'shock', from: 40, to: 600, life: 520, ease: 'expo', alpha: 0.7, color: '@accent2' },
    ],
    light: { color: '@accent', radius: 260, life: 500, intensity: 1.3 },
    shake: [160, 0.005],
    scenery: 0.8,
  },

  /** A burst of gold stars: a rating, a reward. */
  'fanfare.stars': {
    layers: [
      {
        channel: 'glow',
        frames: 'conf_star',
        count: 16,
        zone: { circle: 6 },
        radial: true,
        speed: [180, 380],
        drag: 2.4,
        gravity: 200,
        spin: [-360, 360],
        life: [700, 1200],
        size: [0.9, 1.4],
        color: GOLD,
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 12,
        zone: { circle: 30 },
        speed: [20, 90],
        life: [400, 900],
        size: [0.3, 0.5],
        color: GOLD,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star6', from: 30, to: 150, life: 320, fade: 'quick', color: GOLD[0], rotate: [0, 60] },
      { frame: 'glow', from: 40, to: 120, life: 300, fade: 'quick', alpha: 0.8, color: GOLD[1] },
    ],
    light: { color: GOLD[1], radius: 140, life: 360 },
  },

  /** Level clear: stars at the center, then the full celebration. Play at the board's center. */
  'fanfare.levelclear': {
    layers: [],
    sprites: [{ frame: 'flare', from: 300, to: 900, life: 500, fade: 'quick', alpha: 0.8, color: '@core' }],
    scenery: 1,
    then: [
      { at: 0, fx: 'fanfare.stars' },
      { at: 120, fx: 'fanfare.celebrate' },
    ],
  },
};
