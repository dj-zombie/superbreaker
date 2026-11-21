import type { FxDef } from '../types';

/** Camera-lens effects: flares, anamorphic streaks, flashes and speed lines. */
export const SCREEN_FX: Record<string, FxDef> = {
  /** A lens flare off a bright source: a star, a horizontal streak and ghosts along the axis. */
  'screen.flare': {
    sprites: [
      { frame: 'star4', from: 60, to: 140, life: 520, fade: 'inOut', color: '@core', rotate: 45, spin: [10, 20] },
      { frame: 'flare', from: 200, to: 420, life: 560, fade: 'inOut', alpha: 0.8, color: '@tint' },
      { frame: 'glow', from: 60, to: 110, life: 520, fade: 'inOut', alpha: 0.7, color: '@tint' },
      { frame: 'ghost', dx: 70, dy: 40, from: 34, to: 44, life: 520, fade: 'inOut', alpha: 0.5, color: '@tint' },
      { frame: 'bokeh', dx: 130, dy: 74, from: 20, to: 26, life: 520, fade: 'inOut', alpha: 0.45, color: '@accent' },
      { frame: 'ghost', dx: 200, dy: 114, from: 60, to: 76, life: 520, fade: 'inOut', alpha: 0.3, color: '@accent2' },
      { frame: 'bokeh', dx: -60, dy: -34, from: 16, to: 20, life: 520, fade: 'inOut', alpha: 0.4, color: '@tint' },
    ],
  },

  /** Anamorphic bars: long horizontal streaks through a bright moment. */
  'screen.anamorphic': {
    sprites: [
      { frame: 'flare', from: 500, to: 1100, life: 520, fade: 'quick', alpha: 0.85, color: '@tint' },
      { frame: 'flare', dy: -6, from: 400, to: 900, life: 440, fade: 'quick', alpha: 0.4, color: '@accent' },
      { frame: 'band', from: 900, to: 1200, life: 360, aspect: 0.03, fade: 'quick', alpha: 0.5, color: '@tint' },
      { frame: 'core', from: 40, to: 120, life: 300, fade: 'quick', color: '@core' },
    ],
  },

  /** A full-screen flash. Play at the screen's center. */
  'screen.flash': {
    sprites: [{ frame: 'glow', from: 1400, to: 1600, life: 260, fade: 'quick', alpha: 0.55, color: '@core', depth: 25 }],
  },

  /** Speed lines rushing out from the center: a dash, hyperspeed. Play at the screen's center. */
  'screen.speedlines': {
    layers: [
      {
        channel: 'top',
        frames: 'streak',
        count: 56,
        zone: { ring: 120 },
        radial: true,
        speed: [700, 1200],
        life: [260, 420],
        size: [0.55, 0.85],
        stretch: 0.0022,
        thin: 0.4,
        alpha: [0.4, 0.7],
        color: ['@core', '@tint'],
        fade: 'inOut',
        essential: true,
      },
    ],
  },
};
