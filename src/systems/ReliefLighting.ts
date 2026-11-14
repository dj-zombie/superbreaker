import type Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import type { Light } from './LightingSystem';

/** Phaser compiles its light shader for this many lights; `render.maxLights` in main.ts. */
export const RELIEF_MAX_LIGHTS = 8;

/**
 * Phaser lights a sprite as `tinted texture × (ambient + Σ light × N·L)`, and the corner tints
 * already carry each brick's brightness. So the ambient and a distant fill light are balanced
 * to sum to 1 on a flat face: flat areas keep the tint's brightness, bevels facing the fill
 * brighten and the ones facing away darken. Moving key lights then add a modest glint.
 */
const AMBIENT = 0.42;
const FILL_ELEVATION = (40 * Math.PI) / 180;
const FILL = (1 - AMBIENT) / Math.sin(FILL_ELEVATION);
/** Far enough that the fill's direction barely changes across the playfield. */
const FILL_DISTANCE = 4000;
const KEY_GAIN = 0.5;
/** Key light height as a fraction of its radius; low lights rake across bevels. */
const KEY_HEIGHT = 0.22;

type Lit = Phaser.GameObjects.Components.Lighting;

/** Per-pixel bevel lighting from the foreground normal maps. High tier only. */
export class ReliefLighting {
  private fill: Phaser.GameObjects.Light;
  private keys: Phaser.GameObjects.Light[] = [];
  private picks: Light[] = [];

  constructor(
    private scene: Phaser.Scene,
    shadow: { dx: number; dy: number },
  ) {
    const grey = Math.round(AMBIENT * 255);
    scene.lights.enable().setAmbientColor((grey << 16) | (grey << 8) | grey);
    // The fill comes from opposite the way brick shadows fall, so both agree.
    const len = Math.hypot(shadow.dx, shadow.dy) || 1;
    const d = FILL_DISTANCE;
    this.fill = scene.lights.addLight(
      WIDTH / 2 - (shadow.dx / len) * d,
      HEIGHT / 2 - (shadow.dy / len) * d,
      d * 50,
      0xffffff,
      FILL,
      d * Math.tan(FILL_ELEVATION),
    );
    for (let i = 0; i < RELIEF_MAX_LIGHTS - 1; i++) {
      this.keys.push(scene.lights.addLight(0, 0, 1, 0xffffff, 0).setVisible(false));
    }
  }

  /** Mirrors the strongest relief lights into Phaser's and keeps the foreground lit. */
  update(lights: readonly Light[], bricks: readonly Lit[], paddle: Lit): void {
    const picks = this.picks;
    picks.length = 0;
    for (const l of lights) if (l.relief && !l.negative && !l.dead && l.level > 0.02) picks.push(l);
    picks.sort((a, b) => b.priority - a.priority || b.level * b.radius - a.level * a.radius);
    for (const [i, key] of this.keys.entries()) {
      const l = picks[i];
      if (!l) {
        key.setVisible(false);
        continue;
      }
      key.setVisible(true);
      key.x = l.x;
      key.y = l.y;
      key
        .setRadius(l.radius)
        .setColor(l.color)
        .setIntensity(l.level * KEY_GAIN)
        .setZ(l.radius * KEY_HEIGHT);
    }
    for (const b of bricks) if (!b.lighting) b.setLighting(true);
    if (!paddle.lighting) paddle.setLighting(true);
  }

  destroy(bricks: readonly Lit[], paddle?: Lit): void {
    for (const b of bricks) b.setLighting(false);
    paddle?.setLighting(false);
    this.scene.lights.removeLight(this.fill);
    for (const key of this.keys) this.scene.lights.removeLight(key);
    this.scene.lights.disable();
  }
}
