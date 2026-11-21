import type { FxDef } from '../types';
import { SPARKS } from './shared';

/** Hits. Aimed presets spray around `opts.angle`, the surface normal or the shot's direction. */
export const IMPACT_FX: Record<string, FxDef> = {
  /** Hot streak sparks off metal, with a star glint. */
  'spark.impact': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 14,
        aim: true,
        angle: [-55, 55],
        speed: [220, 640],
        drag: 4,
        gravity: 520,
        life: [180, 400],
        size: [0.3, 0.56],
        stretch: 0.004,
        thin: 0.7,
        color: SPARKS,
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'dot',
        count: 6,
        aim: true,
        angle: [-80, 80],
        speed: [60, 220],
        gravity: 340,
        life: [300, 520],
        size: [0.6, 1],
        color: ['@core', '@warm'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'star4', from: 10, to: 50, life: 150, fade: 'quick', color: '@core', rotate: [0, 90] },
      { frame: 'glow', from: 12, to: 44, life: 130, fade: 'quick', alpha: 0.8, color: '@spark' },
    ],
    light: { color: '@spark', radius: 50, life: 130 },
  },
};
