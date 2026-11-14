import type Phaser from 'phaser';
import { richFx } from '../theme';

/**
 * Filters an overlay puts on the scenes underneath it, removed when the overlay shuts down.
 * Low tier gets nothing; the overlay's own shade does the dimming there.
 */
export class BehindFx {
  private removers: Array<() => void> = [];

  constructor(private host: Phaser.Scene) {
    host.events.once('shutdown', () => this.clear());
  }

  /** Blurs each scene's main camera. */
  blur(scenes: Array<Phaser.Scene | undefined>, strength = 1): this {
    if (!richFx()) return this;
    for (const s of scenes) {
      if (!s?.sys.isActive() && !s?.sys.isPaused()) continue;
      const cam = s.cameras.main;
      const fx = cam.filters.external.addBlur(0, 2, 2, 0);
      this.host.tweens.add({ targets: fx, strength, duration: 280 });
      this.removers.push(() => cam.filters.external.remove(fx));
    }
    return this;
  }

  /** Drains the colour out of each scene, for game over. */
  desaturate(scenes: Array<Phaser.Scene | undefined>, amount = 0.85): this {
    if (!richFx()) return this;
    for (const s of scenes) {
      if (!s?.sys.isActive() && !s?.sys.isPaused()) continue;
      const cam = s.cameras.main;
      const fx = cam.filters.external.addColorMatrix();
      const state = { v: 0 };
      this.host.tweens.add({
        targets: state,
        v: amount,
        duration: 700,
        onUpdate: () => fx.colorMatrix.reset().saturate(-state.v),
      });
      this.removers.push(() => cam.filters.external.remove(fx));
    }
    return this;
  }

  /**
   * A coloured vignette closing in on each scene. Only for opaque scenes: the filter paints
   * the colour over transparent pixels too, so on a HUD it would cover the whole screen.
   */
  vignette(scenes: Array<Phaser.Scene | undefined>, color: number, strength = 0.22, radius = 0.8): this {
    if (!richFx()) return this;
    for (const s of scenes) {
      if (!s?.sys.isActive() && !s?.sys.isPaused()) continue;
      const cam = s.cameras.main;
      const fx = cam.filters.external.addVignette(0.5, 0.5, 1, 0, color);
      this.host.tweens.add({ targets: fx, strength, radius, duration: 700, ease: 'Sine.Out' });
      this.removers.push(() => cam.filters.external.remove(fx));
    }
    return this;
  }

  clear(): void {
    for (const r of this.removers) r();
    this.removers = [];
  }
}
