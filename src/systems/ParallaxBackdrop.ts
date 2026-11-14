import Phaser from 'phaser';
import {
  WORLD_IDS,
  WORLD_LOOKS,
  partKey,
  worldAssets,
  worldLayers,
  type GlowLook,
  type MoteLook,
  type TileLook,
  type WorldId,
} from '../art/backdrops';
import { HEIGHT, STAGE_W, WIDTH, WING } from '../config';
import { save } from '../services';
import type { Tintable } from './Backdrop';
import { particleDensity } from './Quality';

const DEPTH = -100;
/** Rows drawn above and below the view so camera shake never exposes an edge. */
const BLEED = 12;
const GLOW_KEY = 'bd_glow';
const BIT_KEY = 'bd_bit';

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
   * Call from a scene's preload(). A world's layers take about 18 MB of GPU memory, so only
   * one world stays resident: the others are released when a scene asks for a different one.
   */
  static preload(scene: Phaser.Scene, world: WorldId): void {
    for (const other of WORLD_IDS) {
      if (other === world) continue;
      for (const a of worldAssets(other)) {
        if (scene.textures.exists(a.key)) scene.textures.remove(a.key);
      }
    }
    for (const a of worldAssets(world)) {
      if (!scene.textures.exists(a.key)) scene.load.image(a.key, `assets/${a.path}`);
    }
  }

  private sky: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private skyTint: number;
  private tiles: TileLayer[] = [];
  private glows: GlowLayer[] = [];
  private motes: MoteLayer[] = [];
  private pace: number;
  private paceTarget: number;
  private sway = 0;
  private swayTarget = 0;
  private flare = 0;
  private clock = 0;
  private tint = 0xffffff;
  private readonly still: boolean;
  private lightProbe?: (x: number, y: number) => number;

  /** `pace` scales every scroll speed; menus drift slower than play. */
  constructor(
    private scene: Phaser.Scene,
    readonly world: WorldId,
    pace = 1,
  ) {
    this.still = save.state.settings.reducedMotion;
    this.pace = this.paceTarget = this.still ? 0 : pace;
    const look = WORLD_LOOKS[world];
    const art = worldLayers(world);
    const skyKey = art ? partKey(art.sky) : '';
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
      } else if (!this.still) {
        this.motes.push(this.addMotes(layer, depth));
      }
    });

    this.layout();
    this.applyTint();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    });
  }

  /** Multiply tint from Backdrop (dim, Fever hue, Black Hole dark) over each layer's own grade. */
  setTint(color: number): this {
    this.tint = color;
    this.applyTint();
    return this;
  }

  /** Scroll speed multiplier, eased so Fever feels like the floor dropping away. */
  setPace(multiplier: number): void {
    if (!this.still) this.paceTarget = multiplier;
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
    const light = luminance(this.tint);
    for (const m of this.motes) m.emitter.setAlpha(light);
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
    for (const g of this.glows) {
      const size = HEIGHT * g.look.size;
      g.image.setPosition(WIDTH / 2, HEIGHT * g.look.y).setDisplaySize(size * 1.3, size);
    }
    for (const m of this.motes) m.zone.setTo(0, HEIGHT * 0.1, WIDTH, HEIGHT * 0.95);
    this.place();
  }

  private place(): void {
    for (const t of this.tiles) {
      const reach = t.look.sway ?? 0;
      const left = -WING - reach - this.sway * reach;
      for (const p of t.parts) {
        p.sprite.x = left + p.x * t.scale;
        p.sprite.tilePositionY = t.offset / t.scale;
      }
    }
  }

  private onUpdate(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.clock += dt;
    this.pace += (this.paceTarget - this.pace) * Math.min(1, dt * 2.2);
    this.sway += (this.swayTarget - this.sway) * Math.min(1, dt * 3);
    for (const t of this.tiles) t.offset = (t.offset + t.look.speed * this.pace * dt) % t.period;
    this.place();

    this.flare *= Math.exp(-dt * 3.5);
    const flicker = this.still
      ? 1
      : 1 + 0.1 * Math.sin(this.clock * 1.7) + 0.06 * Math.sin(this.clock * 4.3 + 1.3);
    for (const g of this.glows) g.image.setAlpha(Math.min(1, g.look.alpha * flicker + this.flare));
    for (const m of this.motes) m.emitter.timeScale = Math.max(0.2, this.pace);
  }
}
