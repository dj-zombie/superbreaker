import { F } from '../atlas';
import type { FxDef } from '../types';
import { ACID, SPARKS, emberLift, lazySwirl, swirl } from './shared';

/** The level elements of docs/bricks/design.md. `tint` is the element's color; `w`/`h` its size. */
export const LEVEL_FX: Record<string, FxDef> = {
  /** The first fuse catches: a sputter of sparks and a puff of smoke. */
  'brick.fuse_lit': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 10,
        zone: 'box',
        angle: [200, 340],
        speed: [120, 300],
        drag: 3,
        gravity: 500,
        life: [180, 360],
        size: [0.24, 0.4],
        stretch: 0.004,
        thin: 0.7,
        color: SPARKS,
        essential: true,
      },
      {
        channel: 'smoke',
        frames: F.smoke,
        count: 2,
        zone: 'box',
        speed: [10, 30],
        forces: [swirl],
        life: [500, 800],
        size: [0.1, 0.16],
        grow: 2,
        alpha: [0.2, 0.3],
        fade: 'inOut',
        color: '@soot',
        minTier: 'medium',
      },
    ],
    sprites: [
      { frame: 'glow', from: 20, to: 60, life: 200, fade: 'quick', alpha: 0.8, color: '@tint' },
    ],
  },

  /** The flame reaches the next brick on the cord: a quick spit of embers. */
  'brick.fuse_step': {
    layers: [
      {
        channel: 'glow',
        frames: 'ember',
        count: 5,
        zone: 'box',
        angle: [230, 310],
        speed: [40, 120],
        forces: [emberLift],
        life: [300, 600],
        size: [0.3, 0.5],
        color: ['@core', '@tint'],
        fade: 'flicker',
        essential: true,
      },
    ],
    sprites: [{ frame: 'core', from: 10, to: 34, life: 140, fade: 'quick', color: '@tint' }],
  },

  /** A phantom turns solid: a cold ring closes on it. */
  'brick.phantom': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 6,
        zone: 'box',
        speed: [6, 20],
        forces: [lazySwirl],
        life: [300, 520],
        size: [0.3, 0.55],
        color: ['@core', '@tint'],
        alpha: 0.7,
        fade: 'inOut',
      },
    ],
    sprites: [
      { frame: 'ring', from: 50, to: 26, life: 220, ease: 'in', alpha: 0.5, color: '@tint' },
    ],
  },

  /** A switch flips: a rune flash, a ring and sparks in the channel's color. */
  'brick.switch': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 12,
        zone: 'box',
        speed: [160, 360],
        drag: 4,
        life: [180, 320],
        size: [0.24, 0.38],
        stretch: 0.004,
        thin: 0.7,
        color: ['@core', '@tint'],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 4,
        zone: 'box',
        speed: [10, 30],
        life: [300, 500],
        size: [0.3, 0.5],
        color: '@core',
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'glow', from: 30, to: 90, life: 220, fade: 'quick', alpha: 0.9, color: '@tint' },
      { frame: 'ring', from: 16, to: 90, life: 320, alpha: 0.8, color: '@tint' },
      {
        frame: 'star4',
        from: 20,
        to: 70,
        life: 200,
        fade: 'quick',
        color: '@core',
        rotate: [0, 90],
      },
    ],
  },

  /** A gate opens or shuts: motes run along its bars. */
  'brick.gate': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 8,
        zone: 'box',
        speed: [10, 40],
        angle: [-100, -80],
        life: [260, 460],
        size: [0.35, 0.6],
        color: ['@core', '@tint'],
        fade: 'inOut',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'glow', from: 24, to: 52, life: 180, fade: 'quick', alpha: 0.6, color: '@tint' },
    ],
  },

  /** A ball goes in or comes out: an imploding ring and a flare. */
  'brick.portal': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 14,
        zone: { ring: 30 },
        radial: true,
        speed: [-160, -110],
        life: [180, 240],
        size: [0.5, 0.9],
        color: ['@core', '@tint'],
        fade: 'in',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'ring', from: 64, to: 10, life: 220, ease: 'in', alpha: 0.9, color: '@tint' },
      { frame: 'glow', from: 20, to: 70, life: 200, fade: 'quick', alpha: 0.9, color: '@tint' },
      { frame: 'flare', from: 40, to: 120, life: 200, fade: 'quick', alpha: 0.5, color: '@tint' },
    ],
  },

  /** Idle on a portal: motes drawn into its middle. Attach to the portal. */
  'brick.portal_idle': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 7,
        zone: { ring: 24 },
        radial: true,
        speed: [-50, -36],
        follow: true,
        life: [420, 560],
        size: [0.3, 0.55],
        color: ['@core', '@tint'],
        fade: 'in',
      },
    ],
  },

  /** Idle on a virus core: spores rise and drift. Attach to the core. */
  'brick.virus_idle': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 4,
        zone: 'box',
        angle: [-110, -70],
        speed: [8, 24],
        forces: [lazySwirl],
        follow: true,
        life: [700, 1200],
        size: [0.35, 0.65],
        color: ACID,
        fade: 'inOut',
      },
    ],
  },

  /** A brick about to turn: green veins crawl over it. Attach while it incubates. */
  'brick.virus_veins': {
    layers: [
      {
        channel: 'glow',
        frames: [...F.arc],
        anim: { frames: [...F.arc], fps: 18 },
        rate: 10,
        zone: 'box',
        follow: true,
        life: [120, 220],
        size: [0.18, 0.3],
        rotate: [0, 360],
        color: ACID,
        alpha: 0.85,
        fade: 'flicker',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'dot',
        rate: 12,
        zone: 'box',
        follow: true,
        speed: [4, 14],
        life: [200, 400],
        size: [0.3, 0.5],
        color: ACID,
        fade: 'flicker',
      },
    ],
  },

  /** A brick turns: a sick pop and a green ring. */
  'brick.virus_turn': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 10,
        zone: 'box',
        speed: [40, 120],
        drag: 3,
        life: [300, 500],
        size: [0.4, 0.7],
        color: ACID,
        fade: 'late',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'glow', from: 26, to: 64, life: 220, fade: 'quick', alpha: 0.8, color: '@tint' },
      { frame: 'ring', from: 12, to: 56, life: 260, alpha: 0.7, color: '@tint' },
    ],
  },

  /** The last of a colony breaks: a clean burst of light, sparkles and glyphs. */
  'brick.purge': {
    layers: [
      {
        channel: 'glow',
        frames: 'streak',
        count: 22,
        speed: [240, 560],
        drag: 3,
        life: [260, 480],
        size: [0.3, 0.5],
        stretch: 0.004,
        thin: 0.7,
        color: ['@core', '@tint', 0xffffff],
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 14,
        zone: { circle: 30 },
        speed: [30, 120],
        drag: 2,
        life: [500, 900],
        size: [0.3, 0.6],
        rotate: [0, 45],
        color: ['@core', '@tint'],
        fade: 'flicker',
      },
      {
        channel: 'glow',
        frames: [...F.glyphs],
        count: 8,
        only: ['mainframe'],
        zone: { circle: 24 },
        speed: [40, 120],
        drag: 2,
        gravity: -40,
        life: [500, 900],
        size: [0.6, 1],
        color: ['@core', '@tint'],
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'core', from: 20, to: 120, life: 240, fade: 'quick', color: '@core' },
      { frame: 'shock', from: 12, to: 180, life: 420, ease: 'expo', alpha: 0.8, color: '@tint' },
      {
        frame: 'star4',
        from: 40,
        to: 160,
        life: 300,
        fade: 'quick',
        alpha: 0.9,
        color: '@tint',
        rotate: [0, 90],
      },
    ],
    shake: [120, 0.004],
  },
};
