import type Phaser from 'phaser';
import { SPRITE_DEPTH, type BossAnim } from '../core/Boss';
import type { BossRig, RigContext, RigFactory } from '../systems/BossRig';
import type { Light } from '../systems/LightingSystem';

const DIR = 'images/bosses/crucible';
export const CRUCIBLE_KEYS = {
  torso: 'crucible_torso',
  cap: 'crucible_cage_cap',
  bars: ['crucible_cage_bar1', 'crucible_cage_bar2', 'crucible_cage_bar3', 'crucible_cage_bar4'],
  heart: 'crucible_heart',
  slag: 'crucible_slag',
  splash: 'crucible_splash',
  dart: 'crucible_dart',
  chunk: 'crucible_chunk',
  shard: 'crucible_shard',
  rivet: 'crucible_rivet',
} as const;

/** The ribs, outer left to outer right: each is drawn by the bar of the cage in front of it. */
export const RIBS = ['rib1', 'rib2', 'rib3', 'rib4'] as const;

/** Glow sprite the backdrop makes: a soft white disc, tinted per use. */
const GLOW = 'bd_glow';
/** Phaser's additive blend mode, by number, so this module loads without the engine. */
const ADD = 1;

/** The torso on the field, in px, and its centre under the shell's. */
const TORSO_W = 196;
const TORSO_DY = -10;
/** The torso's own pixels: its two gauges, its belly window and the jets on its fists. */
const TORSO_SRC_W = 520;
const GAUGES = [
  [164, 121],
  [355, 122],
] as const;
const GAUGE_R = 15;
const BELLY = [256, 268] as const;
const JETS = [
  [137, 384],
  [382, 384],
] as const;
/** The cage on the field, in px, and its centre under the shell's. */
const CAGE_W = 90;
const CAGE_DY = 130;
const CAGE_SRC_W = 260;
/** The cage's cap ends this far down its canvas, in its own px: the cables hang from there. */
const CAP_SRC_BOTTOM = 96;
/** One frame of the heart's sheet, in its own px, and on the field. */
const HEART_FRAME = [180, 220] as const;
const HEART_W = 68;
/**
 * The heart's frames. The first six: calm, swollen, screaming, hurt, white-hot, cold slag. The
 * in-betweens: squeezed on a beat, eyes half open, a snarl, the widest scream, a cracked flinch,
 * and half-way to white-hot.
 */
const FRAME = {
  calm: 0,
  swell: 1,
  scream: 2,
  hurt: 3,
  hot: 4,
  slag: 5,
  squeeze: 6,
  peek: 7,
  snarl: 8,
  howl: 9,
  crack: 10,
  warm: 11,
} as const;
const FRAMES = 12;
/** How long each step of a frame sequence shows, in ms: a tell's opening, a flinch, the heat-up. */
const STEP_MS = 110;
/** While it idles, its eyes crack open for a moment every this many beats, for this much of one. */
const PEEK_EVERY = 8;
const PEEK_BEATS = 0.6;

/** A heartbeat: how much it swells on the beat, and how fast that dies away, in beats. */
const BEAT_SWELL = 0.045;
const BEAT_DECAY = 9;
/** The second, softer knock of the heartbeat, a sixth of a beat after the first. */
const DUB_AT = 0.18;
const DUB_SWELL = 0.025;
/** A tell's two thumps: how hard each swells the heart, pulses the room and shakes the floor. */
const THUMP_SWELL = 0.13;
const THUMP_PULSE = 0.9;
const THUMP_SHAKE = 0.0045;
const THUMP_MS = 130;
/** Heartbeats are heard every this many beats while it idles, quietly. */
const IDLE_BEAT_EVERY = 2;
const IDLE_BEAT_VOLUME = 0.16;
const THUMP_VOLUME = 0.5;
/** The heart's light: its colour, reach and brightness at rest and on a beat. */
const HEART_COLOR = 0xff5a1a;
const HEART_LIGHT_RADIUS = 120;
const HEART_LIGHT = 0.75;
const HEART_LIGHT_BEAT = 0.45;
/** The furnace glow in the torso's belly, and the flames of its fists. */
const BELLY_COLOR = 0xff6a20;
const JET_COLOR = 0xffa040;
/** Needle sweep of a gauge, in radians from straight up: empty at -SWEEP, full at +SWEEP. */
const NEEDLE_SWEEP = 2.2;
const NEEDLE_COLOR = 0xe0281c;
/** A broken bar flies off this far sideways and down, in px, spinning, over this long. */
const BREAK_FLING = [130, 300] as const;
const BREAK_SPIN = 2.6;
const BREAK_MS = 1000;
/** A rib's heat as its health goes, in the glow over its bar: none at full, then hotter at each third gone. */
const RIB_HEAT = [0, 0.3, 0.65] as const;
const RIB_HEAT_COLOR = 0xff6a20;
/** Where each bar crosses the cage's middle, in the cage's own px. */
const BAR_X = [12, 82, 178, 247] as const;
/** The cables the bare heart hangs from: how many, and how far they sway, in px. */
const CABLES = 3;
const CABLE_SWAY = 4;
const CABLE_COLOR = 0x2a1612;
/** The torso falls away into the dark over this long when the heart tears free, in ms. */
const FALL_MS = 1600;
/** Where the arrival starts: this far under its place, in px. It rises with the room. */
const ARRIVE_RISE = 720;
/** How much of the entrance it spends rising: the rest it hangs still in the dark. */
const ARRIVE_SHARE = 0.42;

type Image = Phaser.GameObjects.Image;

function cubicOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** A point a light can follow. */
interface Spot {
  x: number;
  y: number;
  active: boolean;
}

/**
 * The Crucible drawn in pieces: a furnace torso, a lantern cage hanging from its hook with a bar
 * in front of each rib, and the living heart inside. It holds no rules: the parts under it are
 * the hit zones, and the fight tells it what happened.
 */
export class CrucibleRig implements BossRig {
  readonly focus = { x: 0, y: 0 };
  private readonly torso: Image;
  private readonly cap: Image;
  private readonly bars = new Map<string, Image>();
  /** The heat in each bar: the bar again, added over it in the furnace's colour. */
  private readonly heats = new Map<string, Image>();
  private readonly heart: Image;
  private readonly heartGlow: Image;
  private readonly belly: Image;
  private readonly jets: Image[];
  private readonly needles: Phaser.GameObjects.Graphics;
  private readonly cables: Phaser.GameObjects.Graphics;
  private readonly heartSpot: Spot = { x: 0, y: 0, active: true };
  private readonly bellySpot: Spot = { x: 0, y: 0, active: true };
  private heartLight?: Light;
  private bellyLight?: Light;
  /** The shell's and the heart's rest centres, which everything is placed from. */
  private readonly shellHome: { x: number; y: number };
  private readonly heartHome: { x: number; y: number };
  /** The heart in the cage, bare under the cap, or torn free and flying. */
  private stance: 'caged' | 'bare' | 'free' = 'caged';
  /** The torso is falling away, or gone. */
  private fallen = false;
  private anim: BossAnim = 'idle';
  /** Ms the current animation, and the death's heat, have been showing. */
  private animMs = 0;
  private endMs = 0;
  private beats = 0;
  private lastBeat = Number.NaN;
  /** Thumps left to land on the coming beats, for a tell. */
  private thumps = 0;
  private swell = 0;
  private punch = 0;
  private progressK = 0;
  /** How hot the fists' vents burn over their resting flicker, 0..1. */
  private jetFlare = 0;
  /** Each rib's heat stage last frame, so a crack is heard once per stage. */
  private readonly heatAt = new Map<string, number>();
  private needleK = 0;
  private rise = 0;
  private clock = 0;
  /** The death: white-hot, then cold. */
  private ending: 'none' | 'hot' | 'cold' = 'none';
  private gone = false;
  private readonly still: boolean;

  constructor(private readonly ctx: RigContext) {
    this.still = ctx.calm;
    const { scene, lighting } = ctx;
    const shell = ctx.homes.get('shell') ?? ctx.anchor;
    const heart = ctx.homes.get('heart') ?? ctx.anchor;
    this.shellHome = { x: shell.x, y: shell.y };
    this.heartHome = { x: heart.x, y: heart.y };
    const tex = scene.textures.get(CRUCIBLE_KEYS.heart);
    if (!tex.has(String(FRAMES - 1))) {
      for (let i = 0; i < FRAMES; i++) {
        tex.add(String(i), 0, (i % 3) * HEART_FRAME[0], Math.floor(i / 3) * HEART_FRAME[1], HEART_FRAME[0], HEART_FRAME[1]);
      }
    }
    const cageScale = CAGE_W / CAGE_SRC_W;
    this.cap = scene.add.image(0, 0, CRUCIBLE_KEYS.cap).setScale(cageScale).setDepth(SPRITE_DEPTH + 0.02);
    RIBS.forEach((id, i) => {
      const key = CRUCIBLE_KEYS.bars[i]!;
      const bar = scene.add.image(0, 0, key).setScale(cageScale).setDepth(SPRITE_DEPTH + 0.02);
      this.bars.set(id, bar);
      const heat = scene.add
        .image(0, 0, key)
        .setScale(cageScale)
        .setBlendMode(ADD)
        .setTint(RIB_HEAT_COLOR)
        .setAlpha(0)
        .setDepth(SPRITE_DEPTH + 0.03);
      this.heats.set(id, heat);
    });
    this.heartGlow = scene.add
      .image(0, 0, GLOW)
      .setBlendMode(ADD)
      .setTint(HEART_COLOR)
      .setDepth(SPRITE_DEPTH - 0.02);
    this.heart = scene.add
      .image(0, 0, CRUCIBLE_KEYS.heart, String(FRAME.calm))
      .setScale(HEART_W / HEART_FRAME[0])
      .setDepth(SPRITE_DEPTH);
    this.cables = scene.add.graphics().setDepth(SPRITE_DEPTH - 0.01);
    this.torso = scene.add
      .image(0, 0, CRUCIBLE_KEYS.torso)
      .setScale(TORSO_W / TORSO_SRC_W)
      .setDepth(SPRITE_DEPTH + 0.04);
    this.belly = scene.add
      .image(0, 0, GLOW)
      .setBlendMode(ADD)
      .setTint(BELLY_COLOR)
      .setDepth(SPRITE_DEPTH + 0.05);
    this.jets = JETS.map(() =>
      scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(JET_COLOR).setDepth(SPRITE_DEPTH + 0.05),
    );
    this.needles = scene.add.graphics().setDepth(SPRITE_DEPTH + 0.06);
    // The iron takes the room's light; the heart and its fires make their own.
    for (const img of [this.torso, this.cap, ...this.bars.values()]) lighting.addLit(img);
    this.heartLight = lighting.addLight({
      follow: this.heartSpot,
      radius: HEART_LIGHT_RADIUS,
      color: HEART_COLOR,
      intensity: HEART_LIGHT,
      flicker: 'candle',
      speed: 0.5,
      priority: 8,
      covered: true,
      relief: true,
    });
    this.bellyLight = lighting.addLight({
      follow: this.bellySpot,
      radius: 90,
      color: BELLY_COLOR,
      intensity: 0.5,
      flicker: 'candle',
      speed: 0.8,
      priority: 6,
      covered: true,
    });
  }

  /** The heart shows bare: the bars are gone, and it hangs from the cap by its cables. */
  bare(): void {
    if (this.stance === 'caged') this.stance = 'bare';
  }

  /**
   * The heart tears free: the cables snap and the torso falls away into the dark. `now` puts it
   * there at once, for a fight started past it or a skipped scene.
   */
  tearFree(now: boolean): void {
    this.stance = 'free';
    if (this.fallen) return;
    this.fallen = true;
    const pieces = [this.torso, this.cap];
    const lights = [this.bellyLight];
    this.bellyLight = undefined;
    for (const l of lights) l?.kill();
    this.belly.setVisible(false);
    for (const j of this.jets) j.setVisible(false);
    this.needles.setVisible(false);
    if (now || this.still) {
      for (const p of pieces) p.setAlpha(0);
      return;
    }
    // It drops back and away, shrinking toward the far wall as it darkens.
    this.ctx.scene.tweens.add({
      targets: pieces,
      y: `-=${40}`,
      scaleX: `*=${0.55}`,
      scaleY: `*=${0.55}`,
      alpha: 0,
      duration: FALL_MS,
      ease: 'Cubic.In',
    });
  }

  /** The death begins: the heart goes white-hot. */
  overheat(): void {
    this.ending = 'hot';
    this.endMs = 0;
  }

  /** The death ends: the heart collapses into a lump of cooling slag. */
  cool(): void {
    this.ending = 'cold';
    if (this.heartLight) {
      this.ctx.scene.tweens.add({ targets: this.heartLight, intensity: 0, radius: 60, duration: 1800 });
    }
  }

  /** A tell is coming: the heart thumps hard on each of the next `n` beats. */
  thump(n = 2): void {
    this.thumps = n;
  }

  place(at: { x: number; y: number }, parts: ReadonlyMap<string, { x: number; y: number }>, dt: number): void {
    this.clock += dt;
    this.animMs += dt;
    this.endMs += dt;
    const { anchor } = this.ctx;
    const dx = at.x - anchor.x;
    const dy = at.y - anchor.y + this.rise;
    const sx = this.shellHome.x + dx;
    const sy = this.shellHome.y + dy;
    this.punch *= Math.exp(-dt / 90);
    this.jetFlare *= Math.exp(-dt / 700);
    this.swell *= Math.exp(-dt / 140);
    if (!this.fallen) this.torso.setPosition(sx, sy + TORSO_DY);

    const tx = this.torso.x - TORSO_W / 2;
    const ty = this.torso.y - this.torso.displayHeight / 2;
    const cageX = sx;
    const cageY = sy + CAGE_DY;
    const beat = this.beatSwell();
    if (!this.fallen) this.cap.setPosition(cageX, cageY);
    const cageScale = CAGE_W / CAGE_SRC_W;
    RIBS.forEach((id, i) => {
      const bar = this.bars.get(id)!;
      const glow = this.heats.get(id)!;
      if (bar.getData('flying')) {
        glow.setPosition(bar.x, bar.y).setRotation(bar.rotation).setAlpha(glow.alpha * 0.9);
        return;
      }
      bar.setPosition(cageX, cageY);
      // A rib glows hotter as it cracks, and at its last it flickers and drips sparks.
      const health = this.ctx.health(id) ?? 1;
      const heat = health > 0.66 ? 0 : health > 0.33 ? 1 : 2;
      if (heat > (this.heatAt.get(id) ?? 0)) {
        const x = cageX + (BAR_X[i]! - CAGE_SRC_W / 2) * cageScale;
        this.ctx.juice.burst(x, cageY + 20, 0xff9a40, 8);
        this.ctx.sfx('crucible_rib_crack', 0.45, heat * 120, x);
      }
      this.heatAt.set(id, heat);
      const flick = heat === 2 && !this.still ? 0.75 + 0.25 * Math.sin(this.clock / 55) : 1;
      glow.setPosition(cageX, cageY).setAlpha((RIB_HEAT[heat] + 0.5 * beat) * flick * bar.alpha);
      if (heat === 2 && !this.still && Math.random() < dt / 600) {
        const x = cageX + (BAR_X[i]! - CAGE_SRC_W / 2) * cageScale;
        this.ctx.juice.sparkle(x, cageY + 40, 0xff9a40, 1);
      }
    });
    // The heart: in its cage, or under the cap, it hangs where it rests; torn free it flies with its part.
    const part = parts.get('heart');
    const hx = this.stance === 'free' && part ? part.x : this.heartHome.x + dx;
    const hy = this.stance === 'free' && part ? part.y : this.heartHome.y + dy;
    const scale = (HEART_W / HEART_FRAME[0]) * (1 + beat + this.swell + this.punch * 0.06);
    this.heart.setPosition(hx, hy).setScale(scale).setFrame(String(this.frame(beat)));
    this.heartSpot.x = hx;
    this.heartSpot.y = hy;
    const glow = 0.55 + 4 * beat + this.swell * 3;
    const hot = this.ending === 'hot';
    this.heartGlow
      .setPosition(hx, hy)
      .setDisplaySize(128 * (hot ? 1.6 : 1), 143 * (hot ? 1.6 : 1))
      .setTint(hot ? 0xffe0a0 : HEART_COLOR)
      .setAlpha(this.ending === 'cold' ? 0 : Math.min(1, 0.35 * glow));
    if (this.heartLight && this.ending === 'none') {
      this.heartLight.intensity = HEART_LIGHT + HEART_LIGHT_BEAT * (beat / BEAT_SWELL) + this.swell * 2;
    }
    this.drawCables(cageX, cageY, hx, hy);
    if (!this.fallen) this.placeFires(tx, ty, TORSO_W / TORSO_SRC_W, beat);
    this.focus.x = hx;
    this.focus.y = this.stance === 'free' ? hy : (sy + hy) / 2;
  }

  show(anim: BossAnim): void {
    if (anim !== this.anim) this.animMs = 0;
    this.anim = anim;
  }

  /** The vents on its fists flare for a beam's wind-up. */
  flare(): void {
    this.jetFlare = 1;
  }

  flinch(): void {
    this.punch = 1;
  }

  arrive(k: number): void {
    const t = Math.min(1, k / ARRIVE_SHARE);
    this.rise = this.still ? 0 : ARRIVE_RISE * (1 - cubicOut(t));
  }

  fade(): void {
    this.gone = true;
    const all = [
      this.torso,
      this.cap,
      this.heart,
      this.heartGlow,
      ...this.bars.values(),
      ...this.heats.values(),
      this.belly,
      ...this.jets,
    ];
    this.ctx.scene.tweens.add({ targets: all, alpha: 0, duration: 600 });
    this.ctx.scene.tweens.add({ targets: [this.cables, this.needles], alpha: 0, duration: 300 });
    this.heartLight?.kill();
    this.heartLight = undefined;
    this.bellyLight?.kill();
    this.bellyLight = undefined;
  }

  broken(part: string): void {
    const bar = this.bars.get(part);
    if (!bar || bar.getData('flying')) return;
    bar.setData('flying', true);
    const i = RIBS.indexOf(part as (typeof RIBS)[number]);
    const dir = i < 2 ? -1 : 1;
    const { scene, juice } = this.ctx;
    const { x, y } = bar;
    juice.burst(x + dir * 20, y + 20, 0xff9a40, 14);
    this.debris(x + dir * 18, y + 10, dir);
    if (this.still) {
      bar.setAlpha(0);
      return;
    }
    scene.tweens.add({
      targets: bar,
      x: x + dir * BREAK_FLING[0],
      rotation: dir * BREAK_SPIN,
      duration: BREAK_MS,
      ease: 'Sine.Out',
    });
    scene.tweens.add({
      targets: bar,
      y: y + BREAK_FLING[1],
      alpha: 0,
      duration: BREAK_MS,
      ease: 'Quad.In',
    });
  }

  beat(beats: number): void {
    this.beats = beats;
    const whole = Math.floor(beats);
    if (Number.isNaN(this.lastBeat)) this.lastBeat = whole;
    if (whole === this.lastBeat || this.gone || this.ending !== 'none') return;
    // Beats jump when the music starts or changes section: one knock for the lot.
    this.lastBeat = whole;
    if (this.thumps > 0) {
      this.thumps--;
      this.swell = THUMP_SWELL;
      this.ctx.scenery.pulse(THUMP_PULSE);
      if (!this.still) this.ctx.juice.shake(THUMP_MS, THUMP_SHAKE);
      this.ctx.sfx('crucible_heartbeat', THUMP_VOLUME, 0, this.heart.x);
      return;
    }
    this.ctx.scenery.pulse(0.25);
    if (whole % IDLE_BEAT_EVERY === 0) this.ctx.sfx('crucible_heartbeat', IDLE_BEAT_VOLUME, -100, this.heart.x);
  }

  progress(k: number): void {
    this.progressK = k;
  }

  destroy(): void {
    this.heartLight?.kill();
    this.bellyLight?.kill();
    const lighting = this.ctx.lighting;
    for (const img of [this.torso, this.cap, ...this.bars.values()]) {
      lighting.removeLit(img);
      img.destroy();
    }
    for (const o of [this.heart, this.heartGlow, this.belly, ...this.jets, ...this.heats.values(), this.needles, this.cables]) {
      o.destroy();
    }
  }

  /** How far the heartbeat swells the heart now: a knock on the beat and a softer one after. */
  private beatSwell(): number {
    if (this.ending !== 'none' || this.still) return 0;
    const p = this.beats - Math.floor(this.beats);
    const lub = BEAT_SWELL * Math.exp(-p * BEAT_DECAY);
    const dub = p > DUB_AT ? DUB_SWELL * Math.exp(-(p - DUB_AT) * BEAT_DECAY) : 0;
    return lub + dub;
  }

  /**
   * The heart's frame for what the fight shows and the beat. Every change runs through its
   * in-betweens: the eyes open before the mouth does, a flinch cracks before it winces, and the
   * heat climbs before it is white.
   */
  private frame(beat: number): number {
    const step = Math.floor(this.animMs / STEP_MS);
    if (this.ending === 'hot') {
      const heat = Math.floor(this.endMs / STEP_MS);
      return heat < 3 ? FRAME.warm : heat < 7 && heat % 2 === 1 ? FRAME.warm : FRAME.hot;
    }
    if (this.ending === 'cold') return FRAME.slag;
    if (this.punch > 0.4 || this.anim === 'hurt') return this.punch > 0.75 ? FRAME.crack : FRAME.hurt;
    if (this.anim === 'tell' || this.anim === 'death') {
      if (step === 0) return FRAME.peek;
      if (step === 1) return FRAME.snarl;
      // A thump opens it widest; between them it screams, now and then stretching wider.
      if (this.swell > 0.05) return FRAME.howl;
      return step % 5 === 0 ? FRAME.howl : FRAME.scream;
    }
    if (this.anim === 'open') return step < 2 ? FRAME.peek : FRAME.swell;
    if (this.swell > 0.05) return FRAME.snarl;
    if (beat > BEAT_SWELL * 0.6) return FRAME.squeeze;
    const peek = this.beats % PEEK_EVERY;
    if (!this.still && peek >= PEEK_EVERY / 2 && peek < PEEK_EVERY / 2 + PEEK_BEATS) return FRAME.peek;
    return FRAME.calm;
  }

  /** The cables from the cap to the bare heart, swaying a little. Snapped once it is free. */
  private drawCables(cageX: number, cageY: number, hx: number, hy: number): void {
    const g = this.cables;
    g.clear();
    if (this.stance !== 'bare' || this.gone) return;
    const top = cageY - (CAGE_W / CAGE_SRC_W) * (this.cap.frame.height / 2 - CAP_SRC_BOTTOM);
    const heartTop = hy - 30;
    g.lineStyle(3, CABLE_COLOR, 1);
    for (let i = 0; i < CABLES; i++) {
      const off = (i - (CABLES - 1) / 2) * 20;
      const sway = this.still ? 0 : CABLE_SWAY * Math.sin(this.clock / 600 + i * 1.7);
      const x0 = cageX + off;
      const x1 = cageX + off * 0.6 + sway;
      const y1 = (top + heartTop) / 2 + 6;
      const x2 = hx + off * 0.35;
      g.beginPath();
      g.moveTo(x0, top);
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        const u = 1 - t;
        g.lineTo(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * top + 2 * u * t * y1 + t * t * heartTop);
      }
      g.strokePath();
    }
  }

  /** The furnace in the belly, the flames of the fists and the gauges' needles. */
  private placeFires(tx: number, ty: number, scale: number, beat: number): void {
    const flick = this.still ? 1 : 0.85 + 0.15 * Math.sin(this.clock / 70) * Math.sin(this.clock / 190);
    const alpha = this.torso.alpha;
    this.belly
      .setPosition(tx + BELLY[0] * scale, ty + BELLY[1] * scale)
      .setDisplaySize(68, 45)
      .setAlpha(Math.min(1, (0.45 + 3 * beat + this.swell * 2) * flick) * alpha);
    this.bellySpot.x = this.belly.x;
    this.bellySpot.y = this.belly.y;
    JETS.forEach(([x, y], i) => {
      const big = 1 + this.jetFlare * 1.4;
      this.jets[i]!
        .setPosition(tx + x * scale, ty + y * scale + 6 + 10 * this.jetFlare)
        .setDisplaySize(26 * big, 35 * big)
        .setAlpha(Math.min(1, (0.6 + 0.4 * this.jetFlare) * flick) * alpha);
    });
    // The needles climb toward full as the boss weakens, with a tremble.
    this.needleK += (this.progressK - this.needleK) * 0.08;
    const g = this.needles.clear();
    GAUGES.forEach(([x, y], i) => {
      const cx = tx + x * scale;
      const cy = ty + y * scale;
      const shake = this.still ? 0 : 0.05 * Math.sin(this.clock / (40 + i * 13));
      const a = -NEEDLE_SWEEP + 2 * NEEDLE_SWEEP * this.needleK + shake;
      const len = GAUGE_R * scale * 2 * 0.8;
      g.lineStyle(2, NEEDLE_COLOR, alpha);
      g.lineBetween(cx, cy, cx + Math.sin(a) * len, cy - Math.cos(a) * len);
      g.fillStyle(0x1a0e0a, alpha);
      g.fillCircle(cx, cy, 2);
    });
  }

  /** Chunks of iron off a breaking bar. */
  private debris(x: number, y: number, dir: number): void {
    const { scene } = this.ctx;
    if (this.still) return;
    const keys = [CRUCIBLE_KEYS.chunk, CRUCIBLE_KEYS.rivet, CRUCIBLE_KEYS.shard];
    keys.forEach((key, i) => {
      const img = scene.add.image(x, y, key).setDepth(SPRITE_DEPTH + 0.1).setScale(0.18 + 0.06 * i);
      scene.tweens.add({
        targets: img,
        x: x + dir * (40 + 50 * i),
        y: y + 240 + 40 * i,
        rotation: dir * (3 + i),
        alpha: 0,
        duration: 800 + 150 * i,
        ease: 'Quad.In',
        onComplete: () => img.destroy(),
      });
    });
  }
}

/** The Crucible's pieces, and the rig that draws them. */
export function crucibleRig(): RigFactory {
  const assets = [
    ['torso', 'torso.png'],
    ['cap', 'cage_cap.png'],
    ['heart', 'heart.png'],
    ['slag', 'slag.png'],
    ['splash', 'splash.png'],
    ['dart', 'dart.png'],
    ['chunk', 'chunk.png'],
    ['shard', 'shard.png'],
    ['rivet', 'rivet.png'],
  ] as const;
  return {
    assets: [
      ...assets.map(([k, file]) => ({ key: CRUCIBLE_KEYS[k], path: `${DIR}/${file}` })),
      ...CRUCIBLE_KEYS.bars.map((key, i) => ({ key, path: `${DIR}/cage_bar${i + 1}.png` })),
    ],
    create: (ctx) => new CrucibleRig(ctx),
  };
}
