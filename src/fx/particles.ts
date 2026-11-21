import Phaser from 'phaser';
import { fadeCurve, rampColor, roll, sizeCurve, type Fade, type SizeEase } from './math';
import type { FxForce } from './processors';
import type { EmitSpec } from './types';

type Frame = Phaser.Textures.Frame;
const DEG = Math.PI / 180;

/** Everything a particle needs from the play that spawned it, resolved once per layer. */
export interface Emission {
  spec: EmitSpec;
  frames: readonly Frame[];
  anim?: readonly Frame[];
  /** Color over life. */
  ramp: readonly number[];
  /** One of these per particle instead of the ramp. */
  pick?: readonly number[];
  x: number;
  y: number;
  scale: number;
  /** Radians, for aimed layers. */
  aim: number;
  w: number;
  h: number;
  floor?: number;
  forces: readonly FxForce[];
  anchor?: { readonly x: number; readonly y: number };
  /** Spawn area for fields: a random point in this box instead of `x`/`y` plus the zone. */
  area?: { x: number; y: number; width: number; height: number };
  /** Prewarm: start at a random age so a field begins full instead of empty. */
  warm?: boolean;
  died?: (x: number, y: number, tint: number) => void;
}

/**
 * Set by the engine around each `emitParticleAt`. Phaser fires the new particles synchronously
 * inside that call, so this is how a pooled emitter's particles learn which preset they are.
 */
export const pending: { current: Emission | null } = { current: null };

/**
 * A particle that runs its own simulation from a spec instead of the emitter's ops: color ramps,
 * flipbooks, drag, forces, velocity stretch, floor bounce and following a target.
 */
export class FxParticle extends Phaser.GameObjects.Particles.Particle {
  private em!: Emission;
  private age = 0;
  private size0 = 1;
  private grow = 1;
  private ease: SizeEase = 'out';
  private fadeMode: Fade = 'linear';
  private peak = 1;
  private spinV = 0;
  private flip = 1;
  private jitter = 0.5;
  private ramp: readonly number[] = [0xffffff];
  private ax = 0;
  private ay = 0;
  private rested = false;

  override fire(): boolean {
    const em = pending.current;
    if (!em) return false;
    this.em = em;
    const s = em.spec;
    const k = em.scale;

    const frame = em.frames.length === 1 ? em.frames[0]! : em.frames[(Math.random() * em.frames.length) | 0]!;
    this.frame = (em.anim?.[0] ?? frame) as Frame;
    this.texture = this.frame.texture;

    let ox = 0;
    let oy = 0;
    if (em.area) {
      this.x = em.area.x + Math.random() * em.area.width;
      this.y = em.area.y + Math.random() * em.area.height;
    } else {
      const z = s.zone;
      if (z === 'box') {
        ox = (Math.random() - 0.5) * em.w;
        oy = (Math.random() - 0.5) * em.h;
      } else if (z && 'circle' in z) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * z.circle * k;
        ox = Math.cos(a) * r;
        oy = Math.sin(a) * r;
      } else if (z && 'ring' in z) {
        const a = Math.random() * Math.PI * 2;
        ox = Math.cos(a) * z.ring * k;
        oy = Math.sin(a) * z.ring * k;
      } else if (z && 'rect' in z) {
        ox = (Math.random() - 0.5) * z.rect[0] * k;
        oy = (Math.random() - 0.5) * z.rect[1] * k;
      } else if (z && 'line' in z) {
        const along = (Math.random() - 0.5) * z.line * k;
        ox = Math.cos(em.aim + Math.PI / 2) * along;
        oy = Math.sin(em.aim + Math.PI / 2) * along;
      }
      this.x = em.x + ox;
      this.y = em.y + oy;
    }

    let ang: number;
    if (s.radial && (ox !== 0 || oy !== 0)) ang = Math.atan2(oy, ox);
    else ang = roll(s.angle, Math.random() * 360) * DEG + (s.aim ? em.aim : 0);
    const spd = roll(s.speed, 0) * k;
    this.velocityX = Math.cos(ang) * spd;
    this.velocityY = Math.sin(ang) * spd;
    this.accelerationX = 0;
    this.accelerationY = 0;

    this.life = Math.max(1, roll(s.life, 500));
    this.age = em.warm ? Math.random() * this.life * 0.9 : 0;
    this.lifeCurrent = this.life - this.age;
    this.lifeT = this.age / this.life;
    this.delayCurrent = em.warm ? 0 : roll(s.delay, 0);
    this.holdCurrent = 0;

    this.size0 = roll(s.size, 1) * k;
    this.grow = s.grow ?? 1;
    this.ease = s.sizeEase ?? 'out';
    this.fadeMode = s.fade ?? 'linear';
    this.peak = roll(s.alpha, 1);
    this.flip = s.mirror && Math.random() < 0.5 ? -1 : 1;
    this.jitter = Math.random();
    this.angle = roll(s.rotate, 0);
    this.rotation = this.angle * DEG;
    this.spinV = roll(s.spin, 0);
    this.rested = false;

    this.ramp = em.pick ? [em.pick[(Math.random() * em.pick.length) | 0]!] : em.ramp;
    this.tint = this.ramp[0] ?? 0xffffff;
    this.scaleX = this.size0 * this.flip;
    this.scaleY = this.size0;
    this.alpha = this.delayCurrent > 0 ? 0 : this.peak * fadeCurve(this.fadeMode, 0, this.jitter);

    if (s.follow && em.anchor) {
      this.ax = em.anchor.x;
      this.ay = em.anchor.y;
    }
    return true;
  }

  override update(delta: number, step: number): boolean {
    if (this.lifeCurrent <= 0) return true;
    if (this.delayCurrent > 0) {
      this.delayCurrent -= delta;
      this.alpha = 0;
      return false;
    }
    const em = this.em;
    const s = em.spec;
    this.age += delta;
    const t = Math.min(1, this.age / this.life);
    this.lifeT = t;

    let vx = this.velocityX;
    let vy = this.velocityY;
    if (!this.rested) {
      vx += (s.gravityX ?? 0) * step;
      vy += (s.gravity ?? 0) * step;
    }
    if (s.drag) {
      const d = Math.exp(-s.drag * step);
      vx *= d;
      vy *= d;
      this.spinV *= d;
    }
    this.velocityX = vx;
    this.velocityY = vy;
    const forces = em.forces;
    for (let i = 0; i < forces.length; i++) {
      const f = forces[i]!;
      if (f.active) f.update(this, delta, step, t);
    }
    if (this.lifeCurrent <= 0) return this.die();
    vx = this.velocityX;
    vy = this.velocityY;
    this.x += vx * step;
    this.y += vy * step;

    if (s.follow && em.anchor) {
      this.x += em.anchor.x - this.ax;
      this.y += em.anchor.y - this.ay;
      this.ax = em.anchor.x;
      this.ay = em.anchor.y;
    }

    if (s.bounce !== undefined && em.floor !== undefined && this.y > em.floor && vy > 0) {
      this.y = em.floor;
      if (vy < 60) {
        this.rested = true;
        this.velocityY = 0;
        this.velocityX *= 0.5;
      } else {
        this.velocityY = -vy * s.bounce;
        this.velocityX *= 0.7;
        this.spinV *= 0.5;
      }
    }

    const base = this.size0 * (1 + (this.grow - 1) * sizeCurve(this.ease, t));
    if (s.stretch) {
      const sp = Math.sqrt(vx * vx + vy * vy);
      this.rotation = Math.atan2(vy, vx);
      this.scaleX = base * (1 + sp * s.stretch);
      this.scaleY = base * (s.thin ?? 1);
    } else {
      if (s.align) this.rotation = Math.atan2(vy, vx);
      else if (this.spinV !== 0) {
        this.angle += this.spinV * step;
        this.rotation = this.angle * DEG;
      }
      this.scaleX = base * this.flip;
      this.scaleY = s.flutter ? base * Math.cos((this.age / 1000) * s.flutter * Math.PI * 2 + this.jitter * 6.3) : base;
    }

    const jitter = this.fadeMode === 'flicker' ? Math.random() : this.jitter;
    this.alpha = this.peak * fadeCurve(this.fadeMode, t, jitter);
    if (this.ramp.length > 1) this.tint = rampColor(this.ramp, t);

    const anim = em.anim;
    if (anim && anim.length > 1) {
      const fps = s.anim?.fps;
      let i: number;
      if (fps) {
        i = Math.floor((this.age / 1000) * fps);
        i = s.anim?.loop ? i % anim.length : Math.min(anim.length - 1, i);
      } else {
        i = Math.min(anim.length - 1, Math.floor(t * anim.length));
      }
      this.frame = anim[i]!;
    }

    this.lifeCurrent = this.life - this.age;
    if (this.lifeCurrent <= 0) return this.die();
    return false;
  }

  private die(): boolean {
    this.lifeCurrent = 0;
    const em = this.em;
    if (em.died && Math.random() < (em.spec.deathChance ?? 1)) em.died(this.x, this.y, this.tint);
    return true;
  }
}
