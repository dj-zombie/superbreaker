import Phaser from 'phaser';
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
import { Vortex, type FxEngine, type FxHandle } from '../fx';
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
type BlastLook = 'ability.meteor_impact' | 'ability.bomb_blast';
/** The blast radius each look is drawn for at scale 1, in px. */
const BLAST_SIZE: Record<BlastLook, number> = { 'ability.meteor_impact': 40, 'ability.bomb_blast': 135 };
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
  readonly fx: FxEngine;
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
  trail: FxHandle;
  vx: number;
  vy: number;
  radius: number;
}

interface Bomb {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  trail?: FxHandle;
  fuse?: FxHandle;
  /** Where the fuse burns, on top of the spinning sprite. */
  fusePos: { x: number; y: number };
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
  swirl: FxHandle;
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
        const vx = (tx - x) * 0.8;
        const vy = 820;
        const trail = this.host.fx.attach('ability.meteor_trail', img, {
          tint: 0xff7a1f,
          angle: Phaser.Math.RadToDeg(Math.atan2(-vy, -vx)),
        });
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
        this.meteors.push({ img, trail, vx, vy, radius: meteorRadius });
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
        this.blast(m.img.x, m.img.y, m.radius, 0xff7a1f, 'ability.meteor_impact');
        audio.sfx('ab_meteor_impact', 0.45, Phaser.Math.Between(-150, 150), { x: m.img.x });
        this.removeMeteor(m);
      } else if (m.img.y > PADDLE_Y - 60) {
        this.host.fx.play('fire.burst', m.img.x, m.img.y, { scale: 0.6, bare: true });
        audio.sfx('ab_meteor_impact', 0.25, -300, { x: m.img.x });
        this.removeMeteor(m);
      }
    }
  }

  private removeMeteor(m: Meteor): void {
    this.meteors = this.meteors.filter((o) => o !== m);
    m.trail.stop();
    m.img.destroy();
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
        if (this.host.bricks.kill(next, 'ability')) {
          this.host.fx.play('ability.lightning_strike', b.x, b.y, { tint: 0x7fe9ff, scale: 0.7, bare: true });
        }
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
    // Arc sparks crawl along the drawn bolt.
    const len = Math.hypot(x2 - x1, y2 - y1);
    this.host.fx.play('ability.chain_link', (x1 + x2) / 2, (y1 + y2) / 2, {
      tint: 0x7fe9ff,
      angle: Phaser.Math.RadToDeg(Math.atan2(y2 - y1, x2 - x1)),
      scale: len / 120,
      bare: true,
    });
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
    const fusePos = { x: p.x, y: y0 };
    const trail = calm ? undefined : this.host.fx.attach('fire.trail', img, { tint: 0xff3c6d });
    const fuse = calm ? undefined : this.host.fx.attach('ability.bomb_fuse', fusePos, { tint: 0xff3c6d });
    const bomb: Bomb = {
      img,
      shadow,
      trail,
      fuse,
      fusePos,
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
      if (!brick.isAlive || !brick.solid || brick.kind === 'portal') continue;
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
    const c = Math.cos(b.img.rotation);
    const sn = Math.sin(b.img.rotation);
    const lx = b.img.displayWidth * 0.2;
    const ly = -b.img.displayHeight * 0.26;
    b.fusePos.x = b.img.x + lx * c - ly * sn;
    b.fusePos.y = b.img.y + lx * sn + ly * c;
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
  }

  private detonateBomb(x: number, y: number, radius: number): void {
    const tint = 0xff3c6d;
    const calm = save.state.settings.reducedMotion;
    this.blast(x, y, radius, tint, 'ability.bomb_blast');
    if (!calm) this.host.lights?.flash(x, y, 0xffffff, radius * 1.15, 180, 1.15, 1.5, 9);
    this.host.juice.punch(260, 0.012);
    this.host.juice.hitStop(90);
    this.host.juice.flash(160, 255, 120, 160);
    audio.sfx('ab_bomb_blast', 0.6, 0, { x });
    audio.duck(0.35, 200);
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
          this.host.fx.play('impact.laser', brick.x, brick.y, { tint: 0xff6a6a, angle: 0, bare: true });
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
    const pull = new Vortex(best.x, best.y, 400, 320, 200, 22);
    const swirl = this.host.fx.attach('ability.blackhole', best, { tint: 0xb05cff, forces: [pull] });
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
      swirl,
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
        this.host.fx.play('ability.blackhole_close', h.x, h.y, { tint: 0xb05cff });
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
    h.swirl.stop();
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
    const p = this.host.paddlePos();
    this.host.fx.play('ability.frenzy', p.x, p.y - 26, { tint: ABILITY_INFO.frenzy.color, quiet: true });
    audio.sfx('ab_frenzy', 0.55);
    this.host.juice.flash(100, 120, 255, 160);
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Destroys every breakable brick within `radius`, which also sets off TNT chains. `look` is
   * the blast's effect, scaled from its own size at scale 1 to this radius.
   */
  private blast(x: number, y: number, radius: number, tint: number, look: BlastLook): void {
    for (const b of this.host.bricks.targets) {
      const dx = Math.max(Math.abs(b.x - x) - b.displayWidth / 2, 0);
      const dy = Math.max(Math.abs(b.y - y) - b.displayHeight / 2, 0);
      if (dx * dx + dy * dy <= radius * radius) this.host.bricks.kill(b, 'ability');
    }
    this.host.fx.play(look, x, y, { tint, scale: radius / BLAST_SIZE[look], bare: true });
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
