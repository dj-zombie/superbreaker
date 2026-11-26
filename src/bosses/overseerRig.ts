import type Phaser from 'phaser';
import { PADDLE_Y } from '../config';
import { HABIT_BINS, SPRITE_DEPTH, type BossAnim } from '../core/Boss';
import { BW } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { BossRig, RigContext, RigFactory } from '../systems/BossRig';
import type { Light } from '../systems/LightingSystem';

const DIR = 'images/bosses/overseer';
export const OVERSEER_KEYS = {
  housing: 'overseer_housing',
  iris: 'overseer_iris',
  shutter: 'overseer_shutter',
  mirror: 'overseer_mirror',
  packet: 'overseer_packet',
  skull: 'overseer_skull',
  decoy: 'overseer_decoy',
  slag: 'overseer_slag',
  splash: 'overseer_splash',
  shard: 'overseer_shard',
} as const;

/** Glow sprite the backdrop makes: a soft white disc, tinted per use. */
const GLOW = 'bd_glow';
/** Phaser's additive blend mode, by number, so this module loads without the engine. */
const ADD = 1;

/** The iris's cyan, its red when it focuses, the frost of a stun, and Vesper's gold. */
export const CYAN = 0x3ce7ff;
export const FOCUS = 0xff2a3a;
const FROST = 0xb8e0ff;
export const VESPER = 0xffb050;
/** The daylight through the door. */
export const DAYLIGHT = 0xfff2d8;

/** One frame of the housing's sheet, its scale on the field, and the socket's centre on it, in its own px. */
const HOUSING_FRAME = [450, 480] as const;
const HOUSING_SCALE = 1 / 1.5;
const SOCKET_AT = [224, 190] as const;
/** Housing frames: lit, glaring, broken open, dead. */
const HOUSING = { lit: 0, glare: 1, broken: 2, dead: 3 } as const;

/** One frame of the iris's sheet and its scale: it fills the socket, 120 px across. */
const IRIS_FRAME = [300, 300] as const;
const IRIS_SCALE = 0.414;
/** Iris frames: calm, focusing red, cracked, dead. */
const IRIS = { calm: 0, focus: 1, hurt: 2, dead: 3 } as const;
/** How far the iris turns toward what it watches, in px. */
const IRIS_LOOK = 5;

/** A shutter leaf's scale across and down: drawn a little wide, so four of them close with no gap. */
const LEAF_SCALE = [0.36, 0.31] as const;
/** The leaves' angles, clockwise from straight up: the four diagonals. */
const LEAF_ANGLES = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4] as const;
/** How far a leaf draws back along its diagonal when the shutter is open, in px. */
const LEAF_OPEN = 58;
/** How far each lid slides out to open, in px: the shutter's openness is read from it. */
export const LID_TRAVEL = 2 * BW;

/** One frame of the Mirror's sheet and its scale. Frames: idle, frozen, glitching, dissolving. */
const MIRROR_FRAME = [340, 120] as const;
const MIRROR_SCALE = 0.5;
const MIRROR = { idle: 0, frozen: 1, glitch: 2, gone: 3 } as const;
/** A Mirror moving faster than this, in px/s, tears into its glitch frame. */
const GLITCH_SPEED = 420;
/** The second Mirror is drawn only once it is this far out of the ring, in px. */
const SPLIT_SHOWN = 40;
/** The second Mirror's part is three columns to the first's four: its picture is that much narrower. */
const SPLIT_WIDTH = 3 / 4;

/** The rail's light, and the heatmap's: a strip this tall, this far under the paddle line, in px. */
const RAIL_WIDTH = 2;
const HEAT_HEIGHT = 4;
const HEAT_GAP = 6;
const HEAT_BELOW = 16;
/** How long the heatmap takes to come up or go, in ms. */
const HEAT_FADE_MS = 900;

/** The eye's light at rest and how far it reaches; the Mirror's. */
const EYE_RADIUS = 170;
const EYE_LIGHT = 0.85;
const MIRROR_RADIUS = 80;
const MIRROR_LIGHT = 0.55;
/** The door's light at full width. */
const DOOR_RADIUS = 520;
const DOOR_LIGHT = 1;
/** The door: how wide it opens, in px, and how tall it stands. */
const DOOR_WIDTH = 150;
const DOOR_HEIGHT = 560;

/** A slow swell of the whole housing, and how slowly, in ms a breath. */
const BREATH = 0.008;
const BREATH_MS = 4200;
/** The entrance: the housing comes down this far, then the eye opens, then the Mirror forms. */
const ARRIVE_DROP = 140;
const ARRIVE_EYE = [0.45, 0.7] as const;
const ARRIVE_MIRROR = [0.72, 0.95] as const;
/** The death: the eye cracks, the Mirror goes to light over this long, in ms. */
const DISSOLVE_MS = 1600;
/** Once the fight is over, everything left fades out over this long, in ms. */
const GONE_MS = 600;

type Image = Phaser.GameObjects.Image;

/** A point a light can follow. */
interface Spot {
  x: number;
  y: number;
  active: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One drawn Mirror: its sprite, where it was last frame, and how fast it went. */
interface MirrorView {
  part: string;
  image: Image;
  spot: Spot;
  light?: Light;
  last?: { x: number; y: number };
  speed: number;
}

/**
 * The Overseer, drawn in pieces: a ring of cameras round a socket, the eye in it, four shutter
 * leaves that close over it, and the Mirror on its rail with the record of where you stand
 * burning along it. It holds no rules: the parts under it are the hit zones, and the fight tells
 * it what happened.
 */
export class OverseerRig implements BossRig {
  readonly focus = { x: 0, y: 0 };
  private readonly housing: Image;
  private readonly iris: Image;
  /** The light of the eye over the iris. */
  private readonly irisGlow: Image;
  private readonly leaves: Image[];
  private readonly mirrors: MirrorView[];
  private readonly ghost: Image;
  private readonly rail: Phaser.GameObjects.Graphics;
  private readonly door: Image;
  private readonly eyeSpot: Spot = { x: 0, y: 0, active: true };
  private readonly doorSpot: Spot = { x: 0, y: 0, active: true };
  private eyeLight?: Light;
  private doorLight?: Light;
  private readonly eyeHome: { x: number; y: number };
  private readonly lidHome?: { x: number; y: number };
  private readonly railY: number;
  private anim: BossAnim = 'idle';
  private clock = 0;
  private punch = 0;
  /** The glare on the beat. */
  private swell = 0;
  private lastBeat = Number.NaN;
  /** How far the shutter stands open, 0..1, read from where the lids are. */
  private open = 0;
  private arriveK = 1;
  private watchX: number;
  private readonly heat: number[] = Array.from({ length: HABIT_BINS }, () => 1 / HABIT_BINS);
  private forecastX: number | null = null;
  private heatShown = false;
  private heatK = 0;
  private stunMs = 0;
  private glitchMs = 0;
  private split = false;
  private ending: 'none' | 'dissolve' = 'none';
  private endMs = 0;
  private doorK = 0;
  private gone = false;
  /** 1 until the fight is over, then down to 0 over GONE_MS. */
  private goneK = 1;
  private readonly still: boolean;

  constructor(private readonly ctx: RigContext) {
    this.still = ctx.calm;
    const { scene, lighting } = ctx;
    this.eyeHome = { ...(ctx.homes.get('eye') ?? ctx.anchor) };
    const lid = ctx.homes.get('lidL');
    this.lidHome = lid ? { ...lid } : undefined;
    this.railY = (ctx.homes.get('mirror') ?? ctx.anchor).y;
    this.watchX = this.eyeHome.x;
    sliceSheet(scene, OVERSEER_KEYS.housing, HOUSING_FRAME, 2, 4);
    sliceSheet(scene, OVERSEER_KEYS.iris, IRIS_FRAME, 2, 4);
    sliceSheet(scene, OVERSEER_KEYS.mirror, MIRROR_FRAME, 1, 4);

    this.door = scene.add
      .image(0, 0, GLOW)
      .setBlendMode(ADD)
      .setTint(DAYLIGHT)
      .setAlpha(0)
      .setDepth(SPRITE_DEPTH - 0.1);
    this.housing = scene.add
      .image(0, 0, OVERSEER_KEYS.housing, String(HOUSING.lit))
      .setScale(HOUSING_SCALE)
      .setDepth(SPRITE_DEPTH);
    this.iris = scene.add
      .image(0, 0, OVERSEER_KEYS.iris, String(IRIS.calm))
      .setScale(IRIS_SCALE)
      .setDepth(SPRITE_DEPTH + 0.01);
    this.irisGlow = scene.add
      .image(0, 0, GLOW)
      .setBlendMode(ADD)
      .setTint(CYAN)
      .setAlpha(0)
      .setDepth(SPRITE_DEPTH + 0.015);
    this.leaves = LEAF_ANGLES.map((angle) =>
      scene.add
        .image(0, 0, OVERSEER_KEYS.shutter)
        .setOrigin(0.5, 1)
        .setScale(...LEAF_SCALE)
        .setRotation(angle)
        .setDepth(SPRITE_DEPTH + 0.02),
    );
    this.rail = scene.add.graphics().setDepth(SPRITE_DEPTH + 0.025);
    this.ghost = scene.add
      .image(0, 0, OVERSEER_KEYS.mirror, String(MIRROR.glitch))
      .setScale(MIRROR_SCALE)
      .setAlpha(0)
      .setDepth(SPRITE_DEPTH + 0.028);
    this.mirrors = ['mirror', 'mirror2']
      .filter((id) => ctx.homes.has(id))
      .map((part) => ({
        part,
        image: scene.add
          .image(0, 0, OVERSEER_KEYS.mirror, String(MIRROR.idle))
          .setScale(MIRROR_SCALE * (part === 'mirror2' ? SPLIT_WIDTH : 1), MIRROR_SCALE)
          .setDepth(SPRITE_DEPTH + 0.03),
        spot: { x: 0, y: 0, active: true },
        speed: 0,
      }));
    // The metal takes the room's light; the eye, the Mirror's lights and the rail make their own.
    lighting.addLit(this.housing);
    for (const leaf of this.leaves) lighting.addLit(leaf);
    this.eyeLight = lighting.addLight({
      follow: this.eyeSpot,
      radius: EYE_RADIUS,
      color: CYAN,
      intensity: EYE_LIGHT,
      flicker: 'steady',
      priority: 8,
      covered: true,
      relief: true,
    });
    for (const m of this.mirrors) {
      m.light = lighting.addLight({
        follow: m.spot,
        radius: MIRROR_RADIUS,
        color: CYAN,
        intensity: 0,
        flicker: 'steady',
        priority: 6,
        covered: true,
      });
    }
  }

  /** The iris turns toward `x` on the field: where the paddle is, or what the eye is after. */
  watch(x: number): void {
    this.watchX = x;
  }

  /** Where the paddle has tended to stand, as shares of the field's bins: it burns under the paddle line. */
  habits(shares: readonly number[]): void {
    for (let i = 0; i < this.heat.length; i++) this.heat[i] = shares[i] ?? 0;
  }

  /** Brings the heatmap up, or takes it away. */
  showHabits(on: boolean): void {
    this.heatShown = on;
  }

  /** The Mirror tears and flickers for `ms`: a feint. */
  glitch(ms: number): void {
    this.glitchMs = Math.max(this.glitchMs, ms);
  }

  /** A ghost of the Mirror where it means to go, or none. */
  forecast(x: number | null): void {
    this.forecastX = x;
  }

  /** The Mirror freezes over for `ms`. */
  stun(ms: number): void {
    this.stunMs = Math.max(this.stunMs, ms);
  }

  /** The housing breaks open and the second Mirror comes out: the last phase. */
  divide(): void {
    this.split = true;
  }

  /** The death begins: the eye cracks and the Mirrors go to Vesper's light. */
  dissolve(): void {
    if (this.ending !== 'none') return;
    this.ending = 'dissolve';
    this.endMs = 0;
    this.eyeLight?.kill();
    this.eyeLight = undefined;
    for (const m of this.mirrors) {
      m.light?.kill();
      m.light = undefined;
    }
  }

  /** The door behind the eye opens onto daylight, `k` from 0 (shut) to 1 (wide). */
  openDoor(k: number): void {
    this.doorK = clamp01(k);
    if (this.doorK > 0 && !this.doorLight) {
      this.doorLight = this.ctx.lighting.addLight({
        follow: this.doorSpot,
        radius: DOOR_RADIUS,
        color: DAYLIGHT,
        intensity: 0,
        flicker: 'steady',
        priority: 9,
        covered: true,
      });
    }
  }

  place(
    at: { x: number; y: number },
    parts: ReadonlyMap<string, { x: number; y: number }>,
    dt: number,
  ): void {
    this.clock += dt;
    this.endMs += dt;
    this.punch *= Math.exp(-dt / 110);
    this.swell *= Math.exp(-dt / 180);
    this.stunMs = Math.max(0, this.stunMs - dt);
    this.glitchMs = Math.max(0, this.glitchMs - dt);
    if (this.gone) this.goneK = Math.max(0, this.goneK - dt / GONE_MS);
    const fade = dt / HEAT_FADE_MS;
    this.heatK = clamp01(this.heatK + (this.heatShown ? fade : -fade));
    const { anchor } = this.ctx;
    const dx = at.x - anchor.x;
    const dy = at.y - anchor.y;
    const drop = this.still ? 0 : ARRIVE_DROP * (1 - cubicOut(this.arrival(0, ARRIVE_EYE[0])));
    const shown = this.arrival(0, 0.3);
    const eye = parts.get('eye');
    const ex = eye ? eye.x : this.eyeHome.x + dx;
    const ey = (eye ? eye.y : this.eyeHome.y + dy) - drop;
    const lid = parts.get('lidL');
    if (lid && this.lidHome) this.open = clamp01((this.lidHome.x + dx - lid.x) / LID_TRAVEL);
    else if (!lid) this.open = 1;

    this.placeDoor(ex, ey);
    const breath = this.still ? 0 : BREATH * Math.sin((2 * Math.PI * this.clock) / BREATH_MS);
    const hs = HOUSING_SCALE * (1 + breath + this.punch * 0.02);
    this.housing
      .setPosition(
        ex - (SOCKET_AT[0] - HOUSING_FRAME[0] / 2) * hs,
        ey - (SOCKET_AT[1] - HOUSING_FRAME[1] / 2) * hs,
      )
      .setScale(hs)
      .setFrame(String(this.housingFrame()))
      .setAlpha(shown * this.goneK);

    // The eye opens during the entrance and turns toward what it watches.
    const opened = this.arrival(ARRIVE_EYE[0], ARRIVE_EYE[1]);
    const look = this.ending === 'none' ? Math.max(-1, Math.min(1, (this.watchX - ex) / 200)) : 0;
    const jitter = this.still || this.ending === 'none' ? 0 : 2 * Math.sin(this.clock / 23);
    const ix = ex + look * IRIS_LOOK + jitter;
    const is = IRIS_SCALE * (1 + this.punch * 0.05);
    this.iris
      .setPosition(ix, ey)
      .setScale(is, is * (0.1 + 0.9 * opened))
      .setFrame(String(this.irisFrame()))
      .setAlpha(shown * this.goneK);
    const focusing = this.anim === 'tell';
    const color = focusing ? FOCUS : CYAN;
    const lit = this.ending === 'none' ? opened * (0.35 + 0.25 * this.swell + 0.25 * this.open) : 0;
    this.irisGlow
      .setPosition(ix, ey)
      .setDisplaySize(150, 150)
      .setTint(color)
      .setAlpha(clamp01(lit) * this.goneK);
    this.eyeSpot.x = ix;
    this.eyeSpot.y = ey;
    if (this.eyeLight) {
      this.eyeLight.intensity = EYE_LIGHT * opened * (0.6 + 0.4 * this.open) + 0.3 * this.swell;
      this.eyeLight.color = color;
    }

    this.placeLeaves(ex, ey, shown);
    this.placeMirrors(parts, dt);
    this.drawRail(shown);
    this.focus.x = ex;
    this.focus.y = (ey + this.railY + dy) / 2;
  }

  show(anim: BossAnim): void {
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
    this.eyeLight?.kill();
    this.eyeLight = undefined;
    for (const m of this.mirrors) {
      m.light?.kill();
      m.light = undefined;
    }
  }

  broken(): void {}

  beat(beats: number): void {
    const whole = Math.floor(beats);
    if (Number.isNaN(this.lastBeat)) this.lastBeat = whole;
    if (whole === this.lastBeat || this.gone || this.ending !== 'none') return;
    this.lastBeat = whole;
    this.swell = 1;
    this.ctx.scenery.pulse(0.15);
  }

  progress(): void {}

  destroy(): void {
    this.eyeLight?.kill();
    this.doorLight?.kill();
    for (const m of this.mirrors) m.light?.kill();
    const lighting = this.ctx.lighting;
    for (const img of [this.housing, ...this.leaves]) {
      lighting.removeLit(img);
      img.destroy();
    }
    for (const o of [
      this.iris,
      this.irisGlow,
      this.ghost,
      this.rail,
      this.door,
      ...this.mirrors.map((m) => m.image),
    ]) {
      o.destroy();
    }
  }

  /** 0..1 of the way from `from` to `to` through the entrance, 1 once it is over. */
  private arrival(from: number, to: number): number {
    return clamp01((this.arriveK - from) / (to - from));
  }

  private housingFrame(): number {
    if (this.ending !== 'none' || this.anim === 'death') return HOUSING.dead;
    if (this.split) return HOUSING.broken;
    if (this.anim === 'tell' || this.swell > 0.7 || this.punch > 0.6) return HOUSING.glare;
    return HOUSING.lit;
  }

  private irisFrame(): number {
    if (this.ending !== 'none' || this.anim === 'death')
      return this.endMs < 500 ? IRIS.hurt : IRIS.dead;
    if (this.punch > 0.55 || this.anim === 'hurt') return IRIS.hurt;
    if (this.anim === 'tell') return IRIS.focus;
    return IRIS.calm;
  }

  /** The four leaves: apex to the eye when shut, drawn back over the ring along the diagonals when open. */
  private placeLeaves(ex: number, ey: number, shown: number): void {
    const back = LEAF_OPEN * this.open;
    LEAF_ANGLES.forEach((angle, i) => {
      this.leaves[i]!.setPosition(
        ex + Math.sin(angle) * back,
        ey - Math.cos(angle) * back,
      ).setAlpha(shown * this.goneK);
    });
  }

  /** The Mirrors on the rail, a light under each, and the ghost of where one means to go. */
  private placeMirrors(parts: ReadonlyMap<string, { x: number; y: number }>, dt: number): void {
    const formed = this.arrival(ARRIVE_MIRROR[0], ARRIVE_MIRROR[1]);
    const dissolving = this.ending === 'dissolve' ? clamp01(this.endMs / DISSOLVE_MS) : 0;
    for (const m of this.mirrors) {
      const at = parts.get(m.part);
      if (!at) {
        m.image.setAlpha(m.image.alpha * Math.max(0, 1 - dt / 300));
        continue;
      }
      if (m.last && dt > 0) {
        const v = Math.hypot(at.x - m.last.x, at.y - m.last.y) / (dt / 1000);
        m.speed += (v - m.speed) * Math.min(1, dt / 80);
      }
      m.last ??= { x: 0, y: 0 };
      m.last.x = at.x;
      m.last.y = at.y;
      // The second Mirror waits inside the ring until the split brings it out.
      const out = m.part === 'mirror' ? 1 : clamp01((at.y - this.eyeHome.y) / SPLIT_SHOWN - 1);
      const frame =
        dissolving > 0
          ? MIRROR.gone
          : this.stunMs > 0
            ? MIRROR.frozen
            : m.speed > GLITCH_SPEED || formed < 1 || (this.glitchMs > 0 && m.part === 'mirror')
              ? MIRROR.glitch
              : MIRROR.idle;
      const tear = this.still || frame !== MIRROR.glitch ? 0 : 3 * Math.sin(this.clock / 17 + at.x);
      m.image
        .setPosition(at.x + tear, at.y)
        .setFrame(String(frame))
        .setAlpha(this.goneK * formed * out * (1 - dissolving) * (this.stunMs > 0 ? 0.75 : 1));
      m.spot.x = at.x;
      m.spot.y = at.y;
      if (m.light) {
        m.light.intensity = MIRROR_LIGHT * formed * out * (this.stunMs > 0 ? 0.3 : 1);
        m.light.color = this.stunMs > 0 ? FROST : CYAN;
      }
    }
    const ghosting = this.forecastX !== null && this.ending === 'none' && !this.gone;
    const flick = this.still ? 1 : 0.75 + 0.25 * Math.sin(this.clock / 41);
    this.ghost
      .setPosition(this.forecastX ?? 0, parts.get('mirror')?.y ?? this.railY)
      .setAlpha(ghosting ? 0.35 * flick : 0);
  }

  /** The rail across the field under the Mirror, and the heat of where you stand burning under the paddle. */
  private drawRail(shown: number): void {
    const g = this.rail.clear();
    if (shown <= 0 || this.goneK <= 0) return;
    const y = this.mirrors[0] ? this.mirrors[0].spot.y : this.railY;
    const formed = this.arrival(ARRIVE_MIRROR[0] - 0.2, ARRIVE_MIRROR[0]);
    const fading = this.ending === 'dissolve' ? 1 - clamp01(this.endMs / DISSOLVE_MS) : 1;
    const a = formed * fading * this.goneK;
    if (a <= 0) return;
    g.lineStyle(RAIL_WIDTH + 4, CYAN, 0.12 * a);
    g.lineBetween(0, y, FIELD_WIDTH, y);
    g.lineStyle(RAIL_WIDTH, CYAN, (0.55 + 0.3 * this.swell) * a);
    g.lineBetween(0, y, FIELD_WIDTH, y);
    const heat = a * this.heatK;
    if (heat <= 0) return;
    const bin = FIELD_WIDTH / this.heat.length;
    for (let i = 0; i < this.heat.length; i++) {
      const k = clamp01((this.heat[i]! * this.heat.length) / 2);
      if (k <= 0.02) continue;
      g.fillStyle(FOCUS, (0.15 + 0.7 * k) * heat);
      g.fillRect(i * bin + HEAT_GAP / 2, PADDLE_Y + HEAT_BELOW, bin - HEAT_GAP, HEAT_HEIGHT);
    }
  }

  /** The door of daylight, a slit behind the eye that widens to fill the room. */
  private placeDoor(ex: number, ey: number): void {
    const k = this.doorK;
    this.doorSpot.x = ex;
    this.doorSpot.y = ey;
    this.door
      .setPosition(ex, ey + DOOR_HEIGHT * 0.25)
      .setDisplaySize(8 + DOOR_WIDTH * k * 2, DOOR_HEIGHT * (0.6 + 0.4 * k))
      .setAlpha(clamp01(k * 1.4));
    if (this.doorLight) this.doorLight.intensity = DOOR_LIGHT * k;
  }
}

function cubicOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Names the frames of a sheet of `cols` columns, `count` frames, if it has not been already. */
function sliceSheet(
  scene: Phaser.Scene,
  key: string,
  frame: readonly [number, number],
  cols: number,
  count: number,
): void {
  const tex = scene.textures.get(key);
  if (tex.has(String(count - 1))) return;
  for (let i = 0; i < count; i++) {
    tex.add(
      String(i),
      0,
      (i % cols) * frame[0],
      Math.floor(i / cols) * frame[1],
      frame[0],
      frame[1],
    );
  }
}

/** The Overseer's pieces, and the rig that draws them. */
export function overseerRig(): RigFactory {
  const files = {
    housing: 'housing.png',
    iris: 'iris.png',
    shutter: 'shutter.png',
    mirror: 'mirror.png',
    packet: 'packet.png',
    skull: 'skull.png',
    decoy: 'decoy.png',
    slag: 'slag.png',
    splash: 'splash.png',
    shard: 'shard.png',
  } as const;
  return {
    assets: (Object.keys(files) as Array<keyof typeof files>).map((k) => ({
      key: OVERSEER_KEYS[k],
      path: `${DIR}/${files[k]}`,
    })),
    create: (ctx) => new OverseerRig(ctx),
  };
}
