import Phaser from 'phaser';
import type { SceneryId } from '../art/backdrops';
import { save } from '../services';
import { fxTier, particleDensity } from '../systems/Quality';
import { FX_TEXTURE } from './atlas';
import { FxDistort } from './distort';
import { fadeCurve, rampColor, roll, shareBudget, sizeCurve, tierRank, tierScale } from './math';
import { FX_PALETTES, resolveColor, type ColorRef, type FxPalette } from './palettes';
import { FxParticle, pending, type Emission } from './particles';
import { fxClock, type FxForce } from './processors';
import { FxRibbon } from './ribbon';
import type { ChannelId, EmitSpec, FxDef, FxHooks, FxOpts, SpriteSpec } from './types';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type Frame = Phaser.Textures.Frame;

const ADD = Phaser.BlendModes.ADD;
const NORMAL = Phaser.BlendModes.NORMAL;

/** Blend, depth and alive cap of each pooled emitter. Depths sit in Play's bands (see README). */
export const CHANNELS: Record<ChannelId, { blend: number; depth: number; cap: number }> = {
  sky: { blend: ADD, depth: 2, cap: 420 },
  low: { blend: ADD, depth: 4, cap: 400 },
  smoke: { blend: NORMAL, depth: 7, cap: 260 },
  debris: { blend: NORMAL, depth: 8, cap: 360 },
  glow: { blend: ADD, depth: 9, cap: 900 },
  top: { blend: ADD, depth: 11, cap: 160 },
  front: { blend: NORMAL, depth: 12, cap: 320 },
};

/** New particles per frame across every effect, before density and tier. */
const FRAME_BUDGET = 260;
const SPRITE_DEPTH = 9.5;

// ---------------------------------------------------------------------------------------------
// Registry: presets live in src/fx/library and register themselves by id.

const registry = new Map<string, FxDef>();
const warned = new Set<string>();

export function registerFx(defs: Record<string, FxDef>): void {
  for (const [id, def] of Object.entries(defs)) registry.set(id, def);
}

export function fxDef(id: string): FxDef | undefined {
  return registry.get(id);
}

export function fxIds(): string[] {
  return [...registry.keys()];
}

function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[fx] ${msg}`);
}

// ---------------------------------------------------------------------------------------------

/** A running attached effect or field. `stop()` ends emission; live particles finish their lives. */
export interface FxHandle {
  readonly alive: boolean;
  stop(): void;
  /** Changes the caller options (tint, scale, intensity) of a running effect. */
  set(opts: FxOpts): void;
}

interface Running {
  def: FxDef;
  layers: EmitSpec[];
  acc: number[];
  target: { x: number; y: number; active?: boolean };
  area?: { x: number; y: number; width: number; height: number };
  opts: FxOpts;
  stopped: boolean;
  handle: FxHandle;
  ribbon?: FxRibbon;
  /** The tint the ribbon was last colored with, so `set({ tint })` can recolor it. */
  ribbonTint?: number;
  haze?: { stop(): void };
  /** Weather draws on its own emitters, so `setWeatherAlpha` can dim it with the room. */
  weather?: boolean;
}

interface LiveSprite {
  img: Phaser.GameObjects.Image;
  spec: SpriteSpec;
  age: number;
  delay: number;
  from: number;
  to: number;
  ramp: number[];
  rot: number;
  spin: number;
  aspect: number;
  weather: boolean;
}

export interface FxEngineOptions {
  world?: SceneryId;
  hooks?: FxHooks;
}

/**
 * The scene's particle effects. One per scene: `play` fires a preset once, `attach` keeps one
 * running on a moving target, `field` fills an area (weather). Every particle comes from a few
 * pooled emitters on one texture, so effects cost no emitter or texture churn.
 */
export class FxEngine {
  /** The engine of the scene made last, for the debug overlay. */
  static current?: FxEngine;
  world: SceneryId;
  hooks: FxHooks;
  /** By channel, plus one per depth and parallax that a caller asked for. */
  private emitters = new Map<string, Emitter>();
  private frames = new Map<string, Frame>();
  private running: Running[] = [];
  private sprites: LiveSprite[] = [];
  private spritePool: Phaser.GameObjects.Image[] = [];
  private deaths: Array<{ id: string; x: number; y: number; tint: number; world: SceneryId; weather: boolean }> = [];
  private ribbons: FxRibbon[] = [];
  private distort: FxDistort;
  private budget = 0;
  private weatherAlpha = 1;
  /** Bumped by clear() so queued `then` steps from before it are dropped. */
  private generation = 0;
  private dead = false;

  constructor(
    private scene: Phaser.Scene,
    opts: FxEngineOptions = {},
  ) {
    this.world = opts.world ?? 'hell';
    this.hooks = opts.hooks ?? {};
    this.distort = new FxDistort(scene);
    this.distort.prime();
    this.refillBudget();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    FxEngine.current = this;
  }

  /** Fires a preset once at (x, y). */
  play(id: string, x: number, y: number, opts: FxOpts = {}): void {
    if (this.dead) return;
    const def = registry.get(id);
    if (!def) {
      warnOnce(`no effect "${id}"`);
      return;
    }
    this.playDef(def, x, y, opts);
  }

  playDef(def: FxDef, x: number, y: number, opts: FxOpts = {}): void {
    this.burst(def, x, y, opts, false);
  }

  private burst(def: FxDef, x: number, y: number, opts: FxOpts, weather: boolean): void {
    const tier = fxTier();
    const rank = tierRank(tier);
    const calm = save.state.settings.reducedMotion;
    const pal = this.palette(opts);
    const tint = opts.tint ?? pal.accent;
    const scale = opts.scale ?? 1;
    const world = opts.world ?? this.world;
    const here = (only?: readonly SceneryId[]) => !only || only.includes(world);

    const layers = (def.layers ?? []).filter(
      (l) => l.count !== undefined && rank >= tierRank(l.minTier ?? 'low') && here(l.only),
    );
    if (layers.length) {
      const density = particleDensity() * tierScale(tier) * (opts.intensity ?? 1) * (calm ? 0.35 : 1);
      const wants = layers.map((l) => Math.max(0, roll(l.count, 0) * density));
      const got = shareBudget(
        wants,
        layers.map((l) => !!l.essential),
        this.budgetLeft(),
      );
      layers.forEach((l, i) => {
        const n = got[i]!;
        if (n > 0) this.emit(l, n, x, y, opts, pal, tint, scale, undefined, undefined, false, weather);
      });
      this.spend(got.reduce((s, n) => s + n, 0));
    }

    for (const s of def.sprites ?? []) {
      if (rank >= tierRank(s.minTier ?? 'low') && here(s.only)) {
        this.spawnSprite(s, x, y, opts, pal, tint, scale, weather);
      }
    }

    if (def.distort) this.distort.shock(x, y, def.distort.radius * scale, def.distort.life, def.distort.push);

    const h = this.hooks;
    if (def.light && h.light && !opts.bare) {
      const l = def.light;
      h.light(x, y, resolveColor(l.color, pal, tint), l.radius * scale, l.life, l.intensity ?? 1, l.grow ?? 1);
    }
    if (!opts.quiet && !opts.bare) {
      if (def.shake) h.shake?.(def.shake[0], def.shake[1] * Math.min(1.5, scale));
      if (def.punch) h.punch?.(def.punch[0], def.punch[1] * Math.min(1.5, scale));
      if (def.hitStop) h.hitStop?.(def.hitStop);
      if (def.scenery) h.scenery?.(def.scenery);
    }
    for (const step of def.then ?? []) {
      const gen = this.generation;
      this.scene.time.delayedCall(step.at, () => {
        if (this.dead || gen !== this.generation) return;
        this.play(step.fx, x + roll(step.dx, 0) * scale, y + roll(step.dy, 0) * scale, {
          ...opts,
          scale: scale * (step.scale ?? 1),
          angle: step.angle !== undefined ? roll(step.angle) : opts.angle,
        });
      });
    }
  }

  /** Keeps a preset's `rate` layers emitting at a moving target until stopped or it goes inactive. */
  attach(id: string, target: { x: number; y: number; active?: boolean }, opts: FxOpts = {}): FxHandle {
    return this.run(id, target, undefined, opts);
  }

  /** Keeps a preset's `rate` layers emitting across an area: weather and ambient fields. */
  field(id: string, area: { x: number; y: number; width: number; height: number }, opts: FxOpts = {}): FxHandle {
    return this.run(id, { x: area.x + area.width / 2, y: area.y + area.height / 2 }, area, opts);
  }

  /**
   * Weather over `bounds` (usually the playfield): spawns in a band above it, below it or across
   * it, as the preset's `spawn` says, so rain and ash can fall the whole height.
   */
  weather(id: string, bounds: { x: number; y: number; width: number; height: number }, opts: FxOpts = {}): FxHandle {
    const band = 40;
    const spawn = registry.get(id)?.spawn ?? 'fill';
    const area =
      spawn === 'top'
        ? { x: bounds.x - 80, y: bounds.y - band, width: bounds.width + 160, height: band }
        : spawn === 'bottom'
          ? { x: bounds.x, y: bounds.y + bounds.height, width: bounds.width, height: band }
          : bounds;
    const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    const handle = this.run(id, center, area, opts, true);
    this.prewarm(id, bounds, opts);
    return handle;
  }

  /** Fades every weather particle at once, live ones included: weather is additive, so a dark room has to dim it. */
  setWeatherAlpha(alpha: number): void {
    if (alpha === this.weatherAlpha) return;
    this.weatherAlpha = alpha;
    for (const [key, e] of this.emitters) if (key.startsWith('weather:')) e.setAlpha(alpha);
  }

  /** Seeds a field with a lifetime's worth of particles, already mid-flight, so it starts full. */
  private prewarm(id: string, bounds: { x: number; y: number; width: number; height: number }, opts: FxOpts): void {
    const def = registry.get(id);
    if (!def || this.dead) return;
    const tier = fxTier();
    const rank = tierRank(tier);
    const calm = save.state.settings.reducedMotion;
    const pal = this.palette(opts);
    const tint = opts.tint ?? pal.accent;
    const world = opts.world ?? this.world;
    const density = particleDensity() * tierScale(tier) * (opts.intensity ?? 1) * (calm ? 0.35 : 1);
    for (const l of def.layers ?? []) {
      if (l.rate === undefined || rank < tierRank(l.minTier ?? 'low') || (l.only && !l.only.includes(world))) continue;
      const life = typeof l.life === 'number' ? l.life : (l.life[0] + l.life[1]) / 2;
      const n = Math.min(300, Math.round((l.rate * density * life) / 1000));
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      if (n > 0) this.emit(l, n, cx, cy, opts, pal, tint, opts.scale ?? 1, undefined, bounds, true, true);
    }
  }

  /** Particles alive across every channel. `weather: false` leaves out the ambient fields. */
  aliveCount(weather = true): number {
    let n = 0;
    for (const [key, e] of this.emitters) {
      if (weather || !key.startsWith('weather:')) n += e.getAliveParticleCount();
    }
    return n;
  }

  /** What is on screen now: particles, running effects, one-shot sprites and ribbon trails. */
  stats(): { particles: number; effects: number; sprites: number; ribbons: number } {
    return {
      particles: this.aliveCount(),
      effects: this.running.length,
      sprites: this.sprites.length,
      ribbons: this.ribbons.length,
    };
  }

  /** Ends every running effect and removes every particle and sprite at once. */
  clear(): void {
    this.generation++;
    for (const r of this.running) r.stopped = true;
    this.running.length = 0;
    for (const e of this.emitters.values()) e.killAll();
    for (const s of this.sprites) this.releaseSprite(s.img);
    this.sprites.length = 0;
    this.deaths.length = 0;
    for (const rb of this.ribbons) rb.destroy();
    this.ribbons.length = 0;
    this.distort.clear();
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    if (FxEngine.current === this) FxEngine.current = undefined;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.running.length = 0;
    this.sprites.length = 0;
    for (const e of this.emitters.values()) e.destroy();
    this.emitters.clear();
    for (const img of this.spritePool) img.destroy();
    this.spritePool.length = 0;
    for (const rb of this.ribbons) rb.destroy();
    this.ribbons.length = 0;
    this.distort.destroy();
  }

  // -------------------------------------------------------------------------------------------

  private palette(opts: FxOpts): FxPalette {
    return FX_PALETTES[opts.world ?? this.world] ?? FX_PALETTES.hell;
  }

  private budgetLeft(): number {
    return this.budget;
  }

  private refillBudget(): void {
    this.budget = FRAME_BUDGET * particleDensity() * tierScale(fxTier());
  }

  private spend(n: number): void {
    this.budget -= n;
  }

  private emitter(channel: ChannelId, depth?: number, parallax = 1, weather = false): Emitter {
    const base = depth === undefined && parallax === 1 ? channel : `${channel}@${depth ?? ''}~${parallax}`;
    const key = weather ? `weather:${base}` : base;
    let e = this.emitters.get(key);
    if (!e) {
      const c = CHANNELS[channel];
      e = this.scene.add.particles(0, 0, FX_TEXTURE, {
        frame: 'glow',
        emitting: false,
        maxAliveParticles: c.cap,
        particleClass: FxParticle,
        blendMode: c.blend,
      });
      e.setDepth(depth ?? c.depth).setScrollFactor(parallax);
      if (weather) e.setAlpha(this.weatherAlpha);
      this.emitters.set(key, e);
    }
    return e;
  }

  private frame(name: string): Frame {
    let f = this.frames.get(name);
    if (!f) {
      const tex = this.scene.textures.get(FX_TEXTURE);
      if (tex.has(name)) f = tex.get(name);
      else {
        warnOnce(`no frame "${name}" in the fx atlas`);
        f = tex.get('glow');
      }
      this.frames.set(name, f);
    }
    return f;
  }

  private resolveRamp(color: EmitSpec['color'], pal: FxPalette, tint: number): number[] {
    if (color === undefined) return [tint];
    if (Array.isArray(color)) return (color as ColorRef[]).map((c) => resolveColor(c, pal, tint));
    return [resolveColor(color as ColorRef, pal, tint)];
  }

  private emit(
    spec: EmitSpec,
    n: number,
    x: number,
    y: number,
    opts: FxOpts,
    pal: FxPalette,
    tint: number,
    scale: number,
    anchor?: { x: number; y: number },
    area?: Running['area'],
    warm = false,
    weather = false,
  ): void {
    const names = typeof spec.frames === 'string' ? [spec.frames] : spec.frames;
    const forces: FxForce[] = [...(spec.forces ?? [])];
    if (spec.useForces && opts.forces) forces.push(...opts.forces);
    const world = opts.world ?? this.world;
    const em: Emission = {
      spec,
      frames: names.map((f) => this.frame(f)),
      anim: spec.anim?.frames.map((f) => this.frame(f)),
      ramp: this.resolveRamp(spec.color, pal, tint),
      pick: spec.pick?.flatMap((c) => (c === '@party' ? pal.party : [resolveColor(c, pal, tint)])),
      x,
      y,
      scale,
      aim: ((opts.angle ?? 0) * Math.PI) / 180,
      w: opts.w ?? 30,
      h: opts.h ?? 16,
      floor: opts.floor,
      forces,
      anchor,
      area,
      warm,
      died: spec.onDeath
        ? (dx, dy, t) => this.deaths.push({ id: spec.onDeath!, x: dx, y: dy, tint: t, world, weather })
        : undefined,
    };
    pending.current = em;
    this.emitter(spec.channel, opts.depth, spec.parallax, weather).emitParticleAt(x, y, n);
    pending.current = null;
  }

  private run(
    id: string,
    target: Running['target'],
    area: Running['area'] | undefined,
    opts: FxOpts,
    weather = false,
  ): FxHandle {
    const def = registry.get(id);
    const r: Running = {
      def: def ?? {},
      layers: [],
      acc: [],
      target,
      area,
      weather,
      opts: { ...opts },
      stopped: !def || this.dead,
      handle: {
        get alive() {
          return !r.stopped;
        },
        stop: () => {
          r.stopped = true;
        },
        set: (o: FxOpts) => {
          Object.assign(r.opts, o);
        },
      },
    };
    if (!def) {
      warnOnce(`no effect "${id}"`);
      return r.handle;
    }
    r.layers = (def.layers ?? []).filter((l) => l.rate !== undefined);
    r.acc = r.layers.map(() => Math.random());
    // Bursts in an attached preset fire once at the start.
    if (def.layers?.some((l) => l.count !== undefined) || def.sprites?.length || def.light) {
      this.playDef({ ...def, layers: def.layers?.filter((l) => l.count !== undefined), then: undefined }, target.x, target.y, opts);
    }
    const rb = def.ribbon;
    if (rb && tierRank(fxTier()) >= tierRank(rb.minTier ?? 'low')) {
      const pal = this.palette(opts);
      const tint = opts.tint ?? pal.accent;
      const scale = opts.scale ?? 1;
      r.ribbon = new FxRibbon(this.scene, target, {
        width: rb.width * scale,
        life: rb.life,
        color: resolveColor(rb.color, pal, tint),
        tail: rb.tail ? resolveColor(rb.tail, pal, tint) : undefined,
        alpha: rb.alpha,
        core: rb.core,
        coreColor: pal.core,
        depth: rb.depth,
      });
      r.ribbonTint = tint;
      this.ribbons.push(r.ribbon);
    }
    if (def.haze) {
      const s = opts.scale ?? 1;
      r.haze = this.distort.haze(target, def.haze.w * s, def.haze.h * s, def.haze.push, (def.haze.dy ?? 0) * s);
    }
    this.running.push(r);
    return r.handle;
  }

  private update(_time: number, delta: number): void {
    if (this.dead) return;
    fxClock.t += delta / 1000;
    this.refillBudget();

    if (this.deaths.length) {
      const list = this.deaths.splice(0);
      for (const d of list) {
        const def = registry.get(d.id);
        if (def) this.burst(def, d.x, d.y, { tint: d.tint, world: d.world, quiet: true }, d.weather);
        else warnOnce(`no effect "${d.id}"`);
      }
    }

    if (this.running.length) {
      const tier = fxTier();
      const rank = tierRank(tier);
      const calm = save.state.settings.reducedMotion;
      const base = particleDensity() * tierScale(tier) * (calm ? 0.35 : 1);
      for (let i = this.running.length - 1; i >= 0; i--) {
        const r = this.running[i]!;
        if (r.stopped || r.target.active === false) {
          r.stopped = true;
          r.ribbon?.stop();
          r.haze?.stop();
          this.running.splice(i, 1);
          continue;
        }
        const pal = this.palette(r.opts);
        const tint = r.opts.tint ?? pal.accent;
        const scale = r.opts.scale ?? 1;
        const density = base * (r.opts.intensity ?? 1);
        const world = r.opts.world ?? this.world;
        const rb = r.def.ribbon;
        if (r.ribbon && rb && tint !== r.ribbonTint) {
          r.ribbonTint = tint;
          r.ribbon.recolor(resolveColor(rb.color, pal, tint), rb.tail ? resolveColor(rb.tail, pal, tint) : undefined);
        }
        r.layers.forEach((l, j) => {
          if (rank < tierRank(l.minTier ?? 'low')) return;
          if (l.only && !l.only.includes(world)) return;
          r.acc[j]! += (l.rate! * density * delta) / 1000;
          const n = Math.floor(r.acc[j]!);
          if (n <= 0) return;
          r.acc[j]! -= n;
          this.emit(l, n, r.target.x, r.target.y, r.opts, pal, tint, scale, r.target, r.area, false, r.weather);
        });
      }
    }

    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      if (!this.ribbons[i]!.update(delta)) this.ribbons.splice(i, 1);
    }
    this.distort.update(delta);

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i]!;
      if (s.delay > 0) {
        s.delay -= delta;
        if (s.delay > 0) continue;
        s.img.setVisible(true);
      }
      s.age += delta;
      const t = Math.min(1, s.age / s.spec.life);
      this.drawSprite(s, t, delta);
      if (t >= 1) {
        this.releaseSprite(s.img);
        this.sprites.splice(i, 1);
      }
    }
  }

  private spawnSprite(
    spec: SpriteSpec,
    x: number,
    y: number,
    opts: FxOpts,
    pal: FxPalette,
    tint: number,
    scale: number,
    weather = false,
  ): void {
    const img = this.spritePool.pop() ?? this.scene.add.image(0, 0, FX_TEXTURE, spec.frame);
    img.setFrame(spec.frame);
    let dx = roll(spec.dx, 0) * scale;
    let dy = roll(spec.dy, 0) * scale;
    if (spec.aim && opts.angle) {
      const a = opts.angle * (Math.PI / 180);
      [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    }
    img
      .setPosition(x + dx, y + dy)
      .setBlendMode(spec.blend === 'normal' ? NORMAL : ADD)
      .setDepth(opts.depth ?? spec.depth ?? SPRITE_DEPTH)
      .setAlpha(0)
      .setVisible(!spec.delay);
    const s: LiveSprite = {
      img,
      spec,
      age: 0,
      delay: spec.delay ?? 0,
      from: roll(spec.from) * scale,
      to: roll(spec.to) * scale,
      ramp: this.resolveRamp(spec.color, pal, tint),
      rot: roll(spec.rotate, 0) + (spec.aim ? (opts.angle ?? 0) : 0),
      spin: roll(spec.spin, 0),
      aspect: spec.aspect ?? 0,
      weather,
    };
    this.drawSprite(s, 0, 0);
    this.sprites.push(s);
  }

  private drawSprite(s: LiveSprite, t: number, delta: number): void {
    const spec = s.spec;
    const img = s.img;
    const w = s.from + (s.to - s.from) * sizeCurve(spec.ease ?? 'out', t);
    const fw = img.frame.width;
    const sx = w / fw;
    const sy = s.aspect ? (w * s.aspect) / img.frame.height : sx;
    img.setScale(Math.max(0, sx), Math.max(0, sy));
    s.rot += (s.spin * delta) / 1000;
    img.setAngle(s.rot);
    const dim = s.weather ? this.weatherAlpha : 1;
    img.setAlpha((spec.alpha ?? 1) * fadeCurve(spec.fade ?? 'linear', t) * dim);
    img.setTint(s.ramp.length > 1 ? rampColor(s.ramp, t) : (s.ramp[0] ?? 0xffffff));
  }

  private releaseSprite(img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    this.spritePool.push(img);
  }
}
