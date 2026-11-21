import { F } from '../atlas';
import { Turbulence, Wind } from '../processors';
import type { FxDef } from '../types';
import { drift, flutterAir, lazySwirl } from './shared';

const cloudDrift = new Wind(14, 6, 9);
const slowCurl = new Turbulence(12, 0.35);
const wispCurl = new Turbulence(36, 0.9);

/**
 * Fields for cutscenes and quiet moments: cloud, fog, light and drifting dust. Start one with
 * `fx.weather(id, bounds, { depth })`, so it can sit behind the backdrop's layers, between them
 * or in front of the whole picture. Rates are per second across the field, sized for the stage.
 */
export const AMBIENT_FX: Record<string, FxDef> = {
  /** Heaped cumulus crossing slowly, for a sky or the far side of a gulf. */
  'ambient.clouds': {
    spawn: 'fill',
    layers: [
      {
        channel: 'smoke',
        frames: F.cloud,
        rate: 0.7,
        angle: [-3, 3],
        speed: [6, 16],
        forces: [cloudDrift],
        life: [16000, 22000],
        size: [2.4, 3.6],
        grow: 1.15,
        mirror: true,
        alpha: [0.35, 0.6],
        color: ['@steam', '@soot'],
        fade: 'inOut',
        parallax: 0.85,
        essential: true,
      },
    ],
  },

  /** A low wall of cloud that churns in place: a floor to stand on, or a bank to hide behind. */
  'ambient.cloudbank': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'smoke',
        frames: F.cloud,
        rate: 2.2,
        angle: [-100, -80],
        speed: [6, 18],
        forces: [slowCurl],
        life: [9000, 13000],
        size: [3, 4.4],
        grow: 1.25,
        mirror: true,
        alpha: [0.45, 0.7],
        color: ['@steam', '@soot'],
        fade: 'inOut',
        essential: true,
      },
    ],
  },

  /** Cloud rushing up past the lens: the fall between two worlds. */
  'ambient.through': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'front',
        frames: F.cloud,
        rate: 9,
        angle: [-94, -86],
        speed: [700, 1000],
        life: [1300, 1800],
        size: [3.4, 5.2],
        mirror: true,
        alpha: [0.6, 0.9],
        color: ['@steam', '@soot'],
        fade: 'inOut',
        parallax: 1.3,
        essential: true,
      },
      {
        channel: 'top',
        frames: 'streak',
        rate: 26,
        angle: -90,
        speed: [900, 1400],
        life: [500, 800],
        size: [0.6, 1],
        stretch: 0.002,
        thin: 0.5,
        alpha: [0.2, 0.4],
        color: '@steam',
        fade: 'none',
        minTier: 'medium',
      },
    ],
  },

  /** Ground fog, wider and slower than the crypt's mist. */
  'ambient.fog': {
    spawn: 'fill',
    layers: [
      {
        channel: 'smoke',
        frames: F.smoke,
        rate: 3,
        angle: [-4, 4],
        speed: [6, 14],
        forces: [lazySwirl],
        life: [9000, 13000],
        size: [2.2, 3.2],
        grow: 1.35,
        rotate: [0, 360],
        spin: [-5, 5],
        mirror: true,
        alpha: [0.1, 0.18],
        color: ['@steam', '@arcane'],
        fade: 'inOut',
        essential: true,
      },
    ],
  },

  /** Shafts of light leaning in from above, slowly breathing. */
  'ambient.godrays': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: 'beam',
        rate: 0.9,
        speed: 0,
        zone: { line: 1 },
        life: [5000, 7000],
        size: [3.2, 4.6],
        rotate: [12, 20],
        alpha: [0.12, 0.22],
        color: ['@core', '@warm'],
        fade: 'inOut',
        parallax: 0.9,
        essential: true,
      },
    ],
  },

  /** Motes hanging in a light: slow, lit, barely moving. */
  'ambient.dust': {
    spawn: 'fill',
    layers: [
      {
        channel: 'glow',
        frames: 'dot',
        rate: 14,
        speed: [2, 8],
        forces: [drift],
        life: [5000, 8000],
        size: [0.25, 0.55],
        alpha: [0.3, 0.6],
        color: ['@core', '@warm'],
        fade: 'inOut',
      },
    ],
  },

  /** Soft snow, near and far. */
  'ambient.snow': {
    spawn: 'top',
    layers: [
      {
        channel: 'sky',
        frames: 'dot',
        rate: 30,
        angle: [82, 98],
        speed: [30, 60],
        forces: [flutterAir],
        life: [7000, 10000],
        size: [0.35, 0.6],
        alpha: [0.4, 0.7],
        color: 0xffffff,
        fade: 'inOut',
        parallax: 0.8,
      },
      {
        channel: 'front',
        frames: 'flake',
        rate: 4,
        angle: [80, 100],
        speed: [70, 120],
        forces: [flutterAir],
        life: [4000, 6000],
        size: [0.4, 0.7],
        rotate: [0, 360],
        spin: [-60, 60],
        alpha: [0.6, 0.9],
        color: 0xffffff,
        fade: 'inOut',
        parallax: 1.2,
        minTier: 'medium',
      },
    ],
  },

  /** Pale spirits curling upward: the crypt's dead, stirring. */
  'ambient.wisps': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'glow',
        frames: F.wisp,
        rate: 2.5,
        angle: [-100, -80],
        speed: [18, 40],
        forces: [wispCurl],
        life: [6000, 9000],
        size: [0.7, 1.2],
        grow: 1.4,
        rotate: [0, 360],
        spin: [-30, 30],
        alpha: [0.25, 0.45],
        color: ['@arcane', '@steam'],
        fade: 'inOut',
      },
    ],
  },

  /** Sparks lifting off something burning below the frame. */
  'ambient.sparks': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'glow',
        frames: 'ember',
        rate: 16,
        angle: [-115, -65],
        speed: [60, 160],
        forces: [drift],
        life: [2500, 4500],
        size: [0.3, 0.6],
        color: ['@core', '@hot', '@warm', '@cool'],
        fade: 'flicker',
      },
    ],
  },

  /** Grit and chips falling from a ceiling that has been hit. */
  'ambient.debris': {
    spawn: 'top',
    layers: [
      {
        channel: 'debris',
        frames: [...F.chunks, 'bit'],
        rate: 10,
        angle: [86, 94],
        speed: [40, 120],
        gravity: 380,
        life: [1500, 2400],
        size: [0.25, 0.55],
        rotate: [0, 360],
        spin: [-240, 240],
        alpha: [0.7, 1],
        color: ['@soot', '@steam'],
        fade: 'late',
      },
      {
        channel: 'smoke',
        frames: F.smoke,
        rate: 1.5,
        angle: [80, 100],
        speed: [10, 30],
        life: [3000, 4500],
        size: [1, 1.6],
        grow: 1.6,
        mirror: true,
        alpha: [0.12, 0.2],
        color: '@soot',
        fade: 'inOut',
        minTier: 'medium',
      },
    ],
  },

  /** Streaks racing past: speed, a charge, a long way down. */
  'ambient.speedlines': {
    spawn: 'bottom',
    layers: [
      {
        channel: 'top',
        frames: 'streak',
        rate: 40,
        angle: -90,
        speed: [1100, 1600],
        life: [400, 700],
        size: [0.7, 1.2],
        stretch: 0.0025,
        thin: 0.4,
        alpha: [0.25, 0.5],
        color: ['@core', '@steam'],
        fade: 'none',
        parallax: 1.2,
        essential: true,
      },
    ],
  },
};
