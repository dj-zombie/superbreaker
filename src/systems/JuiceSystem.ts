import Phaser from 'phaser';
import { POP_FONT } from '../art/fonts';
import { save } from '../services';
import { audio } from './AudioSystem';

/** Shake intensity is a fraction of the view size; these keep it subtle. */
const SHAKE_SCALE = 0.4;
const SHAKE_MIN = 0.0008;
const SHAKE_MAX = 0.0055;
const SHAKE_MAX_MS = 260;
/** Shards per frame across every burst. A 30-brick chain would otherwise spawn 500 at once. */
const BURST_BUDGET = 72;

/** Screen shake, hit-stop, particles and pop-up text. Respects the reduced-motion setting. */
export class JuiceSystem {
  private shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private stopDepth = 0;
  private budget = BURST_BUDGET;
  private budgetFrame = -1;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private rings: Phaser.GameObjects.Image[] = [];
  private colors = new Map<string, number>();
  /** Lower particle counts for battery saver and slow devices. */
  particleScale = 1;
  /** Something else has the world stopped, so a hit-stop ending must not start it. */
  holdWorld: () => boolean = () => false;

  constructor(private scene: Phaser.Scene) {
    this.shards = scene.add.particles(0, 0, 'shard', {
      lifespan: { min: 450, max: 800 },
      speed: { min: 90, max: 280 },
      angle: { min: 0, max: 360 },
      gravityY: 700,
      rotate: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 },
      emitting: false,
      maxAliveParticles: 260,
    });
    this.sparks = scene.add.particles(0, 0, 'spark', {
      lifespan: { min: 200, max: 420 },
      speed: { min: 60, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxAliveParticles: 220,
    });
    this.shards.setDepth(8);
    this.sparks.setDepth(9);
  }

  private get calm(): boolean {
    return save.state.settings.reducedMotion;
  }

  /** Takes up to `count` from this frame's particle budget. */
  private spend(count: number): number {
    const frame = this.scene.game.loop.frame;
    if (frame !== this.budgetFrame) {
      this.budgetFrame = frame;
      this.budget = BURST_BUDGET * this.particleScale;
    }
    const n = Math.min(Math.round(count * this.particleScale), Math.floor(this.budget));
    this.budget -= Math.max(0, n);
    return n;
  }

  /**
   * Requests are scaled down and capped, and a weaker shake never interrupts a stronger one,
   * so overlapping impacts (chains, plowing fireballs) don't stack into a violent wobble.
   */
  shake(durationMs: number, intensity: number): void {
    if (this.calm || !save.state.settings.screenShake) return;
    const strength = Math.min(intensity * SHAKE_SCALE, SHAKE_MAX);
    if (strength < SHAKE_MIN) return;
    const cam = this.scene.cameras.main;
    const fx = cam.shakeEffect;
    if (fx.isRunning && fx.intensity.x >= strength) return;
    cam.shake(Math.min(durationMs * 0.7, SHAKE_MAX_MS), strength, true);
  }

  flash(durationMs = 120, r = 255, g = 255, b = 255): void {
    if (this.calm) return;
    this.scene.cameras.main.flash(durationMs, r, g, b);
  }

  /** Freezes physics for a few frames to sell big impacts. */
  hitStop(ms: number): void {
    if (this.calm) return;
    audio.dip(ms);
    const world = this.scene.physics.world;
    this.stopDepth++;
    world.pause();
    this.scene.time.delayedCall(ms, () => {
      this.stopDepth--;
      if (this.stopDepth === 0 && !this.scene.scene.isPaused() && !this.holdWorld()) world.resume();
    });
  }

  get inHitStop(): boolean {
    return this.stopDepth > 0;
  }

  burst(x: number, y: number, tint: number, count = 12): void {
    const n = this.spend(count);
    if (n <= 0) return;
    this.shards.setParticleTint(tint);
    this.shards.explode(n, x, y);
    this.sparks.setParticleTint(0xffffff);
    this.sparks.explode(Math.ceil(n / 2), x, y);
  }

  sparkle(x: number, y: number, tint: number, count = 6): void {
    const n = this.spend(count);
    if (n <= 0) return;
    this.sparks.setParticleTint(tint);
    this.sparks.explode(n, x, y);
  }

  ring(x: number, y: number, tint: number, radius: number): void {
    const ring =
      this.rings.pop() ??
      this.scene.add.image(0, 0, 'ring').setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    ring.setPosition(x, y).setTint(tint).setScale(0.1).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      scale: (radius * 2) / ring.width,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.Out',
      onComplete: () => {
        ring.setVisible(false);
        this.rings.push(ring);
      },
    });
  }

  /** Floating callout; `punch` above 1 overshoots harder, for escalating combos. */
  popText(x: number, y: number, text: string, color = '#ffffff', size = 18, punch = 1): void {
    const t =
      this.texts.pop() ??
      this.scene.add.bitmapText(0, 0, POP_FONT, '', size).setOrigin(0.5).setDepth(20);
    t.setText(text)
      .setFontSize(size)
      .setTint(this.color(color))
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.5)
      .setVisible(true);
    if (punch > 1) t.setScale(punch * 1.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160 + (punch - 1) * 200, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      delay: 260,
      duration: 650,
      ease: 'Cubic.In',
      onComplete: () => {
        t.setVisible(false);
        this.texts.push(t);
      },
    });
  }

  private color(css: string): number {
    let c = this.colors.get(css);
    if (c === undefined) {
      c = Phaser.Display.Color.HexStringToColor(css).color;
      this.colors.set(css, c);
    }
    return c;
  }
}
