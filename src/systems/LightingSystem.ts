import Phaser from 'phaser';
import type { WorldId } from '../art/backdrops';
import { LIGHTING_LOOKS, resolveLook, sceneryLight, type LightingLook } from '../art/lighting';
import { hasNormalMap } from '../art/foreground';
import {
  LIGHT_TEX,
  PX_SIZE,
  SOFT_SIZE,
  cookieKey,
  ensureLightTextures,
} from '../art/lightTextures';
import { HEIGHT, LEVEL_OFFSET_Y, STAGE_W, WIDTH, WING } from '../config';
import {
  accumulate,
  blue,
  flickerAt,
  green,
  MAX_FLASH_HZ,
  mixColor,
  pointOnPath,
  red,
  rgbToColor,
  selectLights,
  type Budgeted,
  type Cookie,
  type Flicker,
  type LevelLightingSpec,
  type LightAffects,
  type LightSpec,
  type SampleLight,
} from '../core/Lighting';
import type { LevelSpec } from '../core/types';
import type { Brick } from '../entities/Brick';
import { save } from '../services';
import { createMood, type MoodFx } from './LightingMoods';
import type { ParallaxBackdrop } from './ParallaxBackdrop';
import { LIGHTING_BUDGETS, lightingTier, type LightingBudget, type LightingTier } from './Quality';
import { ReliefLighting } from './ReliefLighting';

/** Above the backdrop (-100..-90), below everything that plays. */
const DEPTH = -50;
/** Playfield units drawn beyond each edge so camera shake never exposes an unlit border. */
const PAD = 16;
const MAP_KEY = 'lm_map';
const STATIC_KEY = 'lm_static';
const SHADOW_KEY = 'lm_shadow';
const CAST_KEY = 'lm_cast';
/** A shadow's darkness at its tip, as a share of its darkness at the brick. */
const SHADOW_TIP = 0.15;
/** Stamps per shadow sweep: one per light-map pixel of length, up to this many. */
const MAX_SHADOW_STEPS = 16;
/** Normal levels: ambient rises from this fraction while the bricks drop in. */
const INTRO_AMBIENT = 0.6;
const INTRO_S = 0.9;
/** Lights out: after the level's preview time the layout fades to dark over this long. */
const FADE_S = 0.9;
/** Brick shadows wait for the drop-in animation to settle. */
const SHADOW_DELAY_S = 1.1;
const IGNITE_S = 0.35;
/** Reduced motion turns flashes into gentle swells. */
const CALM_FLASH = 0.35;

/** Anything a light can ride on: balls, pickups, lasers, bricks. Inactive targets end the light. */
export interface Followable {
  x: number;
  y: number;
  active: boolean;
  visible?: boolean;
}

export interface LightOptions {
  x?: number;
  y?: number;
  radius?: number;
  color?: number;
  intensity?: number;
  flicker?: Flicker;
  speed?: number;
  phase?: number;
  affects?: LightAffects;
  follow?: Followable;
  /** Additive glow sprite drawn over the scene, in playfield units of radius. 0 for none. */
  halo?: number;
  haloAlpha?: number;
  haloDepth?: number;
  /** Fades out and removes itself after this long. 0 lives until killed. */
  lifeMs?: number;
  /** Radius multiplier reached at the end of `lifeMs`. */
  grow?: number;
  /** Darkens instead of lighting (the Black Hole). */
  negative?: boolean;
  /** Survives the per-frame budget first. Gameplay 5+, decoration 0-2. */
  priority?: number;
  area?: { width: number; height: number; rotation?: number; cookie?: Cookie };
  path?: { points: Array<{ x: number; y: number }>; pingpong: boolean; speed: number };
  /** Steady authored lights are drawn once into the static map instead of every frame. */
  baked?: boolean;
  /** Seconds after the level starts when this light switches on. */
  igniteAt?: number;
  /** High tier: also lights brick and paddle bevels per pixel. Keep to a few strong lights. */
  relief?: boolean;
  /**
   * Shine even when `follow` is hidden. A boss part is an invisible hit zone under the picture,
   * and its light is the glow on that picture.
   */
  covered?: boolean;
}

export class Light implements Budgeted {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker: Flicker;
  speed: number;
  phase: number;
  affects: LightAffects;
  priority: number;
  negative: boolean;
  baked: boolean;
  readonly relief: boolean;
  readonly covered: boolean;
  /** Current brightness including flicker, fades and ignition. */
  level = 0;
  /** Extra multiplier for callers (fades, moods); keeps `intensity` as authored. */
  gain = 1;
  dead = false;
  follow?: Followable;
  halo: number;
  haloAlpha: number;
  haloDepth: number;
  haloImage?: Phaser.GameObjects.Image;
  area?: { width: number; height: number; rotation: number; cookie: Cookie };
  path?: {
    points: Array<{ x: number; y: number }>;
    pingpong: boolean;
    speed: number;
    dist: number;
  };
  readonly baseRadius: number;
  readonly lifeMs: number;
  readonly grow: number;
  readonly igniteAt: number;
  age = 0;
  ignite = 1;

  constructor(o: LightOptions) {
    this.x = o.x ?? o.follow?.x ?? 0;
    this.y = o.y ?? o.follow?.y ?? 0;
    this.color = o.color ?? 0xffffff;
    this.intensity = o.intensity ?? 1;
    this.flicker = o.flicker ?? 'steady';
    this.speed = o.speed ?? 1;
    this.phase = o.phase ?? 0;
    this.affects = o.affects ?? 'both';
    this.priority = o.priority ?? 3;
    this.negative = o.negative ?? false;
    this.baked = o.baked ?? false;
    this.relief = o.relief ?? false;
    this.covered = o.covered ?? false;
    this.follow = o.follow;
    this.halo = o.halo ?? 0;
    this.haloAlpha = o.haloAlpha ?? 0.7;
    this.haloDepth = o.haloDepth ?? 4;
    this.lifeMs = o.lifeMs ?? 0;
    this.grow = o.grow ?? 1;
    this.igniteAt = o.igniteAt ?? -1;
    if (o.area) {
      this.area = {
        width: o.area.width,
        height: o.area.height,
        rotation: o.area.rotation ?? 0,
        cookie: o.area.cookie ?? 'none',
      };
      this.radius = Math.hypot(o.area.width, o.area.height);
    } else {
      this.radius = o.radius ?? 96;
    }
    this.baseRadius = this.radius;
    if (o.path && o.path.points.length > 0) this.path = { ...o.path, dist: 0 };
  }

  kill(): void {
    this.dead = true;
  }

  /** Whether this light can live in the static map: steady, still, permanent and lit. */
  get still(): boolean {
    return (
      this.baked &&
      this.flicker === 'steady' &&
      !this.follow &&
      !this.path &&
      this.lifeMs === 0 &&
      !this.negative &&
      this.ignite >= 1 &&
      this.gain === 1
    );
  }

  step(dt: number, clock: number, calm: boolean): void {
    const f = this.follow;
    if (f) {
      if (!f.active) {
        this.dead = true;
        return;
      }
      this.x = f.x;
      this.y = f.y;
    }
    if (this.path) {
      this.path.dist += this.path.speed * dt;
      const p = pointOnPath(this.path.points, this.path.dist, this.path.pingpong);
      this.x = p.x;
      this.y = p.y;
    }
    let k =
      this.intensity * this.gain * flickerAt(this.flicker, clock + this.phase, this.speed, calm);
    if (this.lifeMs > 0) {
      this.age += dt * 1000;
      const t = this.age / this.lifeMs;
      if (t >= 1) {
        this.dead = true;
        return;
      }
      k *= (1 - t) * (1 - t);
      if (this.grow !== 1) this.radius = this.baseRadius * (1 + (this.grow - 1) * Math.sqrt(t));
    }
    if (this.igniteAt >= 0) {
      const t = Math.min(1, Math.max(0, (clock - this.igniteAt) / IGNITE_S));
      // A struck match: a brief over-bright flare as it catches.
      this.ignite = calm || t >= 1 ? t : t * (1 + 0.8 * Math.sin(t * Math.PI));
    }
    if (f && f.visible === false && !this.covered) k = 0;
    this.level = k * this.ignite;
  }
}

interface ForegroundLight extends SampleLight {
  reach: number;
}

const WHITE = 0xffffff;

let mod2x: { renderer: Phaser.Renderer.WebGL.WebGLRenderer; index: number } | undefined;

/**
 * dst * src * 2: light map values of 0.5 leave the backdrop as painted, below darken, above
 * brighten. Phaser's addBlendMode returns the wrong index, so it is read back from the list.
 */
function modulate2x(renderer: Phaser.Renderer.WebGL.WebGLRenderer): number {
  if (mod2x?.renderer === renderer) return mod2x.index;
  const gl = renderer.gl;
  renderer.addBlendMode([gl.DST_COLOR, gl.SRC_COLOR], gl.FUNC_ADD);
  mod2x = { renderer, index: renderer.blendModes.length - 1 };
  return mod2x.index;
}

let maxBlend: { renderer: Phaser.Renderer.WebGL.WebGLRenderer; index: number | null } | undefined;

/**
 * Keeps the larger alpha of source and destination, so overlapping shadows don't stack darker.
 * Null when WebGL 1 lacks EXT_blend_minmax.
 */
function maxBlendMode(renderer: Phaser.Renderer.WebGL.WebGLRenderer): number | null {
  if (maxBlend?.renderer === renderer) return maxBlend.index;
  const gl = renderer.gl;
  const max =
    typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
      ? gl.MAX
      : gl.getExtension('EXT_blend_minmax')?.MAX_EXT;
  let index: number | null = null;
  if (max !== undefined) {
    renderer.addBlendMode([gl.ONE, gl.ONE], max);
    index = renderer.blendModes.length - 1;
  }
  maxBlend = { renderer, index };
  return index;
}

/** A string of bulbs hung across the field. */
export interface BulbString {
  x0: number;
  x1: number;
  y: number;
  depth: number;
}

export interface LightingStats {
  tier: LightingTier;
  lights: number;
  drawn: number;
  map: string;
  ms: number;
}

/** Something `addLit` can light: it is tinted at its four corners, around a centre origin. */
export type LitImage = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/**
 * A lit image bigger than this is drawn as a grid of pieces. Corner tints cannot show a light
 * that falls in the middle of one quad, and a boss is much bigger than the ball's lantern.
 */
const PATCH_PX = 40;
/** Extra texture pixels a piece borrows from its neighbour, so the grid does not crack open. */
const PATCH_BLEED = 0.5;

/**
 * Tints an image's corners from light at the world's corners. A tint belongs to a corner of the
 * quad, which a flip or a negative scale turns over, so the colours swap sides with it.
 */
function tintCorners(
  o: LitImage,
  [tl, tr, bl, br]: readonly [number, number, number, number],
): void {
  const mx = o.flipX !== o.scaleX < 0;
  const my = o.flipY !== o.scaleY < 0;
  if (mx && my) o.setTint(br, bl, tr, tl);
  else if (mx) o.setTint(tr, tl, br, bl);
  else if (my) o.setTint(bl, br, tl, tr);
  else o.setTint(tl, tr, bl, br);
}

/** A big lit image, standing in for the source so a light can fall inside it. */
interface LitGrid {
  cols: number;
  rows: number;
  cells: Phaser.GameObjects.Image[];
}

/**
 * Multiply light map for the backdrop plus per-vertex tints for bricks and the paddle.
 *
 * Each frame a small texture is filled with the ambient light at half brightness, the baked
 * static lights and the dynamic ones are added, brick shadows and the vignette are darkened in,
 * and the result is drawn over the backdrop with a modulate-2x blend. Bricks never sample the
 * map: their four corners are lit on the CPU from the same lights, which costs nothing on the GPU.
 */
export class LightingSystem {
  static current?: LightingSystem;

  readonly enabled: boolean;
  /** How the room is lit. Only `relook` changes it. */
  look: LightingLook;
  readonly calm: boolean;
  /** Set by moods every frame: breathing forge, beat pulse. */
  ambientScale = 1;
  /** Lights out, set by moods every frame: how far the room lights have sputtered on, 0..1. */
  roomFlicker = 0;
  /** Set by moods every frame: the ambient leans this far, 0..1, toward `roomTint`. */
  roomTintK = 0;
  roomTint = 0xffffff;
  /** Strings of bulbs a stage hung, for the party mood to light. */
  readonly bulbs: BulbString[] = [];
  /**
   * Set by the scene every frame: a boss scene has the room, so the world's lightning and failing
   * lights wait rather than spend the flash limit, and make no sound, where nobody sees them.
   */
  held = false;
  stats: LightingStats = { tier: 'medium', lights: 0, drawn: 0, map: '', ms: 0 };

  private lights: Light[] = [];
  private tier: LightingTier;
  private budget: LightingBudget;
  private map?: Phaser.Textures.DynamicTexture;
  private staticMap?: Phaser.Textures.DynamicTexture;
  private shadowMap?: Phaser.Textures.DynamicTexture;
  /** The still-brick mask and moving bricks swept along the shadow, ready to darken the map. */
  private castMap?: Phaser.Textures.DynamicTexture;
  private castBlend: number | null = null;
  private composite?: Phaser.GameObjects.Image;
  private sx = 0.25;
  private sy = 0.25;
  /** Map x origin in playfield units: the pad plus the left wing, so the map spans the stage. */
  private ox = PAD;
  private height = HEIGHT;
  private stageW = STAGE_W;
  private clock = 0;
  /** Clock time the look was last set: a lights-out preview counts from here. */
  private lookAt = 0;
  private frame = 0;
  private bricks: readonly Brick[] = [];
  private paddle?: Phaser.GameObjects.Image;
  /** Images lit the way bricks are without being one: a boss's sprite. */
  private lit: LitImage[] = [];
  /** The ones too big for a single quad, and the pieces drawn in their place. */
  private grids = new Map<LitImage, LitGrid>();
  /** Reused as the box `cornerTints` samples for one piece. */
  private readonly patchBox = { x: 0, y: 0, displayWidth: 0, displayHeight: 0 };
  private relief?: ReliefLighting;
  private shadowFocus?: { x: number; y: number };
  private shadowSig = -1;
  private shadowFade = 0;
  private shadowOffset = { x: 0, y: 0 };
  private staticSig = -1;
  private gloom = 0;
  private boost = 0;
  private comboNow = 0;
  private stageClockNow = 0;
  private comboBoost = 0;
  private feverBoost = 0;
  private celebrating = false;
  private flare = 0;
  private flashRGB: [number, number, number] = [0, 0, 0];
  /** Clock times of recent ambient flashes, for the MAX_FLASH_HZ limit. */
  private flashTimes: number[] = [];
  private lastFlash = -Infinity;
  private dipK = 0;
  private pulseColor = 0;
  private pulseK = 0;
  /** Lights out: the lights coming back on after a clear, 0..1. */
  private relight = 0;
  private relightTarget = 0;
  private reveal = 0;
  private revealPeak = 0;
  private mood?: MoodFx;
  private ambientRGB = [1, 1, 1];
  private fgRGB = [1, 1, 1];
  private paddleRGB = [1, 1, 1];
  private fgLights: ForegroundLight[] = [];
  private backLights: Light[] = [];
  private near: ForegroundLight[] = [];
  private acc = new Float32Array(12);

  constructor(
    private scene: Phaser.Scene,
    readonly world: WorldId,
    level: LevelSpec,
    private scenery?: ParallaxBackdrop,
  ) {
    this.look = resolveLook(world, level.lighting);
    this.calm = save.state.settings.reducedMotion;
    this.tier = lightingTier();
    this.budget = LIGHTING_BUDGETS[this.tier];
    this.enabled = scene.sys.game.renderer.type === Phaser.WEBGL;
    if (!this.enabled) return;
    LightingSystem.current = this;
    ensureLightTextures(scene);
    this.createMaps();
    this.addLevelLights(level);
    this.mood = createMood(this, scene, this.look.mood, scenery);
    scenery?.setLightProbe((x, y) => this.moteAlpha(x, y));

    const renderer = scene.sys.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get tierName(): LightingTier {
    return this.tier;
  }

  get budgetInfo(): LightingBudget {
    return this.budget;
  }

  get time(): number {
    return this.clock;
  }

  /**
   * Lights the room another way part-way through a level, as an Arcade round going dark or coming
   * back on. The world's mood starts over, and a lights-out preview counts from now.
   */
  relook(spec: LevelLightingSpec): void {
    this.look = resolveLook(this.world, spec);
    this.lookAt = this.clock;
    this.relight = this.relightTarget = 0;
    this.reveal = this.revealPeak = 0;
    if (!this.enabled) return;
    this.mood?.destroy(false);
    this.mood = createMood(this, this.scene, this.look.mood, this.scenery);
  }

  /** The bricks to tint and shadow, and the paddle to tint. Call once after both exist. */
  attach(bricks: readonly Brick[], paddle: Phaser.GameObjects.Image): void {
    this.bricks = bricks;
    this.paddle = paddle;
  }

  /**
   * Lights an image the way bricks are lit: corner tints from the lights around it. An image
   * bigger than a brick is drawn in pieces, so a light in the middle of it still shows, and the
   * source stays hidden until `removeLit`.
   */
  addLit(image: LitImage): void {
    if (this.lit.includes(image)) return;
    this.lit.push(image);
    if (this.enabled) this.ensureGrid(image);
  }

  /** Stops lighting an image. Its last tint stays on it, and a gridded one is drawn whole again. */
  removeLit(image: LitImage): void {
    const i = this.lit.indexOf(image);
    if (i >= 0) this.lit.splice(i, 1);
    this.dropGrid(image, true);
  }

  /** Where brick shadows lean away from, usually the main ball. */
  setShadowFocus(p?: { x: number; y: number }): void {
    this.shadowFocus = p;
  }

  addLight(o: LightOptions): Light {
    const l = new Light(o);
    if (this.enabled) this.lights.push(l);
    return l;
  }

  /** A short burst that fades out (hits, breaks, explosions). */
  flash(
    x: number,
    y: number,
    color: number,
    radius: number,
    lifeMs: number,
    intensity = 1,
    grow = 1,
    priority = 4,
    relief = false,
  ): Light | undefined {
    if (!this.enabled) return undefined;
    if (this.calm) {
      intensity *= CALM_FLASH * 2;
      grow = 1;
    }
    return this.addLight({ x, y, color, radius, lifeMs, intensity, grow, priority, relief });
  }

  /**
   * Brightens the ambient for a moment, e.g. lightning. Decays over about a quarter second.
   * Whole-screen flashes are what photosensitivity guidelines count, so more than MAX_FLASH_HZ
   * in any second are dropped (returns false), and the brightening stays well short of white.
   */
  flashAmbient(color: number, amount: number): boolean {
    if (!this.claimFlash()) return false;
    const k = this.calm ? amount * CALM_FLASH : amount;
    this.flashRGB[0] = Math.min(0.6, this.flashRGB[0] + red(color) * k);
    this.flashRGB[1] = Math.min(0.6, this.flashRGB[1] + green(color) * k);
    this.flashRGB[2] = Math.min(0.6, this.flashRGB[2] + blue(color) * k);
    return true;
  }

  /**
   * Books one whole-screen flash against the MAX_FLASH_HZ limit, shared by everything that
   * flashes the room. False means the flash must not happen.
   */
  claimFlash(): boolean {
    const now = this.clock;
    this.flashTimes = this.flashTimes.filter((t) => now - t < 1);
    if (this.flashTimes.length >= Math.floor(MAX_FLASH_HZ)) return false;
    this.flashTimes.push(now);
    this.lastFlash = now;
    return true;
  }

  /** Seconds since the last whole-screen flash. */
  get sinceFlash(): number {
    return this.clock - this.lastFlash;
  }

  /** Lights out: the level is cleared and the room lights are coming back on for good. */
  get relit(): boolean {
    return this.relightTarget > 0;
  }

  /**
   * Lights out: lightning shows the level as if the lights were on, then it sinks back into the
   * dark. Call only after flashAmbient has allowed the flash. Reduced motion swells slowly.
   */
  revealLevel(amount: number): void {
    if (this.look.lightsOut) this.revealPeak = Math.max(this.revealPeak, amount);
  }

  /** Momentary drop in all light, for glitches. */
  dip(amount: number): void {
    if (!this.calm) this.dipK = Math.max(this.dipK, amount);
  }

  /** Black Hole: 0..1, eased by Backdrop. */
  setGloom(dark: number): void {
    this.gloom = dark;
  }

  /** Fever already recolors the backdrop through Backdrop; the light just lifts. */
  setFever(active: boolean): void {
    this.feverBoost = active ? 0.12 : 0;
  }

  /** Long combos warm the whole scene a little. */
  setCombo(combo: number): void {
    this.comboNow = combo;
    this.comboBoost = Math.min(0.25, Math.max(0, combo - 4) * 0.02);
  }

  /** The combo the scene last reported. */
  get combo(): number {
    return this.comboNow;
  }

  /** How far a bonus stage's timer has run, 0..1, for the party mood. */
  setStageClock(progress: number): void {
    this.stageClockNow = progress;
  }

  get stageClock(): number {
    return this.stageClockNow;
  }

  /**
   * Hangs a string of bulbs from `x0` to `x1` at height `y`, drawn at `depth`. Only the party mood
   * lights them; under any other they stay dark.
   */
  hangBulbs(x0: number, x1: number, y: number, depth: number): void {
    this.bulbs.push({ x0, x1, y, depth });
  }

  /** Takes every string of bulbs down, as the stage that hung them leaves. */
  takeDownBulbs(): void {
    this.bulbs.length = 0;
  }

  /** Seconds after the start when a light at height `y` ignites in the opening wave. */
  igniteTime(y: number): number {
    return 0.25 + Math.max(0, HEIGHT - y) * 0.0012;
  }

  /** Life lost: the room flushes with `color` and recovers. Lights out keeps it dark. */
  pulse(color: number, amount = 0.6): void {
    const k = amount * sceneryLight(this.look) * (this.calm ? CALM_FLASH : 1);
    this.pulseColor = color;
    this.pulseK = Math.max(this.pulseK, k);
  }

  /** Level clear: every light flares and the room brightens. Lights out turns the lights on. */
  celebrate(): void {
    this.flare = 1;
    this.celebrating = true;
    this.relightTarget = 1;
  }

  /** Mainframe glitches on hits; other moods ignore it. */
  onBrickHit(): void {
    this.mood?.onHit?.();
  }

  /** Brightness of the backdrop at (x, y), 1 = as painted. Matches the light map within a few %. */
  brightnessAt(x: number, y: number): number {
    let v = this.ambientRGB[0]! * 0.3 + this.ambientRGB[1]! * 0.59 + this.ambientRGB[2]! * 0.11;
    const s = this.look.backdropStrength;
    for (const l of this.backLights) {
      if (l.area) continue;
      const dx = x - l.x;
      const dy = y - l.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= l.radius * l.radius) continue;
      const q = 1 - d2 / (l.radius * l.radius);
      v += (l.negative ? -1 : 1) * q * q * l.level * s;
    }
    return v;
  }

  // ------------------------------------------------------------------ setup

  private createMaps(): void {
    const tex = this.scene.textures;
    for (const key of [MAP_KEY, STATIC_KEY, SHADOW_KEY, CAST_KEY])
      if (tex.exists(key)) tex.remove(key);
    const w = STAGE_W + PAD * 2;
    const h = HEIGHT + PAD * 2;
    const k = this.budget.mapScale;
    this.ox = PAD + WING;
    this.stageW = STAGE_W;
    const mw = Math.max(8, Math.ceil(w * k));
    const mh = Math.max(8, Math.ceil(h * k));
    this.map = tex.addDynamicTexture(MAP_KEY, mw, mh) ?? undefined;
    this.staticMap = tex.addDynamicTexture(STATIC_KEY, mw, mh) ?? undefined;
    this.shadowMap = tex.addDynamicTexture(SHADOW_KEY, mw, mh) ?? undefined;
    this.castMap = tex.addDynamicTexture(CAST_KEY, mw, mh) ?? undefined;
    if (!this.map) return;
    this.sx = this.map.width / w;
    this.sy = this.map.height / h;
    this.height = HEIGHT;
    this.staticSig = -1;
    this.shadowSig = -1;
    const renderer = this.scene.sys.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    this.castBlend = maxBlendMode(renderer);
    if (!this.composite) {
      this.composite = this.scene.add.image(0, 0, MAP_KEY).setOrigin(0, 0).setDepth(DEPTH);
      this.composite.setBlendMode(modulate2x(renderer));
    } else {
      this.composite.setTexture(MAP_KEY);
    }
    this.composite.setPosition(-this.ox, -PAD);
    this.composite.setDisplaySize(w, h);
    this.stats.map = `${this.map.width}x${this.map.height}`;
  }

  private onRestore(): void {
    this.staticSig = -1;
    this.shadowSig = -1;
  }

  /** Authored lights and emissive bricks. They ignite in a wave rising from the paddle. */
  private addLevelLights(level: LevelSpec): void {
    const igniteAt = (y: number) => this.igniteTime(y);
    for (const spec of level.lights) this.addSpecLight(spec, igniteAt);
  }

  private addSpecLight(spec: LightSpec, igniteAt: (y: number) => number): Light {
    const y = spec.y + LEVEL_OFFSET_Y;
    const common = {
      color: spec.color,
      intensity: spec.intensity,
      flicker: spec.flicker,
      speed: spec.speed,
      phase: spec.phase,
      affects: spec.affects,
      priority: 2,
      baked: true,
      igniteAt: igniteAt(y),
      relief: spec.relief,
    };
    if (spec.kind === 'area') {
      return this.addLight({
        ...common,
        x: spec.x,
        y,
        area: {
          width: spec.width,
          height: spec.height,
          rotation: (spec.rotation * Math.PI) / 180,
          cookie: spec.cookie,
        },
      });
    }
    if (spec.kind === 'path') {
      return this.addLight({
        ...common,
        radius: spec.radius,
        halo: Math.min(18, spec.radius * 0.18),
        haloAlpha: 0.8,
        haloDepth: -1,
        path: {
          points: spec.path.map((p) => ({ x: p.x, y: p.y + LEVEL_OFFSET_Y })),
          pingpong: spec.pingpong,
          // `speed` 1 is 60 units per second.
          speed: spec.speed * 60,
        },
        speed: 1,
      });
    }
    return this.addLight({ ...common, x: spec.x, y, radius: spec.radius });
  }

  // ------------------------------------------------------------------ frame

  private onPostUpdate(_time: number, delta: number): void {
    if (!this.map) return;
    const t0 = performance.now();
    const dt = Math.min(delta, 50) / 1000;
    this.clock += dt;
    this.frame++;

    const tier = lightingTier();
    if (tier !== this.tier || HEIGHT !== this.height || STAGE_W !== this.stageW) {
      this.tier = tier;
      this.budget = LIGHTING_BUDGETS[tier];
      this.createMaps();
      if (!this.map) return;
    }

    this.mood?.update(dt, this.clock);
    this.updateAmbient(dt);
    this.stepLights(dt);

    const view = { x: -this.ox, y: -PAD, width: STAGE_W + PAD * 2, height: HEIGHT + PAD * 2 };
    const cap = this.budget.maxLights;
    const staticOk = this.bakeStatic();
    this.backLights = selectLights(
      this.lights.filter((l) => l.affects !== 'bricks' && !(staticOk && l.still)),
      cap,
      view,
    );
    this.drawMap();

    const tintNow = this.frame % this.budget.tintEvery === 0;
    // A boss's pieces are few, and the lantern has to follow the ball every frame, including
    // the tiers that tint the whole brick field less often.
    if (tintNow || this.grids.size > 0) {
      this.prepareForeground(
        selectLights(
          this.lights.filter((l) => l.affects !== 'backdrop'),
          cap,
          view,
        ),
      );
      if (tintNow) this.tintForeground();
    }
    this.syncLitGrids();
    this.updateHalos();
    this.updateRelief();

    this.stats = {
      tier: this.tier,
      lights: this.lights.length,
      drawn: this.backLights.length,
      map: this.stats.map,
      ms: this.stats.ms * 0.9 + (performance.now() - t0) * 0.1,
    };
  }

  /** High tier with normal maps: Phaser's per-pixel lights add bevel relief to the foreground. */
  private updateRelief(): void {
    const want = this.budget.extras && !!this.paddle && hasNormalMap(this.scene, this.world);
    if (want && !this.relief) this.relief = new ReliefLighting(this.scene, this.look.shadow);
    if (!want && this.relief) {
      this.relief.destroy(this.bricks, this.paddle);
      this.relief = undefined;
    }
    this.relief?.update(this.lights, this.bricks, this.paddle!);
  }

  private stepLights(dt: number): void {
    let removed = false;
    for (const l of this.lights) {
      if (!l.dead) l.step(dt, this.clock, this.calm);
      if (l.dead) removed = true;
    }
    if (!removed) return;
    this.lights = this.lights.filter((l) => {
      if (!l.dead) return true;
      l.haloImage?.destroy();
      return false;
    });
  }

  private updateAmbient(dt: number): void {
    const t = this.clock - this.lookAt;
    const look = this.look;
    let base = look.ambient;
    let floor = look.brickFloor;
    let intro = 1;
    if (look.lightsOut) {
      const preview = look.preview ?? 0;
      // No preview means the level is already dark. A preview holds the normal look, then fades.
      if (preview > 0) {
        const normal = LIGHTING_LOOKS[this.world];
        const k = t < preview ? 0 : Math.min(1, (t - preview) / FADE_S);
        const e = k * k * (3 - 2 * k);
        base = mixColor(normal.ambient, look.ambient, e);
        floor = normal.brickFloor + (look.brickFloor - normal.brickFloor) * e;
      }
    } else if (t < INTRO_S) {
      const k = t / INTRO_S;
      intro = INTRO_AMBIENT + (1 - INTRO_AMBIENT) * (1 - (1 - k) * (1 - k));
    }

    this.relight += (this.relightTarget - this.relight) * Math.min(1, dt * 1.5);
    if (this.relight > 0.001 && look.lightsOut) {
      base = mixColor(base, LIGHTING_LOOKS[this.world].ambient, this.relight * 0.6);
      floor += (0.6 - floor) * this.relight;
    }
    this.reveal += (this.revealPeak - this.reveal) * Math.min(1, dt * (this.calm ? 3 : 40));
    this.revealPeak *= Math.exp(-dt * (this.calm ? 1.2 : 3.5));
    // A sputter snaps on and off with no easing: that's what makes it read as a failing bulb.
    const shown = Math.max(this.reveal, this.roomFlicker);
    if (shown > 0.002 && look.lightsOut) {
      const normal = LIGHTING_LOOKS[this.world];
      base = mixColor(base, normal.ambient, shown);
      floor += (normal.brickFloor - floor) * shown;
    }
    if (this.roomTintK > 0) base = mixColor(base, this.roomTint, this.roomTintK);
    // Combos and fever lift the room; in the dark that would give the layout away.
    const boostTarget = this.celebrating
      ? 0.35
      : (this.comboBoost + this.feverBoost) * sceneryLight(look);
    this.boost += (boostTarget - this.boost) * Math.min(1, dt * 2);
    this.flare *= Math.exp(-dt * 1.2);
    this.dipK *= Math.exp(-dt * 14);
    this.pulseK *= Math.exp(-dt * 2.2);
    const fd = Math.exp(-dt * 7);
    this.flashRGB[0] *= fd;
    this.flashRGB[1] *= fd;
    this.flashRGB[2] *= fd;

    const k = intro * this.ambientScale * (1 - 0.72 * this.gloom) * (1 - this.dipK);
    const lift = this.boost * 0.3 + this.flare * 0.25;
    const amb = this.ambientRGB;
    amb[0] = red(base) * k + lift + this.flashRGB[0]!;
    amb[1] = green(base) * k + lift + this.flashRGB[1]!;
    amb[2] = blue(base) * k + lift + this.flashRGB[2]!;
    if (this.pulseK > 0.002) {
      const p = this.pulseK;
      amb[0] = amb[0]! * (1 - p) + red(this.pulseColor) * p;
      amb[1] = amb[1]! * (1 - p) + green(this.pulseColor) * p;
      amb[2] = amb[2]! * (1 - p) + blue(this.pulseColor) * p;
    }

    const fk =
      (look.lightsOut ? 1 : 0.85 + 0.15 * intro) * (1 - 0.35 * this.gloom) * (1 - this.dipK * 0.5);
    const fl = floor * fk + this.boost * 0.15 + this.flare * 0.2;
    const fg = this.fgRGB;
    fg[0] = red(look.brickTint) * fl + this.flashRGB[0]! * 0.5;
    fg[1] = green(look.brickTint) * fl + this.flashRGB[1]! * 0.5;
    fg[2] = blue(look.brickTint) * fl + this.flashRGB[2]! * 0.5;
    // The paddle is the player's anchor: it never sinks into the dark.
    const pf = Math.max(fl, look.lightsOut ? 0.7 : 0.88);
    this.paddleRGB[0] = red(look.brickTint) * pf;
    this.paddleRGB[1] = green(look.brickTint) * pf;
    this.paddleRGB[2] = blue(look.brickTint) * pf;
  }

  /** Redraws the static map when the set of still lights changes. False if it can't be used. */
  private bakeStatic(): boolean {
    const st = this.staticMap;
    if (!st) return false;
    let sig = 0;
    let n = 0;
    for (const l of this.lights) {
      if (!l.still || l.affects === 'bricks') continue;
      n++;
      sig = (sig * 31 + Math.round(l.x * 7 + l.y * 13 + l.radius + l.color)) | 0;
    }
    sig = (sig * 31 + n) | 0;
    if (sig === this.staticSig) return true;
    this.staticSig = sig;
    st.fill(0x000000, 1);
    for (const l of this.lights) {
      if (!l.still || l.affects === 'bricks') continue;
      this.stampLight(st, l, l.intensity);
    }
    st.render();
    return true;
  }

  private stampLight(target: Phaser.Textures.DynamicTexture, l: Light, level: number): void {
    const x = (l.x + this.ox) * this.sx;
    const y = (l.y + PAD) * this.sy;
    const k = level * this.look.backdropStrength * 0.5;
    const blendMode = l.negative ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD;
    const tint = l.negative ? 0x000000 : l.color;
    const alpha = Math.min(1, l.negative ? level : k);
    if (l.area) {
      const key = cookieKey(l.area.cookie);
      const src = this.scene.textures.get(key).getSourceImage();
      target.stamp(key, undefined, x, y, {
        originX: 0,
        originY: 0,
        rotation: l.area.rotation,
        scaleX: (l.area.width * this.sx) / src.width,
        scaleY: (l.area.height * this.sy) / src.height,
        tint,
        alpha,
        blendMode,
      });
      return;
    }
    target.stamp(LIGHT_TEX.soft, undefined, x, y, {
      scaleX: (l.radius * 2 * this.sx) / SOFT_SIZE,
      scaleY: (l.radius * 2 * this.sy) / SOFT_SIZE,
      tint,
      alpha,
      blendMode,
    });
  }

  private drawMap(): void {
    const map = this.map!;
    const amb = this.ambientRGB;
    // An opaque stamp of the white texture rather than `fill`, which flushes to a separate
    // batcher (see `solid` in ui/shapes).
    const white = this.scene.textures.getFrame('__WHITE');
    map.stamp('__WHITE', undefined, 0, 0, {
      originX: 0,
      originY: 0,
      scaleX: map.width / white.width,
      scaleY: map.height / white.height,
      tint: rgbToColor(amb[0]! * 0.5, amb[1]! * 0.5, amb[2]! * 0.5),
    });
    const flare = 1 + this.flare * 0.6;
    if (this.staticMap && this.staticSig !== -1) {
      map.stamp(STATIC_KEY, undefined, 0, 0, {
        originX: 0,
        originY: 0,
        alpha: Math.min(1, flare),
        blendMode: Phaser.BlendModes.ADD,
      });
    }
    // Darkness goes on last so a pit stays black inside its own glow.
    for (const l of this.backLights) if (!l.negative) this.stampLight(map, l, l.level * flare);
    for (const l of this.backLights) if (l.negative) this.stampLight(map, l, l.level);
    this.drawShadows(map);
    if (this.look.vignette > 0) {
      map.stamp(LIGHT_TEX.vignette, undefined, 0, 0, {
        originX: 0,
        originY: 0,
        scaleX: map.width / 64,
        scaleY: map.height / 64,
        tint: 0x000000,
        alpha: this.look.vignette,
      });
    }
    map.render();
  }

  // ------------------------------------------------------------------ shadows

  /**
   * Bricks cast long soft shadows on the backdrop, swung away from the ball. Still bricks are
   * baked into one mask; the mask and any moving bricks are stamped again and again along the
   * shadow, darkest at the brick and fading toward the tip.
   */
  private drawShadows(map: Phaser.Textures.DynamicTexture): void {
    if (this.clock < SHADOW_DELAY_S || !this.shadowMap) return;
    this.shadowFade = Math.min(1, this.shadowFade + 0.03);
    const s = this.look.shadow;
    let ox = s.dx;
    let oy = s.dy;
    const f = this.shadowFocus;
    if (f) {
      // Lean away from the ball, as if it were a second light.
      ox += Phaser.Math.Clamp((WIDTH / 2 - f.x) / WIDTH, -0.5, 0.5) * 2 * s.lean;
      oy += Phaser.Math.Clamp((HEIGHT * 0.4 - f.y) / HEIGHT, -0.5, 0.5) * 1.3 * s.lean;
    }
    this.shadowOffset.x += (ox - this.shadowOffset.x) * 0.08;
    this.shadowOffset.y += (oy - this.shadowOffset.y) * 0.08;

    let sig = 0;
    for (const b of this.bricks) {
      if (this.castsStillShadow(b)) sig = (sig * 31 + b.spec.id + 1) | 0;
    }
    if (sig !== this.shadowSig) {
      this.shadowSig = sig;
      const sm = this.shadowMap;
      sm.clear();
      for (const b of this.bricks) if (this.castsStillShadow(b)) this.stampBrick(sm, b, 0, 0, 1);
      sm.render();
    }
    const alpha = s.alpha * this.shadowFade;
    const { x: dx, y: dy } = this.shadowOffset;
    const cast = this.castMap;
    const blend = this.castBlend;
    if (!cast || blend === null) {
      // Without a max blend, overlapping stamps would stack darker: one offset copy instead.
      map.stamp(SHADOW_KEY, undefined, dx * this.sx, dy * this.sy, {
        originX: 0,
        originY: 0,
        alpha,
      });
      for (const b of this.bricks) {
        if (this.castsMovingShadow(b)) this.stampBrick(map, b, dx, dy, alpha * b.alpha);
      }
      return;
    }
    const steps = Phaser.Math.Clamp(
      Math.ceil(Math.hypot(dx * this.sx, dy * this.sy)),
      1,
      MAX_SHADOW_STEPS,
    );
    cast.clear();
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const a = alpha * (1 - (1 - SHADOW_TIP) * (steps > 1 ? (i - 1) / (steps - 1) : 0));
      cast.stamp(SHADOW_KEY, undefined, dx * k * this.sx, dy * k * this.sy, {
        originX: 0,
        originY: 0,
        alpha: a,
        blendMode: blend,
      });
      for (const b of this.bricks) {
        if (this.castsMovingShadow(b)) this.stampBrick(cast, b, dx * k, dy * k, a * b.alpha, blend);
      }
    }
    cast.render();
    map.stamp(CAST_KEY, undefined, 0, 0, { originX: 0, originY: 0 });
  }

  private castsMovingShadow(b: Brick): boolean {
    return b.visible && b.life !== 'dead' && !this.castsStillShadow(b);
  }

  /** A boss part is moved by its owner, so its shadow is never baked. */
  private castsStillShadow(b: Brick): boolean {
    return (
      b.isAlive && b.visible && !b.falling && b.spec.moveX === 0 && b.y === b.homeY && !b.owner
    );
  }

  private stampBrick(
    target: Phaser.Textures.DynamicTexture,
    b: Brick,
    dx: number,
    dy: number,
    alpha: number,
    blendMode?: number,
  ): void {
    target.stamp(
      LIGHT_TEX.px,
      undefined,
      (b.x + dx + this.ox) * this.sx,
      (b.y + dy + PAD) * this.sy,
      {
        scaleX: (b.displayWidth * this.sx) / PX_SIZE,
        scaleY: (b.displayHeight * this.sy) / PX_SIZE,
        rotation: b.rotation,
        tint: 0x000000,
        alpha,
        blendMode,
      },
    );
  }

  // ------------------------------------------------------------------ foreground

  private prepareForeground(lights: readonly Light[]): void {
    const gain = this.look.brickGain * (1 + this.flare * 0.5);
    const out = this.fgLights;
    out.length = 0;
    for (const l of lights) {
      const k = l.level * gain * (l.negative ? -1.4 : 1);
      const fl: ForegroundLight = {
        x: l.x,
        y: l.y,
        radius: l.radius,
        r: red(l.color) * k,
        g: green(l.color) * k,
        b: blue(l.color) * k,
        reach: l.radius,
      };
      if (l.area) {
        fl.area = {
          width: l.area.width,
          height: l.area.height,
          cos: Math.cos(l.area.rotation),
          sin: Math.sin(l.area.rotation),
          shaft: l.area.cookie === 'shaft' || l.area.cookie === 'stained',
        };
      }
      out.push(fl);
    }
  }

  private tintForeground(): void {
    for (const b of this.bricks) {
      if (!b.visible || b.life === 'dead' || b.flashing) continue;
      const [tl, tr, bl, br] = this.cornerTints(b, this.fgRGB);
      b.applyLight(tl, tr, bl, br);
    }
    for (const o of this.lit) {
      // A gridded image is hidden; its pieces are lit in `placeGrid`.
      if (!o.visible || this.grids.has(o)) continue;
      tintCorners(o, this.cornerTints(o, this.fgRGB));
    }
    const p = this.paddle;
    if (p) {
      const [tl, tr, bl, br] = this.cornerTints(p, this.paddleRGB);
      p.setTint(tl, tr, bl, br);
    }
  }

  private corners: [number, number, number, number] = [WHITE, WHITE, WHITE, WHITE];

  private cornerTints(
    o: { x: number; y: number; displayWidth: number; displayHeight: number },
    floor: number[],
  ): [number, number, number, number] {
    const hw = o.displayWidth / 2;
    const hh = o.displayHeight / 2;
    const near = this.near;
    near.length = 0;
    for (const l of this.fgLights) {
      if (Math.abs(l.x - o.x) < l.reach + hw && Math.abs(l.y - o.y) < l.reach + hh) near.push(l);
    }
    const acc = this.acc;
    for (let c = 0; c < 4; c++) {
      const i = c * 3;
      acc[i] = floor[0]!;
      acc[i + 1] = floor[1]!;
      acc[i + 2] = floor[2]!;
      if (near.length === 0) continue;
      const cx = o.x + (c % 2 === 0 ? -hw : hw);
      const cy = o.y + (c < 2 ? -hh : hh);
      accumulate(near, cx, cy, acc, i);
    }
    const out = this.corners;
    for (let c = 0; c < 4; c++) {
      const i = c * 3;
      out[c] = rgbToColor(acc[i]!, acc[i + 1]!, acc[i + 2]!);
    }
    return out;
  }

  /**
   * Splits `image` into a grid when it is bigger than one brick's worth of light. The pieces
   * share its place, frame and crop, so together they draw the same picture.
   */
  private ensureGrid(image: LitImage): void {
    const w = image.displayWidth;
    const h = image.displayHeight;
    if (!(w > PATCH_PX || h > PATCH_PX) || !image.scene) {
      this.dropGrid(image, true);
      return;
    }
    const cols = Math.ceil(w / PATCH_PX);
    const rows = Math.ceil(h / PATCH_PX);
    const had = this.grids.get(image);
    if (had?.cols === cols && had.rows === rows) return;
    if (had) this.dropGrid(image, false);
    const tint = this.unlitTint();
    const cells: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < cols * rows; i++) {
      cells.push(
        this.scene.add
          .image(image.x, image.y, image.texture.key, image.frame.name)
          .setOrigin(image.originX, image.originY)
          .setScrollFactor(image.scrollFactorX, image.scrollFactorY)
          .setBlendMode(image.blendMode)
          .setDepth(image.depth)
          .setTint(tint),
      );
    }
    image.setVisible(false);
    this.grids.set(image, { cols, rows, cells });
  }

  /** Drops an image's pieces. `show` draws the source again, for when it leaves the grid. */
  private dropGrid(image: LitImage, show: boolean): void {
    const grid = this.grids.get(image);
    if (!grid) return;
    this.grids.delete(image);
    for (const cell of grid.cells) cell.destroy();
    if (show && image.scene) image.setVisible(true);
  }

  /** Moves, frames and lights every gridded image. A dead source takes its pieces with it. */
  private syncLitGrids(): void {
    for (let i = this.lit.length - 1; i >= 0; i--) {
      const image = this.lit[i]!;
      if (!image.active || !image.scene) {
        this.dropGrid(image, false);
        this.lit.splice(i, 1);
        continue;
      }
      this.ensureGrid(image);
      const grid = this.grids.get(image);
      if (grid) this.placeGrid(image, grid);
    }
  }

  /** Lays one image's pieces over it and tints each from the lights on that piece. */
  private placeGrid(image: LitImage, grid: LitGrid): void {
    const frame = image.frame;
    const fw = frame.realWidth;
    const fh = frame.realHeight;
    if (fw <= 0 || fh <= 0) return;
    image.setVisible(false);
    const { cols, rows, cells } = grid;
    const { scaleX, scaleY, flipX, flipY, rotation } = image;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const ox = fw * image.originX;
    const oy = fh * image.originY;
    // Phaser mirrors a flipped image's crop as well as its quad, which puts each piece's half of
    // the picture on the wrong side. A piece turns over by a negative scale instead, which leaves
    // its crop alone. That turns about the origin where a flip turns about the frame's middle, so
    // the pieces shift by the difference.
    const dx = flipX ? (fw - 2 * ox) * scaleX : 0;
    const dy = flipY ? (fh - 2 * oy) * scaleY : 0;
    const px = image.x + dx * cos - dy * sin;
    const py = image.y + dx * sin + dy * cos;
    const box = this.patchBox;
    for (let r = 0; r < rows; r++) {
      const y0 = Math.max(0, Math.round((r * fh) / rows) - (r > 0 ? PATCH_BLEED : 0));
      const y1 = Math.min(fh, Math.round(((r + 1) * fh) / rows) + (r < rows - 1 ? PATCH_BLEED : 0));
      for (let c = 0; c < cols; c++) {
        const cell = cells[r * cols + c]!;
        const x0 = Math.max(0, Math.round((c * fw) / cols) - (c > 0 ? PATCH_BLEED : 0));
        const x1 = Math.min(fw, Math.round(((c + 1) * fw) / cols) + (c < cols - 1 ? PATCH_BLEED : 0));
        cell.setPosition(px, py).setRotation(rotation).setFlip(false, false);
        if (cell.frame !== frame) cell.setFrame(frame.name);
        cell
          .setScale(flipX ? -scaleX : scaleX, flipY ? -scaleY : scaleY)
          .setAlpha(image.alpha)
          .setDepth(image.depth)
          .setCrop(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        // The crop stays where it sat in the whole frame, which is where this piece is drawn.
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const wx = (flipX ? fw - ox - cx : cx - ox) * scaleX;
        const wy = (flipY ? fh - oy - cy : cy - oy) * scaleY;
        box.x = image.x + wx * cos - wy * sin;
        box.y = image.y + wx * sin + wy * cos;
        box.displayWidth = (x1 - x0) * Math.abs(scaleX);
        box.displayHeight = (y1 - y0) * Math.abs(scaleY);
        tintCorners(cell, this.cornerTints(box, this.fgRGB));
      }
    }
  }

  /** Floor tint for a piece before the first lit frame, so it never flashes in at full paint. */
  private unlitTint(): number {
    const fl = this.look.brickFloor;
    const tint = this.look.brickTint;
    return rgbToColor(red(tint) * fl, green(tint) * fl, blue(tint) * fl);
  }

  // ------------------------------------------------------------------ halos and motes

  private updateHalos(): void {
    for (const l of this.lights) {
      if (l.halo <= 0) continue;
      const visible = l.level > 0.01 && (l.covered || (l.follow?.visible ?? true));
      if (!l.haloImage) {
        if (!visible) continue;
        l.haloImage = this.scene.add
          .image(l.x, l.y, LIGHT_TEX.halo)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(l.haloDepth);
      }
      const k = Math.min(1.3, l.level / Math.max(0.01, l.intensity));
      l.haloImage
        .setVisible(visible)
        .setPosition(l.x, l.y)
        .setTint(l.color)
        .setAlpha(Math.min(1, l.haloAlpha * k))
        .setDisplaySize(l.halo * 2 * (0.85 + 0.15 * k), l.halo * 2 * (0.85 + 0.15 * k));
    }
  }

  /** Motes are invisible in the dark and catch the light near lamps. */
  private moteAlpha(x: number, y: number): number {
    const ambient =
      this.ambientRGB[0]! * 0.3 + this.ambientRGB[1]! * 0.59 + this.ambientRGB[2]! * 0.11;
    const v = this.brightnessAt(x, y);
    return Phaser.Math.Clamp(0.35 + (v - ambient) * 2.2, 0.2, 1.8) * Math.min(1, ambient * 1.4);
  }

  /** Applies a filter-based heat shimmer when the tier allows it. */
  addHaze(key: string, amount: number): void {
    if (this.budget.extras && !this.calm) this.scenery?.addHaze(key, amount);
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate, this);
    const renderer = this.scene.sys.game.renderer;
    renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
    this.mood?.destroy();
    this.mood = undefined;
    this.relief?.destroy([]);
    this.relief = undefined;
    this.scenery?.setLightProbe(undefined);
    for (const l of this.lights) l.haloImage?.destroy();
    this.lights = [];
    for (const image of [...this.grids.keys()]) this.dropGrid(image, false);
    this.composite?.destroy();
    this.composite = undefined;
    const tex = this.scene.textures;
    for (const key of [MAP_KEY, STATIC_KEY, SHADOW_KEY, CAST_KEY])
      if (tex.exists(key)) tex.remove(key);
    this.map = this.staticMap = this.shadowMap = this.castMap = undefined;
    if (LightingSystem.current === this) LightingSystem.current = undefined;
  }
}
