import Phaser from 'phaser';
import type { ActorDef } from '../../core/cutscene';
import { softDiscTexture } from '../../ui/frames';
import { calm } from '../../ui/theme';
import { LIGHTING_BUDGETS, lightingTier } from '../Quality';
import type { ActorRig } from './ActorStage';

type Image = Phaser.GameObjects.Image;

/** Bullet colours by the rig's argument: `volley:slag`, `volley:spirit`, `volley:data`. */
const PALETTES: Record<string, { glow: number; core: number }> = {
  slag: { glow: 0xff5a1f, core: 0xffe2a8 },
  spirit: { glow: 0x9a6bff, core: 0xeadcff },
  data: { glow: 0x2fe4ff, core: 0xe0fbff },
};

/** How a pattern fires: every `everyMs`, a `burst` of bullets around `aim`. Angles in degrees. */
interface Pattern {
  everyMs: number;
  burst: number;
  /** The spread a burst covers; 360 is a full ring. */
  spread: number;
  /** Turns the aim by this much per burst, for spirals. */
  turn: number;
  speed: number;
  /** Degrees a bullet's heading bends per second, so spirals curl. */
  curl: number;
  /** Random scatter on each bullet's heading. */
  jitter: number;
  size: number;
}

const PATTERNS: Record<string, Pattern> = {
  spiral: {
    everyMs: 55,
    burst: 4,
    spread: 360,
    turn: 11,
    speed: 250,
    curl: 22,
    jitter: 0,
    size: 22,
  },
  fan: {
    everyMs: 240,
    burst: 11,
    spread: 110,
    turn: 0,
    speed: 340,
    curl: 0,
    jitter: 1.5,
    size: 24,
  },
  ring: {
    everyMs: 480,
    burst: 28,
    spread: 360,
    turn: 6.4,
    speed: 210,
    curl: -8,
    jitter: 0,
    size: 26,
  },
  rain: { everyMs: 45, burst: 1, spread: 80, turn: 0, speed: 420, curl: 0, jitter: 40, size: 18 },
};

/** Fired straight down the board, toward whatever the volley is aimed at. */
const AIM = 90;
/** Far enough out that a bullet has left any screen the board fits. */
const REACH = 1100;
const LIFE_MS = 4200;

interface Bullet {
  glow: Image;
  core: Image;
  x: number;
  y: number;
  heading: number;
  speed: number;
  curl: number;
  age: number;
  size: number;
  live: boolean;
}

/**
 * A bullet-hell emitter for cutscenes: an actor that sprays glowing shots in patterns, picked by
 * anim name (`spiral`, `fan`, `ring`, `rain`; `stop` holds fire and lets the last shots fly out).
 * The shots live inside the actor's root, so they move with it and stay off the UI camera. Like
 * the ambient fields it runs on real time, so a seek doesn't replay what was fired. The pool is
 * smaller below the High tier, and reduced motion fires sparser, slower shots and no rings.
 */
export class VolleyRig implements ActorRig {
  readonly root: Phaser.GameObjects.Container;
  readonly height = 64;
  private readonly bullets: Bullet[] = [];
  private readonly palette: { glow: number; core: number };
  private readonly heart: Image;
  private pattern?: Pattern;
  private anim: string | null = null;
  private readonly idle: string | undefined;
  private sinceShot = 0;
  private aim = AIM;
  private clock = 0;
  /** The muzzle glow, eased toward how hard the pattern fires. */
  private heat = 0;
  private flashK = 0;

  constructor(scene: Phaser.Scene, def: ActorDef, arg: string) {
    this.palette = PALETTES[arg] ?? {
      glow: def.light?.color ?? PALETTES.slag!.glow,
      core: PALETTES.slag!.core,
    };
    this.idle = def.idle;
    const disc = softDiscTexture(scene);
    const pool = LIGHTING_BUDGETS[lightingTier()].extras ? 180 : 90;
    this.heart = scene.add
      .image(0, 0, disc)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.palette.glow)
      .setDisplaySize(90, 90)
      .setAlpha(0);
    this.root = scene.add.container(0, 0, [this.heart]);
    for (let i = 0; i < pool; i++) {
      const glow = scene.add
        .image(0, 0, disc)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(this.palette.glow)
        .setVisible(false);
      const core = scene.add
        .image(0, 0, disc)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(this.palette.core)
        .setVisible(false);
      this.root.add([glow, core]);
      this.bullets.push({
        glow,
        core,
        x: 0,
        y: 0,
        heading: 0,
        speed: 0,
        curl: 0,
        age: 0,
        size: 0,
        live: false,
      });
    }
    this.play(null);
  }

  play(anim: string | null): void {
    const name = anim ?? this.idle ?? null;
    if (name === this.anim) return;
    this.anim = name;
    let p = name ? PATTERNS[name] : undefined;
    if (p && calm()) {
      const base = name === 'ring' ? PATTERNS.fan! : p;
      p = { ...base, everyMs: base.everyMs * 3, speed: base.speed * 0.6, curl: 0 };
    }
    this.pattern = p;
    this.sinceShot = p ? p.everyMs : 0;
    this.aim = AIM;
  }

  face(): void {}

  tint(): void {}

  flash(amount: number): void {
    this.flashK = amount;
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    const p = this.pattern;
    if (p) {
      this.sinceShot += dtMs;
      while (this.sinceShot >= p.everyMs) {
        this.sinceShot -= p.everyMs;
        this.fire(p);
      }
    }
    const heat = p ? 0.55 + 0.25 * Math.sin(this.clock / 70) : 0;
    this.heat += (heat - this.heat) * Math.min(1, dtMs / 120);
    const a = Math.max(this.heat, this.flashK);
    this.heart.setAlpha(a).setDisplaySize(80 + 30 * a, 80 + 30 * a);

    const dt = dtMs / 1000;
    for (const b of this.bullets) {
      if (!b.live) continue;
      b.age += dtMs;
      b.heading += b.curl * dt;
      const rad = Phaser.Math.DegToRad(b.heading);
      b.x += Math.cos(rad) * b.speed * dt;
      b.y += Math.sin(rad) * b.speed * dt;
      if (b.age > LIFE_MS || b.x * b.x + b.y * b.y > REACH * REACH) {
        this.retire(b);
        continue;
      }
      // Pops in hot and a little large, then settles to its flying size.
      const pop = Math.min(1, b.age / 90);
      const s = b.size * (1.6 - 0.6 * pop);
      const flicker = 0.85 + 0.15 * Math.sin(this.clock / 40 + b.heading);
      b.glow
        .setPosition(b.x, b.y)
        .setDisplaySize(s, s)
        .setAlpha(pop * 0.9 * flicker);
      b.core
        .setPosition(b.x, b.y)
        .setDisplaySize(s * 0.42, s * 0.42)
        .setAlpha(pop);
    }
  }

  private fire(p: Pattern): void {
    const full = p.spread >= 360;
    const step = full ? 360 / p.burst : p.burst > 1 ? p.spread / (p.burst - 1) : 0;
    const from = full ? this.aim : this.aim - p.spread / 2;
    for (let i = 0; i < p.burst; i++) {
      const b = this.bullets.find((x) => !x.live);
      if (!b) return;
      const jitter = (Math.random() - 0.5) * 2 * p.jitter;
      b.heading = p.burst > 1 || full ? from + step * i + jitter : this.aim + jitter;
      b.speed = p.speed * (0.92 + Math.random() * 0.16);
      b.curl = p.curl;
      b.size = p.size;
      b.x = Math.cos(Phaser.Math.DegToRad(b.heading)) * 18;
      b.y = Math.sin(Phaser.Math.DegToRad(b.heading)) * 18;
      b.age = 0;
      b.live = true;
      b.glow.setVisible(true);
      b.core.setVisible(true);
    }
    this.aim += p.turn;
  }

  private retire(b: Bullet): void {
    b.live = false;
    b.glow.setVisible(false);
    b.core.setVisible(false);
  }

  destroy(): void {
    this.root.destroy();
  }
}
