import { F } from '../atlas';
import { Turbulence } from '../processors';
import type { FxDef } from '../types';
import { drift, emberLift, lazySwirl } from './shared';

const wispCurl = new Turbulence(50, 0.9);

/**
 * Fever, in the world's own colors. FeverSystem starts the fields when Fever begins and stops
 * them when it ends; the rates are per second across the whole field.
 */
export const FEVER_FX: Record<string, FxDef> = {
  /** The room's heat rising off the floor: one layer per world. Give it a band along the bottom. */
  'fever.updraft': {
    layers: [
      {
        channel: 'glow',
        frames: 'ember',
        rate: 28,
        angle: [-105, -75],
        speed: [90, 220],
        forces: [drift],
        life: [2000, 3600],
        size: [0.3, 0.6],
        color: ['@core', '@hot', '@warm'],
        fade: 'flicker',
        only: ['hell', 'crucible'],
      },
      {
        channel: 'glow',
        frames: F.wisp,
        rate: 5,
        angle: [-100, -80],
        speed: [50, 110],
        forces: [wispCurl],
        life: [2500, 4000],
        size: [0.5, 0.9],
        grow: 1.4,
        rotate: [0, 360],
        spin: [-30, 30],
        alpha: [0.25, 0.45],
        color: ['@accent', '@arcane'],
        fade: 'inOut',
        only: ['crypt'],
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        rate: 14,
        angle: [-100, -80],
        speed: [60, 140],
        forces: [lazySwirl],
        life: [1800, 3000],
        size: [0.3, 0.5],
        color: ['@spark', '@accent2'],
        fade: 'flicker',
        only: ['crypt'],
      },
      {
        channel: 'glow',
        frames: [...F.glyphs, 'bit'],
        rate: 22,
        angle: -90,
        speed: [140, 300],
        life: [1800, 3000],
        size: [0.45, 0.75],
        alpha: [0.35, 0.7],
        color: ['@core', '@accent', '@accent2'],
        fade: 'flicker',
        only: ['mainframe', 'kernel'],
      },
      {
        channel: 'glow',
        frames: ['bokeh', 'dot'],
        rate: 18,
        angle: [-100, -80],
        speed: [60, 150],
        forces: [drift],
        life: [2000, 3500],
        size: [0.25, 0.55],
        alpha: [0.3, 0.6],
        color: ['@accent', '@spark', '@accent2'],
        fade: 'inOut',
        only: ['abyss'],
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        rate: 20,
        angle: [-105, -75],
        speed: [80, 180],
        forces: [drift],
        life: [1800, 3000],
        size: [0.3, 0.55],
        pick: ['@party'],
        fade: 'flicker',
        only: ['carnival'],
      },
    ],
  },

  /** Speed lines racing up a wall: the floor dropping away. Give it a narrow band under each wall. */
  'fever.rush': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        rate: 10,
        angle: -90,
        speed: [900, 1300],
        life: [500, 800],
        size: [0.5, 0.9],
        stretch: 0.0022,
        thin: 0.4,
        alpha: [0.15, 0.35],
        color: ['@core', '@accent'],
        fade: 'none',
        minTier: 'medium',
      },
    ],
  },

  /** On the paddle: heat shimmer above it (High tier) and sparks lifting off its top. */
  'fever.heat': {
    haze: { w: 150, h: 110, push: 4, dy: -50 },
    layers: [
      {
        channel: 'glow',
        frames: 'ember',
        rate: 14,
        zone: { rect: [90, 6] },
        angle: [-110, -70],
        speed: [60, 140],
        forces: [drift],
        life: [500, 900],
        size: [0.25, 0.45],
        color: ['@core', '@hot', '@warm'],
        fade: 'flicker',
      },
    ],
  },

  /** A brick breaking while Fever runs: a few hot sparks on top of its shatter. */
  'fever.break': {
    layers: [
      {
        channel: 'glow',
        frames: ['ember', 'dot'],
        count: [6, 10],
        zone: { circle: 8 },
        radial: true,
        speed: [120, 320],
        drag: 3,
        forces: [emberLift],
        life: [250, 500],
        size: [0.3, 0.5],
        color: ['@core', '@hot', '@spark'],
        fade: 'quick',
      },
    ],
    sprites: [{ frame: 'ring', from: 10, to: 54, life: 220, ease: 'expo', alpha: 0.5, color: '@hot', minTier: 'medium' }],
  },

  /** Fever burning out at the paddle: a puff of steam, falling sparks and a fading ring. */
  'fever.end': {
    layers: [
      {
        channel: 'smoke',
        frames: F.smoke,
        count: 6,
        zone: { rect: [120, 10] },
        angle: [-110, -70],
        speed: [20, 60],
        life: [700, 1100],
        size: [0.6, 1],
        grow: 1.6,
        mirror: true,
        alpha: [0.15, 0.3],
        color: '@steam',
        fade: 'inOut',
      },
      {
        channel: 'glow',
        frames: 'ember',
        count: 10,
        zone: { rect: [100, 6] },
        angle: [-150, -30],
        speed: [40, 120],
        gravity: 260,
        life: [400, 800],
        size: [0.25, 0.4],
        color: ['@hot', '@warm', '@cool'],
        fade: 'flicker',
      },
    ],
    sprites: [{ frame: 'ring', from: 40, to: 200, life: 420, ease: 'expo', alpha: 0.4, color: '@accent' }],
  },
};
