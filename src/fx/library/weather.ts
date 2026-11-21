import { F } from '../atlas';
import type { FxDef } from '../types';
import { drift, flutterAir, lazySwirl, rainWind } from './shared';

/**
 * Ambient fields. Start one with `fx.weather(id, playfieldBounds)`; `spawn` says where in the
 * bounds new particles appear. Rates are per second across the whole field.
 */
export const WEATHER_FX: Record<string, FxDef> = {
  /** Slanting rain; some drops splash where they end. */
  'weather.rain': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: 'drop',
        rate: 240,
        angle: [100, 104],
        speed: [900, 1100],
        forces: [rainWind],
        life: [700, 1000],
        size: [0.8, 1.15],
        stretch: 0.0007,
        thin: 0.9,
        alpha: [0.35, 0.65],
        color: '@steam',
        fade: 'none',
        onDeath: 'weather.splash',
        deathChance: 0.25,
      },
    ],
  },

  'weather.splash': {
    layers: [
      {
        channel: 'sky',
        frames: 'dot',
        count: 3,
        angle: [-150, -30],
        speed: [40, 100],
        gravity: 600,
        life: [140, 260],
        size: [0.3, 0.5],
        alpha: 0.5,
        color: '@steam',
        fade: 'quick',
      },
    ],
    sprites: [{ frame: 'splash', from: 10, to: 18, life: 160, fade: 'quick', alpha: 0.4, color: '@steam' }],
  },

  /** Ash drifting down, turning over as it falls. */
  'weather.ash': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: ['bit', 'conf_rect', 'dot'],
        rate: 20,
        angle: [80, 100],
        speed: [30, 60],
        forces: [flutterAir],
        life: [6000, 9000],
        size: [0.45, 0.85],
        rotate: [0, 360],
        spin: [-120, 120],
        flutter: 0.8,
        alpha: [0.4, 0.7],
        color: ['@steam', '@soot'],
        fade: 'inOut',
      },
      {
        channel: 'sky',
        frames: 'ember',
        rate: 4,
        angle: [80, 100],
        speed: [30, 60],
        forces: [flutterAir],
        life: [5000, 8000],
        size: [0.3, 0.5],
        color: ['@hot', '@warm', '@cool'],
        fade: 'flicker',
        minTier: 'medium',
      },
    ],
  },

  /** Crypt mist: big, faint banks rolling slowly across the low field. */
  'weather.mist': {
    spawn: 'fill',
    layers: [
      {
        channel: 'sky',
        frames: F.smoke,
        rate: 2.4,
        angle: [-5, 5],
        speed: [8, 20],
        forces: [lazySwirl],
        life: [7000, 10000],
        size: [1.6, 2.6],
        grow: 1.3,
        rotate: [0, 360],
        spin: [-6, 6],
        mirror: true,
        alpha: [0.12, 0.2],
        color: ['@steam', '@arcane'],
        fade: 'inOut',
      },
    ],
  },

  /** Mainframe digital rain: glyphs and bits falling in straight lines, flickering. */
  'weather.digital': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: [...F.glyphs, 'bit'],
        rate: 26,
        angle: 90,
        speed: [160, 320],
        life: [3500, 5500],
        size: [0.5, 0.8],
        alpha: [0.25, 0.5],
        color: ['@core', '@accent', '@accent'],
        fade: 'flicker',
      },
      {
        channel: 'sky',
        frames: 'streak',
        rate: 8,
        angle: 90,
        speed: [500, 800],
        life: [1400, 2000],
        size: [0.4, 0.6],
        stretch: 0.002,
        thin: 0.4,
        alpha: [0.2, 0.35],
        color: '@accent',
        fade: 'none',
      },
    ],
  },

  /** Embers rising from below and drifting across the field. */
  'weather.embers': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'sky',
        frames: 'ember',
        rate: 18,
        angle: [-110, -70],
        speed: [40, 110],
        forces: [drift],
        life: [5000, 8000],
        size: [0.35, 0.65],
        color: ['@core', '@hot', '@warm', '@cool'],
        fade: 'flicker',
      },
      {
        channel: 'sky',
        frames: 'glow',
        rate: 1.5,
        angle: [-100, -80],
        speed: [20, 50],
        forces: [drift],
        life: [5000, 8000],
        size: [0.1, 0.18],
        alpha: 0.5,
        color: '@warm',
        fade: 'inOut',
        minTier: 'medium',
      },
    ],
  },

  /** Carnival: slow confetti drifting down from above. */
  'weather.confetti': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: F.confetti,
        rate: 14,
        angle: [80, 100],
        speed: [40, 80],
        forces: [flutterAir],
        life: [7000, 10000],
        size: [0.55, 0.8],
        rotate: [0, 360],
        spin: [-300, 300],
        flutter: 1.6,
        alpha: [0.5, 0.8],
        pick: ['@party'],
        fade: 'inOut',
      },
    ],
  },
};
