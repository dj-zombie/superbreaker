import { F } from '../atlas';
import { Heat } from '../processors';
import type { FxDef } from '../types';
import { swirl } from './shared';

/** The Overseer's materials: the machine's cyan, Vesper's warm light, and the day outside. */
const DATA = [0xe8ffff, 0x7af4ff, 0x3ce7ff] as const;
const WARM = [0xfff6d8, 0xffd27a, 0xffb050] as const;
const DAYLIGHT = [0xffffff, 0xfff2d8, 0xffe2b0] as const;

/** Warm light drifts up as it fades. */
const rise = new Heat(50);

/**
 * The Overseer. The machine is cold cyan, crushed into bits and glyphs; what it cannot count is
 * warm. Caught light and the death keep to the warm side, so the player reads what helps.
 */
export const OVERSEER_FX: Record<string, FxDef> = {
  /** Vesper's light falling: warm motes shed behind it, rising as they fade. Attach. */
  'overseer.slag_trail': {
    ribbon: {
      width: 12,
      life: 240,
      color: 0xffd27a,
      tail: 0xffb050,
      alpha: 0.5,
      minTier: 'medium',
    },
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 20,
        zone: { circle: 8 },
        speed: [10, 40],
        forces: [rise, swirl],
        life: [450, 800],
        size: [0.25, 0.45],
        color: WARM,
        fade: 'flicker',
      },
    ],
  },

  /** Missed light hits the floor: a cold ring of bits scattering, and a fizzle of gold. */
  'overseer.splash': {
    layers: [
      {
        channel: 'glow',
        frames: F.glyphs,
        count: 12,
        angle: [-160, -20],
        speed: [120, 280],
        gravity: 700,
        spin: [-360, 360],
        life: [450, 750],
        size: [0.3, 0.5],
        color: DATA,
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'dot',
        count: 8,
        angle: [-130, -50],
        speed: [30, 90],
        forces: [rise, swirl],
        life: [500, 900],
        size: [0.25, 0.4],
        color: WARM,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'ring', from: 18, to: 84, life: 420, ease: 'out', alpha: 0.6, color: 0x3ce7ff },
      { frame: 'glow', from: 36, to: 64, life: 260, fade: 'quick', alpha: 0.5, color: 0xffc060 },
    ],
    light: { color: 0xffc060, radius: 70, life: 240, intensity: 0.6 },
  },

  /** A data packet falling: crushed glyphs flaking off it. Attach. */
  'overseer.packet_trail': {
    layers: [
      {
        channel: 'glow',
        frames: F.glyphs,
        rate: 14,
        zone: { circle: 5 },
        angle: [-100, -80],
        speed: [10, 30],
        life: [220, 420],
        size: [0.2, 0.32],
        color: DATA,
        fade: 'quick',
      },
      {
        channel: 'glow',
        frames: 'glow',
        rate: 8,
        follow: true,
        life: [140, 220],
        size: [0.4, 0.55],
        color: 0x3ce7ff,
        alpha: 0.45,
        fade: 'quick',
      },
    ],
  },

  /** The machine rewrites itself: a burst of cyan glyphs from the eye, and a ring of light. */
  'overseer.recompile': {
    layers: [
      {
        channel: 'glow',
        frames: F.glyphs,
        count: 26,
        zone: { circle: 40 },
        radial: true,
        speed: [60, 200],
        drag: 1.5,
        spin: [-240, 240],
        life: [600, 1100],
        size: [0.3, 0.55],
        color: DATA,
        fade: 'flicker',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'ring', from: 40, to: 180, life: 600, ease: 'out', alpha: 0.6, color: 0x3ce7ff },
    ],
    light: { color: 0x3ce7ff, radius: 160, life: 500, intensity: 0.8 },
  },

  /** Steel and glass breaking: the ring cracks open, or the eye. Cold shards and a shock ring. */
  'overseer.crack': {
    distort: { radius: 130, life: 380, push: 10 },
    layers: [
      {
        channel: 'debris',
        frames: F.shards,
        count: 18,
        zone: { circle: 14 },
        radial: true,
        speed: [200, 480],
        gravity: 700,
        spin: [-1000, 1000],
        rotate: [0, 360],
        life: [700, 1200],
        size: [0.3, 0.6],
        color: [0xd8f4ff, 0x7af4ff, 0x40505a],
        fade: 'late',
        bounce: 0.25,
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'streak',
        count: 20,
        speed: [280, 640],
        drag: 3,
        life: [200, 420],
        size: [0.34, 0.56],
        stretch: 0.0035,
        thin: 0.75,
        color: DATA,
      },
    ],
    sprites: [
      { frame: 'core', from: 30, to: 150, life: 220, fade: 'quick', color: 0xe8ffff },
      { frame: 'shock', from: 16, to: 200, life: 440, ease: 'expo', alpha: 0.8, color: 0x3ce7ff },
    ],
    light: { color: 0x3ce7ff, radius: 190, life: 400, intensity: 1.1 },
  },

  /** A Mirror comes apart: its cyan flakes away as glyphs and what is left is warm light, rising. */
  'overseer.dissolve': {
    layers: [
      {
        channel: 'glow',
        frames: F.glyphs,
        count: 20,
        zone: { rect: [110, 24] },
        speed: [20, 80],
        angle: [-150, -30],
        drag: 0.8,
        spin: [-200, 200],
        life: [500, 900],
        size: [0.25, 0.45],
        color: DATA,
        fade: 'quick',
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 24,
        delay: [150, 900],
        zone: { rect: [110, 24] },
        speed: [30, 90],
        angle: [-120, -60],
        forces: [rise, swirl],
        drag: 0.4,
        life: [1300, 2200],
        size: [0.3, 0.6],
        color: WARM,
        fade: 'flicker',
        essential: true,
      },
    ],
    sprites: [
      { frame: 'glow', from: 60, to: 150, life: 900, fade: 'inOut', alpha: 0.5, color: 0xffd27a },
    ],
  },

  /** Daylight through the open door: pale motes drifting in on the light, slow. */
  'overseer.daylight': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 30,
        delay: [0, 1600],
        zone: { rect: [160, 220] },
        speed: [8, 30],
        forces: [swirl],
        drag: 0.6,
        life: [1800, 3000],
        size: [0.2, 0.4],
        color: DAYLIGHT,
        fade: 'inOut',
      },
    ],
    sprites: [
      { frame: 'glow', from: 80, to: 240, life: 2400, fade: 'inOut', alpha: 0.4, color: 0xfff2d8 },
    ],
  },
};
