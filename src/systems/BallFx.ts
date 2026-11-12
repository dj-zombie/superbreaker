import Phaser from 'phaser';
import { FIRE_FRAMES } from '../art/procedural';
import type { Ball } from '../entities/Ball';

const FIRE_EVERY_MS = 10;

/**
 * One trail emitter and one fire emitter shared by every ball. Frenzy and multiball add
 * particles to two batches instead of two new emitters per ball, and the caps bound the worst case.
 */
export class BallFx {
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.trail = scene.add.particles(0, 0, 'spark', {
      lifespan: 260,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.6, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxAliveParticles: 260,
    });
    this.fire = scene.add.particles(0, 0, 'fire', {
      frame: FIRE_FRAMES,
      lifespan: 520,
      speed: { min: 10, max: 50 },
      gravityY: 220,
      rotate: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxAliveParticles: 200,
    });
    this.trail.setDepth(4);
    this.fire.setDepth(4);
  }

  /** `density` below 1 thins both effects for battery saver. */
  update(balls: readonly Ball[], dtMs: number, density = 1): void {
    for (const b of balls) {
      if (!b.active) continue;
      if (b.trailOn) {
        const every = b.trailEvery / density;
        b.trailAcc += dtMs;
        if (b.trailAcc >= every) {
          const n = Math.floor(b.trailAcc / every);
          b.trailAcc -= n * every;
          this.trail.setParticleTint(b.trailTint);
          this.trail.setParticleLifespan(b.trailLife);
          this.trail.emitParticleAt(b.x, b.y, n);
        }
      }
      if (b.fireOn) {
        const every = FIRE_EVERY_MS / density;
        b.fireAcc += dtMs;
        if (b.fireAcc >= every) {
          const n = Math.floor(b.fireAcc / every);
          b.fireAcc -= n * every;
          this.fire.emitParticleAt(b.x, b.y, n);
        }
      }
    }
  }
}
