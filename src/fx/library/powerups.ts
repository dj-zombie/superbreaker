import type { FxDef } from '../types';
import { GOLD, HEART, flutterAir, lazySwirl } from './shared';

/** Powerup drops and pickups. `tint` is the powerup's color from POWERUP_INFO. */
export const POWERUP_FX: Record<string, FxDef> = {
  /** A powerup drops out of a brick: a ring opens and glints scatter. */
  'powerup.spawn': {
    layers: [
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 8,
        zone: { circle: 10 },
        radial: true,
        speed: [60, 160],
        drag: 3,
        life: [300, 600],
        size: [0.25, 0.45],
        rotate: [0, 45],
        color: ['@core', '@tint'],
        fade: 'flicker',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'ring', from: 14, to: 90, life: 340, ease: 'expo', alpha: 0.9, color: '@tint' },
      { frame: 'star4', from: 16, to: 56, life: 180, fade: 'quick', color: '@core', rotate: 45 },
      { frame: 'glow', from: 24, to: 70, life: 240, fade: 'quick', alpha: 0.85, color: '@tint' },
    ],
  },

  /** A falling powerup's glow trail. Attach to the capsule. */
  'powerup.aura': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 18,
        zone: { rect: [22, 8] },
        angle: [-100, -80],
        speed: [10, 30],
        life: [300, 560],
        size: [0.5, 0.8],
        color: ['@core', '@tint'],
        fade: 'inOut',
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        rate: 3,
        zone: { rect: [26, 12] },
        follow: true,
        life: [240, 420],
        size: [0.2, 0.34],
        rotate: [0, 45],
        color: '@core',
        fade: 'inOut',
      },
      {
        channel: 'low',
        frames: 'glow',
        rate: 10,
        follow: true,
        life: [200, 300],
        size: [0.75, 0.85],
        color: '@tint',
        alpha: 0.35,
        fade: 'inOut',
      },
    ],
  },

  /** Caught: a bright pop, a star and rising glitter in the powerup's color. */
  'powerup.pickup': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 14,
        zone: { ring: 10 },
        radial: true,
        speed: [220, 460],
        drag: 4,
        life: [180, 340],
        size: [0.28, 0.44],
        stretch: 0.004,
        thin: 0.6,
        color: ['@core', '@tint'],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 10,
        zone: { rect: [40, 10] },
        angle: [-110, -70],
        speed: [60, 160],
        drag: 1.6,
        life: [500, 900],
        size: [0.26, 0.46],
        rotate: [0, 45],
        color: ['@core', '@tint'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star6', from: 20, to: 90, life: 240, fade: 'quick', color: '@core', rotate: [0, 60] },
      { frame: 'ring', from: 16, to: 96, life: 300, ease: 'expo', alpha: 0.9, color: '@tint' },
      { frame: 'glow', from: 30, to: 90, life: 240, fade: 'quick', alpha: 0.8, color: '@tint' },
    ],
    light: { color: '@tint', radius: 90, life: 260 },
  },

  /** A coin collected: a gold glint and a spray of tiny coins. */
  'powerup.coin': {
    layers: [
      {
        channel: 'debris',
        frames: 'coin',
        count: 5,
        angle: [-130, -50],
        speed: [140, 260],
        gravity: 900,
        flutter: 3,
        life: [500, 800],
        size: [0.5, 0.7],
        color: GOLD[1],
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 6,
        zone: { circle: 10 },
        speed: [20, 60],
        life: [300, 520],
        size: [0.25, 0.4],
        color: GOLD,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star4', from: 20, to: 76, life: 220, fade: 'quick', color: GOLD[0], rotate: 45 },
      { frame: 'glow', from: 26, to: 64, life: 200, fade: 'quick', alpha: 0.75, color: GOLD[1] },
    ],
  },

  /** An extra life: warm pink motes swirl up around a soft heart-colored bloom. */
  'powerup.life': {
    layers: [
      {
        channel: 'glow',
        frames: 'glow',
        count: 14,
        zone: { circle: 16 },
        angle: [-120, -60],
        speed: [40, 120],
        forces: [lazySwirl],
        life: [700, 1200],
        size: [0.12, 0.22],
        color: HEART,
        fade: 'inOut',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 8,
        zone: { circle: 20 },
        speed: [20, 70],
        life: [500, 900],
        size: [0.26, 0.42],
        color: HEART,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'ring', from: 20, to: 110, life: 420, ease: 'expo', alpha: 0.8, color: HEART[2] },
      { frame: 'core', from: 30, to: 110, life: 300, fade: 'quick', color: HEART[1] },
    ],
    light: { color: HEART[2], radius: 110, life: 360 },
  },

  /** A shield goes up: hex cells flare out on a ring. */
  'powerup.shield': {
    layers: [
      {
        channel: 'glow',
        frames: 'hex',
        count: 14,
        zone: { ring: 26 },
        radial: true,
        speed: [40, 90],
        drag: 3,
        life: [360, 600],
        size: [0.24, 0.36],
        rotate: [0, 60],
        color: ['@core', '@tint'],
        fade: 'inOut',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'hex', from: 30, to: 120, life: 360, ease: 'expo', alpha: 0.9, color: '@tint' },
      { frame: 'ringThick', from: 30, to: 140, life: 380, ease: 'expo', alpha: 0.6, color: '@tint' },
    ],
    light: { color: '@tint', radius: 100, life: 300 },
  },

  /** Multiball: glints split off in three directions. */
  'powerup.multiball': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 9,
        angle: [-150, -30],
        speed: [300, 520],
        drag: 4,
        life: [200, 360],
        size: [0.32, 0.5],
        stretch: 0.004,
        thin: 0.6,
        color: ['@core', '@tint'],
        essential: true,
      },
    ],
    sprites: [
      { frame: 'glow', from: 20, to: 70, life: 220, fade: 'quick', alpha: 0.8, color: '@tint' },
      { frame: 'ring', from: 10, to: 70, life: 260, alpha: 0.8, color: '@tint' },
    ],
  },

  /** Hyperspeed: speed lines streak upward past the paddle. */
  'powerup.hyper': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 20,
        zone: { rect: [120, 20] },
        angle: [-94, -86],
        speed: [600, 1000],
        drag: 1.5,
        life: [200, 380],
        size: [0.3, 0.5],
        stretch: 0.003,
        thin: 0.5,
        color: ['@core', '@tint'],
        essential: true,
      },
    ],
    sprites: [{ frame: 'flare', from: 80, to: 220, life: 220, fade: 'quick', alpha: 0.8, color: '@tint' }],
  },

  /** The mystery box opens: a confetti pop in party colors. */
  'powerup.mystery': {
    layers: [
      {
        channel: 'debris',
        frames: ['conf_rect', 'conf_star', 'conf_disc'],
        count: 22,
        zone: { circle: 6 },
        radial: true,
        speed: [160, 360],
        drag: 2.2,
        gravity: 320,
        forces: [flutterAir],
        life: [800, 1300],
        size: [0.5, 0.8],
        rotate: [0, 360],
        spin: [-600, 600],
        flutter: 2.4,
        pick: ['@party'],
        fade: 'late',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'star6', from: 24, to: 100, life: 240, fade: 'quick', color: '@core', rotate: [0, 60] },
      { frame: 'glow', from: 30, to: 90, life: 220, fade: 'quick', alpha: 0.8, color: '@tint' },
    ],
  },

  /** A bad pickup (tiny paddle): a sour fizzle that sinks instead of rising. */
  'powerup.bad': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 14,
        zone: { rect: [40, 8] },
        angle: [60, 120],
        speed: [30, 90],
        gravity: 200,
        life: [400, 700],
        size: [0.5, 0.8],
        color: ['@tint', '@cool'],
        fade: 'flicker',
        essential: true,
      },
    ],
    sprites: [{ frame: 'ring', from: 90, to: 20, life: 300, ease: 'in', alpha: 0.7, color: '@tint' }],
  },

  /** The magnet's pull: motes stream in toward the paddle. Attach, with `w` the paddle width. */
  'powerup.magnet': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        rate: 24,
        zone: { ring: 80 },
        radial: true,
        speed: [-200, -160],
        life: [380, 460],
        size: [0.18, 0.3],
        stretch: 0.003,
        thin: 0.5,
        color: ['@tint', '@core'],
        fade: 'in',
      },
      {
        channel: 'glow',
        frames: 'dot',
        rate: 14,
        zone: { ring: 60 },
        radial: true,
        speed: [-140, -100],
        life: [420, 520],
        size: [0.4, 0.6],
        color: '@tint',
        fade: 'in',
      },
    ],
  },
};
