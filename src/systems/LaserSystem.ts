import Phaser from 'phaser';
import type { WorldId } from '../art/backdrops';
import { HUD_HEIGHT, PADDLE_Y, WIDTH } from '../config';
import { powerupStats, type PowerupStats } from '../core/Economy';
import {
  GUN_PATTERNS,
  PATTERN_MS,
  nextPattern,
  weaveSpeed,
  type GunPatternId,
  type Weave,
} from '../core/GunPattern';
import { pickHomingTarget, type HomingBox } from '../core/Homing';
import {
  LASER_COOL_MS,
  LASER_MODES,
  LASER_MODE_DEFS,
  laserCadence,
  laserSchedule,
  rollLaserMode,
  volleyGap,
  type LaserMode,
  type LaserPlan,
} from '../core/Laser';
import type { Brick } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import type { FxEngine, FxHandle } from '../fx';
import { save } from '../services';
import { audio } from './AudioSystem';
import type { BrickSystem } from './BrickSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { Light, LightingSystem } from './LightingSystem';
import type { PowerupSystem } from './PowerupSystem';

/** Dev only: `?laser=helix` (or gun, scatter, swarm, ricochet) makes every laser that mode. */
export const FORCED_LASER_MODE = ((): LaserMode | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const m = new URLSearchParams(location.search).get('laser');
  return LASER_MODES.find((id) => id === m);
})();

export interface LaserHost {
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly fx: FxEngine;
  readonly lights: LightingSystem;
  readonly paddle: Paddle;
  readonly powerups: PowerupSystem;
  /** Fever's color while it runs. */
  feverTint(): number | undefined;
}

interface LaserLook {
  /** Tracer tail, muzzle flash and pod light. */
  glow: number;
  /** The white-hot head of each tracer. */
  core: number;
  casing: number;
  casingKey: string;
}

const LOOKS: Record<WorldId, LaserLook> = {
  hell: { glow: 0xff5a1f, core: 0xfff0c8, casing: 0xffb347, casingKey: 'laser_casing' },
  crypt: { glow: 0xb46cff, core: 0xf6ecff, casing: 0xd7dcea, casingKey: 'laser_casing' },
  mainframe: { glow: 0x2fe6ff, core: 0xeaffff, casing: 0x5cff9d, casingKey: 'laser_bit' },
};

/** Pooled bolts; the pool reuses them, and a full pool skips a shot rather than growing. */
const MAX_BOLTS = 64;
const BOLT_LIFE_MS = 3_000;
const STEEL_SPARK = 0xcfd6e6;
/** Bolts pick up this share of the paddle's sideways speed, up to STRAFE_MAX px/s. */
const STRAFE_SHARE = 0.35;
const STRAFE_MAX = 240;
const RICOCHET_BOUNCES = 2;
/** Helix strands swing this far either side of their center, this fast (rad/s). */
const HELIX_AMP = 14;
const HELIX_OMEGA = 24;
const SWARM_MAX_SPEED = 680;
const SWARM_ACCEL = 1_200;
/** rad/s */
const SWARM_TURN = 6;
const SWARM_RETARGET_MS = 100;
/** Pods sit this far in from the paddle's ends and sink this far to hide behind it. */
const POD_INSET = 12;
const POD_HIDE = 12;
const POD_HEIGHT = 22;
/** Pods draw behind the paddle, so they slide out of it. */
export const POD_DEPTH = -0.5;
const KICK_PX = 3;
const FLASH_MS = 60;
const TRAIL_EVERY_MS = 22;
const STEAM_EVERY_MS = 70;
/** At most one shot sound this often, whatever the fire rate. */
const SHOT_SOUND_GAP_MS = 100;
const IMPACT_SOUND_GAP_MS = 70;
const STEEL_HEAT = 0x9aa3b5;
const DEG = Math.PI / 180;
/** From one mouth, a pattern's two pods become two streams this many degrees either side of up. */
const MOUTH_FAN = 3;

class Bolt extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  mode: LaserMode = 'gun';
  damage = 0;
  tail = 0xffffff;
  age = 0;
  bounces = 0;
  /** Helix: the strand center's sideways speed, and its place in the weave. */
  drift = 0;
  phase = 0;
  /** A patterned gun bolt's swing in flight, and how many px a half paddle was when it left. */
  weave: Weave | null = null;
  span = 0;
  target: Brick | null = null;
  retargetIn = 0;
  trailAcc = 0;
  /** A missile's exhaust, stopped when the bolt goes back to the pool. */
  exhaust?: FxHandle;
}

interface Pod {
  side: -1 | 1;
  img: Phaser.GameObjects.Image;
  flash: Phaser.GameObjects.Image;
  light?: Light;
  kick: number;
  glow: number;
}

interface Target extends HomingBox {
  brick: Brick;
}

/** What has the pods out: a laser pickup, the gun skill's short burst, or a bonus stage's held trigger. */
type LaserSource = 'pickup' | 'burst' | 'stream';

/** A held trigger, as a bonus stage's gatling runs it. */
export interface LaserStream {
  /** The trigger is held. */
  firing: boolean;
  /** 0..1, how far the barrels have spun up: the pods glow toward white and the shots climb. */
  spin: number;
  /** Ms between shots now. */
  gapMs: number;
  /** Each bolt's damage now, in the stage's target hit points. */
  damage: number;
  /** Fire from this one point, with the pods kept in, e.g. a clown's mouth. */
  mouth?: { x: number; y: number };
}

/** A streamed bolt's tracer, in px, at damage 1; it grows with each point more. */
const STREAM_TRACER: readonly [number, number] = [5, 20];
const STREAM_GROW: readonly [number, number] = [2, 5];

function box(b: Brick): Target {
  return { x: b.x, y: b.y, halfW: b.spec.width / 2, halfH: b.spec.height / 2, brick: b };
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    return Math.round(x + (((b >> s) & 255) - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/**
 * The laser powerup. Each pickup rolls a firing mode, the pods slide out of the paddle and spin
 * up, and every bolt carries an equal share of the pickup's damage budget (see core/Laser).
 * The gun skill fires a short Machine Gun burst through the same pods.
 */
export class LaserSystem {
  readonly group: Phaser.Physics.Arcade.Group;
  private readonly look: LaserLook;
  private mode: LaserMode = 'gun';
  private previous?: LaserMode;
  private pending?: LaserMode;
  private source: LaserSource | null = null;
  private burstMs = 0;
  private burstLeftMs = 0;
  private burstBudget = 0;
  private stats: PowerupStats = powerupStats(save.state.upgrades);
  private plan: LaserPlan = { volleys: 0, bolts: 0, damage: 0 };
  private elapsedMs = 0;
  private cooldown = 0;
  private volley = 0;
  private side: -1 | 1 = -1;
  /** The gun skill's and a bonus stage's gatling fire in patterns; a pickup's guns do not. */
  private pattern: GunPatternId | null = null;
  private patternMs = 0;
  private patternShot = 0;
  private readonly pods: [Pod, Pod];
  private readonly center: Phaser.GameObjects.Image;
  private centerGlow = 0;
  /** Where along the paddle the middle flash sits, in px from its center. */
  private centerAt = 0;
  /** 0 = pods out, 1 = tucked behind the paddle. */
  private readonly deploy = { t: 1 };
  private steamAcc = 0;
  private readonly casings: [
    Phaser.GameObjects.Particles.ParticleEmitter,
    Phaser.GameObjects.Particles.ParticleEmitter,
  ];
  private shotSoundAt = -Infinity;
  private impactSoundAt = -Infinity;
  private targetBoxes: Target[] | null = null;
  private wallBoxes: HomingBox[] = [];
  /** The held trigger, while a bonus stage has the guns out. */
  private held: LaserStream | null = null;
  /** The held stream's mouth as last given, kept so the barrels can still vent there once it lets go. */
  private lastMouth?: { x: number; y: number };
  private wasFiring = false;
  /** Bolts fired since the scene started. A bonus stage works its accuracy out from it. */
  shots = 0;

  constructor(
    private scene: Phaser.Scene,
    private host: LaserHost,
    world: WorldId,
  ) {
    this.look = LOOKS[world];
    this.group = scene.physics.add.group({
      classType: Bolt,
      maxSize: MAX_BOLTS,
      allowGravity: false,
    });
    scene.physics.add.overlap(
      this.group,
      host.bricks.group,
      (a, b) => {
        const bolt = (a instanceof Bolt ? a : b) as Bolt;
        this.onBrick(bolt, (bolt === a ? b : a) as Brick);
      },
      (a, b) => {
        const bolt = (a instanceof Bolt ? a : b) as Bolt;
        const brick = (bolt === a ? b : a) as Brick;
        // Bolts fly through ghosts, open gates and portals.
        return bolt.active && brick.isAlive && brick.solid && brick.kind !== 'portal';
      },
    );

    const pod = (side: -1 | 1): Pod => ({
      side,
      img: scene.add.image(0, 0, 'laser_pod').setOrigin(0.5, 1).setDepth(POD_DEPTH).setVisible(false),
      flash: this.flashImage(),
      kick: 0,
      glow: 0,
    });
    this.pods = [pod(-1), pod(1)];
    this.center = this.flashImage();

    const casing = (min: number, max: number) =>
      scene.add
        .particles(0, 0, this.look.casingKey, {
          lifespan: 560,
          speed: { min: 70, max: 150 },
          angle: { min, max },
          gravityY: 900,
          rotate: { start: 0, end: 540 },
          alpha: { start: 1, end: 0.2 },
          tint: this.look.casing,
          emitting: false,
          maxAliveParticles: 60,
        })
        .setDepth(1);
    this.casings = [casing(205, 245), casing(295, 335)];
  }

  /** The mode the laser being picked up fires: the running one, or the one that will run next. */
  nextMode(): LaserMode {
    if (this.source === 'pickup') return this.mode;
    this.pending ??= FORCED_LASER_MODE ?? rollLaserMode(Math.random, this.previous);
    return this.pending;
  }

  /** Fires a Machine Gun burst for `durationMs`, sharing `budget` damage over its bolts. */
  burst(durationMs: number, budget: number): void {
    if (this.source === 'pickup') return;
    this.burstMs = this.burstLeftMs = durationMs;
    this.burstBudget = budget;
    if (this.source === 'burst') this.begin('burst');
  }

  /** Draws the pods at `depth`: over a gun drawn in place of the paddle, so they sit on its sides. */
  podsAt(depth: number): void {
    for (const p of this.pods) p.img.setDepth(depth);
  }

  /**
   * Keeps the pods out for a bonus stage's held trigger, set every frame before `update`. Null
   * tucks them away. A pickup or a burst still outranks it.
   */
  stream(held: LaserStream | null): void {
    this.held = held;
    if (held) this.lastMouth = held.mouth;
  }

  update(dtMs: number): void {
    const pickup = this.host.powerups.effect('laser');
    if (pickup) this.burstLeftMs = 0;
    const held = this.held;
    const source: LaserSource | null = pickup
      ? 'pickup'
      : this.burstLeftMs > 0
        ? 'burst'
        : held
          ? 'stream'
          : null;
    if (source && source !== this.source) this.begin(source);
    else if (!source && this.source) this.finish();
    const remainingMs = source === 'stream' ? Infinity : (pickup?.remainingMs ?? this.burstLeftMs);
    this.targetBoxes = null;
    const stopped = this.host.juice.inHitStop;
    const firing = source !== 'stream' || !!held?.firing;
    if (source === 'stream') this.trigger(firing);
    if (source && firing && !stopped) {
      this.updateFire(dtMs, remainingMs);
      if (source === 'burst') this.burstLeftMs = Math.max(0, this.burstLeftMs - dtMs);
    }
    this.updatePods(dtMs, remainingMs);
    if (!stopped) this.updateBolts(dtMs);
  }

  /** The held trigger went down or came up: the guns spin up from cold, or vent. */
  private trigger(firing: boolean): void {
    if (firing === this.wasFiring) return;
    this.wasFiring = firing;
    const { x } = this.host.paddle;
    if (firing) {
      this.elapsedMs = 0;
      this.cooldown = 0;
      // From cold the barrels wind up; still spinning, they just carry on.
      if ((this.held?.spin ?? 0) < 0.3) audio.sfx('laser_spinup', 0.25, 0, { x });
      return;
    }
    if (save.state.settings.reducedMotion) return;
    const mouth = this.mouth;
    if (mouth) {
      this.vent(mouth.x, mouth.y, 0.6);
      return;
    }
    for (const p of this.pods) {
      const m = this.muzzle(p);
      this.vent(m.x, m.y, 0.4);
    }
  }

  /** Where a held stream fires from, when it fires from one point instead of the pods. */
  private get mouth(): { x: number; y: number } | undefined {
    return this.source === 'stream' ? this.lastMouth : undefined;
  }

  /** Removes every bolt and tucks the pods away, e.g. when a life is lost. */
  clear(): void {
    for (const b of this.group.getChildren() as Bolt[]) if (b.active) this.kill(b);
    this.source = null;
    this.burstLeftMs = 0;
    this.pending = undefined;
    this.wasFiring = false;
    this.scene.tweens.killTweensOf(this.deploy);
    this.deploy.t = 1;
    for (const p of this.pods) {
      p.light?.kill();
      p.light = undefined;
      p.glow = 0;
      p.kick = 0;
    }
    this.centerGlow = 0;
    this.updatePods(0, 0);
  }

  // ---------------------------------------------------------------- start and end

  private begin(source: LaserSource): void {
    const upgrades = powerupStats(save.state.upgrades);
    if (source === 'pickup') {
      this.mode = this.nextMode();
      this.pending = undefined;
      this.previous = this.mode;
      this.stats = upgrades;
    } else if (source === 'burst') {
      this.mode = 'gun';
      this.stats = { ...upgrades, laserDurationMs: this.burstMs, laserBudget: this.burstBudget };
    } else {
      this.mode = 'gun';
      this.stats = upgrades;
    }
    this.plan =
      source === 'stream' ? { volleys: 0, bolts: 0, damage: 1 } : laserSchedule(this.mode, this.stats);
    this.source = source;
    this.wasFiring = false;
    this.elapsedMs = 0;
    this.cooldown = 0;
    this.volley = 0;
    this.side = -1;
    // A held trigger opens on the twin guns and moves through the rest; a burst gets one of them.
    this.pattern =
      source === 'stream' ? 'twin' : source === 'burst' ? nextPattern('twin', Math.random) : null;
    this.patternMs = 0;
    this.patternShot = 0;
    this.steamAcc = 0;
    this.scene.tweens.killTweensOf(this.deploy);
    const mouth = !!this.mouth;
    if (!mouth) this.scene.tweens.add({ targets: this.deploy, t: 0, duration: 160, ease: 'Back.Out' });
    for (const p of this.pods) {
      p.light?.kill();
      // Firing from a mouth, one pod's light follows the flash there instead and the other stays off.
      p.light =
        mouth && p.side < 0
          ? undefined
          : this.host.lights.addLight({
              follow: mouth ? this.center : p.img,
              radius: 64,
              color: this.look.glow,
              intensity: 0.5,
              priority: 5,
            });
    }
    audio.sfx('laser_spinup', 0.35, 0, { x: this.host.paddle.x });
  }

  /** The barrels vent their heat and the pods tuck back into the paddle. */
  private finish(): void {
    const mouth = this.mouth;
    this.source = null;
    const calm = save.state.settings.reducedMotion;
    if (mouth && !calm) this.vent(mouth.x, mouth.y, 1.2);
    for (const p of this.pods) {
      const { x, y } = this.muzzle(p);
      if (!calm && !mouth) this.vent(x, y, 1);
      p.light?.kill();
      p.light = undefined;
    }
    audio.sfx('laser_vent', 0.35, 0, { x: this.host.paddle.x });
    this.scene.tweens.killTweensOf(this.deploy);
    this.scene.tweens.add({ targets: this.deploy, t: 1, delay: 120, duration: 220, ease: 'Cubic.In' });
  }

  // ---------------------------------------------------------------- firing

  private updateFire(dtMs: number, remainingMs: number): void {
    this.cooldown -= dtMs;
    // A long frame can owe a few volleys; more than that and the frame was a stall, not a burst.
    for (let owed = 0; this.cooldown <= 0 && owed < 4; owed++) {
      this.fire(remainingMs);
      const held = this.source === 'stream' ? this.held : null;
      this.cooldown += held ? held.gapMs : volleyGap(this.mode, this.stats, this.elapsedMs, remainingMs);
    }
    this.elapsedMs += dtMs;
    if (this.pattern) {
      this.patternMs += dtMs;
      if (this.source === 'stream' && this.patternMs >= PATTERN_MS) this.switchPattern();
    }
  }

  /** The held gatling moves on to its next pattern, and names it over the paddle. */
  private switchPattern(): void {
    this.pattern = nextPattern(this.pattern, Math.random);
    this.patternMs = 0;
    this.patternShot = 0;
    const { paddle } = this.host;
    const label = GUN_PATTERNS[this.pattern].label.toUpperCase();
    const color = `#${this.look.core.toString(16).padStart(6, '0')}`;
    this.host.juice.popText(paddle.x, paddle.y - 64, label, color, 14);
    audio.sfx('ui_pip', 0.25, 600, { x: paddle.x });
  }

  private fire(remainingMs: number): void {
    const def = LASER_MODE_DEFS[this.mode];
    const count = def.bolts(this.volley++);
    const calm = save.state.settings.reducedMotion;
    const tint = this.host.feverTint() ?? this.look.glow;
    const strafe =
      this.mode === 'swarm'
        ? 0
        : Phaser.Math.Clamp(this.host.paddle.vx * STRAFE_SHARE, -STRAFE_MAX, STRAFE_MAX);

    if (this.pattern && this.mode === 'gun') {
      this.firePattern(this.pattern, def.speed, tint, strafe, remainingMs, calm);
      return;
    }

    if (this.mode === 'helix') {
      this.centerAt = 0;
      const { x, y } = this.centerMuzzle();
      for (const phase of [0, Math.PI]) {
        const b = this.spawn(x, y, 0, def.speed, tint);
        if (!b) continue;
        b.drift = strafe;
        b.phase = phase;
        b.body.velocity.x = strafe + HELIX_AMP * HELIX_OMEGA * Math.cos(phase);
      }
      this.centerGlow = 1;
      for (const p of this.pods) p.glow = Math.max(p.glow, 0.6);
      if (!calm) for (const c of this.casings) c.emitParticleAt(x, y + 6, 1);
      this.shotSound(0, x, remainingMs);
      return;
    }

    const pod = this.pods[this.side < 0 ? 0 : 1];
    this.side = this.side < 0 ? 1 : -1;
    const { x, y } = this.muzzle(pod);
    for (const angle of this.aim(pod.side, count)) {
      const b = this.spawn(x, y, angle, def.speed, tint);
      if (!b) continue;
      if (this.mode === 'gun') b.body.velocity.x += strafe + Phaser.Math.FloatBetween(-18, 18);
      else b.body.velocity.x += strafe;
      b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI / 2);
    }
    pod.glow = 1;
    if (!calm) {
      pod.kick = KICK_PX;
      this.casings[pod.side < 0 ? 0 : 1].emitParticleAt(x, y + 8, 1);
    }
    this.shotSound(pod.side, x, remainingMs);
  }

  /**
   * One shot of a pattern: from a pod when it sits at an end, else from the paddle's top edge
   * with the middle flash moved to meet it.
   */
  private firePattern(
    id: GunPatternId,
    speed: number,
    tint: number,
    strafe: number,
    remainingMs: number,
    calm: boolean,
  ): void {
    const m = GUN_PATTERNS[id].shot(this.patternMs, this.patternShot++);
    const { paddle } = this.host;
    const span = paddle.halfWidth - POD_INSET;
    const mouth = this.mouth;
    const pod = !mouth && Math.abs(m.at) > 0.85 ? this.pods[m.at < 0 ? 0 : 1] : null;
    const { x, y } = mouth ?? (pod ? this.muzzle(pod) : { x: paddle.x + m.at * span, y: paddle.y - 14 });
    const angle = m.angle + (mouth ? m.at * MOUTH_FAN * DEG : 0);
    const b = this.spawn(x, y, angle + Phaser.Math.FloatBetween(-0.8, 0.8) * DEG, speed, tint);
    if (b) {
      b.body.velocity.x += strafe;
      if (m.weave) {
        b.weave = m.weave;
        b.span = span;
        b.drift = b.body.velocity.x;
      }
      b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x) + Math.PI / 2);
    }
    const sideOf: -1 | 1 = m.at < 0 ? -1 : 1;
    if (pod) {
      pod.glow = 1;
      if (!calm) pod.kick = KICK_PX;
    } else {
      this.centerAt = x - paddle.x;
      this.centerGlow = 1;
    }
    if (!calm && !mouth) this.casings[sideOf < 0 ? 0 : 1].emitParticleAt(x, y + 8, 1);
    this.shotSound(m.at, x, remainingMs);
  }

  /** Launch angles off vertical for one volley, in radians; positive leans right. */
  private aim(side: -1 | 1, count: number): number[] {
    switch (this.mode) {
      case 'scatter':
        return count >= 5 ? [-24, -12, 0, 12, 24].map((d) => d * DEG) : [-12, 0, 12].map((d) => d * DEG);
      case 'swarm':
        return [side * Phaser.Math.FloatBetween(20, 40) * DEG];
      case 'ricochet':
        // Lean hard enough outward that bolts reach the walls and come back across the field.
        return [side * Phaser.Math.FloatBetween(12, 28) * DEG];
      default:
        return [Phaser.Math.FloatBetween(-1.2, 1.2) * DEG];
    }
  }

  private spawn(x: number, y: number, angle: number, speed: number, tint: number): Bolt | undefined {
    const missile = this.mode === 'swarm';
    const key = missile ? 'laser_missile' : 'laser_tracer';
    const b = this.group.get(x, y, key) as Bolt | null;
    if (!b) return undefined;
    b.enableBody(true, x, y, true, true);
    // Pooled bolts swap textures between modes, so the body takes its size from the new one.
    b.setTexture(key);
    b.body.setSize();
    const held = this.source === 'stream' ? this.held : null;
    const more = held ? held.damage - 1 : 0;
    const [w, h] = missile
      ? [7, 14]
      : this.mode === 'scatter'
        ? [4, 16]
        : held
          ? [STREAM_TRACER[0] + more * STREAM_GROW[0], STREAM_TRACER[1] + more * STREAM_GROW[1]]
          : [5, 20];
    b.setDisplaySize(w, h).setDepth(5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(1);
    b.setTint(this.look.core, this.look.core, tint, tint).setRotation(angle);
    b.mode = this.mode;
    b.damage = held ? held.damage : this.plan.damage;
    b.tail = tint;
    b.age = 0;
    b.bounces = 0;
    b.drift = 0;
    b.phase = Math.random() * Math.PI * 2;
    b.weave = null;
    b.span = 0;
    b.target = null;
    b.retargetIn = 0;
    b.trailAcc = 0;
    b.body.setVelocity(Math.sin(angle) * speed, -Math.cos(angle) * speed);
    b.exhaust?.stop();
    b.exhaust = missile
      ? this.host.fx.attach('weapon.exhaust', b, { tint, angle: Phaser.Math.RadToDeg(angle) + 90 })
      : undefined;
    this.shots++;
    return b;
  }

  // ---------------------------------------------------------------- flight

  private updateBolts(dtMs: number): void {
    const calm = save.state.settings.reducedMotion;
    const density = this.host.juice.particleScale;
    for (const b of this.group.getChildren() as Bolt[]) {
      if (!b.active) continue;
      b.age += dtMs;
      const v = b.body.velocity;
      if (b.mode === 'helix') {
        v.x = b.drift + HELIX_AMP * HELIX_OMEGA * Math.cos((HELIX_OMEGA * b.age) / 1000 + b.phase);
      } else if (b.mode === 'swarm') {
        this.steer(b, dtMs);
      } else if (b.weave) {
        v.x = b.drift + weaveSpeed(b.weave, b.age) * b.span;
      }
      if (!this.inPlay(b)) {
        this.kill(b);
        continue;
      }
      if ((b.mode !== 'gun' && b.mode !== 'scatter') || b.weave) {
        b.setRotation(Math.atan2(v.y, v.x) + Math.PI / 2);
      }
      // A missile's exhaust is attached; it only needs pointing back along the new heading.
      if (b.exhaust) {
        b.exhaust.set({ angle: Phaser.Math.RadToDeg(Math.atan2(-v.y, -v.x)) });
        continue;
      }
      if (calm || density <= 0) continue;
      b.trailAcc += dtMs;
      const every = TRAIL_EVERY_MS / density;
      if (b.trailAcc < every) continue;
      b.trailAcc -= every;
      this.host.fx.play('weapon.bolt_trail', b.x, b.y, { tint: b.tail });
    }
  }

  /**
   * False once a bolt leaves play. Ricochet bolts bounce off the walls and ceiling until they run
   * out of bounces; bolts heading back down die before they reach the paddle.
   */
  private inPlay(b: Bolt): boolean {
    const v = b.body.velocity;
    if (b.age > BOLT_LIFE_MS) return false;
    if (v.y > 0 && b.y > PADDLE_Y - 50) return false;
    const top = HUD_HEIGHT + 2;
    const ceiling = b.y < top && v.y < 0;
    const wall = (b.x < 2 && v.x < 0) || (b.x > WIDTH - 2 && v.x > 0);
    if (b.mode === 'ricochet' && b.bounces < RICOCHET_BOUNCES && (ceiling || wall)) {
      if (ceiling) {
        v.y = -v.y;
        b.y = top;
      } else {
        v.x = -v.x;
        b.x = Phaser.Math.Clamp(b.x, 2, WIDTH - 2);
      }
      b.bounces++;
      this.ricochet(b);
      return true;
    }
    if (b.y < HUD_HEIGHT) return false;
    return b.x > -12 && b.x < WIDTH + 12;
  }

  private steer(b: Bolt, dtMs: number): void {
    b.retargetIn -= dtMs;
    if (!b.target?.isAlive || b.retargetIn <= 0) {
      b.target = this.findTarget(b.x, b.y);
      b.retargetIn = SWARM_RETARGET_MS;
    }
    const v = b.body.velocity;
    const s = dtMs / 1000;
    let a = Math.atan2(v.y, v.x);
    const speed = Math.min(SWARM_MAX_SPEED, Math.hypot(v.x, v.y) + SWARM_ACCEL * s);
    if (b.target) {
      const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
      a += Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - a), -SWARM_TURN * s, SWARM_TURN * s);
    }
    // A little weave so a volley reads as a swarm rather than a line.
    a += Math.sin(b.age / 70 + b.phase) * 1.2 * s;
    v.set(Math.cos(a) * speed, Math.sin(a) * speed);
  }

  /** Nearest brick a missile can reach without crossing steel. Boxes are built once a frame. */
  private findTarget(x: number, y: number): Brick | null {
    if (!this.targetBoxes) {
      this.targetBoxes = this.host.bricks.targets.map(box);
      this.wallBoxes = this.host.bricks.bricks.filter((b) => b.wall).map(box);
    }
    const hit = pickHomingTarget(x, y, this.targetBoxes, this.wallBoxes, 3) as Target | null;
    return hit?.brick ?? null;
  }

  // ---------------------------------------------------------------- hits

  private onBrick(bolt: Bolt, brick: Brick): void {
    if (!bolt.active || !brick.isAlive) return;
    if (!brick.breakable) {
      if (brick.kind === 'switch') this.host.bricks.hit(brick, 0, 'laser');
      if (bolt.mode === 'ricochet' && bolt.bounces < RICOCHET_BOUNCES) {
        this.bounceOff(bolt, brick);
        return;
      }
      this.spray(bolt, STEEL_SPARK, 5, 'impact.steel');
      this.impactSound(bolt.x, 500);
      this.kill(bolt);
      return;
    }
    const armor = brick.armor;
    const res = this.host.bricks.hit(brick, bolt.damage, 'laser', { chip: true });
    if (res === 'armor') {
      const cracked = brick.armor < armor;
      if (cracked) audio.sfx('brick_armor', 0.3, 0, { x: brick.x });
      else this.impactSound(bolt.x, 300);
      this.spray(bolt, STEEL_SPARK, cracked ? 8 : 4, 'impact.steel');
    } else {
      if (res === 'damaged') this.impactSound(bolt.x, 0);
      this.spray(bolt, bolt.tail, res === 'destroyed' ? 7 : 4);
    }
    this.kill(bolt);
  }

  /** Reflects off whichever face of the steel the bolt is nearer, and pushes it clear. */
  private bounceOff(b: Bolt, brick: Brick): void {
    const halfW = brick.spec.width / 2;
    const halfH = brick.spec.height / 2;
    const dx = (b.x - brick.x) / halfW;
    const dy = (b.y - brick.y) / halfH;
    const v = b.body.velocity;
    if (Math.abs(dy) >= Math.abs(dx)) {
      v.y = -v.y;
      b.y = brick.y + (dy < 0 ? -1 : 1) * (halfH + 6);
    } else {
      v.x = -v.x;
      b.x = brick.x + (dx < 0 ? -1 : 1) * (halfW + 6);
    }
    b.bounces++;
    this.ricochet(b);
  }

  private ricochet(b: Bolt): void {
    this.spray(b, STEEL_SPARK, 4, 'impact.steel');
    audio.sfx('laser_ricochet', 0.2, Phaser.Math.Between(200, 700), { x: b.x });
  }

  private kill(b: Bolt): void {
    b.exhaust?.stop();
    b.exhaust = undefined;
    b.target = null;
    b.disableBody(true, true);
  }

  // ---------------------------------------------------------------- effects

  private flashImage(): Phaser.GameObjects.Image {
    return this.scene.add
      .image(0, 0, 'laser_flash')
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }

  private muzzle(p: Pod): { x: number; y: number } {
    return { x: p.img.x, y: p.img.y - POD_HEIGHT };
  }

  private centerMuzzle(): { x: number; y: number } {
    return this.mouth ?? { x: this.host.paddle.x + this.centerAt, y: this.host.paddle.y - 14 };
  }

  private updatePods(dtMs: number, remainingMs: number): void {
    const paddle = this.host.paddle;
    const calm = save.state.settings.reducedMotion;
    const hidden = this.deploy.t >= 1 || !!this.mouth;
    const heat = this.heatColor(remainingMs);
    const flashAlpha = calm ? 0.5 : 1;
    const cooling = this.source !== null && remainingMs < LASER_COOL_MS;
    if (cooling) this.steamAcc += dtMs;
    for (const p of this.pods) {
      p.kick = Math.max(0, p.kick - dtMs * 0.04);
      p.glow = Math.max(0, p.glow - dtMs / FLASH_MS);
      const x = paddle.x + p.side * (paddle.halfWidth - POD_INSET);
      p.img.setPosition(x, paddle.y + POD_HIDE * this.deploy.t + p.kick).setVisible(!hidden);
      p.img.setTint(heat);
      const m = this.muzzle(p);
      this.showFlash(p.flash, m.x, m.y, p.glow * flashAlpha, p.glow > 0.95);
      if (p.light) p.light.gain = 0.3 + p.glow * 0.9;
      if (cooling && this.steamAcc >= STEAM_EVERY_MS && !calm) this.vent(m.x, m.y, 0.15);
    }
    if (this.steamAcc >= STEAM_EVERY_MS) this.steamAcc = 0;
    this.centerGlow = Math.max(0, this.centerGlow - dtMs / FLASH_MS);
    const c = this.centerMuzzle();
    this.showFlash(this.center, c.x, c.y, this.centerGlow * flashAlpha, this.centerGlow > 0.95);
  }

  /** A fresh flash gets a new size and spin, so no two shots look the same. */
  private showFlash(img: Phaser.GameObjects.Image, x: number, y: number, alpha: number, fresh: boolean): void {
    img.setVisible(alpha > 0.02).setPosition(x, y).setAlpha(alpha);
    if (!fresh) return;
    img.setTint(mix(this.look.core, this.host.feverTint() ?? this.look.glow, 0.45));
    img.setScale(Phaser.Math.FloatBetween(0.7, 1.1)).setRotation(Math.random() * Math.PI);
  }

  /** Cool steel to the world's glow over the run, then white hot as it overheats. */
  private heatColor(remainingMs: number): number {
    if (!this.source) return STEEL_HEAT;
    const total = this.elapsedMs + remainingMs;
    const p =
      this.source === 'stream' ? (this.held?.spin ?? 0) : total > 0 ? this.elapsedMs / total : 0;
    return p < 0.7 ? mix(STEEL_HEAT, this.look.glow, p / 0.7) : mix(this.look.glow, 0xffffff, (p - 0.7) / 0.3);
  }

  /**
   * An impact thrown back the way the bolt came, off whatever it hit. `count` is how hard, with 8
   * a full hit; a missile always lands as a missile.
   */
  private spray(b: Bolt, tint: number, count: number, look = 'impact.laser'): void {
    const v = b.body.velocity;
    const id = b.mode === 'swarm' ? 'weapon.missile_hit' : look;
    this.host.fx.play(id, b.x, b.y, {
      tint,
      angle: Math.atan2(-v.y, -v.x) / DEG,
      intensity: count / 8,
      scale: id === 'weapon.missile_hit' ? 0.7 : 1,
      bare: true,
    });
  }

  /** Smoke and heat off the barrels; `amount` 1 is a full vent. */
  private vent(x: number, y: number, amount: number): void {
    this.host.fx.play('weapon.vent', x, y, { intensity: amount, bare: true });
  }

  // ---------------------------------------------------------------- sound

  /** Barrels alternate a little in pitch; the spin-up starts low and the overheat sags. */
  private shotSound(side: number, x: number, remainingMs: number): void {
    const now = this.scene.time.now;
    if (now - this.shotSoundAt < SHOT_SOUND_GAP_MS) return;
    this.shotSoundAt = now;
    // A gatling's shots climb as its barrels spin up; anything else sags as it runs out.
    const sag =
      this.source === 'stream' && this.held
        ? this.held.spin * 700
        : (laserCadence(this.elapsedMs, remainingMs) - 1) * 600;
    if (this.mode === 'swarm') {
      audio.sfx('laser_missile', 0.16, 500 + side * 80 + sag, { x });
    } else {
      audio.sfx('laser_shot', 0.15, side * 80 + sag, { x });
    }
  }

  private impactSound(x: number, detune: number): void {
    const now = this.scene.time.now;
    if (now - this.impactSoundAt < IMPACT_SOUND_GAP_MS) return;
    this.impactSoundAt = now;
    audio.sfx('laser_impact', 0.12, detune, { x });
  }
}
