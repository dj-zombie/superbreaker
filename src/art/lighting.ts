import type { LevelLightingSpec, Mood } from '../core/Lighting';
import { LIGHTS_OUT_DEFAULTS, scaleColor } from '../core/Lighting';
import type { WorldId } from './backdrops';

export type WorldMood = Exclude<Mood, 'world'>;

/** How a world is lit. Colors are brightness per channel, where 0xffffff leaves art as painted. */
export interface LightingLook {
  /** Backdrop brightness with no lights nearby. Carries the world's color grade. */
  ambient: number;
  /** How far one light at full intensity brightens the backdrop over the ambient. */
  backdropStrength: number;
  /** Bricks and paddle with no lights nearby: this color times `brickFloor`. */
  brickTint: number;
  brickFloor: number;
  /** How much a light brightens bricks; 1 takes a floor of 0 to full brightness. */
  brickGain: number;
  /** Darkening toward the corners, 0..1. */
  vignette: number;
  /** Brick shadow offset on the backdrop, in playfield units, and its darkness. */
  shadow: { dx: number; dy: number; alpha: number };
  ball: { normal: number; fireball: number; pierce: number; radius: number; intensity: number };
  mood: WorldMood;
  /** Big slow key light that sets the scene, as fractions of the view width and height. */
  key?: { x: number; y: number; radius: number; color: number; intensity: number; sweep: number };
  /** Lights out: the ball becomes a lantern and only lights reveal the bricks. */
  lightsOut: boolean;
  /** Lights out, 0..1: how little of the level shows away from lights. Unset on normal levels. */
  darkness?: number;
  /** Lights out: seconds the layout shows before the lights go. */
  preview?: number;
  /** Average seconds between lightning strikes, when the level asks for them. */
  lightning?: number;
}

export const LIGHTING_LOOKS: Record<WorldId, LightingLook> = {
  hell: {
    ambient: 0xb49a92,
    backdropStrength: 0.75,
    brickTint: 0xfff0e6,
    brickFloor: 0.8,
    brickGain: 0.45,
    vignette: 0.45,
    shadow: { dx: 4, dy: 9, alpha: 0.55 },
    ball: { normal: 0xffd2a0, fireball: 0xff7a1f, pierce: 0xd6ff3c, radius: 130, intensity: 1 },
    mood: 'forge',
    key: { x: 0.5, y: 1.08, radius: 1.05, color: 0xff6a24, intensity: 0.25, sweep: 0.22 },
    lightsOut: false,
  },
  crypt: {
    ambient: 0xa4a6c2,
    backdropStrength: 0.8,
    brickTint: 0xeef0ff,
    brickFloor: 0.78,
    brickGain: 0.5,
    vignette: 0.55,
    shadow: { dx: -3, dy: 10, alpha: 0.6 },
    ball: { normal: 0xc8d8ff, fireball: 0xff8a3c, pierce: 0xd6ff3c, radius: 130, intensity: 1 },
    mood: 'storm',
    key: { x: 0.5, y: -0.08, radius: 0.95, color: 0x8c9cff, intensity: 0.2, sweep: 0.1 },
    lightsOut: false,
  },
  mainframe: {
    ambient: 0xa2b4c0,
    backdropStrength: 0.75,
    brickTint: 0xe8f8ff,
    brickFloor: 0.82,
    brickGain: 0.45,
    vignette: 0.4,
    shadow: { dx: 0, dy: 8, alpha: 0.5 },
    ball: { normal: 0x9af0ff, fireball: 0xff9a3c, pierce: 0xd6ff3c, radius: 125, intensity: 1 },
    mood: 'beat',
    key: { x: 0.5, y: 1.08, radius: 1, color: 0x1ab8ff, intensity: 0.22, sweep: 0.3 },
    lightsOut: false,
  },
};

/** The world look with a level's Tiled overrides applied. */
export function resolveLook(world: WorldId, spec?: LevelLightingSpec): LightingLook {
  const base = LIGHTING_LOOKS[world];
  const look: LightingLook = { ...base, ball: { ...base.ball }, shadow: { ...base.shadow } };
  if (!spec) return look;
  if (spec.lightsOut) {
    const d = spec.darkness ?? LIGHTS_OUT_DEFAULTS.darkness;
    const byDarkness = (light: number, dark: number) => light + (dark - light) * d;
    look.lightsOut = true;
    look.darkness = d;
    look.preview = spec.previewTime ?? LIGHTS_OUT_DEFAULTS.previewTime;
    look.ambient = scaleColor(base.ambient, byDarkness(0.6, 0.04));
    // Lights must climb well past the painted art to read as pools in the dark.
    look.backdropStrength = base.backdropStrength * 1.5;
    look.brickFloor = byDarkness(0.35, 0);
    look.brickGain = 1.25;
    // The ambient already does the darkening; a strong vignette would only smother the lantern.
    look.vignette = base.vignette * 0.6;
    // A darker room also gets a smaller lantern, so less of the layout shows at once.
    look.ball.radius = spec.lanternRadius ?? base.ball.radius * byDarkness(1.8, 1.2);
    look.ball.intensity = base.ball.intensity * 1.4;
    look.shadow.alpha = base.shadow.alpha * 0.6;
  }
  if (spec.lightning) look.lightning = spec.lightningInterval;
  if (spec.ambient !== undefined) look.ambient = spec.ambient;
  if (spec.backdropStrength !== undefined) look.backdropStrength = spec.backdropStrength;
  if (spec.brickFloor !== undefined) look.brickFloor = spec.brickFloor;
  if (spec.vignette !== undefined) look.vignette = spec.vignette;
  if (spec.mood !== 'world') look.mood = spec.mood;
  return look;
}
