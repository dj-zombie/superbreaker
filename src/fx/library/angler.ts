import { F } from '../atlas';
import { Heat } from '../processors';
import type { FxDef } from '../types';
import { swirl } from './shared';

/** The Lantern Angler's materials: the lantern's warm gold, the throat's green, its ink, and cold glass. */
const LANTERN = [0xfff6d8, 0xffd27a, 0xffb050] as const;
const SOUL = [0xffffff, 0xfff0c0, 0xffd890] as const;
const THROAT = [0xe8fff0, 0x7affc0, 0x3aff9a] as const;
const INK = [0xc8a0ff, 0x8a4ad8, 0x3a1a5a] as const;
const GLASS = [0xffffff, 0xd8f4ff, 0x9ad8ff] as const;
const LAKE = [0xd8ecff, 0x8ab0d0, 0x3a5a78] as const;

/** Souls drift up and sway. */
const rise = new Heat(60);

/**
 * The Lantern Angler. Warm light helps and cold light lies, so every effect keeps to one side:
 * wisps and souls are gold and soft; ink, glass and the lake are cold.
 */
export const ANGLER_FX: Record<string, FxDef> = {
  /** A warm wisp drifting down: soft gold motes shed behind it, rising as they fade. Attach. */
  'angler.wisp_trail': {
    ribbon: { width: 12, life: 260, color: 0xffd27a, tail: 0xffb050, alpha: 0.55, minTier: 'medium' },
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 22,
        zone: { circle: 8 },
        speed: [10, 40],
        forces: [rise, swirl],
        life: [500, 900],
        size: [0.25, 0.45],
        color: LANTERN,
        fade: 'flicker',
      },
      {
        channel: 'glow',
        frames: 'glow',
        rate: 10,
        follow: true,
        life: [180, 260],
        size: [0.5, 0.7],
        color: 0xffc060,
        alpha: 0.45,
        fade: 'quick',
      },
    ],
  },

  /** A missed wisp falls into the black water: a cold ring, a few drops and a fizzle of gold. */
  'angler.splash': {
    layers: [
      {
        channel: 'glow',
        frames: 'drop',
        count: 14,
        angle: [-160, -20],
        speed: [140, 320],
        gravity: 900,
        life: [500, 800],
        size: [0.4, 0.6],
        stretch: 0.003,
        thin: 1.6,
        color: LAKE,
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
        life: [600, 1000],
        size: [0.25, 0.4],
        color: LANTERN,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'ring', from: 20, to: 90, life: 500, ease: 'out', alpha: 0.6, color: 0x8ab0d0 },
      { frame: 'ring', delay: 120, from: 14, to: 60, life: 420, ease: 'out', alpha: 0.4, color: 0x8ab0d0 },
      { frame: 'glow', from: 40, to: 70, life: 280, fade: 'quick', alpha: 0.5, color: 0xffc060 },
    ],
    light: { color: 0xffc060, radius: 70, life: 260, intensity: 0.6 },
  },

  /** Ink dripping off a falling drop: thick violet beads that sink. Attach. */
  'angler.ink_trail': {
    layers: [
      {
        channel: 'glow',
        frames: 'drop',
        rate: 18,
        zone: { circle: 5 },
        angle: [80, 100],
        speed: [10, 40],
        gravity: 300,
        life: [300, 600],
        size: [0.3, 0.5],
        stretch: 0.003,
        thin: 1.6,
        color: INK,
        fade: 'late',
      },
      {
        channel: 'glow',
        frames: 'glow',
        rate: 8,
        follow: true,
        life: [160, 240],
        size: [0.45, 0.6],
        color: 0x8a4ad8,
        alpha: 0.5,
        fade: 'quick',
      },
    ],
  },

  /** A pod bursts: green glass and the fluid it held spray out, and its soul's light swells. */
  'angler.pod_burst': {
    distort: { radius: 110, life: 340, push: 9 },
    layers: [
      {
        channel: 'debris',
        frames: F.shards,
        count: 16,
        zone: { circle: 16 },
        radial: true,
        speed: [180, 420],
        gravity: 900,
        spin: [-900, 900],
        rotate: [0, 360],
        life: [700, 1100],
        size: [0.34, 0.7],
        color: [0x7affc0, 0x3a8a6a, 0xd8fff0],
        fade: 'late',
        bounce: 0.25,
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'drop',
        count: 22,
        zone: { circle: 12 },
        radial: true,
        speed: [120, 360],
        gravity: 800,
        life: [500, 900],
        size: [0.4, 0.65],
        stretch: 0.003,
        thin: 1.6,
        color: THROAT,
        fade: 'late',
      },
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 14,
        delay: [80, 260],
        zone: { circle: 24 },
        speed: [20, 70],
        forces: [rise, swirl],
        life: [900, 1500],
        size: [0.3, 0.55],
        color: SOUL,
        fade: 'flicker',
      },
    ],
    sprites: [
      { frame: 'core', from: 20, to: 110, life: 220, fade: 'quick', color: 0xe8fff0 },
      { frame: 'shock', from: 10, to: 150, life: 380, ease: 'expo', alpha: 0.7, color: 0x7affc0 },
    ],
    light: { color: 0x7affc0, radius: 160, life: 420, intensity: 1.1 },
    shake: [180, 0.008],
    hitStop: 30,
  },

  /** Souls set free: warm motes streaming up, swaying, from where they were held. */
  'angler.souls': {
    layers: [
      {
        channel: 'glow',
        frames: 'twinkle',
        count: 26,
        delay: [0, 700],
        zone: { circle: 22 },
        speed: [30, 90],
        angle: [-120, -60],
        forces: [rise, swirl],
        drag: 0.4,
        life: [1400, 2400],
        size: [0.3, 0.6],
        color: SOUL,
        fade: 'flicker',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'glow',
        count: 6,
        delay: [0, 500],
        zone: { circle: 16 },
        speed: [20, 50],
        angle: [-110, -70],
        forces: [rise],
        life: [1600, 2400],
        size: [0.6, 0.9],
        color: 0xffd890,
        alpha: 0.5,
        fade: 'inOut',
      },
    ],
    sprites: [{ frame: 'glow', from: 60, to: 140, life: 900, fade: 'inOut', alpha: 0.5, color: 0xfff0c0 }],
  },

  /** The lantern shatters: cold glass bursts out and the light inside snaps out with a ring. */
  'angler.shatter': {
    distort: { radius: 140, life: 400, push: 12 },
    layers: [
      {
        channel: 'debris',
        frames: F.shards,
        count: 20,
        zone: { circle: 10 },
        radial: true,
        speed: [220, 520],
        gravity: 700,
        spin: [-1100, 1100],
        rotate: [0, 360],
        life: [800, 1300],
        size: [0.3, 0.6],
        color: GLASS,
        fade: 'late',
        essential: true,
      },
      {
        channel: 'glow',
        frames: 'streak',
        count: 24,
        speed: [300, 700],
        drag: 3,
        life: [220, 460],
        size: [0.34, 0.56],
        stretch: 0.0035,
        thin: 0.75,
        color: GLASS,
      },
    ],
    sprites: [
      { frame: 'core', from: 30, to: 160, life: 240, fade: 'quick', color: 0xd8f4ff },
      { frame: 'shock', from: 16, to: 220, life: 460, ease: 'expo', alpha: 0.85, color: 0x9ad8ff },
    ],
    light: { color: 0x9ad8ff, radius: 200, life: 420, intensity: 1.2 },
  },

  /** Spores shed by a pod as it slides out of the dark: green motes drifting slow. */
  'angler.spores': {
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        count: 18,
        zone: { circle: 30 },
        speed: [10, 50],
        forces: [swirl],
        drag: 0.6,
        life: [1200, 2200],
        size: [0.2, 0.4],
        color: THROAT,
        fade: 'flicker',
      },
    ],
  },
};
