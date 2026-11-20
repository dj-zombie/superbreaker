import Phaser from 'phaser';
import { PADDLE_Y } from '../config';
import type { RailGun } from '../core/RailGun';
import type { Paddle } from '../entities/Paddle';
import { calm, css, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import { type JackLook, JackRig } from './JackRig';
import type { JuiceSystem } from './JuiceSystem';
import type { LightingSystem } from './LightingSystem';
import { particleDensity } from './Quality';

/** The beam and its spray draw over the targets and under the words. */
const BEAM_DEPTH = 7;
/** The white-hot core thins out over this long, and the glow around it lingers this long, in ms. */
const CORE_MS = 130;
const GLOW_MS = 320;
/** The glow is this many times the core's width, and swells by this much as it fades. */
const GLOW_WIDTH = 4.5;
const GLOW_SWELL = 1.7;
/** The paddle kicks down this far, in px, and is back in this long, in ms. */
const RECOIL_PX = 12;
const RECOIL_MS = 190;
/** A kill holds the world this long, in ms; a multi-kill longer. */
const HIT_STOP_MS = 45;
const MULTI_STOP_MS = 85;
/** Lights strung up the beam for its flash. */
const BEAM_LIGHTS = 4;
/** The capacitor's lamps along the paddle. */
const COILS = 5;
/** Helix sparks up the beam: one every this many px. */
const HELIX_STEP = 26;
/** The bullet-hell spray: pellets out of the muzzle, and how fast and far they fly. */
const PELLET_POOL = 180;
const PELLET_SPEED = 640;
const PELLET_MS = 720;
const PELLET_KEY = 'rail_pellet';
const BEAM_KEY = 'rail_beam';
const SHADOW_KEY = 'rail_shadow';
/** A look's gun draws just over the paddle's place, under the targets. */
const GUN_DEPTH = 0.6;
/** Callouts sit this far over the clown's mouth, in px: clear of his hair. */
const CALLOUT_OVER_MOUTH = 70;

/** A gun drawn in place of the paddle. */
export type RailLook = JackLook;

/** What one slug did, for its look. */
export interface RailShotFx {
  x: number;
  overcharged: boolean;
  halfWidth: number;
  /** Targets it popped. */
  popped: number;
  /** Where the highest of them was, for the spray's second burst. */
  topY?: number;
  /** The combo's multiplier as it went: the spray grows with it. */
  multiplier: number;
}

/**
 * How wild the harmless spray of one slug is at a combo multiplier: the fan's pellets, its spread
 * in degrees, and the ring thrown off the highest kill. It is all look; none of it hits anything.
 */
export function sprayFor(multiplier: number): { fan: number; spread: number; ring: number } {
  if (multiplier >= 3) return { fan: 17, spread: 120, ring: 14 };
  if (multiplier >= 2) return { fan: 13, spread: 90, ring: 8 };
  if (multiplier >= 1.5) return { fan: 9, spread: 70, ring: 0 };
  return { fan: 5, spread: 46, ring: 0 };
}

/** A soft column: white down the middle, nothing at the edges. Stretched to the beam's height. */
function beamTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(BEAM_KEY)) return BEAM_KEY;
  const w = 64;
  const tex = scene.textures.createCanvas(BEAM_KEY, w, 4);
  if (!tex) return BEAM_KEY;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 4);
  tex.refresh();
  return BEAM_KEY;
}

/** A pellet: a hot white core in a soft halo, tinted by the image. */
function pelletTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(PELLET_KEY)) return PELLET_KEY;
  const s = 24;
  const tex = scene.textures.createCanvas(PELLET_KEY, s, s);
  if (!tex) return PELLET_KEY;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
  return PELLET_KEY;
}

/** A soft dark oval, for the gun's shadow on the floor. */
function shadowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(SHADOW_KEY)) return SHADOW_KEY;
  const w = 128;
  const h = 32;
  const tex = scene.textures.createCanvas(SHADOW_KEY, w, h);
  if (!tex) return SHADOW_KEY;
  const ctx = tex.getContext();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  tex.refresh();
  return SHADOW_KEY;
}

/** A rail gun's look and sound. It holds no rules: the director says what happened. */
export class RailGunFx {
  private readonly coils: Phaser.GameObjects.Image[] = [];
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly pellets: Phaser.GameObjects.Image[] = [];
  private readonly rig?: JackRig;
  private recoil?: Phaser.Tweens.Tween;
  private clock = 0;
  private stowed = false;

  constructor(
    private scene: Phaser.Scene,
    private juice: JuiceSystem,
    private lighting: LightingSystem,
    private paddle: Paddle,
    private look?: RailLook,
  ) {
    beamTexture(scene);
    pelletTexture(scene);
    if (look && Object.values(look.keys).every((key) => scene.textures.exists(key))) {
      this.rig = new JackRig(scene, look, GUN_DEPTH, shadowTexture(scene));
      paddle.setVisible(false);
      // Every frame, frozen or not: the paddle still moves under the tally.
      scene.events.on(Phaser.Scenes.Events.UPDATE, this.follow, this);
      this.follow(0, 0);
    }
    for (let i = 0; i < COILS; i++) {
      this.coils.push(
        scene.add
          .image(0, 0, PELLET_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(BEAM_DEPTH)
          .setScale(0.6),
      );
    }
    this.sparks = scene.add
      .particles(0, 0, 'spark', {
        lifespan: { min: 260, max: 520 },
        speedX: { min: -150, max: 150 },
        speedY: { min: -60, max: 60 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
        maxAliveParticles: 260,
      })
      .setDepth(BEAM_DEPTH);
  }

  /** Every update of play, with the gun as it stands: the capacitor's lamps fill along the gun. */
  update(rail: RailGun, dtMs: number): void {
    if (this.stowed) return;
    this.clock += dtMs;
    this.rig?.update(rail, dtMs);
    const p = theme().palette;
    const { paddle } = this;
    const span = paddle.halfWidth * 1.5;
    const spots = this.rig?.lamps(COILS);
    const lit = rail.charge * COILS;
    const sweet = rail.inSweetSpot;
    const ready = rail.ready;
    // A soft breath while it waits full, so a ready gun reads as one.
    const breath = ready && !calm() ? 0.85 + 0.15 * Math.sin(this.clock / 90) : 1;
    this.coils.forEach((c, i) => {
      const at = spots?.[i] ?? { x: paddle.x + (i / (COILS - 1) - 0.5) * span, y: paddle.y - 11 };
      const on = ready || i < lit;
      c.setPosition(at.x, at.y)
        .setTint(sweet ? 0xffffff : rail.jammed ? 0x8a8a8a : ready ? p.accentHi : p.accent)
        .setAlpha(on ? breath : 0.18)
        .setScale(sweet ? 0.95 : on ? 0.62 : 0.45);
    });
  }

  /** Where a callout goes: over the clown's head when there is one, so it does not cover him. */
  private get calloutY(): number {
    return this.rig ? this.rig.muzzle().y - CALLOUT_OVER_MOUTH : this.paddle.y - 65;
  }

  /** Keeps the gun on the paddle, kicked down with it. */
  private follow(_time: number, _delta: number): void {
    if (!this.rig || !this.look) return;
    const { paddle } = this;
    this.rig.place(paddle.x, paddle.y + this.look.drop, paddle.displayWidth * this.look.width);
  }

  fire(shot: RailShotFx): void {
    const { scene, paddle, juice } = this;
    const p = theme().palette;
    const over = shot.overcharged;
    // Out of the clown's mouth, when there is a clown; off the paddle's top, when there is not.
    const bottom = this.rig?.muzzle().y ?? paddle.y - 14;
    const top = 0;
    const height = bottom - top;
    const coreTint = over ? 0xfff4c8 : 0xffffff;
    const glowTint = over ? 0xffc040 : p.accentHi;

    const glow = scene.add
      .image(shot.x, top + height / 2, BEAM_KEY)
      .setDisplaySize(shot.halfWidth * 2 * GLOW_WIDTH, height)
      .setTint(glowTint)
      .setAlpha(over ? 0.9 : 0.7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BEAM_DEPTH);
    const core = scene.add
      .image(shot.x, top + height / 2, BEAM_KEY)
      .setDisplaySize(shot.halfWidth * 2 * 1.4, height)
      .setTint(coreTint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BEAM_DEPTH + 0.01);
    scene.tweens.add({
      targets: core,
      scaleX: core.scaleX * 0.08,
      duration: CORE_MS,
      ease: 'Cubic.In',
      onComplete: () => core.destroy(),
    });
    scene.tweens.add({
      targets: glow,
      scaleX: glow.scaleX * GLOW_SWELL,
      alpha: 0,
      duration: GLOW_MS,
      ease: 'Cubic.Out',
      onComplete: () => glow.destroy(),
    });
    const muzzle = scene.add
      .image(shot.x, bottom, PELLET_KEY)
      .setTint(glowTint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BEAM_DEPTH + 0.02)
      .setScale(over ? 5 : 3.6);
    scene.tweens.add({
      targets: muzzle,
      scale: muzzle.scale * 0.3,
      alpha: 0,
      duration: 140,
      ease: 'Quad.Out',
      onComplete: () => muzzle.destroy(),
    });

    // The room lights up along the beam.
    for (let i = 0; i < BEAM_LIGHTS; i++) {
      const y = bottom - (height * (i + 0.5)) / BEAM_LIGHTS;
      this.lighting.flash(shot.x, y, glowTint, over ? 230 : 180, 200, over ? 1.6 : 1.2, 1.3);
    }

    this.kick(over);
    this.rig?.fire();
    juice.ring(shot.x, bottom, glowTint, over ? 110 : 70, 280);
    if (over) juice.ring(shot.x, bottom, 0xffffff, 160, 420);
    juice.punch(over ? 200 : 150, over ? 0.011 : 0.0075);
    if (shot.popped > 0) juice.hitStop(shot.popped > 1 ? MULTI_STOP_MS : HIT_STOP_MS);

    this.helix(shot.x, bottom, top, shot.halfWidth, glowTint);
    this.spray(shot, bottom);

    audio.sfx('rail_fire', over ? 0.75 : 0.65, over ? -150 : 0, { x: shot.x });
    if (over) {
      audio.sfx('rail_perfect', 0.5, 0, { x: shot.x });
      juice.popText(shot.x, this.calloutY, 'PERFECT', css(0xffd27a), 18, 1.2);
    }
    audio.sfx('rail_charge', 0.28, 0, { x: shot.x });
  }

  jam(): void {
    const { paddle, juice } = this;
    this.rig?.jam();
    juice.sparkle(paddle.x, paddle.y - 14, 0x8a8a8a, 10);
    juice.shake(90, 0.004);
    juice.popText(paddle.x, this.calloutY, 'JAM!', '#9a9a9a', 16);
    audio.sfx('rail_jam', 0.55, 0, { x: paddle.x });
  }

  /** The timer is out: the lamps go dark and the gun shuts. */
  stow(): void {
    this.stowed = true;
    for (const c of this.coils) c.setVisible(false);
    this.rig?.stow();
  }

  destroy(): void {
    this.recoil?.stop();
    this.paddle.y = PADDLE_Y;
    if (this.rig) {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.follow, this);
      this.rig.destroy();
      this.paddle.setVisible(true);
    }
    for (const c of this.coils) c.destroy();
    this.coils.length = 0;
    for (const pel of this.pellets) {
      this.scene.tweens.killTweensOf(pel);
      pel.destroy();
    }
    this.pellets.length = 0;
    this.sparks.destroy();
  }

  /** The paddle kicks down under the shot and springs back. */
  private kick(over: boolean): void {
    if (calm()) return;
    this.recoil?.stop();
    this.paddle.y = PADDLE_Y + RECOIL_PX * (over ? 1.4 : 1);
    this.recoil = this.scene.tweens.add({
      targets: this.paddle,
      y: PADDLE_Y,
      duration: RECOIL_MS,
      ease: 'Back.Out',
    });
  }

  /** Sparks wound round the beam on its way up. */
  private helix(x: number, bottom: number, top: number, halfWidth: number, tint: number): void {
    const density = particleDensity();
    if (density <= 0) return;
    this.sparks.setParticleTint(tint);
    const step = HELIX_STEP / Math.max(0.35, density);
    const phase = Math.random() * Math.PI * 2;
    for (let y = bottom; y > top; y -= step) {
      const k = (bottom - y) * 0.045 + phase;
      this.sparks.emitParticleAt(x + Math.sin(k) * halfWidth * 1.8, y, 1);
    }
  }

  /**
   * The bullet-hell spray: a fan of pellets out of the muzzle, wider and thicker as the combo
   * climbs, and a ring off the highest kill at the top multipliers. None of it hits anything.
   */
  private spray(shot: RailShotFx, bottom: number): void {
    if (calm()) return;
    const density = particleDensity();
    const { fan, spread, ring } = sprayFor(shot.multiplier);
    const colors = this.sprayColors(shot.overcharged);
    const n = Math.max(3, Math.round(fan * density));
    for (let i = 0; i < n; i++) {
      const a = -90 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      this.pellet(
        shot.x,
        bottom - 8,
        a,
        PELLET_SPEED * (0.85 + 0.3 * Math.random()),
        colors[i % colors.length]!,
      );
    }
    if (ring > 0 && shot.topY !== undefined) {
      const m = Math.max(4, Math.round(ring * density));
      const turn = Math.random() * 360;
      for (let i = 0; i < m; i++) {
        this.pellet(
          shot.x,
          shot.topY,
          turn + (360 * i) / m,
          PELLET_SPEED * 0.55,
          colors[(i + 1) % colors.length]!,
        );
      }
    }
  }

  private sprayColors(over: boolean): number[] {
    const p = theme().palette;
    return over ? [0xfff4c8, 0xffc040, 0xffffff] : [p.accentHi, 0xffb040, 0x40ffd0, 0xff5a6e];
  }

  private pellet(x: number, y: number, angleDeg: number, speed: number, tint: number): void {
    const pel = this.takePellet();
    if (!pel) return;
    const a = Phaser.Math.DegToRad(angleDeg);
    const dist = (speed * PELLET_MS) / 1000;
    pel.setPosition(x, y).setTint(tint).setAlpha(1).setScale(0.55).setVisible(true);
    this.scene.tweens.add({
      targets: pel,
      x: x + Math.cos(a) * dist,
      y: y + Math.sin(a) * dist,
      alpha: 0,
      scale: 0.25,
      duration: PELLET_MS,
      ease: 'Quad.Out',
      onComplete: () => pel.setVisible(false),
    });
  }

  private takePellet(): Phaser.GameObjects.Image | undefined {
    const free = this.pellets.find((p) => !p.visible);
    if (free) return free;
    if (this.pellets.length >= PELLET_POOL) return undefined;
    const pel = this.scene.add
      .image(0, 0, PELLET_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BEAM_DEPTH - 0.01)
      .setVisible(false);
    this.pellets.push(pel);
    return pel;
  }
}
