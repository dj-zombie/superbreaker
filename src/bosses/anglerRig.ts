import type Phaser from 'phaser';
import { SPRITE_DEPTH, type BossAnim } from '../core/Boss';
import { BH } from '../core/procgen/grid';
import type { BossRig, RigContext, RigFactory } from '../systems/BossRig';
import type { Light } from '../systems/LightingSystem';

const DIR = 'images/bosses/angler';
export const ANGLER_KEYS = {
  head: 'angler_head',
  lure: 'angler_lure',
  pod: 'angler_pod',
  wisp: 'angler_wisp',
  decoy: 'angler_decoy',
  ink: 'angler_ink',
  skull: 'angler_skull',
  splash: 'angler_splash',
  shard: 'angler_shard',
} as const;

/** The cryo-pods, outer left to outer right. */
export const PODS = ['pod1', 'pod2', 'pod3', 'pod4'] as const;

/**
 * The eyes that open in the dark over the field for a glint: one over each lane, this far from the
 * skull's centre at rest, in px. Ink falls from the open ones.
 */
export const EYE_LANES = [60, 180, 300, 420, 540] as const;
export const EYE_DY = -26;

/** Glow sprite the backdrop makes: a soft white disc, tinted per use. */
const GLOW = 'bd_glow';
/** Phaser's additive blend mode, by number, so this module loads without the engine. */
const ADD = 1;

/** Lantern-gold, the throat's green, the eyes' teal and the stalk's flesh. */
export const LANTERN = 0xffb050;
export const THROAT = 0x3aff9a;
const EYE = 0x8affe0;
const STALK = 0x24122c;
const STALK_LIGHT = 0x5a3466;
const NODULE = 0x6affc0;

/** One frame of the head's sheet, in its own px, how it is drawn on the field, and where it hangs from the skull. */
const HEAD_FRAME = [630, 480] as const;
const HEAD_SCALE = 0.7;
const HEAD_DX = 16;
const HEAD_DY = 61;
/** The head's frames: jaw shut, gaping on its green throat, flinching, dead. */
const HEAD = { shut: 0, gape: 1, hurt: 2, dead: 3 } as const;
/** The head's six eyes and the root of the stalk, in its own px. */
const HEAD_EYES = [
  [215, 178],
  [338, 173],
  [190, 213],
  [372, 212],
  [163, 233],
  [458, 212],
] as const;
const BROW = [300, 64] as const;
/** The deep of its throat, in its own px: the green light lives there. */
const THROAT_AT = [288, 300] as const;

/** One frame of the lure's sheet, its scale on the field, where it hangs from its part, and the stalk's tip on it. */
const LURE_FRAME = [200, 230] as const;
const LURE_SCALE = 0.42;
const LURE_DX = 6;
const LURE_DY = -6;
const LURE_TIP = [128, 26] as const;
/** The lantern she holds, in the lure's own px. */
const LANTERN_AT = [54, 144] as const;
/** Vesper's frames: calm, flaring, split open, recoiling, dark, shattering. */
const LURE = { calm: 0, flare: 1, split: 2, recoil: 3, dark: 4, shatter: 5 } as const;

/** One frame of the pod's sheet and its scale. Frames: sealed, cracked, bursting, empty. */
const POD_FRAME = [120, 300] as const;
const POD_SCALE = 0.46;
const POD = { sealed: 0, cracked: 1, burst: 2, empty: 3 } as const;
/** How long a bursting pod shows its burst, in ms. */
const POD_BURST_MS = 420;

/** The lantern's light: reach and brightness at rest, and how hard the beat swells it. */
const LANTERN_RADIUS = 150;
const LANTERN_LIGHT = 0.95;
const LANTERN_BEAT = 0.35;
/** The throat's light at a full gape. */
const THROAT_RADIUS = 140;
const THROAT_LIGHT = 0.9;
/** A sealed pod's green light. */
const POD_RADIUS = 80;
const POD_LIGHT = 0.7;
/** The glow in a pod's glass, so a target reads in the dark: size, and how far above centre. */
const POD_GLOW = [46, 96] as const;
const POD_GLOW_DY = -12;
/** The breath: how much the head swells, and how slowly, in ms a breath. */
const BREATH = 0.012;
const BREATH_MS = 3800;
/** How far the lure sways under its stalk, in px, and how slowly, in ms a swing. */
const LURE_SWAY = 5;
const LURE_SWAY_MS = 2600;
/** How far the stalk bows out to the side of the head, in px, and how far it sways. */
const STALK_BOW = 150;
const STALK_SWAY = 18;
const STALK_STEPS = 24;
/** A lean for a lunge, in radians, and how fast the head eases toward it, per ms. */
const LEAN = 0.09;
const LEAN_EASE = 0.006;
/** The entrance: the lure rises from this far under its place over the first share, then the eyes open one by one. */
const ARRIVE_RISE = 320;
const ARRIVE_LURE = 0.38;
const ARRIVE_EYES = [0.42, 0.82] as const;
/** How much of the head the dark lets show at rest in the first phase, before it surfaces. */
export const SUBMERGED = 0.6;
/** The death: how far it sinks, in px, over how long. */
const SINK = 260;
const SINK_MS = 3600;

type Image = Phaser.GameObjects.Image;

/** A point a light can follow. */
interface Spot {
  x: number;
  y: number;
  active: boolean;
}

function cubicOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Vesper, the Lure, drawn in pieces: the angler's head, lit only where light falls, with its jaw
 * that gapes on a green throat; Vesper herself hanging from a stalk drawn in code, her lantern the
 * one warm light in the room; four cryo-pods that slide out from behind the head; and eyes, on the
 * head and in the dark around it, that stay visible when nothing else does. It holds no rules: the
 * parts under it are the hit zones, and the fight tells it what happened.
 */
export class AnglerRig implements BossRig {
  readonly focus = { x: 0, y: 0 };
  private readonly head: Image;
  /** The throat's glow over the gape. */
  private readonly maw: Image;
  private readonly lure: Image;
  private readonly lantern: Image;
  private readonly pods = new Map<string, Image>();
  private readonly podGlows = new Map<string, Image>();
  private readonly podLights = new Map<string, Light>();
  private readonly podSpots = new Map<string, Spot>();
  /** Each pod's frame, and when a burst began, by pod. */
  private readonly podState = new Map<string, { frame: number; burstAt: number }>();
  private readonly eyes: Image[];
  private readonly darkEyes: Image[];
  private readonly stalk: Phaser.GameObjects.Graphics;
  private readonly nodules: Image[];
  private readonly lureSpot: Spot = { x: 0, y: 0, active: true };
  private readonly throatSpot: Spot = { x: 0, y: 0, active: true };
  private lanternLight?: Light;
  private throatLight?: Light;
  /** Rest centres the pieces are placed from. */
  private readonly skullHome: { x: number; y: number };
  private readonly teethHome: { x: number; y: number };
  private readonly lureHome: { x: number; y: number };
  private anim: BossAnim = 'idle';
  private animMs = 0;
  private beats = 0;
  private lastBeat = Number.NaN;
  private clock = 0;
  private punch = 0;
  /** The lantern's swell on the beat. */
  private swell = 0;
  /** How far the jaw stands open, 0..1, read from where the teeth are. */
  private gape = 0;
  private lean = 0;
  private leanTo = 0;
  /** Ms left with the lantern out. */
  private darkMs = 0;
  /** Her face is split open: the third phase. */
  private split = false;
  /** How much of the head the dark lets show, 0..1, and how far the entrance has come. */
  private presence = SUBMERGED;
  private arriveK = 1;
  /** How far each eye is open, 0..1: the head's six, and those over the lanes. */
  private readonly eyeOpen: number[] = HEAD_EYES.map(() => 1);
  private readonly laneOpen: number[] = EYE_LANES.map(() => 0);
  private readonly laneWant: boolean[] = EYE_LANES.map(() => false);
  private ending: 'none' | 'shatter' | 'sunk' = 'none';
  private endMs = 0;
  private gone = false;
  private readonly still: boolean;

  constructor(private readonly ctx: RigContext) {
    this.still = ctx.calm;
    const { scene, lighting } = ctx;
    const home = (id: string) => ctx.homes.get(id) ?? ctx.anchor;
    this.skullHome = { ...home('skull') };
    this.teethHome = { ...home('teeth') };
    this.lureHome = { ...home('lure') };
    sliceSheet(scene, ANGLER_KEYS.head, HEAD_FRAME, 2, 4);
    sliceSheet(scene, ANGLER_KEYS.lure, LURE_FRAME, 3, 6);
    sliceSheet(scene, ANGLER_KEYS.pod, POD_FRAME, 4, 4);

    for (const id of PODS) {
      if (!ctx.homes.has(id)) continue;
      const pod = scene.add
        .image(0, 0, ANGLER_KEYS.pod, String(POD.sealed))
        .setScale(POD_SCALE)
        .setDepth(SPRITE_DEPTH - 0.06);
      this.pods.set(id, pod);
      this.podGlows.set(
        id,
        scene.add
          .image(0, 0, GLOW)
          .setBlendMode(ADD)
          .setTint(THROAT)
          .setAlpha(0)
          .setDisplaySize(...POD_GLOW)
          .setDepth(SPRITE_DEPTH - 0.055),
      );
      this.podState.set(id, { frame: POD.sealed, burstAt: -Infinity });
      const spot: Spot = { x: 0, y: 0, active: true };
      this.podSpots.set(id, spot);
      lighting.addLit(pod);
    }
    this.head = scene.add
      .image(0, 0, ANGLER_KEYS.head, String(HEAD.shut))
      .setScale(HEAD_SCALE)
      .setDepth(SPRITE_DEPTH);
    this.maw = scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(THROAT).setAlpha(0).setDepth(SPRITE_DEPTH + 0.01);
    this.eyes = HEAD_EYES.map(() =>
      scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(EYE).setDepth(SPRITE_DEPTH + 0.02),
    );
    this.darkEyes = EYE_LANES.map(() =>
      scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(EYE).setAlpha(0).setDepth(SPRITE_DEPTH + 0.02),
    );
    this.stalk = scene.add.graphics().setDepth(SPRITE_DEPTH + 0.03);
    this.nodules = Array.from({ length: 6 }, () =>
      scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(NODULE).setDepth(SPRITE_DEPTH + 0.035),
    );
    this.lure = scene.add
      .image(0, 0, ANGLER_KEYS.lure, String(LURE.calm))
      .setScale(LURE_SCALE)
      .setDepth(SPRITE_DEPTH + 0.05);
    this.lantern = scene.add.image(0, 0, GLOW).setBlendMode(ADD).setTint(LANTERN).setDepth(SPRITE_DEPTH + 0.06);
    // The flesh takes the room's light; the lantern, the throat, the pods and the eyes make their own.
    lighting.addLit(this.head);
    this.lanternLight = lighting.addLight({
      follow: this.lureSpot,
      radius: LANTERN_RADIUS,
      color: LANTERN,
      intensity: LANTERN_LIGHT,
      flicker: 'candle',
      speed: 0.6,
      priority: 8,
      covered: true,
      relief: true,
    });
    this.throatLight = lighting.addLight({
      follow: this.throatSpot,
      radius: THROAT_RADIUS,
      color: THROAT,
      intensity: 0,
      flicker: 'candle',
      speed: 0.4,
      priority: 7,
      covered: true,
    });
    for (const [id, spot] of this.podSpots) {
      this.podLights.set(
        id,
        lighting.addLight({
          follow: spot,
          radius: POD_RADIUS,
          color: THROAT,
          intensity: 0,
          flicker: 'candle',
          speed: 0.3,
          priority: 6,
          covered: true,
        }),
      );
    }
  }

  /** How much of the head shows in the dark, 0..1: dim while it lurks, whole once it surfaces. */
  surface(k: number): void {
    this.presence = SUBMERGED + (1 - SUBMERGED) * clamp01(k);
  }

  /** Eyes open in the dark over these lanes (indexes of EYE_LANES), and the rest close. */
  openEyes(lanes: readonly number[]): void {
    this.laneWant.fill(false);
    for (const i of lanes) if (i >= 0 && i < this.laneWant.length) this.laneWant[i] = true;
  }

  /** The lantern goes out for `ms`: what falls next is a lie. */
  blink(ms: number): void {
    this.darkMs = Math.max(this.darkMs, ms);
  }

  /** The head leans toward a side for a lunge: -1 left, 1 right, 0 back upright. */
  lunge(side: -1 | 0 | 1): void {
    this.leanTo = side * LEAN;
  }

  /** Her face splits open for good: the last phase. */
  frenzy(): void {
    this.split = true;
  }

  /** The death begins: the lantern shatters and the eyes go out. */
  shatter(): void {
    this.ending = 'shatter';
    this.endMs = 0;
    this.lanternLight?.kill();
    this.lanternLight = undefined;
    this.ctx.scenery.reflect(this.lure.x, 0);
  }

  /** The death ends: the head sinks into the black water. */
  sink(): void {
    this.ending = 'sunk';
    this.endMs = 0;
    this.throatLight?.kill();
    this.throatLight = undefined;
  }

  place(at: { x: number; y: number }, parts: ReadonlyMap<string, { x: number; y: number }>, dt: number): void {
    this.clock += dt;
    this.animMs += dt;
    this.endMs += dt;
    this.punch *= Math.exp(-dt / 110);
    this.swell *= Math.exp(-dt / 160);
    this.darkMs = Math.max(0, this.darkMs - dt);
    this.lean += (this.leanTo - this.lean) * Math.min(1, dt * LEAN_EASE);
    const { anchor } = this.ctx;
    const dx = at.x - anchor.x;
    const dy = at.y - anchor.y;
    const sink = this.ending === 'sunk' ? SINK * easeIn(Math.min(1, this.endMs / SINK_MS)) : 0;

    // The head, breathing.
    const breath = this.still ? 0 : BREATH * Math.sin((2 * Math.PI * this.clock) / BREATH_MS);
    const hx = this.skullHome.x + dx + HEAD_DX;
    const hy = this.skullHome.y + dy + HEAD_DY + sink;
    const teeth = parts.get('teeth');
    if (teeth) this.gape = clamp01((this.teethHome.y + dy - teeth.y) / (3 * BH));
    const headScale = HEAD_SCALE * (1 + breath + this.punch * 0.025);
    const shown = this.presence * this.arrival(ARRIVE_EYES[1], 1) * (this.ending === 'sunk' ? 1 - this.endMs / SINK_MS : 1);
    this.head
      .setPosition(hx, hy)
      .setScale(headScale, headScale * (1 - breath * 0.5))
      .setRotation(this.lean)
      .setFrame(String(this.headFrame()))
      .setAlpha(clamp01(shown));
    const point = (fx: number, fy: number) => {
      const ox = (fx - HEAD_FRAME[0] / 2) * headScale;
      const oy = (fy - HEAD_FRAME[1] / 2) * headScale;
      const c = Math.cos(this.lean);
      const s = Math.sin(this.lean);
      return { x: hx + ox * c - oy * s, y: hy + ox * s + oy * c };
    };

    // The throat glows as the jaw opens.
    const throat = point(THROAT_AT[0], THROAT_AT[1]);
    this.throatSpot.x = throat.x;
    this.throatSpot.y = throat.y;
    const flick = this.still ? 1 : 0.85 + 0.15 * Math.sin(this.clock / 90) * Math.sin(this.clock / 230);
    const gapeGlow = this.ending === 'none' ? this.gape : 0;
    this.maw
      .setPosition(throat.x, throat.y)
      .setDisplaySize(150, 110)
      .setAlpha(clamp01(gapeGlow * 0.8 * flick * shown));
    if (this.throatLight) this.throatLight.intensity = THROAT_LIGHT * gapeGlow;

    this.placeEyes(point, dx, dy + sink, shown);
    this.placePods(parts, dt, sink);
    this.placeLure(parts, dx, dy, point, sink);
    this.focus.x = hx;
    this.focus.y = (hy + this.lure.y) / 2;
  }

  show(anim: BossAnim): void {
    if (anim !== this.anim) this.animMs = 0;
    this.anim = anim;
  }

  flinch(): void {
    this.punch = 1;
  }

  arrive(k: number): void {
    this.arriveK = k;
  }

  fade(): void {
    this.gone = true;
    const all = [
      this.head,
      this.maw,
      this.lure,
      this.lantern,
      ...this.eyes,
      ...this.darkEyes,
      ...this.nodules,
      ...this.pods.values(),
      ...this.podGlows.values(),
    ];
    this.ctx.scene.tweens.add({ targets: all, alpha: 0, duration: 600 });
    this.ctx.scene.tweens.add({ targets: this.stalk, alpha: 0, duration: 300 });
    this.lanternLight?.kill();
    this.lanternLight = undefined;
    this.throatLight?.kill();
    this.throatLight = undefined;
    for (const l of this.podLights.values()) l.kill();
    this.podLights.clear();
    this.ctx.scenery.reflect(0, 0);
  }

  broken(part: string): void {
    const pod = this.pods.get(part);
    const state = this.podState.get(part);
    if (!pod || !state) return;
    state.frame = POD.burst;
    state.burstAt = this.clock;
    this.podLights.get(part)?.kill();
    this.podLights.delete(part);
    const { fx, juice } = this.ctx;
    fx.play('angler.pod_burst', pod.x, pod.y, { bare: true });
    juice.sparkle(pod.x, pod.y, THROAT, 10);
    this.shards(pod.x, pod.y);
    this.ctx.sfx('angler_pod_burst', 0.6, 0, pod.x);
  }

  beat(beats: number): void {
    this.beats = beats;
    const whole = Math.floor(beats);
    if (Number.isNaN(this.lastBeat)) this.lastBeat = whole;
    if (whole === this.lastBeat || this.gone || this.ending !== 'none') return;
    // Beats jump when the music starts or changes section: one swell for the lot.
    this.lastBeat = whole;
    this.swell = 1;
    this.ctx.scenery.pulse(0.18);
  }

  progress(): void {}

  destroy(): void {
    this.lanternLight?.kill();
    this.throatLight?.kill();
    for (const l of this.podLights.values()) l.kill();
    const lighting = this.ctx.lighting;
    for (const img of [this.head, ...this.pods.values()]) {
      lighting.removeLit(img);
      img.destroy();
    }
    for (const o of [
      this.maw,
      this.lure,
      this.lantern,
      this.stalk,
      ...this.eyes,
      ...this.darkEyes,
      ...this.nodules,
      ...this.podGlows.values(),
    ]) {
      o.destroy();
    }
  }

  /** 0..1 of the way from `from` to `to` through the entrance, 1 once it is over. */
  private arrival(from: number, to: number): number {
    return clamp01((this.arriveK - from) / (to - from));
  }

  private headFrame(): number {
    if (this.ending !== 'none' || this.anim === 'death') return HEAD.dead;
    if (this.punch > 0.55 || this.anim === 'hurt') return HEAD.hurt;
    return this.gape > 0.5 ? HEAD.gape : HEAD.shut;
  }

  private lureFrame(): number {
    if (this.ending !== 'none') return LURE.shatter;
    if (this.darkMs > 0) return LURE.dark;
    if (this.punch > 0.5 || this.anim === 'hurt') return LURE.recoil;
    if (this.split || this.anim === 'death') return LURE.split;
    if (this.anim === 'tell') return Math.floor(this.animMs / 140) % 4 === 3 ? LURE.calm : LURE.flare;
    return this.swell > 0.6 ? LURE.flare : LURE.calm;
  }

  /** The head's six eyes, opening one by one as it arrives, and the eyes in the dark over the lanes. */
  private placeEyes(point: (x: number, y: number) => { x: number; y: number }, dx: number, dy: number, shown: number): void {
    const twinkle = this.still ? 1 : 0.8 + 0.2 * Math.sin(this.clock / 170);
    const dead = this.ending !== 'none' || this.anim === 'death';
    HEAD_EYES.forEach(([ex, ey], i) => {
      // During the entrance they open one after another; at the end they go out.
      const opens = ARRIVE_EYES[0] + ((ARRIVE_EYES[1] - ARRIVE_EYES[0]) * i) / HEAD_EYES.length;
      const open = dead ? 0 : this.arrival(opens, opens + 0.06);
      this.eyeOpen[i] = open;
      const p = point(ex, ey);
      const size = (i < 2 ? 22 : i < 4 ? 17 : 12) * (1 + 0.35 * this.swell * 0.4);
      this.eyes[i]!.setPosition(p.x, p.y)
        .setDisplaySize(size, size * (0.25 + 0.75 * open))
        .setAlpha(Math.min(1, open * twinkle * (0.55 + 0.45 * shown)));
    });
    EYE_LANES.forEach((lx, i) => {
      const want = this.laneWant[i] && !dead ? 1 : 0;
      this.laneOpen[i]! += (want - this.laneOpen[i]!) * (want ? 0.2 : 0.12);
      const open = this.laneOpen[i]!;
      const x = lx + dx;
      const y = this.skullHome.y + dy + EYE_DY;
      this.darkEyes[i]!.setPosition(x, y)
        .setDisplaySize(26, 26 * (0.15 + 0.85 * open))
        .setAlpha(Math.min(1, open * 1.1 * twinkle));
    });
  }

  /** The pods: behind the head while tucked away, sliding out to the flanks for the breach. */
  private placePods(parts: ReadonlyMap<string, { x: number; y: number }>, dt: number, sink: number): void {
    for (const [id, pod] of this.pods) {
      const state = this.podState.get(id)!;
      const at = parts.get(id);
      if (at) {
        pod.setPosition(at.x, at.y + 8 + sink);
        const spot = this.podSpots.get(id)!;
        spot.x = at.x;
        spot.y = at.y;
      } else {
        pod.y += sink > 0 ? dt * 0.05 : 0;
      }
      const health = this.ctx.health(id) ?? 1;
      if (state.frame === POD.burst && this.clock - state.burstAt > POD_BURST_MS) state.frame = POD.empty;
      if (state.frame === POD.sealed && health <= 0.5) {
        state.frame = POD.cracked;
        this.ctx.juice.sparkle(pod.x, pod.y, THROAT, 6);
        this.ctx.sfx('angler_pod_crack', 0.5, 0, pod.x);
      }
      pod.setFrame(String(state.frame));
      // A pod tucked behind the head shows only as the head lets it; its light, only once out.
      const out = at ? clamp01(Math.abs(at.x - this.skullHome.x) / 120 - 0.4) : 1;
      const light = this.podLights.get(id);
      if (light) light.intensity = POD_LIGHT * out * (0.8 + 0.4 * this.swell * 0.3);
      const lit = state.frame === POD.sealed ? 0.55 : state.frame === POD.cracked ? 0.45 + (this.still ? 0 : 0.12 * Math.sin(this.clock / 90)) : 0;
      this.podGlows
        .get(id)!
        .setPosition(pod.x, pod.y + POD_GLOW_DY)
        .setAlpha(this.gone ? 0 : lit * out * (0.85 + 0.15 * this.swell));
    }
  }

  /** Vesper on her stalk, her lantern and its light, and its streak on the water. */
  private placeLure(
    parts: ReadonlyMap<string, { x: number; y: number }>,
    dx: number,
    dy: number,
    point: (x: number, y: number) => { x: number; y: number },
    sink: number,
  ): void {
    const part = parts.get('lure');
    const sway = this.still ? 0 : LURE_SWAY * Math.sin((2 * Math.PI * this.clock) / LURE_SWAY_MS);
    const rise = this.still ? 0 : ARRIVE_RISE * (1 - cubicOut(this.arrival(0, ARRIVE_LURE)));
    const lx = (part ? part.x : this.lureHome.x + dx) + LURE_DX + sway + this.lean * 120;
    const ly = (part ? part.y : this.lureHome.y + dy) + LURE_DY + rise + sink * 0.5;
    const shattering = this.ending !== 'none';
    const fadeEnd = shattering ? 1 - clamp01((this.endMs - 500) / 900) : 1;
    this.lure
      .setPosition(lx, ly)
      .setScale(LURE_SCALE * (1 + this.punch * 0.06))
      .setRotation(this.still ? 0 : 0.05 * Math.sin((2 * Math.PI * this.clock) / LURE_SWAY_MS + 0.8))
      .setFrame(String(this.lureFrame()))
      .setAlpha(clamp01(this.arrival(0, 0.12)) * fadeEnd);
    const lan = {
      x: lx + (LANTERN_AT[0] - LURE_FRAME[0] / 2) * LURE_SCALE,
      y: ly + (LANTERN_AT[1] - LURE_FRAME[1] / 2) * LURE_SCALE,
    };
    this.lureSpot.x = lan.x;
    this.lureSpot.y = lan.y;
    const dark = this.darkMs > 0;
    const cold = this.split;
    const flick = this.still ? 1 : 0.88 + 0.12 * Math.sin(this.clock / 63) * Math.sin(this.clock / 151);
    const glow = dark || shattering ? 0 : (0.75 + 0.35 * this.swell) * flick;
    this.lantern
      .setPosition(lan.x, lan.y)
      .setDisplaySize(70 + 20 * this.swell, 70 + 20 * this.swell)
      .setTint(cold ? 0x9affe0 : LANTERN)
      .setAlpha(clamp01(glow * this.lure.alpha));
    if (this.lanternLight) {
      this.lanternLight.intensity = dark ? 0.05 : LANTERN_LIGHT + LANTERN_BEAT * this.swell;
      this.lanternLight.color = cold ? 0x9affe0 : LANTERN;
    }
    this.ctx.scenery.reflect(lan.x, glow * this.lure.alpha, cold ? 0x9affe0 : LANTERN);

    // The stalk: from the brow it bows out past the head and down into the back of her hood.
    const tip = {
      x: lx + (LURE_TIP[0] - LURE_FRAME[0] / 2) * LURE_SCALE,
      y: ly + (LURE_TIP[1] - LURE_FRAME[1] / 2) * LURE_SCALE,
    };
    const root = point(BROW[0], BROW[1]);
    this.drawStalk(root, tip, shattering ? fadeEnd : this.lure.alpha);
  }

  private drawStalk(root: { x: number; y: number }, tip: { x: number; y: number }, alpha: number): void {
    const g = this.stalk.clear();
    if (alpha <= 0.01 || this.gone) {
      for (const n of this.nodules) n.setAlpha(0);
      return;
    }
    const bow = STALK_BOW + (this.still ? 0 : STALK_SWAY * Math.sin(this.clock / 900));
    const c1 = { x: root.x + 30, y: root.y - 70 };
    const c2 = { x: tip.x + bow, y: tip.y - 150 };
    const at = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * root.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * tip.x,
        y: u * u * u * root.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * tip.y,
      };
    };
    // Thick at the root, thin at the lure: drawn as segments that taper.
    let prev = at(0);
    for (let k = 1; k <= STALK_STEPS; k++) {
      const t = k / STALK_STEPS;
      const p = at(t);
      const width = 9 - 6 * t;
      g.lineStyle(width, STALK, alpha);
      g.lineBetween(prev.x, prev.y, p.x, p.y);
      g.lineStyle(Math.max(1, width * 0.35), STALK_LIGHT, alpha * 0.8);
      g.lineBetween(prev.x - 1, prev.y - 1, p.x - 1, p.y - 1);
      prev = p;
    }
    // Luminous nodules down its length, pulsing out along it on the beat.
    const phase = this.beats - Math.floor(this.beats);
    this.nodules.forEach((n, i) => {
      const t = (i + 1) / (this.nodules.length + 1);
      const p = at(t);
      const wave = this.still ? 0.6 : Math.max(0, 1 - Math.abs(phase - t) * 4);
      n.setPosition(p.x, p.y)
        .setDisplaySize(10 + 6 * wave, 10 + 6 * wave)
        .setAlpha(alpha * (0.35 + 0.5 * wave));
    });
  }

  /** Green glass off a bursting pod. */
  private shards(x: number, y: number): void {
    if (this.still) return;
    const { scene } = this.ctx;
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const img = scene.add
        .image(x, y, ANGLER_KEYS.shard)
        .setDepth(SPRITE_DEPTH + 0.1)
        .setScale(0.16 + 0.05 * i);
      scene.tweens.add({
        targets: img,
        x: x + dir * (30 + 35 * i),
        y: y + 220 + 30 * i,
        rotation: dir * (2 + i),
        alpha: 0,
        duration: 800 + 120 * i,
        ease: 'Quad.In',
        onComplete: () => img.destroy(),
      });
    }
  }
}

function easeIn(t: number): number {
  return t * t;
}

/** Names the frames of a sheet of `cols` columns, `count` frames, if it has not been already. */
function sliceSheet(scene: Phaser.Scene, key: string, frame: readonly [number, number], cols: number, count: number): void {
  const tex = scene.textures.get(key);
  if (tex.has(String(count - 1))) return;
  for (let i = 0; i < count; i++) {
    tex.add(String(i), 0, (i % cols) * frame[0], Math.floor(i / cols) * frame[1], frame[0], frame[1]);
  }
}

/** The angler's pieces, and the rig that draws them. */
export function anglerRig(): RigFactory {
  const files = {
    head: 'head.png',
    lure: 'lure.png',
    pod: 'pod.png',
    wisp: 'wisp.png',
    decoy: 'decoy.png',
    ink: 'ink.png',
    skull: 'skull.png',
    splash: 'splash.png',
    shard: 'shard.png',
  } as const;
  return {
    assets: (Object.keys(files) as Array<keyof typeof files>).map((k) => ({
      key: ANGLER_KEYS[k],
      path: `${DIR}/${files[k]}`,
    })),
    create: (ctx) => new AnglerRig(ctx),
  };
}
