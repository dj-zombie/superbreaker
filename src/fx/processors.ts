import Phaser from 'phaser';
import { curl } from './math';

type Particle = Phaser.GameObjects.Particles.Particle;

/** Seconds of effect time, advanced by the engine; flow fields animate on it. */
export const fxClock = { t: 0 };

/**
 * Forces are particle processors, so they also work on any stock emitter
 * (`emitter.addParticleProcessor`). The engine's particles apply them per layer.
 */
export abstract class FxForce extends Phaser.GameObjects.Particles.ParticleProcessor {
  abstract override update(p: Particle, delta: number, step: number, t: number): void;
}

const flow = { x: 0, y: 0 };

/** Curl-noise swirl: smoke and embers curl and drift instead of moving in straight lines. */
export class Turbulence extends FxForce {
  constructor(
    public strength = 60,
    /** Larger is a finer, busier field. */
    public scale = 1,
  ) {
    super(0, 0, true);
  }

  update(p: Particle, _d: number, step: number): void {
    curl(p.x * this.scale, p.y * this.scale, fxClock.t, flow);
    p.velocityX += flow.x * this.strength * step;
    p.velocityY += flow.y * this.strength * step;
  }
}

/**
 * Swirl around a point and pull into it. Particles that cross `horizon` die, so a black hole
 * swallows what it pulls in. Move it with `x`/`y`.
 */
export class Vortex extends FxForce {
  constructor(
    x: number,
    y: number,
    public swirl = 220,
    public pull = 260,
    public radius = 220,
    public horizon = 8,
  ) {
    super(x, y, true);
  }

  update(p: Particle, _d: number, step: number): void {
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < this.horizon) {
      p.lifeCurrent = 0;
      return;
    }
    const falloff = Math.max(0, 1 - dist / this.radius);
    const k = 0.35 + falloff * 1.65;
    const nx = dx / dist;
    const ny = dy / dist;
    p.velocityX += (nx * this.pull + -ny * this.swirl) * k * step;
    p.velocityY += (ny * this.pull + nx * this.swirl) * k * step;
  }
}

/** Steers particles to a point (coins to the counter, energy to a charging boss), then kills them. */
export class Attractor extends FxForce {
  constructor(
    x: number,
    y: number,
    public speed = 600,
    /** How hard velocity turns toward the target, per second. */
    public steer = 5,
    public catchRadius = 10,
  ) {
    super(x, y, true);
  }

  update(p: Particle, _d: number, step: number): void {
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < this.catchRadius) {
      p.lifeCurrent = 0;
      return;
    }
    const k = Math.min(1, this.steer * step);
    p.velocityX += ((dx / dist) * this.speed - p.velocityX) * k;
    p.velocityY += ((dy / dist) * this.speed - p.velocityY) * k;
  }
}

/** A steady push with slow gusts: rain slants, ash and snow sway. */
export class Wind extends FxForce {
  constructor(
    public push = 40,
    public gust = 30,
    public period = 4,
  ) {
    super(0, 0, true);
  }

  update(p: Particle, _d: number, step: number): void {
    const g = Math.sin((fxClock.t / this.period) * Math.PI * 2 + p.y * 0.004);
    p.velocityX += (this.push + g * this.gust - p.velocityX) * Math.min(1, 1.5 * step);
  }
}

/** Hot air: lift that fades over life, so flames rise fast and smoke slows as it cools. */
export class Heat extends FxForce {
  constructor(public lift = 160) {
    super(0, 0, true);
  }

  update(p: Particle, _d: number, step: number, t: number): void {
    p.velocityY -= this.lift * (1 - t) * step;
  }
}
