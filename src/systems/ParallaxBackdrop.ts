import Phaser from 'phaser';
import {
  SCENERY_IDS,
  WORLD_LOOKS,
  partKey,
  worldAssets,
  worldLayers,
  type GlowLook,
  type MoteLook,
  type SceneryId,
  type StillLook,
  type TileLook,
} from '../art/backdrops';
import { HEIGHT, LEVEL_OFFSET_Y, STAGE_W, WIDTH, WIDE, WING } from '../config';
import { save } from '../services';
import type { Tintable } from './Backdrop';
import { particleDensity } from './Quality';

const DEPTH = -100;
/** Rows drawn above and below the view so camera shake never exposes an edge. */
const BLEED = 12;
/** Set in preload and read in the constructor so both agree on which sheet to use. */
const HD_REG = 'backdropHd';
const GLOW_KEY = 'bd_glow';
/** A scenery switch fades the new layers in over the old ones for this long, in ms. */
const SWITCH_MS = 900;
const BIT_KEY = 'bd_bit';
/** A still plate rises into place over this long as the descent stops, in ms. */
const LAND_MS = 2200;
/** How far below its place a still plate waits while the layers scroll, as a share of the view. */
const LAND_DROP = 1.05;
/** The fall: how much nearer the nearest layer comes, the roll at its widest, in radians, and the
 * pace the shaft scrolls at once the room has gone. Every layer swells a little, so a roll never
 * shows an edge. */
const FALL_ZOOM = 0.35;
const FALL_SWELL = 0.08;
const FALL_ROLL = 0.045;
const FALL_PACE = 2.6;
/** The fall's vanishing point, as a share of the view's height. */
const FALL_FOCUS_Y = 0.55;
/** A pulse dies away at this rate, per second. */
const PULSE_DECAY = 5;

interface TileLayer {
  look: TileLook;
  parts: { sprite: Phaser.GameObjects.TileSprite; x: number; width: number }[];
  /** Source sheet size in pixels. */
  srcWidth: number;
  srcHeight: number;
  /** Playfield units per source pixel. The sheet spans the whole stage. */
  scale: number;
  /** Height of one repeat in playfield units. */
  period: number;
  offset: number;
}

interface StillLayer {
  look: StillLook;
  image: Phaser.GameObjects.Image;
  glows: Array<{ image: Phaser.GameObjects.Image; spec: NonNullable<StillLook['glows']>[number] }>;
  /** Rows of the source plate trimmed off above the image, in source pixels. */
  srcY: number;
  /** Playfield units per source pixel. */
  scale: number;
}

/** Where a still plate is drawn now: its top-centre, its scale, and how solid it is. */
export interface StillFrame {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  alpha: number;
}

interface GlowLayer {
  look: GlowLook;
  image: Phaser.GameObjects.Image;
}

interface MoteLayer {
  look: MoteLook;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  zone: Phaser.Geom.Rectangle;
}

function multiply(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function luminance(c: number): number {
  return (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
}

function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_KEY)) return;
  const tex = scene.textures.createCanvas(GLOW_KEY, 256, 256);
  if (!tex) return;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  tex.refresh();
}

function ensureBitTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(BIT_KEY)) return;
  const tex = scene.textures.createCanvas(BIT_KEY, 8, 8);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, 2, 4, 4);
  tex.refresh();
}

/**
 * Shmup-style parallax: a static sky plate behind painted layers that scroll upward at
 * different speeds (the view sinks through the world), with fog, light and drifting sparks
 * between them. Nearer layers scroll faster and sway more against the paddle.
 */
export class ParallaxBackdrop implements Tintable {
  /**
   * Call from a scene's preload(). A phone world's layers take about 18 MB of GPU memory, and
   * the 16:9 set is 4x on a side, so only one world at one resolution stays resident.
   */
  static preload(scene: Phaser.Scene, world: SceneryId): void {
    const hd = WIDE && !save.state.settings.batterySaver;
    scene.registry.set(HD_REG, hd);
    const drop = (id: SceneryId, hi: boolean) => {
      for (const a of worldAssets(id, hi)) {
        if (scene.textures.exists(a.key)) scene.textures.remove(a.key);
      }
    };
    for (const other of SCENERY_IDS) {
      if (other === world) {
        drop(other, !hd);
        continue;
      }
      drop(other, false);
      drop(other, true);
    }
    for (const a of worldAssets(world, hd)) {
      if (!scene.textures.exists(a.key)) scene.load.image(a.key, `assets/${a.path}`);
    }
  }

  private world: SceneryId;
  private sky!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private skyTint = 0xffffff;
  private tiles: TileLayer[] = [];
  private stills: StillLayer[] = [];
  /**
   * Where the still plates are: below the view while the layers scroll, rising, in place, or
   * gone after a fall. `landMs` counts through the rise.
   */
  private landing: 'away' | 'rising' | 'landed' | 'gone' = 'away';
  private landMs = 0;
  private landPace = 1;
  /** How far through a fall the scenery is, 0..1. */
  private falling = 0;
  /** The heartbeat on the still plates' lights, 0..1. */
  private pulsing = 0;
  private readonly frame: StillFrame = { x: 0, y: 0, scale: 1, rotation: 0, alpha: 0 };
  private glows: GlowLayer[] = [];
  private motes: MoteLayer[] = [];
  private pace: number;
  private paceTarget: number;
  /** The pace last asked for: a landed room holds the layers still until a new scenery comes. */
  private wantPace: number;
  private sway = 0;
  private swayTarget = 0;
  private flare = 0;
  private clock = 0;
  private tint = 0xffffff;
  private readonly still: boolean;
  private lightProbe?: (x: number, y: number) => number;
  private haze?: { key: string; amount: number };
  /** How far the current scenery has faded in over the one it replaced, 0..1. */
  private fade = 1;
  /** The scenery whose art is loading, to fade to once it is in. */
  private switching?: SceneryId;
  private dead = false;

  /** `pace` scales every scroll speed; menus drift slower than play. */
  constructor(
    private scene: Phaser.Scene,
    world: SceneryId,
    pace = 1,
  ) {
    this.still = save.state.settings.reducedMotion;
    this.pace = this.paceTarget = this.still ? 0 : pace;
    this.wantPace = pace;
    this.world = world;
    this.build(world);
    this.layout();
    this.applyTint();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.dead = true;
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    });
  }

  /**
   * Fades to another scenery mid-scene, as Arcade's bonus round does. Its art loads first while
   * the current layers stay up; once the fade is over, the old scenery's textures are let go.
   */
  switchTo(id: SceneryId, pace = 1): void {
    this.setPace(pace);
    if (id === (this.switching ?? this.world)) return;
    this.switching = id;
    const scene = this.scene;
    const hd = scene.registry.get(HD_REG) === true;
    const go = () => {
      if (this.dead) return;
      if (this.switching !== id) {
        // Called off while it loaded: nothing shows it, so it need not stay resident.
        if (id !== this.world && id !== this.switching) this.drop(id);
        return;
      }
      this.crossTo(id);
    };
    const missing = worldAssets(id, hd).filter((a) => !scene.textures.exists(a.key));
    if (missing.length === 0) return go();
    for (const a of missing) scene.load.image(a.key, `assets/${a.path}`);
    scene.load.once(Phaser.Loader.Events.COMPLETE, go);
    scene.load.start();
  }

  private crossTo(id: SceneryId): void {
    const from = this.world;
    const old = this.objects();
    this.switching = undefined;
    this.world = id;
    this.build(id);
    this.layout();
    this.fade = 0;
    this.applyTint();
    this.applyFade();
    this.scene.tweens.add({ targets: old, alpha: 0, duration: SWITCH_MS });
    this.scene.tweens.add({
      targets: this,
      fade: 1,
      duration: SWITCH_MS,
      onUpdate: () => this.applyFade(),
      onComplete: () => {
        for (const o of old) o.destroy();
        if (from !== this.world && from !== this.switching) this.drop(from);
      },
    });
  }

  /** Lets go of one scenery's textures, at both resolutions. */
  private drop(id: SceneryId): void {
    for (const hi of [false, true]) {
      for (const a of worldAssets(id, hi)) {
        if (this.scene.textures.exists(a.key)) this.scene.textures.remove(a.key);
      }
    }
  }

  private objects(): Array<Phaser.GameObjects.GameObject & { alpha: number }> {
    return [
      this.sky,
      ...this.tiles.flatMap((t) => t.parts.map((p) => p.sprite)),
      ...this.stills.flatMap((s) => [s.image, ...s.glows.map((g) => g.image)]),
      ...this.glows.map((g) => g.image),
      ...this.motes.map((m) => m.emitter),
    ];
  }

  /** The layers of `id`, from the sky forward. */
  private build(id: SceneryId): void {
    const scene = this.scene;
    const look = WORLD_LOOKS[id];
    const art = worldLayers(id, scene.registry.get(HD_REG) === true);
    const skyKey = art ? partKey(art.sky) : '';
    this.tiles = [];
    this.stills = [];
    this.landing = 'away';
    this.falling = 0;
    if (!this.still) this.paceTarget = this.wantPace;
    this.glows = [];
    this.motes = [];
    this.skyTint = look.skyTint;
    this.sky = scene.textures.exists(skyKey)
      ? scene.add.image(WIDTH / 2, HEIGHT / 2, skyKey)
      : scene.add.rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W, HEIGHT, look.base);
    this.sky.setDepth(DEPTH);

    const saver = save.state.settings.batterySaver;
    look.layers.forEach((layer, i) => {
      const depth = DEPTH + 1 + i;
      if (layer.kind === 'tiles') {
        const src = art?.layers[layer.name];
        if (!src || (layer.optional && saver)) return;
        const parts = src.parts
          .filter((p) => scene.textures.exists(partKey(p.path)))
          .map((p) => {
            const sprite = scene.add
              .tileSprite(0, -BLEED, p.width, HEIGHT + 2 * BLEED, partKey(p.path))
              .setOrigin(0, 0)
              .setAlpha(layer.alpha ?? 1)
              .setDepth(depth);
            return { sprite, x: p.x, width: p.width };
          });
        const tile: TileLayer = {
          look: layer,
          parts,
          srcWidth: src.width,
          srcHeight: src.height,
          scale: 1,
          period: src.height,
          offset: 0,
        };
        this.fitTiles(tile);
        // Start each layer at a different point of its loop so the repeats never line up.
        tile.offset = (i * 0.37 * tile.period) % tile.period;
        this.tiles.push(tile);
      } else if (layer.kind === 'glow') {
        ensureGlowTexture(scene);
        const image = scene.add
          .image(WIDTH / 2, 0, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(layer.color)
          .setAlpha(layer.alpha)
          .setDepth(depth);
        this.glows.push({ look: layer, image });
      } else if (layer.kind === 'still') {
        const src = art?.layers[layer.name];
        const part = src?.parts[0];
        if (!src || !part || !scene.textures.exists(partKey(part.path))) return;
        ensureGlowTexture(scene);
        const image = scene.add.image(0, 0, partKey(part.path)).setOrigin(0.5, 0).setDepth(depth);
        const glows = (layer.glows ?? []).map((spec) => ({
          spec,
          image: scene.add
            .image(0, 0, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(spec.color)
            .setDepth(depth),
        }));
        this.stills.push({ look: layer, image, glows, srcY: src.y ?? 0, scale: 1 });
      } else if (!this.still) {
        this.motes.push(this.addMotes(layer, depth));
      }
    });
    if (this.haze) this.hazeNear(this.haze.key, this.haze.amount);
  }

  /** Multiply tint from Backdrop (dim, Fever hue, Black Hole dark) over each layer's own grade. */
  setTint(color: number): this {
    this.tint = color;
    this.applyTint();
    return this;
  }

  /** Scroll speed multiplier, eased so Fever feels like the floor dropping away. */
  setPace(multiplier: number): void {
    this.wantPace = multiplier;
    if (!this.still && this.landing !== 'rising' && this.landing !== 'landed') this.paceTarget = multiplier;
  }

  /** Horizontal focus, usually the paddle: nearer layers slide the other way. */
  setFocus(x: number): void {
    if (!this.still) this.swayTarget = Phaser.Math.Clamp((x - WIDTH / 2) / (WIDTH / 2), -1, 1);
  }

  /** Briefly brightens the light sources, e.g. for explosions. */
  flash(amount: number): void {
    this.flare = Math.min(0.6, this.flare + amount);
  }

  /** Dust only shows where light falls: `probe` returns a mote alpha multiplier at (x, y). */
  setLightProbe(probe?: (x: number, y: number) => number): void {
    this.lightProbe = probe;
  }

  /**
   * Heat shimmer on the nearest painted layer: a displacement filter driven by `noiseKey`,
   * which the caller scrolls. Costs a full-layer pass, so the lighting system only asks on High.
   */
  addHaze(noiseKey: string, amount: number): void {
    this.haze = { key: noiseKey, amount };
    this.hazeNear(noiseKey, amount);
  }

  /**
   * The descent stops: the layers ease to a halt as the still plates rise into place. `now`
   * puts them there at once, as a skipped scene or a fight started part-way needs.
   */
  land(now = false): void {
    if (this.landing === 'landed' || this.landing === 'gone') return;
    if (this.landing === 'rising' && !now) return;
    if (now || this.still) {
      this.landing = 'landed';
      this.pace = this.paceTarget = 0;
    } else {
      this.landing = 'rising';
      this.landMs = 0;
      this.landPace = this.pace;
    }
    this.placeStills();
  }

  /**
   * The floor gives way, `k` from 0 to 1: each layer swells toward the view as fast as it is near,
   * the view rolls, the room drops past and the shaft scrolls again, faster. Under reduced motion
   * the room fades out instead. At 1 the room is gone for good.
   */
  fall(k: number): void {
    if (this.landing === 'gone') return;
    this.falling = Phaser.Math.Clamp(k, 0, 1);
    if (!this.still) this.paceTarget = this.pace = FALL_PACE * this.falling * this.falling;
    if (this.falling >= 1) {
      this.landing = 'gone';
      this.falling = 0;
      if (!this.still) this.paceTarget = FALL_PACE;
    }
    this.place();
  }

  /** A heartbeat on the still plates' lights, and a little on the rest. */
  pulse(amount: number): void {
    this.pulsing = Math.min(1, this.pulsing + amount);
    this.flare = Math.min(0.6, this.flare + amount * 0.25);
  }

  /** Where a still plate is drawn now, for props that ride on it. Undefined when it isn't shown. */
  stillFrame(name: string): Readonly<StillFrame> | undefined {
    const s = this.stills.find((p) => p.look.name === name);
    if (!s || !s.image.visible) return undefined;
    const f = this.frame;
    f.x = s.image.x;
    f.y = s.image.y - s.srcY * s.image.scaleY;
    f.scale = s.image.scaleX;
    f.rotation = s.image.rotation;
    f.alpha = s.image.alpha;
    return f;
  }

  private hazeNear(noiseKey: string, amount: number): void {
    const near = this.tiles[this.tiles.length - 1];
    if (!near) return;
    for (const p of near.parts) {
      p.sprite.enableFilters();
      p.sprite.filters?.internal.addDisplacement(noiseKey, amount, amount);
    }
  }

  private addMotes(look: MoteLook, depth: number): MoteLayer {
    const zone = new Phaser.Geom.Rectangle(0, 0, WIDTH, HEIGHT);
    const lifespan = 7000;
    const count = Math.max(1, Math.round(look.count * particleDensity()));
    if (look.shape === 'bit') ensureBitTexture(this.scene);
    const emitter = this.scene.add
      .particles(0, 0, look.shape === 'bit' ? BIT_KEY : 'spark', {
        lifespan: { min: lifespan * 0.6, max: lifespan * 1.2 },
        speedY: { min: -look.rise[1], max: -look.rise[0] },
        speedX: { min: -8, max: 8 },
        accelerationX: { min: -5, max: 5 },
        scale: { min: look.scale[0], max: look.scale[1] },
        alpha: {
          onEmit: () => 0,
          onUpdate: (p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) =>
            Math.sin(Math.PI * t) * look.alpha * (this.lightProbe ? this.lightProbe(p.x, p.y) : 1),
        },
        tint: look.colors,
        blendMode: Phaser.BlendModes.ADD,
        frequency: lifespan / count,
        maxAliveParticles: count,
        emitZone: {
          type: 'random',
          source: zone,
          quantity: 1,
        } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(depth);
    emitter.fastForward(lifespan);
    return { look, emitter, zone };
  }

  private applyTint(): void {
    if (this.sky instanceof Phaser.GameObjects.Image)
      this.sky.setTint(multiply(this.skyTint, this.tint));
    else this.sky.setFillStyle(multiply(WORLD_LOOKS[this.world].base, this.tint));
    for (const t of this.tiles) {
      const color = multiply(t.look.tint ?? 0xffffff, this.tint);
      for (const p of t.parts) p.sprite.setTint(color);
    }
    for (const g of this.glows) g.image.setTint(multiply(g.look.color, this.tint));
    for (const s of this.stills) {
      s.image.setTint(multiply(s.look.tint ?? 0xffffff, this.tint));
      for (const g of s.glows) g.image.setTint(multiply(g.spec.color, this.tint));
    }
    const light = luminance(this.tint);
    for (const m of this.motes) m.emitter.setAlpha(light * this.fade);
  }

  /** The layers' own opacity, scaled by how far a scenery switch has faded in. */
  private applyFade(): void {
    this.sky.setAlpha(this.fade);
    for (const t of this.tiles) for (const p of t.parts) p.sprite.setAlpha((t.look.alpha ?? 1) * this.fade);
    const light = luminance(this.tint);
    for (const m of this.motes) m.emitter.setAlpha(light * this.fade);
  }

  /**
   * Fits a painted layer across the whole stage. On the wide stage the same sheet just gets
   * bigger, so the near cliffs that framed the portrait board fill the wings instead.
   */
  private fitTiles(t: TileLayer): void {
    const scale = (STAGE_W + 2 * (t.look.sway ?? 0)) / t.srcWidth;
    const loop = t.period > 0 ? t.offset / t.period : 0;
    t.scale = scale;
    t.period = t.srcHeight * scale;
    t.offset = loop * t.period;
    for (const p of t.parts) {
      p.sprite.setSize(p.width * scale, HEIGHT + 2 * BLEED).setTileScale(scale);
    }
  }

  private layout(): void {
    // The stage is symmetric about the board, so its center is the board's.
    if (this.sky instanceof Phaser.GameObjects.Image) {
      const cover = Math.max(STAGE_W / this.sky.frame.width, HEIGHT / this.sky.frame.height);
      this.sky.setPosition(WIDTH / 2, HEIGHT / 2).setScale(cover);
    } else {
      this.sky.setPosition(WIDTH / 2, HEIGHT / 2).setSize(STAGE_W, HEIGHT);
    }
    for (const t of this.tiles) this.fitTiles(t);
    for (const s of this.stills) {
      s.scale = s.look.width / s.image.frame.width;
    }
    for (const g of this.glows) {
      const size = HEIGHT * g.look.size;
      g.image.setPosition(WIDTH / 2, HEIGHT * g.look.y).setDisplaySize(size * 1.3, size);
    }
    for (const m of this.motes) m.zone.setTo(0, HEIGHT * 0.1, WIDTH, HEIGHT * 0.95);
    this.place();
  }

  private place(): void {
    const k = this.still ? 0 : this.falling;
    const arc = Math.sin(Math.PI * k);
    const roll = FALL_ROLL * arc * Math.sin(k * 9);
    const vx = WIDTH / 2;
    const vy = HEIGHT * FALL_FOCUS_Y;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    for (const t of this.tiles) {
      const reach = t.look.sway ?? 0;
      const left = -WING - reach - this.sway * reach;
      // Nearer layers scroll faster: their speed says how near they are.
      const near = Math.min(1, t.look.speed / 36);
      const zoom = 1 + (FALL_SWELL + FALL_ZOOM * near) * arc;
      for (const p of t.parts) {
        p.sprite.tilePositionY = t.offset / t.scale;
        const x = left + p.x * t.scale - vx;
        const y = -BLEED - vy;
        p.sprite
          .setPosition(vx + zoom * (x * cos - y * sin), vy + zoom * (x * sin + y * cos))
          .setScale(zoom)
          .setRotation(roll);
      }
    }
    this.placeStills();
  }

  /** The still plates: below the view, rising, in place, or dropping away in a fall. */
  private placeStills(): void {
    const k = this.falling;
    const rise = this.landing === 'rising' ? 1 - Phaser.Math.Easing.Cubic.Out(this.landMs / LAND_MS) : 0;
    const shown = this.landing === 'rising' || this.landing === 'landed';
    const vx = WIDTH / 2;
    const vy = HEIGHT * FALL_FOCUS_Y;
    const beat = this.pulsing;
    const flicker = this.still ? 1 : 1 + 0.08 * Math.sin(this.clock * 2.3) + 0.05 * Math.sin(this.clock * 5.1);
    for (const s of this.stills) {
      const top = LEVEL_OFFSET_Y + s.look.top + rise * HEIGHT * LAND_DROP;
      let zoom = 1;
      let y = top + s.srcY * s.scale;
      let x = vx;
      let alpha = 1;
      if (k > 0) {
        if (this.still) {
          alpha = 1 - k;
        } else {
          // The room drops away under the view, swelling as it passes.
          zoom = 1 + 1.6 * k * k * s.look.depth;
          y = vy + (y - vy) * zoom - HEIGHT * 0.7 * k * k;
          x = vx;
          alpha = 1 - Phaser.Math.Clamp((k - 0.55) / 0.4, 0, 1);
        }
      }
      s.image
        .setVisible(shown)
        .setPosition(x, y)
        .setScale(s.scale * zoom)
        .setAlpha(alpha * this.fade);
      for (const g of s.glows) {
        const { spec } = g;
        g.image
          .setVisible(shown)
          .setPosition(x + (spec.x - s.image.frame.width / 2) * s.scale * zoom, y + (spec.y - s.srcY) * s.scale * zoom)
          .setDisplaySize(spec.width * s.scale * zoom * 1.3, spec.height * s.scale * zoom * 1.3)
          .setAlpha(Math.min(1, spec.alpha * flicker * (0.7 + 0.6 * beat) + this.flare) * alpha * this.fade);
      }
    }
  }

  private onUpdate(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.clock += dt;
    this.pace += (this.paceTarget - this.pace) * Math.min(1, dt * 2.2);
    this.sway += (this.swayTarget - this.sway) * Math.min(1, dt * 3);
    if (this.landing === 'rising') {
      this.landMs += dt * 1000;
      const t = Math.min(1, this.landMs / LAND_MS);
      // The scroll brakes with the room's rise, so they come to rest together.
      this.pace = this.paceTarget = this.landPace * (1 - t) * (1 - t);
      if (t >= 1) this.landing = 'landed';
    }
    this.pulsing *= Math.exp(-dt * PULSE_DECAY);
    for (const t of this.tiles) t.offset = (t.offset + t.look.speed * this.pace * dt) % t.period;
    this.place();

    this.flare *= Math.exp(-dt * 3.5);
    const flicker = this.still
      ? 1
      : 1 + 0.1 * Math.sin(this.clock * 1.7) + 0.06 * Math.sin(this.clock * 4.3 + 1.3);
    for (const g of this.glows) {
      g.image.setAlpha(Math.min(1, g.look.alpha * flicker + this.flare) * this.fade);
    }
    for (const m of this.motes) m.emitter.timeScale = Math.max(0.2, this.pace);
  }
}
