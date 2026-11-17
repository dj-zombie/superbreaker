import Phaser from 'phaser';
import { BOOM_FRAMES, FIRE_FRAMES } from '../art/procedural';
import { ABILITY_INFO, ARENA_MID, HUD_HEIGHT, PADDLE_Y, WIDTH } from '../config';
import { panAt } from '../core/AudioMix';
import {
  ABILITY_IDS,
  FEW_BRICKS,
  abilityStats,
  rollAbility,
  type AbilityId,
  type AbilityStats,
  type RollContext,
} from '../core/Abilities';
import type { Brick } from '../entities/Brick';
import { haptic } from '../platform/haptics';
import { save } from '../services';
import { audio } from './AudioSystem';
import type { Backdrop } from './Backdrop';
import type { BrickSystem } from './BrickSystem';
import type { JuiceSystem } from './JuiceSystem';
import { bombLob } from './bombLob';
import type { Light, LightingSystem } from './LightingSystem';

export const SLOT_COUNT = 2;
const ROULETTE_MS = 1_200;
const BOMB_SPEED = 760;
const BOMB_HIT_R = 16;
const BOMB_SIZE = 40;
/** How far the sprite lifts off its shadow, as a share of the flight. */
const BOMB_LIFT = 0.28;
const BOMB_LIFT_MIN = 36;
const BOMB_LIFT_MAX = 110;
/** Reduced motion keeps the scale read and shortens the hop. */
const BOMB_CALM_LIFT = 0.35;

export interface SlotState {
  /** The ability waiting to be fired, once the roulette has stopped. */
  ability: AbilityId | null;
  /** The icon shown right now; cycles while spinning. */
  display: AbilityId | null;
  spinning: boolean;
}

export interface AbilityHost {
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly backdrop: Backdrop;
  readonly lights?: LightingSystem;
  paddlePos(): { x: number; y: number };
  rollContext(): RollContext;
  spawnFrenzy(count: number): void;
  /** Where chain lightning starts: the lowest free ball, or the paddle. */
  lightningOrigin(): { x: number; y: number };
}

interface Spin {
  final: AbilityId;
  elapsed: number;
  nextTick: number;
  tickIndex: number;
}

interface Meteor {
  img: Phaser.GameObjects.Image;
  fire: Phaser.GameObjects.Particles.ParticleEmitter;
  vx: number;
  vy: number;
  radius: number;
}

interface Bomb {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  fuse?: Phaser.GameObjects.Particles.ParticleEmitter;
  vy: number;
  radius: number;
  /** Launch and predicted landing, in playfield y. The shadow rides this line. */
  y0: number;
  y1: number;
  y: number;
  x: number;
  amp: number;
  baseScale: number;
}

interface Beam {
  gfx: Phaser.GameObjects.Graphics;
  x: number;
  speed: number;
  /** Bricks chosen to die when the beam crosses them; the rest only lose their armor. */
  victims: Set<Brick>;
  crossed: Set<Brick>;
  light?: Light;
  /** The beam's hum, panned along with it until the sound ends. */
  sound?: Phaser.Sound.WebAudioSound;
}

interface Hole {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  remainingMs: number;
  nextPull: number;
  gfx: Phaser.GameObjects.Graphics;
  core: Phaser.GameObjects.Image;
  pit?: Light;
}

/** Two Mario Kart style item slots plus the six big abilities they can fire. */
export class AbilitySystem {
  readonly slots: SlotState[] = Array.from({ length: SLOT_COUNT }, () => ({
    ability: null,
    display: null,
    spinning: false,
  }));
  private spins: Array<Spin | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private meteors: Meteor[] = [];
  private bombs: Bomb[] = [];
  private beams: Beam[] = [];
  private holes: Hole[] = [];

  constructor(
    private scene: Phaser.Scene,
    private host: AbilityHost,
  ) {}

  /** Puts a chosen ability straight into a free slot. Returns the slot index, or -1. */
  grantSpecific(id: AbilityId): number {
    const i = this.freeSlot();
    if (i < 0) return -1;
    this.slots[i] = { ability: id, display: id, spinning: false };
    return i;
  }

  /** Abilities the player is holding, including a roulette that has not stopped yet. */
  held(): AbilityId[] {
    const out: AbilityId[] = [];
    this.slots.forEach((slot, i) => {
      if (slot.ability) out.push(slot.ability);
      else if (this.spins[i]) out.push(this.spins[i]!.final);
    });
    return out;
  }

  /** Puts a rolled ability into the first free slot. Returns false when both are taken. */
  grant(): boolean {
    const i = this.freeSlot();
    if (i < 0) return false;
    const final = rollAbility(this.host.rollContext());
    this.spins[i] = { final, elapsed: 0, nextTick: 0, tickIndex: Math.floor(Math.random() * 6) };
    this.slots[i] = { ability: null, display: ABILITY_IDS[0]!, spinning: true };
    return true;
  }

  get hasFreeSlot(): boolean {
    return this.freeSlot() >= 0;
  }

  private freeSlot(): number {
    return this.slots.findIndex((s, i) => !s.ability && !this.spins[i]);
  }

  /** Fires the ability in a slot. Returns the ability that fired, if any. */
  activate(i: number): AbilityId | null {
    const slot = this.slots[i];
    if (!slot?.ability) return null;
    const id = slot.ability;
    this.slots[i] = { ability: null, display: null, spinning: false };
    const info = ABILITY_INFO[id];
    this.host.juice.popText(
      WIDTH / 2,
      ARENA_MID - 60,
      info.label.toUpperCase() + '!',
      '#ffffff',
      30,
    );
    haptic('heavy');
    this[id]();
    return id;
  }

  update(dtMs: number): void {
    this.updateSpins(dtMs);
    const dt = dtMs / 1000;
    this.updateMeteors(dt);
    this.updateBombs(dt);
    this.updateBeams(dt);
    this.updateHoles(dtMs);
  }

  /** Removes projectiles and effects, e.g. when a life is lost. Slots are kept. */
  clearEffects(): void {
    for (const m of this.meteors) this.removeMeteor(m);
    for (const b of this.bombs) this.removeBomb(b);
    for (const b of this.beams) {
      b.gfx.destroy();
      b.light?.kill();
    }
    for (const h of this.holes) this.removeHole(h);
    this.meteors = [];
    this.bombs = [];
    this.beams = [];
    this.holes = [];
    this.setGloom(false);
    audio.setGravity(false);
  }

  // ---------------------------------------------------------------- roulette

  private updateSpins(dtMs: number): void {
    this.spins.forEach((spin, i) => {
      if (!spin) return;
      spin.elapsed += dtMs;
      if (spin.elapsed >= ROULETTE_MS) {
        this.spins[i] = null;
        this.slots[i] = { ability: spin.final, display: spin.final, spinning: false };
        audio.sfx('roulette_lock', 0.5);
        haptic('medium');
        return;
      }
      if (spin.elapsed < spin.nextTick) return;
      spin.tickIndex++;
      this.slots[i]!.display = ABILITY_IDS[spin.tickIndex % ABILITY_IDS.length]!;
      // Ticks slow down as the roulette winds down.
      const t = spin.elapsed / ROULETTE_MS;
      spin.nextTick = spin.elapsed + 50 + t * t * 180;
      audio.sfx('roulette_tick', 0.3, t * 600);
    });
  }

  // ---------------------------------------------------------------- meteor shower

  private get stats(): AbilityStats {
    return abilityStats(save.state.abilities);
  }

  private meteor(): void {
    const targets = this.host.bricks.targets;
    const { meteorCount, meteorRadius } = this.stats;
    for (let i = 0; i < meteorCount; i++) {
      this.scene.time.delayedCall(i * 170, () => {
        const aim = targets.length ? targets[Phaser.Math.Between(0, targets.length - 1)] : null;
        const tx = aim?.isAlive ? aim.x : Phaser.Math.Between(30, WIDTH - 30);
        const x = Phaser.Math.Clamp(tx + Phaser.Math.Between(-60, 60), 20, WIDTH - 20);
        const img = this.scene.add.image(x, HUD_HEIGHT - 20, 'ball').setDepth(7);
        img.setScale(20 / img.width).setTint(0xff7a1f);
        const fire = this.scene.add.particles(0, 0, 'fire', {
          follow: img,
          frame: FIRE_FRAMES,
          lifespan: 420,
          frequency: 12,
          speed: { min: 10, max: 40 },
          scale: { start: 1.6, end: 0 },
          alpha: { start: 1, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
        });
        fire.setDepth(6);
        this.host.lights?.addLight({
          follow: img,
          radius: 110,
          color: 0xff7a1f,
          intensity: 0.6,
          flicker: 'torch',
          speed: 2,
          priority: 7,
          relief: true,
        });
        this.meteors.push({ img, fire, vx: (tx - x) * 0.8, vy: 820, radius: meteorRadius });
        audio.sfx('ab_meteor_whoosh', 0.35, Phaser.Math.Between(-300, 300), { x });
      });
    }
  }

  private updateMeteors(dt: number): void {
    for (const m of [...this.meteors]) {
      m.img.x += m.vx * dt;
      m.img.y += m.vy * dt;
      const hit = this.brickAt(m.img.x, m.img.y, 8);
      if (hit) {
        this.blast(m.img.x, m.img.y, m.radius, 0xff7a1f);
        audio.sfx('ab_meteor_impact', 0.45, Phaser.Math.Between(-150, 150), { x: m.img.x });
        this.removeMeteor(m);
      } else if (m.img.y > PADDLE_Y - 60) {
        this.host.juice.sparkle(m.img.x, m.img.y, 0xff7a1f, 6);
        audio.sfx('ab_meteor_impact', 0.25, -300, { x: m.img.x });
        this.removeMeteor(m);
      }
    }
  }

  private removeMeteor(m: Meteor): void {
    this.meteors = this.meteors.filter((o) => o !== m);
    m.fire.stop();
    m.img.destroy();
    this.scene.time.delayedCall(500, () => m.fire.destroy());
  }

  // ---------------------------------------------------------------- chain lightning

  private lightning(): void {
    let from = this.host.lightningOrigin();
    const pool = [...this.host.bricks.targets];
    const hops = Math.min(this.stats.lightningHops, pool.length);
    for (let i = 0; i < hops; i++) {
      const next = nearest(pool, from.x, from.y);
      if (!next) break;
      pool.splice(pool.indexOf(next), 1);
      const a = from;
      const b = { x: next.x, y: next.y };
      this.scene.time.delayedCall(i * 70, () => {
        this.bolt(a.x, a.y, b.x, b.y);
        if (this.host.bricks.kill(next, 'ability')) this.host.juice.sparkle(b.x, b.y, 0x7fe9ff, 10);
        audio.sfx('ab_lightning', 0.4, i * 100, { x: b.x });
        haptic('light');
      });
      from = b;
    }
    this.host.juice.flash(90, 160, 240, 255);
    this.host.lights?.flashAmbient(0x9fdcff, 0.25);
  }

  private bolt(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    const steps = 7;
    const pts: Array<[number, number]> = [[x1, y1]];
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      pts.push([
        x1 + (x2 - x1) * t + Phaser.Math.Between(-10, 10),
        y1 + (y2 - y1) * t + Phaser.Math.Between(-10, 10),
      ]);
    }
    pts.push([x2, y2]);
    for (const [w, a] of [
      [8, 0.25],
      [3, 1],
    ] as const) {
      g.lineStyle(w, w > 4 ? 0x3ce7ff : 0xffffff, a);
      g.beginPath();
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    this.host.lights?.flash(x2, y2, 0x9fe8ff, 90, 260, 0.6, 1, 7);
  }

  // ---------------------------------------------------------------- mega bomb

  private bomb(): void {
    const p = this.host.paddlePos();
    const calm = save.state.settings.reducedMotion;
    const y0 = p.y - 30;
    const y1 = Math.min(y0 - 1, this.bombLandingY(p.x, y0));
    const amp = Phaser.Math.Clamp((y0 - y1) * BOMB_LIFT, BOMB_LIFT_MIN, BOMB_LIFT_MAX);
    const shadow = this.scene.add.image(p.x, y0, 'spark').setDepth(5).setTint(0x140814);
    const img = this.scene.add.image(p.x, y0, 'ab_bomb').setDepth(7);
    const baseScale = BOMB_SIZE / img.width;
    if (!calm) this.scene.tweens.add({ targets: img, angle: 360, duration: 600, repeat: -1 });
    this.host.lights?.addLight({
      follow: img,
      radius: 80,
      color: 0xff3c6d,
      intensity: 0.5,
      flicker: 'pulse',
      speed: 2.5,
      priority: 7,
    });
    const density = Math.max(0.35, this.host.juice.particleScale);
    const trail = calm
      ? undefined
      : this.scene.add
          .particles(0, 0, 'fire', {
            follow: img,
            frame: FIRE_FRAMES,
            lifespan: 380,
            frequency: Math.round(16 / density),
            speed: { min: 8, max: 36 },
            scale: { start: 1.35, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: [0xff3c6d, 0xffe08a, 0xff7a1f],
            blendMode: Phaser.BlendModes.ADD,
            maxAliveParticles: 40,
          })
          .setDepth(6);
    const fuse = calm
      ? undefined
      : this.scene.add
          .particles(p.x, y0, 'spark', {
            lifespan: 240,
            frequency: Math.round(34 / density),
            speed: { min: 16, max: 48 },
            angle: { min: 250, max: 290 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [0xffe08a, 0xffffff],
            blendMode: Phaser.BlendModes.ADD,
            maxAliveParticles: 16,
          })
          .setDepth(8);
    const bomb: Bomb = {
      img,
      shadow,
      trail,
      fuse,
      vy: -BOMB_SPEED,
      radius: this.stats.bombRadius,
      y0,
      y1,
      y: y0,
      x: p.x,
      amp,
      baseScale,
    };
    this.poseBomb(bomb);
    this.bombs.push(bomb);
    audio.sfx('ab_bomb_launch', 0.5, 0, { x: p.x });
  }

  /** Y where a rising bomb first overlaps a brick, or the ceiling when the column is clear. */
  private bombLandingY(x: number, fromY: number): number {
    let land = HUD_HEIGHT + 20;
    for (const brick of this.host.bricks.bricks) {
      if (!brick.isAlive) continue;
      if (Math.abs(brick.x - x) >= brick.displayWidth / 2 + BOMB_HIT_R) continue;
      const touch = brick.y + brick.displayHeight / 2 + BOMB_HIT_R;
      if (touch < fromY && touch > land) land = touch;
    }
    return land;
  }

  /** Shadow on the flight line, sprite lifted and scaled above it. */
  private poseBomb(b: Bomb): void {
    const span = b.y0 - b.y1;
    const t = span <= 1 ? 1 : (b.y0 - b.y) / span;
    const lob = bombLob(t);
    const calm = save.state.settings.reducedMotion ? BOMB_CALM_LIFT : 1;
    const lift = lob.lift * b.amp * calm;
    b.shadow.setPosition(b.x, b.y + 6);
    b.img.setPosition(b.x, b.y - lift);
    const s = b.baseScale * lob.scale;
    const h = lob.lift;
    b.img.setScale(s * (1 - 0.12 * h), s * (1 + 0.18 * h));
    b.shadow.setScale(3 * lob.shadow, 0.72 * lob.shadow);
    b.shadow.setAlpha(0.5 * lob.shadow);
    const fuse = b.fuse;
    if (!fuse) return;
    const c = Math.cos(b.img.rotation);
    const sn = Math.sin(b.img.rotation);
    const lx = b.img.displayWidth * 0.2;
    const ly = -b.img.displayHeight * 0.26;
    fuse.setPosition(b.img.x + lx * c - ly * sn, b.img.y + lx * sn + ly * c);
  }

  private updateBombs(dt: number): void {
    for (const b of [...this.bombs]) {
      b.y += b.vy * dt;
      this.poseBomb(b);
      const touching = this.brickAt(b.x, b.y, BOMB_HIT_R, true);
      if (!touching && b.y > HUD_HEIGHT + 20) continue;
      this.bombs = this.bombs.filter((o) => o !== b);
      const { x, y, radius } = b;
      this.removeBomb(b);
      this.detonateBomb(x, y, radius);
    }
  }

  private removeBomb(b: Bomb): void {
    this.scene.tweens.killTweensOf(b.img);
    b.trail?.stop();
    b.fuse?.stop();
    b.img.destroy();
    b.shadow.destroy();
    const trail = b.trail;
    const fuse = b.fuse;
    if (!trail && !fuse) return;
    this.scene.time.delayedCall(500, () => {
      trail?.destroy();
      fuse?.destroy();
    });
  }

  private detonateBomb(x: number, y: number, radius: number): void {
    const tint = 0xff3c6d;
    const calm = save.state.settings.reducedMotion;
    this.blast(x, y, radius, tint, 22);
    this.playBoom(x, y, radius);
    const rich = !calm && this.host.juice.particleScale >= 1;
    if (rich) {
      this.scene.time.delayedCall(50, () => {
        this.playBoom(x + radius * 0.28, y - radius * 0.12, radius * 0.55, 0.62);
      });
      this.scene.time.delayedCall(90, () => {
        this.playBoom(x - radius * 0.22, y + radius * 0.16, radius * 0.45, 0.5);
      });
    }
    if (!calm) {
      const core = this.scene.add
        .image(x, y, 'spark')
        .setDepth(10)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.15);
      this.scene.tweens.add({
        targets: core,
        scale: Math.max(1.2, radius / 18),
        alpha: 0,
        duration: 70,
        ease: 'Cubic.Out',
        onComplete: () => core.destroy(),
      });
      this.bombBurst(x, y, tint);
      this.host.juice.ring(x, y, 0xffffff, radius * 1.55, 560);
      this.host.lights?.flash(x, y, 0xffffff, radius * 1.15, 180, 1.15, 1.5, 9);
    }
    const scorch = this.scene.add.image(x, y + 4, 'spark').setDepth(1).setTint(0x2a1020);
    scorch.setScale((radius * 2.1) / 16, (radius * 0.7) / 16).setAlpha(calm ? 0.28 : 0.45);
    this.scene.tweens.add({
      targets: scorch,
      alpha: 0,
      delay: 200,
      duration: 1000,
      onComplete: () => scorch.destroy(),
    });
    this.host.juice.punch(260, 0.012);
    this.host.juice.hitStop(90);
    this.host.juice.flash(160, 255, 120, 160);
    audio.sfx('ab_bomb_blast', 0.6, 0, { x });
    audio.duck(0.35, 200);
  }

  /** One pass through the painted blast frames, scaled out to the blast radius. */
  private playBoom(x: number, y: number, radius: number, amount = 1): void {
    if (!this.scene.textures.exists('boom')) return;
    const img = this.scene.add
      .image(x, y, 'boom', BOOM_FRAMES[0])
      .setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const end = (radius * 2.1 * amount) / img.width;
    img.setScale(end * 0.35);
    BOOM_FRAMES.forEach((frame, i) => {
      this.scene.time.delayedCall(i * 45, () => {
        if (!img.active) return;
        img.setFrame(frame);
        if (i >= BOOM_FRAMES.length - 1) img.setBlendMode(Phaser.BlendModes.NORMAL);
      });
    });
    this.scene.tweens.add({ targets: img, scale: end, duration: 220, ease: 'Cubic.Out' });
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: 140,
      duration: 160,
      onComplete: () => img.destroy(),
    });
  }

  /** Sparks, debris and smoke that do not share the brick-break particle budget. */
  private bombBurst(x: number, y: number, tint: number): void {
    const density = this.host.juice.particleScale;
    const sparks = Math.max(4, Math.round(24 * density));
    const debris = Math.max(6, Math.round(14 * density));
    const smokeN = Math.max(3, Math.round(8 * density));
    const spark = this.scene.add.particles(x, y, 'spark', {
      lifespan: { min: 220, max: 480 },
      speed: { min: 90, max: 380 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.15, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffe08a, tint],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxAliveParticles: sparks,
    });
    spark.setDepth(9).explode(sparks);
    const shards = this.scene.add.particles(x, y, 'shard', {
      lifespan: { min: 420, max: 760 },
      speed: { min: 120, max: 340 },
      angle: { min: 0, max: 360 },
      gravityY: 720,
      rotate: { min: 0, max: 360 },
      scale: { start: 0.95, end: 0.15 },
      alpha: { start: 1, end: 0 },
      tint,
      emitting: false,
      maxAliveParticles: debris,
    });
    shards.setDepth(8).explode(debris);
    const smoke = this.scene.add.particles(x, y, 'fire', {
      frame: 'f4',
      lifespan: { min: 480, max: 820 },
      speed: { min: 18, max: 70 },
      angle: { min: 250, max: 290 },
      gravityY: -36,
      scale: { start: 1.5, end: 2.4 },
      alpha: { start: 0.5, end: 0 },
      tint: 0x8a8696,
      emitting: false,
      maxAliveParticles: smokeN,
    });
    smoke.setDepth(8).explode(smokeN);
    this.scene.time.delayedCall(900, () => {
      spark.destroy();
      shards.destroy();
      smoke.destroy();
    });
  }

  // ---------------------------------------------------------------- laser sweep

  /**
   * Kills a share of the bricks, never all of them: it stops short of the collapse threshold so the
   * sweep alone can't end the level. With only a few bricks left it clears them all.
   */
  private sweep(): void {
    const targets = Phaser.Utils.Array.Shuffle([...this.host.bricks.targets]);
    let count = targets.length;
    if (targets.length > FEW_BRICKS) {
      const share = Math.round(targets.length * this.stats.sweepKillShare);
      const floor = targets.length - (this.host.bricks.collapseAt + 4);
      count = Math.max(Math.min(share, floor), Math.min(4, targets.length));
    }
    const gfx = this.scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    const light = this.host.lights?.addLight({
      x: -40,
      y: HUD_HEIGHT,
      area: { width: 64, height: PADDLE_Y - HUD_HEIGHT - 30 },
      color: 0xff4d4d,
      intensity: 0.55,
      priority: 8,
    });
    const beam: Beam = {
      gfx,
      x: -10,
      speed: (WIDTH + 20) / 1.5,
      victims: new Set(targets.slice(0, count)),
      crossed: new Set(),
      light,
    };
    beam.sound = audio.sfx('ab_sweep', 0.5, 0, { x: beam.x });
    beam.sound?.once('destroy', () => (beam.sound = undefined));
    this.beams.push(beam);
  }

  private updateBeams(dt: number): void {
    for (const b of [...this.beams]) {
      b.x += b.speed * dt;
      b.gfx.clear();
      b.gfx
        .fillStyle(0xff4d4d, 0.25)
        .fillRect(b.x - 18, HUD_HEIGHT, 36, PADDLE_Y - HUD_HEIGHT - 30);
      b.gfx.fillStyle(0xffffff, 0.9).fillRect(b.x - 3, HUD_HEIGHT, 6, PADDLE_Y - HUD_HEIGHT - 30);
      if (b.light) b.light.x = b.x - 32;
      if (b.sound) b.sound.pan = panAt(b.x, WIDTH);
      for (const brick of this.host.bricks.targets) {
        if (b.crossed.has(brick) || Math.abs(brick.x - b.x) >= brick.displayWidth / 2 + 6) continue;
        b.crossed.add(brick);
        if (b.victims.has(brick) && this.host.bricks.kill(brick, 'ability')) {
          this.host.juice.sparkle(brick.x, brick.y, 0xff6a6a, 5);
        } else {
          this.host.bricks.hit(brick, 0, 'ability', { stripArmor: true });
        }
      }
      if (b.x > WIDTH + 20) {
        this.beams = this.beams.filter((o) => o !== b);
        b.gfx.destroy();
        b.light?.kill();
      }
    }
  }

  // ---------------------------------------------------------------- black hole

  private blackhole(): void {
    const targets = this.host.bricks.targets;
    let best = { x: WIDTH / 2, y: (HUD_HEIGHT + ARENA_MID) / 2, n: -1 };
    for (const b of targets) {
      const n = targets.filter(
        (o) => Phaser.Math.Distance.Between(o.x, o.y, b.x, b.y) < 110,
      ).length;
      if (n > best.n) best = { x: b.x, y: b.y, n };
    }
    const gfx = this.scene.add.graphics().setDepth(7);
    const core = this.scene.add.image(best.x, best.y, 'ab_blackhole').setDepth(8).setScale(0);
    this.scene.tweens.add({
      targets: core,
      scale: 56 / core.width,
      duration: 300,
      ease: 'Back.Out',
    });
    const { holeRadius, holeMs } = this.stats;
    this.scene.tweens.add({ targets: core, angle: -720, duration: holeMs });
    // A violet rim around a pit that swallows the light.
    this.host.lights?.addLight({
      follow: core,
      radius: holeRadius * 2.2,
      color: 0xb05cff,
      intensity: 0.4,
      flicker: 'pulse',
      speed: 1.2,
      priority: 8,
    });
    const pit = this.host.lights?.addLight({
      follow: core,
      radius: 60,
      negative: true,
      intensity: 0.9,
      priority: 8,
    });
    this.holes.push({
      x: best.x,
      y: best.y,
      radius: 40,
      maxRadius: holeRadius,
      remainingMs: holeMs,
      nextPull: 0,
      gfx,
      core,
      pit,
    });
    this.setGloom(true);
    audio.setGravity(true);
    audio.sfx('ab_blackhole_open', 0.55, 0, { x: best.x });
  }

  private updateHoles(dtMs: number): void {
    for (const h of [...this.holes]) {
      h.remainingMs -= dtMs;
      h.radius = Math.min(h.maxRadius, h.radius + dtMs * 0.03);
      if (h.pit) h.pit.radius = h.radius * 1.5;
      h.nextPull -= dtMs;
      const t = this.scene.time.now / 1000;
      h.gfx.clear();
      for (let i = 0; i < 3; i++) {
        h.gfx.lineStyle(3, 0xb05cff, 0.5 - i * 0.12);
        h.gfx.strokeCircle(h.x, h.y, h.radius * (0.4 + ((t * 0.8 + i / 3) % 1) * 0.6));
      }
      if (h.nextPull <= 0) {
        h.nextPull = 120;
        for (const b of this.host.bricks.targets) {
          if (Phaser.Math.Distance.Between(b.x, b.y, h.x, h.y) > h.radius) continue;
          this.suckIn(b, h);
        }
      }
      if (h.remainingMs <= 0) {
        this.holes = this.holes.filter((o) => o !== h);
        this.host.juice.ring(h.x, h.y, 0xb05cff, 160);
        audio.sfx('ab_blackhole_close', 0.45, 0, { x: h.x });
        this.removeHole(h);
      }
    }
  }

  private suckIn(b: Brick, h: Hole): void {
    const ghost = this.scene.add.image(b.x, b.y, b.texture.key, b.frame.name).setDepth(6);
    ghost.setDisplaySize(b.displayWidth, b.displayHeight).setTint(b.tintColor);
    if (!this.host.bricks.kill(b, 'ability')) {
      ghost.destroy();
      return;
    }
    audio.sfx('ab_blackhole_swallow', 0.3, Phaser.Math.Between(-200, 200), { x: h.x });
    this.scene.tweens.add({
      targets: ghost,
      x: h.x,
      y: h.y,
      scale: 0,
      angle: 270,
      duration: 380,
      ease: 'Cubic.In',
      onComplete: () => ghost.destroy(),
    });
  }

  private removeHole(h: Hole): void {
    h.gfx.destroy();
    h.pit?.kill();
    this.scene.tweens.killTweensOf(h.core);
    this.scene.tweens.add({
      targets: h.core,
      scale: 0,
      duration: 220,
      onComplete: () => h.core.destroy(),
    });
    if (this.holes.length === 0) {
      this.setGloom(false);
      audio.setGravity(false);
    }
  }

  private setGloom(on: boolean): void {
    if (on && save.state.settings.reducedMotion) return;
    this.host.backdrop.setDark(on ? 0.55 : 0);
  }

  // ---------------------------------------------------------------- ball frenzy

  private frenzy(): void {
    this.host.spawnFrenzy(this.stats.frenzyBalls);
    audio.sfx('ab_frenzy', 0.55);
    this.host.juice.flash(100, 120, 255, 160);
  }

  // ---------------------------------------------------------------- helpers

  /** Destroys every breakable brick within `radius`, which also sets off TNT chains. */
  private blast(x: number, y: number, radius: number, tint: number, shards = 14): void {
    for (const b of this.host.bricks.targets) {
      const dx = Math.max(Math.abs(b.x - x) - b.displayWidth / 2, 0);
      const dy = Math.max(Math.abs(b.y - y) - b.displayHeight / 2, 0);
      if (dx * dx + dy * dy <= radius * radius) this.host.bricks.kill(b, 'ability');
    }
    this.host.juice.ring(x, y, tint, radius * 1.2);
    this.host.juice.burst(x, y, tint, shards);
    this.host.lights?.flash(x, y, tint, radius * 2.4, 520, 0.8, 1.2, 8);
    this.host.juice.shake(120, 0.006);
    haptic('medium');
  }

  /** First live brick overlapping a circle; steel counts only when `includeSteel` is set. */
  private brickAt(x: number, y: number, r: number, includeSteel = false): Brick | undefined {
    return this.host.bricks.bricks.find(
      (b) =>
        b.isAlive &&
        (includeSteel || b.breakable) &&
        Math.abs(b.x - x) < b.displayWidth / 2 + r &&
        Math.abs(b.y - y) < b.displayHeight / 2 + r,
    );
  }
}

function nearest(list: readonly Brick[], x: number, y: number): Brick | undefined {
  let best: Brick | undefined;
  let bestD = Infinity;
  for (const b of list) {
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
