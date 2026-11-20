import Phaser from 'phaser';
import { sceneryLight, type WorldMood } from '../art/lighting';
import { LIGHT_TEX } from '../art/lightTextures';
import { HEIGHT, HUD_HEIGHT, PADDLE_Y, WIDTH } from '../config';
import { hash, MAX_FLASH_HZ, noise1, sputter, type Blink } from '../core/Lighting';
import {
  BULB_COLORS,
  PARTY_TINT,
  PARTY_TOP,
  barHue,
  beamAngle,
  bulbLevel,
  kick,
  partyAmbient,
  partyTier,
  washHue,
} from '../core/Party';
import { solid } from '../ui/shapes';
import { audio } from './AudioSystem';
import type { Light, LightingSystem } from './LightingSystem';
import type { ParallaxBackdrop } from './ParallaxBackdrop';

/** World ambience layered over the light map. */
export interface MoodFx {
  update(dt: number, clock: number): void;
  onHit?(): void;
  /** `final` is false when another mood takes over in the same scene. */
  destroy(final?: boolean): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Crypt storms strike about this often (seconds) when the level doesn't set its own lightning. */
const STORM_LIGHTNING = 14;
/** Lights out: the room lights sputter about this often (seconds). */
const SPUTTER_INTERVAL = 11;
/** A sputter never starts this soon (seconds) after another flash, such as a lightning strike. */
const SPUTTER_QUIET = 1.5;

export function createMood(
  sys: LightingSystem,
  scene: Phaser.Scene,
  mood: WorldMood,
  scenery?: ParallaxBackdrop,
): MoodFx | undefined {
  const keyed = new KeyLight(sys);
  let fx: MoodFx | undefined;
  if (mood === 'forge') fx = new Forge(sys, scene);
  else if (mood === 'storm') fx = new Storm(sys);
  else if (mood === 'beat') fx = new Beat(sys);
  else if (mood === 'party') fx = new Party(sys, scene);
  // Lights-out levels only get lightning when the map asks; storms skip it with reduced motion.
  const stormy = mood === 'storm' && !sys.look.lightsOut && !sys.calm;
  const interval = sys.look.lightning ?? (stormy ? STORM_LIGHTNING : undefined);
  const failing = sys.look.lightsOut && sys.look.sputter ? new FailingLights(sys) : undefined;
  const lightning = interval
    ? new Lightning(sys, interval, scenery, () => failing?.active ?? false)
    : undefined;
  return {
    update: (dt, clock) => {
      sys.ambientScale = 1;
      sys.roomFlicker = 0;
      sys.roomTintK = 0;
      keyed.update(clock);
      fx?.update(dt, clock);
      lightning?.update(clock);
      failing?.update(clock);
    },
    onHit: () => fx?.onHit?.(),
    destroy: (final = true) => {
      keyed.destroy();
      fx?.destroy(final);
    },
  };
}

/** The world's big slow scene light (lava glow, moonlight, server glow), swaying gently. */
class KeyLight {
  private light?: Light;

  constructor(private sys: LightingSystem) {
    const k = sys.look.key;
    if (!k) return;
    this.light = sys.addLight({
      x: WIDTH * k.x,
      y: HEIGHT * k.y,
      radius: HEIGHT * k.radius,
      color: k.color,
      intensity: k.intensity * sceneryLight(sys.look),
      priority: 7,
    });
  }

  update(clock: number): void {
    const k = this.sys.look.key;
    if (!this.light || !k) return;
    const sway = this.sys.calm ? 0 : Math.sin(clock * 0.15) * k.sweep;
    this.light.x = WIDTH * (k.x + sway);
    this.light.y = HEIGHT * k.y;
    this.light.radius = HEIGHT * k.radius;
  }

  destroy(): void {
    this.light?.kill();
  }
}

// ---------------------------------------------------------------- Hell

/** A breathing furnace: the ambient swells, embers rise with their own light, heat shimmers. */
class Forge implements MoodFx {
  /** A scene's haze outlives a mood that is replaced, since the backdrop's filter keeps reading it. */
  private static hazes = new WeakMap<Phaser.Scene, Phaser.Textures.DynamicTexture>();
  private embers: Array<{ light: Light; vy: number; wobble: number }> = [];
  private haze?: Phaser.Textures.DynamicTexture;

  constructor(
    private sys: LightingSystem,
    private scene: Phaser.Scene,
  ) {
    if (sys.budgetInfo.moodLights) {
      for (let i = 0; i < 5; i++) {
        const light = sys.addLight({
          x: rand(30, WIDTH - 30),
          y: rand(HUD_HEIGHT, HEIGHT),
          radius: 56,
          color: 0xff7a2a,
          intensity: 0.3 * sceneryLight(sys.look),
          flicker: 'candle',
          phase: i * 1.7,
          halo: 7,
          haloAlpha: 0.45,
          haloDepth: -3,
          affects: 'backdrop',
          priority: 1,
        });
        this.embers.push({ light, vy: rand(22, 48), wobble: rand(0, Math.PI * 2) });
      }
    }
    const kept = Forge.hazes.get(scene);
    if (kept && scene.textures.exists('lm_haze')) {
      this.haze = kept;
    } else if (sys.budgetInfo.extras && !sys.calm) {
      if (scene.textures.exists('lm_haze')) scene.textures.remove('lm_haze');
      this.haze = scene.textures.addDynamicTexture('lm_haze', 64, 64) ?? undefined;
      if (this.haze) {
        Forge.hazes.set(scene, this.haze);
        sys.addHaze('lm_haze', 0.0035);
      }
    }
  }

  update(dt: number, clock: number): void {
    if (!this.sys.calm && !this.sys.look.lightsOut) {
      this.sys.ambientScale = 0.95 + 0.07 * noise1(clock * 0.45);
    }
    for (const e of this.embers) {
      const l = e.light;
      l.y -= e.vy * dt;
      l.x += Math.sin(clock * 1.3 + e.wobble) * 14 * dt;
      if (l.y < HUD_HEIGHT - 30) {
        l.y = HEIGHT + 30;
        l.x = rand(30, WIDTH - 30);
      }
    }
    if (this.haze) {
      // Scroll the noise upward so the shimmer rises with the heat.
      const off = (clock * 18) % 64;
      this.haze.stamp(LIGHT_TEX.noise, undefined, 0, -off, { originX: 0, originY: 0 });
      this.haze.stamp(LIGHT_TEX.noise, undefined, 0, 64 - off, { originX: 0, originY: 0 });
      this.haze.render();
    }
  }

  destroy(final = true): void {
    for (const e of this.embers) e.light.kill();
    if (!final) return;
    Forge.hazes.delete(this.scene);
    if (this.haze && this.scene.textures.exists('lm_haze')) this.scene.textures.remove('lm_haze');
  }
}

// ---------------------------------------------------------------- Crypt

/** Moonlight through stained glass and drifting wisps. The storm's lightning is `Lightning`. */
class Storm implements MoodFx {
  private windows: Array<{ light: Light; base: number }> = [];
  private wisps: Light[] = [];

  constructor(private sys: LightingSystem) {
    if (!sys.budgetInfo.moodLights) return;
    const top = HUD_HEIGHT - 6;
    for (const [fx, deg] of [
      [0.16, -14],
      [0.6, 11],
    ] as const) {
      const light = sys.addLight({
        x: WIDTH * fx,
        y: top,
        area: {
          width: 120,
          height: HEIGHT * 0.62,
          rotation: (deg * Math.PI) / 180,
          cookie: 'stained',
        },
        color: 0xfff1dc,
        intensity: 0.3 * sceneryLight(sys.look),
        affects: 'backdrop',
        priority: 2,
      });
      this.windows.push({ light, base: (deg * Math.PI) / 180 });
    }
    for (let i = 0; i < 2; i++) {
      this.wisps.push(
        sys.addLight({
          radius: 72,
          color: 0x7fe8ff,
          intensity: 0.3 * sceneryLight(sys.look),
          flicker: 'breathe',
          phase: i * 3,
          halo: 10,
          haloAlpha: 0.4,
          haloDepth: -3,
          // In the dark they would show the bricks they drift past.
          affects: sys.look.lightsOut ? 'backdrop' : 'both',
          priority: 1,
        }),
      );
    }
  }

  update(_dt: number, clock: number): void {
    for (const [i, w] of this.windows.entries()) {
      w.light.area!.rotation = w.base + (this.sys.calm ? 0 : Math.sin(clock * 0.22 + i * 2) * 0.04);
    }
    for (const [i, l] of this.wisps.entries()) {
      l.x = WIDTH * (0.5 + 0.4 * Math.sin(clock * 0.11 * (i + 1) + i * 2.1));
      l.y = HUD_HEIGHT + (PADDLE_Y - HUD_HEIGHT) * (0.5 + 0.32 * Math.sin(clock * 0.17 + i * 1.3));
    }
  }

  destroy(): void {
    for (const w of this.windows) w.light.kill();
    for (const l of this.wisps) l.kill();
  }
}

/**
 * Lightning: one or two flashes per strike, with thunder from the first flash that shows.
 * Strikes come seconds apart and every flash must pass flashAmbient's MAX_FLASH_HZ limit, well
 * under the three-per-second photosensitivity guideline. On lights-out levels a strike shows
 * the layout for a moment. With reduced motion a strike is one slow swell with no strike light.
 */
class Lightning {
  private nextStrike: number;
  private flashes: number[] = [];
  private thundered = true;

  constructor(
    private sys: LightingSystem,
    private interval: number,
    private scenery?: ParallaxBackdrop,
    /** True while the room lights sputter; a strike then waits so its flash isn't dropped. */
    private busy: () => boolean = () => false,
  ) {
    // Not during a lights-out level's preview, while the layout is still lit.
    this.nextStrike = sys.time + (sys.look.preview ?? 0) + 1 + interval * rand(0.3, 0.6);
  }

  update(clock: number): void {
    if (this.sys.held) {
      this.flashes = [];
      this.nextStrike = Math.max(this.nextStrike, clock + 1);
      return;
    }
    if (clock >= this.nextStrike && this.busy()) this.nextStrike = clock + 1;
    if (clock >= this.nextStrike) {
      this.nextStrike = clock + this.interval * rand(0.6, 1.4);
      this.flashes = [clock];
      // Two flashes 0.2 s apart stay within MAX_FLASH_HZ.
      if (!this.sys.calm && Math.random() < 0.55) {
        this.flashes.push(clock + Math.max(0.2, 1 / MAX_FLASH_HZ / 2));
      }
      this.thundered = false;
    }
    while (this.flashes.length && clock >= this.flashes[0]!) {
      this.flashes.shift();
      const x = this.strike();
      if (x !== undefined && !this.thundered) {
        this.thundered = true;
        audio.thunder(rand(0.3, 0.45), x);
      }
    }
  }

  /** Where the bolt struck, so the thunder can come from there; undefined when it was dropped. */
  private strike(): number | undefined {
    const dark = this.sys.look.lightsOut;
    if (!this.sys.flashAmbient(0xc8d4ff, dark ? 0.15 : 0.3)) return undefined;
    this.sys.revealLevel(0.8);
    if (this.sys.calm) return WIDTH / 2;
    const x = rand(80, WIDTH - 80);
    this.sys.addLight({
      x,
      y: HUD_HEIGHT - 40,
      radius: HEIGHT * 0.9,
      color: 0xbfd0ff,
      intensity: 0.6,
      lifeMs: 420,
      priority: 9,
    });
    this.scenery?.flash(0.2);
    return x;
  }
}

/**
 * Lights out: now and then the dead room lights sputter back on, buzzing, and die again. Each
 * blink shows the layout for a moment and books its flash with the lighting system, which
 * shares the MAX_FLASH_HZ limit with lightning. With reduced motion a sputter is one faint,
 * slow swell.
 */
class FailingLights {
  private nextAt: number;
  private blinks: Blink[] = [];
  /** Blinks that lost the flash limit to something else; they stay dark. */
  private dropped = new Set<Blink>();
  private start = 0;
  private due = 0;

  constructor(private sys: LightingSystem) {
    this.nextAt = sys.time + (sys.look.preview ?? 0) + rand(2.5, 5);
  }

  get active(): boolean {
    return this.blinks.length > 0;
  }

  update(clock: number): void {
    if (this.sys.held) {
      this.blinks = [];
      this.nextAt = Math.max(this.nextAt, clock + SPUTTER_QUIET);
      return;
    }
    if (!this.active) {
      if (clock < this.nextAt || this.sys.relit) return;
      if (this.sys.sinceFlash < SPUTTER_QUIET) {
        this.nextAt = clock + SPUTTER_QUIET;
        return;
      }
      this.blinks = this.sys.calm ? [{ at: 0, hold: 2.4, level: 0.3 }] : sputter();
      this.dropped.clear();
      this.start = clock;
      this.due = 0;
    }
    const t = clock - this.start;
    while (this.due < this.blinks.length && t >= this.blinks[this.due]!.at) {
      const b = this.blinks[this.due++]!;
      if (this.sys.claimFlash()) audio.flicker(this.sys.calm ? 0.12 : 0.3);
      else this.dropped.add(b);
    }
    for (const b of this.blinks) {
      const u = t - b.at;
      if (u < 0 || u >= b.hold || this.dropped.has(b)) continue;
      let level = b.level;
      // A long hold never settles: the tube hums and wavers before it gives out.
      if (this.sys.calm) level *= Math.sin((Math.PI * u) / b.hold);
      else if (b.hold > 0.3) level *= 0.7 + 0.3 * noise1(clock * 13);
      this.sys.roomFlicker = Math.max(this.sys.roomFlicker, level);
    }
    const last = this.blinks[this.blinks.length - 1]!;
    if (t >= last.at + last.hold) {
      this.blinks = [];
      this.nextAt = clock + SPUTTER_INTERVAL * rand(0.6, 1.4);
    }
  }
}

// ---------------------------------------------------------------- Mainframe

/** Lights pulse with the music's bass, scanners sweep, data packets race along traces. */
class Beat implements MoodFx {
  private avg = 0;
  private env = 0;
  private lastGlitch = -1;
  private clock = 0;
  private scanners: Array<{ light: Light; px: number; base: number; dir: number }> = [];
  private nextPacket = 1.5;

  constructor(private sys: LightingSystem) {
    if (!sys.budgetInfo.moodLights) return;
    const colors = [0x22d3ff, 0xff3ad6];
    for (const [i, px] of [0.12, 0.88].entries()) {
      const light = sys.addLight({
        area: { width: 80, height: HEIGHT * 0.85, cookie: 'shaft' },
        color: colors[i]!,
        intensity: 0.2 * sceneryLight(sys.look),
        affects: 'backdrop',
        priority: 2,
      });
      this.scanners.push({ light, px, base: i === 0 ? -0.35 : 0.35, dir: i === 0 ? 1 : -1 });
    }
  }

  update(dt: number, clock: number): void {
    this.clock = clock;
    const level = audio.musicLevel();
    let beat: number;
    if (level === undefined) {
      // No analyser (muted, Canvas audio): a steady 120 BPM pulse.
      beat = Math.max(0, 1 - ((clock * 2) % 1) * 5);
    } else {
      this.avg += (level - this.avg) * Math.min(1, dt * 1.5);
      beat = Math.min(1, Math.max(0, (level - this.avg) * 5));
    }
    this.env = Math.max(beat, this.env * Math.exp(-dt * 7));
    const env = this.sys.calm ? this.env * 0.3 : this.env;
    // A blackout stays black: the bass pulse only lifts the room as much as `darkness` allows.
    const room = sceneryLight(this.sys.look);
    this.sys.ambientScale = 1 - (1 - (0.93 + 0.14 * env)) * room;

    for (const s of this.scanners) {
      const swing = this.sys.calm ? 0 : Math.sin(clock * 0.45) * 0.3 * s.dir;
      const rot = s.base + swing;
      const area = s.light.area!;
      area.rotation = rot;
      // Pivot at the top center of the beam, not its corner.
      s.light.x = WIDTH * s.px - Math.cos(rot) * (area.width / 2);
      s.light.y = HUD_HEIGHT - 10 - Math.sin(rot) * (area.width / 2);
      s.light.gain = 0.7 + 0.6 * env;
    }

    if (this.sys.budgetInfo.moodLights && clock >= this.nextPacket) {
      this.nextPacket = clock + rand(1.2, 3);
      this.packet();
    }
  }

  /** A pulse racing along an L-shaped trace across the backdrop. */
  private packet(): void {
    const y0 = rand(HUD_HEIGHT + 20, PADDLE_Y - 60);
    const x0 = Math.random() < 0.5 ? -20 : WIDTH + 20;
    const xm = rand(WIDTH * 0.25, WIDTH * 0.75);
    const y1 = y0 + (Math.random() < 0.5 ? -1 : 1) * rand(60, 160);
    const points = [
      { x: x0, y: y0 },
      { x: xm, y: y0 },
      { x: xm, y: y1 },
    ];
    const speed = 420;
    const length = Math.abs(xm - x0) + Math.abs(y1 - y0);
    this.sys.addLight({
      radius: 44,
      color: Math.random() < 0.7 ? 0x22d3ff : 0xff3ad6,
      intensity: 0.4 * sceneryLight(this.sys.look),
      halo: 6,
      haloAlpha: 0.45,
      haloDepth: -3,
      affects: 'backdrop',
      priority: 1,
      path: { points, pingpong: false, speed },
      lifeMs: (length / speed) * 1000,
    });
  }

  onHit(): void {
    if (this.sys.calm || this.clock - this.lastGlitch < 0.4 || Math.random() > 0.3) return;
    this.lastGlitch = this.clock;
    this.sys.dip(0.4);
  }

  destroy(): void {
    for (const s of this.scanners) s.light.kill();
  }
}

// ---------------------------------------------------------------- Bonus stages

/** Bulbs hang about this far apart along a string, in px. */
const BULB_GAP = 25;
/** A bulb's glow and its filament, across, in px. */
const BULB_GLOW = 30;
const BULB_CORE = 7;
/** A tier's lights fade in over about this long, and out over about this long (s). */
const PARTY_IN_S = 0.35;
const PARTY_OUT_S = 0.7;
/** With no song to follow, the party keeps this tempo. */
const PARTY_BPM = 120;
/** Losing a tier blacks the bulbs out for this long (s). */
const POWER_CUT_S = 0.3;
/** The rave's tint: a deep indigo. */
const RAVE_TINT = 0x4a3ca8;
/** The mirror ball hangs this far under the HUD, and waits this far above it, in px. */
const BALL_DROP = 64;
const BALL_HIDE = -40;
const BALL_KEY = 'party_ball';
const BALL_SIZE = 40;
const CORD_W = 1.5;
/** Specks the mirror ball throws, and how many beats it takes to turn once. */
const SPECKS = 36;
const BALL_TURN_BEATS = 32;
const SPECK_COLORS = [0xffffff, 0xffd0ec, 0xd0e8ff] as const;
const SPECK_SIZE = 18;
/**
 * The party's own glow, drawn over the backdrop rather than lighting it: coloured light only
 * shows on art of its own colour, and these must read over any world, on every quality tier.
 */
const GLOW_DEPTH = -2.5;
const BEAM_KEY = 'party_beam';
const BEAM_W = 170;
const BEAM_LEN = HEIGHT * 0.88;
/** Where the moving heads hang, as a share of the width. */
const HEAD_X = [0.12, 0.37, 0.63, 0.88] as const;

interface Bulb {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  i: number;
  n: number;
  dir: 1 | -1;
}

/**
 * A bonus stage's party: the lights keep time with the music and step up with the combo, and with
 * the stage's clock, so every player reaches the top before the end. Steady bulbs at first; past
 * each step the bulbs chase, colour washes thump in from the sides, and at the top the room goes
 * dark for moving heads and a mirror ball. Losing a step cuts the power for a moment. Reduced
 * motion keeps the colour and drops the motion.
 */
class Party implements MoodFx {
  private beats = 0;
  private tier = 0;
  /** How far each tier's lights have faded in, 0..1. */
  private on = new Array<number>(PARTY_TOP + 1).fill(0);
  private cutUntil = -1;
  private rows: Bulb[][] = [];
  private spill: Light[] = [];
  private washes: Light[] = [];
  private floor?: Light;
  private heads: Array<{ light: Light; px: number }> = [];
  private sideGlows: Phaser.GameObjects.Image[] = [];
  private floorGlow?: Phaser.GameObjects.Image;
  private beams: Phaser.GameObjects.Image[] = [];
  private ball?: Phaser.GameObjects.Image;
  private cord?: Phaser.GameObjects.Image;
  private ballY = HUD_HEIGHT + BALL_HIDE;
  private specks: Array<{ image: Phaser.GameObjects.Image; angle: number; fy: number }> = [];

  constructor(
    private sys: LightingSystem,
    private scene: Phaser.Scene,
  ) {
    // The party is the stage's whole show, so its washes and heads light on every tier; only the
    // floor and the bulbs' spill wait for a budget with room for mood lights.
    for (const x of [-40, WIDTH + 40]) {
      this.washes.push(sys.addLight({ x, y: HEIGHT * 0.62, radius: 440, intensity: 1.1, priority: 1 }));
    }
    if (sys.budgetInfo.moodLights) {
      this.floor = sys.addLight({
        x: WIDTH / 2,
        y: PADDLE_Y + 40,
        radius: 320,
        intensity: 0.9,
        affects: 'backdrop',
        priority: 1,
      });
    }
    for (const px of HEAD_X) {
      const light = sys.addLight({
        area: { width: 70, height: HEIGHT * 0.95, cookie: 'shaft' },
        intensity: 0.8,
        priority: 1,
      });
      this.heads.push({ light, px });
    }
    const glow = (x: number, y: number, key: string) =>
      scene.add.image(x, y, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH).setAlpha(0);
    for (const x of [0, WIDTH]) {
      this.sideGlows.push(glow(x, HEIGHT * 0.55, LIGHT_TEX.halo).setDisplaySize(WIDTH, HEIGHT * 0.95));
    }
    this.floorGlow = glow(WIDTH / 2, PADDLE_Y + 40, LIGHT_TEX.halo).setDisplaySize(WIDTH * 1.3, 320);
    const beam = beamTexture(scene);
    for (const px of HEAD_X) {
      this.beams.push(glow(WIDTH * px, HUD_HEIGHT - 6, beam).setOrigin(0.5, 0).setDisplaySize(BEAM_W, BEAM_LEN));
    }
    this.cord = solid(scene, WIDTH / 2, 0, CORD_W, 1, 0xb4b4c8, 0.8)
      .setOrigin(0.5, 0)
      .setDepth(-2);
    this.ball = scene.add.image(WIDTH / 2, this.ballY, ballTexture(scene)).setDepth(-2);
    for (let i = 0; i < SPECKS; i++) {
      const image = scene.add
        .image(0, 0, LIGHT_TEX.halo)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-3)
        .setTint(SPECK_COLORS[i % SPECK_COLORS.length]!)
        .setVisible(false);
      this.specks.push({ image, angle: hash(i * 2 + 1) * Math.PI * 2, fy: hash(i * 2 + 2) });
    }
  }

  update(dt: number, clock: number): void {
    const { sys } = this;
    this.beats = audio.musicBeat() ?? this.beats + (dt * PARTY_BPM) / 60;
    const tier = partyTier(sys.combo, sys.stageClock);
    if (tier < this.tier) this.powerCut(clock);
    this.tier = tier;
    for (let t = 1; t <= PARTY_TOP; t++) {
      const want = tier >= t ? 1 : 0;
      const step = dt / (want > this.on[t]! ? PARTY_IN_S : PARTY_OUT_S);
      this.on[t] = Phaser.Math.Clamp(want, this.on[t]! - step, this.on[t]! + step);
    }
    const wash = this.on[2]!;
    const rave = this.on[PARTY_TOP]!;
    const beat = kick(this.beats);
    const thump = sys.calm ? 0.3 : beat;
    sys.ambientScale = partyAmbient(rave, wash, beat, sys.calm);
    sys.roomTint = RAVE_TINT;
    sys.roomTintK = PARTY_TINT * rave + 0.2 * wash;

    this.hangNew();
    const cut = clock < this.cutUntil;
    for (const [r, row] of this.rows.entries()) {
      let sum = 0;
      for (const b of row) {
        const k = cut ? 0.05 : bulbLevel(b.i, b.n, this.beats, tier, b.dir, sys.calm);
        sum += k;
        const color = tier > 0 ? BULB_COLORS[b.i % BULB_COLORS.length]! : BULB_COLORS[0];
        const size = BULB_GLOW * (0.6 + 0.4 * k);
        b.glow
          .setTint(color)
          .setAlpha(0.85 * k)
          .setDisplaySize(size, size);
        b.core.setAlpha(Math.min(1, 0.25 + k));
      }
      const spill = this.spill[r];
      if (spill) spill.gain = row.length ? sum / row.length : 0;
    }

    for (const [i, w] of this.washes.entries()) {
      w.color = washHue(this.beats, i);
      w.gain = wash * (0.45 + 0.55 * thump);
    }
    for (const [i, g] of this.sideGlows.entries()) {
      g.setTint(washHue(this.beats, i)).setAlpha(wash * (0.3 + 0.15 * thump));
    }
    if (this.floor) {
      this.floor.color = barHue(this.beats, 2);
      this.floor.gain = wash * (0.3 + 0.7 * thump);
    }
    this.floorGlow?.setTint(barHue(this.beats, 2)).setAlpha(wash * (0.2 + 0.15 * thump));
    const top = HUD_HEIGHT - 6;
    for (const [i, h] of this.heads.entries()) {
      const rot = beamAngle(i, this.beats, sys.calm);
      const area = h.light.area!;
      area.rotation = rot;
      // Pivot at the top center of the beam, not its corner.
      h.light.x = WIDTH * h.px - Math.cos(rot) * (area.width / 2);
      h.light.y = top - Math.sin(rot) * (area.width / 2);
      h.light.color = barHue(this.beats, i % 2);
      h.light.gain = rave * (0.55 + 0.45 * thump);
    }
    for (const [i, b] of this.beams.entries()) {
      b.setRotation(beamAngle(i, this.beats, sys.calm))
        .setTint(barHue(this.beats, i % 2))
        .setAlpha(rave * (0.3 + 0.15 * thump));
    }
    this.updateBall(dt, rave, beat);
  }

  /** The mirror ball drops in for the rave and throws its specks around the room. */
  private updateBall(dt: number, rave: number, beat: number): void {
    const want = HUD_HEIGHT + (rave > 0.01 ? BALL_DROP : BALL_HIDE);
    this.ballY += (want - this.ballY) * Math.min(1, dt * 4);
    const shown = this.ballY > HUD_HEIGHT + BALL_HIDE + 1;
    this.ball?.setVisible(shown).setY(this.ballY);
    if (this.ball && !this.sys.calm) this.ball.rotation = this.beats * 0.15;
    this.cord
      ?.setVisible(shown)
      .setY(HUD_HEIGHT)
      .setDisplaySize(CORD_W, Math.max(1, this.ballY - BALL_SIZE / 2 - HUD_HEIGHT));
    const turn = this.sys.calm ? 0 : (Math.PI * 2 * this.beats) / BALL_TURN_BEATS;
    const from = this.ballY + BALL_SIZE;
    const twinkleBeat = Math.floor(this.beats);
    for (const [i, s] of this.specks.entries()) {
      const a = s.angle + turn;
      const front = Math.cos(a);
      const k = rave * Math.sqrt(Math.max(0, front));
      s.image.setVisible(k > 0.02);
      if (k <= 0.02) continue;
      const twinkle = !this.sys.calm && (i + twinkleBeat) % 5 === 0 ? 0.75 + 0.25 * beat : 0.75;
      s.image
        .setPosition(
          WIDTH / 2 + WIDTH * 0.66 * Math.sin(a) * (0.55 + 0.45 * s.fy),
          from + (PADDLE_Y - from) * s.fy,
        )
        .setAlpha(k * twinkle)
        .setDisplaySize(SPECK_SIZE, SPECK_SIZE);
    }
  }

  /** Bulbs for strings the stage has hung since the last frame; none for strings taken down. */
  private hangNew(): void {
    const { bulbs } = this.sys;
    if (this.rows.length > bulbs.length) this.takeDown();
    while (this.rows.length < bulbs.length) {
      const s = bulbs[this.rows.length]!;
      const n = Math.max(2, Math.round((s.x1 - s.x0) / BULB_GAP));
      const dir = this.rows.length % 2 ? -1 : 1;
      const row: Bulb[] = [];
      for (let i = 0; i < n; i++) {
        const x = s.x0 + ((i + 0.5) * (s.x1 - s.x0)) / n;
        const glow = this.scene.add
          .image(x, s.y, LIGHT_TEX.halo)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(s.depth + 0.01);
        const core = this.scene.add
          .image(x, s.y, LIGHT_TEX.halo)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(s.depth + 0.02)
          .setTint(0xfff6e0)
          .setDisplaySize(BULB_CORE, BULB_CORE);
        row.push({ glow, core, i, n, dir });
      }
      this.rows.push(row);
      if (this.sys.budgetInfo.moodLights) {
        this.spill.push(
          this.sys.addLight({
            x: s.x0,
            y: s.y - 28,
            area: { width: s.x1 - s.x0, height: 56 },
            color: BULB_COLORS[0],
            intensity: 0.3,
            priority: 1,
          }),
        );
      }
    }
  }

  /** A step of the combo is lost: the bulbs black out for a moment and the room dips. */
  private powerCut(clock: number): void {
    if (this.sys.calm) return;
    this.cutUntil = clock + POWER_CUT_S;
    if (this.tier >= 2 && this.sys.claimFlash()) this.sys.dip(0.45);
  }

  private takeDown(): void {
    for (const l of this.spill) l.kill();
    for (const b of this.rows.flat()) {
      b.glow.destroy();
      b.core.destroy();
    }
    this.spill = [];
    this.rows = [];
  }

  destroy(): void {
    this.takeDown();
    for (const l of [...this.washes, ...this.heads.map((h) => h.light)]) l.kill();
    this.floor?.kill();
    for (const g of [...this.sideGlows, ...this.beams]) g.destroy();
    this.floorGlow?.destroy();
    for (const s of this.specks) s.image.destroy();
    this.ball?.destroy();
    this.cord?.destroy();
  }
}

/** A mirror ball's facets, painted once per game. */
function ballTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(BALL_KEY)) return BALL_KEY;
  const tex = scene.textures.createCanvas(BALL_KEY, BALL_SIZE, BALL_SIZE);
  if (!tex) return BALL_KEY;
  const ctx = tex.getContext();
  const r = BALL_SIZE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#5a5f78';
  ctx.fillRect(0, 0, BALL_SIZE, BALL_SIZE);
  for (let j = 0; j < BALL_SIZE / 4; j++) {
    for (let i = 0; i < BALL_SIZE / 4; i++) {
      const v = 0.45 + 0.55 * hash(i * 13 + j * 71);
      ctx.fillStyle = `rgb(${Math.round(200 * v + 40)},${Math.round(205 * v + 40)},${Math.round(225 * v + 30)})`;
      ctx.fillRect(i * 4 + 0.5, j * 4 + 0.5, 3, 3);
    }
  }
  const shade = ctx.createRadialGradient(r * 0.7, r * 0.7, 2, r, r, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.25)');
  shade.addColorStop(0.6, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, BALL_SIZE, BALL_SIZE);
  ctx.restore();
  tex.refresh();
  return BALL_KEY;
}

/** A moving head's beam in haze: a narrow cone from the rig, fading toward the floor. */
function beamTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(BEAM_KEY)) return BEAM_KEY;
  const w = 64;
  const h = 256;
  const tex = scene.textures.createCanvas(BEAM_KEY, w, h);
  if (!tex) return BEAM_KEY;
  const ctx = tex.getContext();
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = fade;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 3, 0);
  ctx.lineTo(w / 2 + 3, 0);
  ctx.lineTo(w - 6, h);
  ctx.lineTo(6, h);
  ctx.closePath();
  ctx.fill();
  tex.refresh();
  return BEAM_KEY;
}
