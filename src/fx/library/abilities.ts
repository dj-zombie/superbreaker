import { F } from '../atlas';
import type { FxDef } from '../types';

/**
 * Ability visuals. `tint` is the ability's color from ABILITY_INFO.
 *
 * The black hole is attached with its pull passed in, so the field can move. Give the vortex a
 * horizon of about 22 so particles die at the edge of the black core:
 *   const pull = new Vortex(x, y, 400, 320, 200, 22);
 *   fx.attach('ability.blackhole', pos, { tint, forces: [pull] })
 */
export const ABILITY_FX: Record<string, FxDef> = {
  'ability.blackhole': {
    layers: [
      // Accretion disk: streaks spawn on a ring and spiral in until the horizon swallows them.
      {
        channel: 'glow',
        frames: 'streak',
        rate: 170,
        zone: { ring: 105 },
        speed: [20, 50],
        useForces: true,
        drag: 1.1,
        life: [1300, 2000],
        size: [0.3, 0.5],
        stretch: 0.0026,
        thin: 0.6,
        color: ['@tint', '@tint', '@core'],
        fade: 'in',
      },
      {
        channel: 'glow',
        frames: 'dot',
        rate: 60,
        zone: { ring: 150 },
        useForces: true,
        drag: 1.1,
        life: [1300, 2100],
        size: [0.6, 1],
        color: ['@accent', '@core'],
        fade: 'in',
      },
      // A halo of swirling plasma around the core.
      {
        channel: 'glow',
        frames: F.wisp,
        rate: 8,
        zone: { circle: 4 },
        follow: true,
        life: [700, 1100],
        size: [0.75, 1],
        grow: 1.3,
        rotate: [0, 360],
        spin: [160, 240],
        color: ['@tint', '@core'],
        alpha: 0.6,
        fade: 'inOut',
      },
      {
        channel: 'glow',
        frames: 'ringThick',
        rate: 6,
        follow: true,
        life: [500, 700],
        size: 0.5,
        grow: 1.15,
        color: '@tint',
        alpha: 0.75,
        fade: 'inOut',
      },
      // The horizon: soft black discs drawn over the glow, so the core reads as a hole.
      {
        channel: 'front',
        frames: 'glow',
        rate: 16,
        follow: true,
        life: 400,
        size: [0.78, 0.84],
        color: 0x000000,
        alpha: 1,
        fade: 'inOut',
      },
    ],
    sprites: [
      { frame: 'shock', from: 320, to: 30, life: 460, ease: 'in', alpha: 0.75, color: '@tint' },
      { frame: 'core', from: 40, to: 130, life: 260, fade: 'quick', color: '@core' },
      { frame: 'flare', from: 120, to: 300, life: 360, fade: 'quick', alpha: 0.6, color: '@tint' },
    ],
    light: { color: '@tint', radius: 160, life: 400, intensity: 1.1 },
  },
};
