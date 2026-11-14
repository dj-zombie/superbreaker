import Phaser from 'phaser';
import { save } from '../../services';
import { audio } from '../../systems/AudioSystem';
import { calm, richFx, type UiTheme } from '../theme';
import { heroGlow, type GlowHandle } from './glow';
import { every } from './motion';
import { burst } from './particles';

export interface LogoKeys {
  base: string;
  /** Emissive cracks as white; tinted with the world's glow. Optional for the fallback logo. */
  glow: string;
}

export const DEFAULT_LOGO: LogoKeys = { base: 'logo', glow: 'logo_glow' };

/** Logo designs in images/ui/logo, built by scripts/process-logo.py. */
export const LOGO_VARIANTS = ['forged-slab', 'shattered', 'blade', 'emblem'] as const;

let launched: string | undefined;

/** The logo for this launch: one variant at random, or `?logo=2` in dev for the second. */
export function launchLogo(): string {
  if (launched) return launched;
  const dev =
    import.meta.env.DEV && typeof location !== 'undefined'
      ? LOGO_VARIANTS[Number(new URLSearchParams(location.search).get('logo')) - 1]
      : undefined;
  launched = dev ?? Phaser.Utils.Array.GetRandom([...LOGO_VARIANTS]);
  return launched;
}

/** Queues the launch logo's base and glow layers under DEFAULT_LOGO's keys. */
export function loadLogo(load: Phaser.Loader.LoaderPlugin): void {
  const v = launchLogo();
  load.image(DEFAULT_LOGO.base, `images/ui/logo/${v}.webp`);
  load.image(DEFAULT_LOGO.glow, `images/ui/logo/${v}_glow.webp`);
}

const ROWS = 3;
const COLS = 7;
const SWEEP_FRAMES = 14;
/** The sweep is soft, so it is baked at a third of the logo's resolution. */
const SWEEP_SCALE = 3;

/** Brick-shaped frames over the logo texture, with odd rows offset by half a brick. */
function fragmentFrames(scene: Phaser.Scene, key: string): Phaser.Textures.Frame[] {
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage() as { width: number; height: number };
  const W = src.width;
  const H = src.height;
  const rowH = Math.ceil(H / ROWS);
  const brick = W / COLS;
  const frames: Phaser.Textures.Frame[] = [];
  for (let r = 0; r < ROWS; r++) {
    const shift = r % 2 ? brick / 2 : 0;
    const edges = [0];
    for (let c = 1; c <= COLS; c++) edges.push(Math.min(W, Math.round(c * brick - shift)));
    if (shift) edges.push(W);
    for (let i = 0; i < edges.length - 1; i++) {
      const x = edges[i]!;
      const w = edges[i + 1]! - x;
      if (w < 4) continue;
      const name = `frag_${r}_${i}`;
      const y = r * rowH;
      const h = Math.min(rowH, H - y);
      const frame = tex.has(name) ? tex.get(name) : tex.add(name, 0, x, y, w, h);
      if (frame) frames.push(frame);
    }
  }
  // Adding frames makes the first one the texture's default; keep the whole logo as the default.
  tex.firstFrame = '__BASE';
  return frames;
}

/** A light band clipped to the logo silhouette, baked as frames so it costs one sprite. */
function sweepTexture(scene: Phaser.Scene, key: string): string {
  const out = `${key}_sweep`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const w = Math.max(1, Math.round(src.width / SWEEP_SCALE));
  const h = Math.max(1, Math.round(src.height / SWEEP_SCALE));
  const cols = 4;
  const rows = Math.ceil(SWEEP_FRAMES / cols);
  const sheet = scene.textures.createCanvas(out, w * cols, h * rows);
  if (!sheet) return out;
  const ctx = sheet.getContext();
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d')!;
  for (let f = 0; f < SWEEP_FRAMES; f++) {
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.drawImage(src, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    const cx = -0.25 * w + (f / (SWEEP_FRAMES - 1)) * 1.5 * w;
    t.save();
    t.transform(1, 0, -0.5, 1, h * 0.25, 0);
    const g = t.createLinearGradient(cx - w * 0.09, 0, cx + w * 0.09, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = g;
    t.fillRect(cx - w * 0.1, 0, w * 0.2, h);
    t.restore();
    const x = (f % cols) * w;
    const y = Math.floor(f / cols) * h;
    ctx.drawImage(tmp, x, y);
    sheet.add(`s${f}`, 0, x, y, w, h);
  }
  sheet.refresh();
  return out;
}

/**
 * The title logo: shatters in from brick fragments, slams together, ignites its cracks in the
 * world's colour, then idles with a light sweep and the world's motion.
 */
export class Logo extends Phaser.GameObjects.Container {
  readonly base: Phaser.GameObjects.Image;
  private glow?: Phaser.GameObjects.Image;
  private core?: Phaser.GameObjects.Image;
  private sweepImg?: Phaser.GameObjects.Image;
  private glowFx?: GlowHandle;
  private loops: Array<{ stop(): void }> = [];
  private readonly s: number;
  private settled = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    private readonly t: UiTheme,
    private readonly keys: LogoKeys = DEFAULT_LOGO,
  ) {
    super(scene, x, y);
    this.base = scene.add.image(0, 0, keys.base);
    this.s = width / this.base.width;
    this.base.setScale(this.s);
    this.add(this.base);
    if (scene.textures.exists(keys.glow)) {
      this.glow = scene.add
        .image(0, 0, keys.glow)
        .setTint(t.palette.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.glow.setScale(width / this.glow.width);
      this.core = scene.add
        .image(0, 0, keys.glow)
        .setScale(this.glow.scale)
        .setTint(t.palette.accentHi)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.add([this.glow, this.core]);
    }
    this.setSize(width, this.base.height * this.s);
    scene.add.existing(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.stopIdle());
  }

  get logoHeight(): number {
    return this.base.height * this.s;
  }

  /** Final state with no entrance. */
  show(): this {
    this.base.setAlpha(1);
    this.glow?.setAlpha(1);
    this.core?.setAlpha(0.45);
    this.settle();
    return this;
  }

  /** Fragments fly in and slam together, then the cracks ignite. */
  reveal(delay = 0, onDone?: () => void): this {
    if (calm()) {
      this.setAlpha(0);
      this.scene.tweens.add({
        targets: this,
        alpha: 1,
        delay,
        duration: 400,
        onComplete: () => {
          this.show();
          onDone?.();
        },
      });
      return this;
    }
    this.base.setAlpha(0);
    const frames = fragmentFrames(this.scene, this.keys.base);
    const W = this.base.width;
    const H = this.base.height;
    const order = Phaser.Utils.Array.Shuffle(frames.map((_, i) => i));
    let landed = 0;
    const pieces = frames.map((frame, i) => {
      const fx = (frame.cutX + frame.cutWidth / 2 - W / 2) * this.s;
      const fy = (frame.cutY + frame.cutHeight / 2 - H / 2) * this.s;
      const piece = this.scene.add.image(fx, fy, this.keys.base, frame.name).setScale(this.s * 1.6);
      this.add(piece);
      const a = Math.atan2(fy, fx || 1) + Phaser.Math.FloatBetween(-0.6, 0.6);
      const r = Phaser.Math.Between(260, 460);
      piece.setPosition(fx + Math.cos(a) * r, fy + Math.sin(a) * r - 80);
      piece.setAngle(Phaser.Math.Between(-120, 120)).setAlpha(0);
      this.scene.tweens.add({
        targets: piece,
        x: fx,
        y: fy,
        angle: 0,
        scale: this.s,
        alpha: 1,
        delay: delay + order.indexOf(i) * 26,
        duration: 460,
        ease: 'Cubic.In',
        onComplete: () => {
          landed++;
          if (landed % 4 === 0) audio.breakSound(-300);
          if (landed === frames.length) this.slam(pieces, onDone);
        },
      });
      return piece;
    });
    return this;
  }

  private slam(pieces: Phaser.GameObjects.Image[], onDone?: () => void): void {
    for (const p of pieces) p.destroy();
    this.base.setAlpha(1);
    const flash = this.scene.add
      .image(0, 0, this.keys.base)
      .setScale(this.s)
      .setTint(0xffffff)
      .setTintMode(Phaser.TintModes.FILL)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.9);
    this.add(flash);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    this.scene.tweens.add({
      targets: this,
      scale: { from: this.scale * 1.06, to: this.scale },
      duration: 320,
      ease: 'Back.Out',
    });
    if (save.state.settings.screenShake) this.scene.cameras.main.shake(180, 0.006);
    audio.sfx('death', 0.25, -600);
    const m = this.getWorldTransformMatrix();
    burst(this.scene, 0, 0, this.t, {
      count: 40,
      speed: 380,
      zone: new Phaser.Geom.Rectangle(
        m.tx - (this.width * this.scale) / 2,
        m.ty - (this.logoHeight * this.scale) / 2,
        this.width * this.scale,
        this.logoHeight * this.scale,
      ),
      depth: this.depth + 1,
    });
    this.ignite(onDone);
  }

  /** Cracks catch: a stutter of light, then full glow. */
  private ignite(onDone?: () => void): void {
    if (!this.glow || !this.core) {
      this.settle();
      onDone?.();
      return;
    }
    this.scene.tweens.chain({
      targets: this.glow,
      tweens: [
        { alpha: 0.6, duration: 60 },
        { alpha: 0.15, duration: 80 },
        { alpha: 1, duration: 260, ease: 'Cubic.Out' },
      ],
      delay: 120,
      onComplete: () => {
        this.settle();
        onDone?.();
      },
    });
    this.scene.tweens.add({ targets: this.core, alpha: 0.45, delay: 260, duration: 500 });
  }

  private settle(): void {
    if (this.settled) return;
    this.settled = true;
    if (richFx()) this.glowFx = heroGlow(this.scene, this.base, this.t.palette.glow, { strength: 2.5 });
    this.startIdle();
  }

  /** Plays the light sweep once. */
  sweep(): void {
    if (calm()) return;
    if (!this.sweepImg) {
      this.sweepImg = this.scene.add
        .image(0, 0, sweepTexture(this.scene, this.keys.base), 's0')
        .setScale(this.s * SWEEP_SCALE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(this.t.palette.accentHi)
        .setAlpha(0);
      this.add(this.sweepImg);
    }
    const img = this.sweepImg;
    const state = { f: 0 };
    img.setAlpha(0.85);
    this.scene.tweens.add({
      targets: state,
      f: SWEEP_FRAMES - 1,
      duration: 900,
      ease: 'Sine.InOut',
      onUpdate: () => img.setFrame(`s${Math.round(state.f)}`),
      onComplete: () => img.setAlpha(0),
    });
  }

  private startIdle(): void {
    if (calm()) return;
    const scene = this.scene;
    this.scene.time.delayedCall(500, () => this.active && this.sweep());
    this.loops.push(every(scene, 4200, 6200, () => this.sweep()));
    if (!this.glow) return;
    const glow = this.glow;
    if (this.t.textFx === 'heat') {
      scene.tweens.add({
        targets: glow,
        alpha: { from: 1, to: 0.62 },
        duration: 1700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    } else if (this.t.textFx === 'candle') {
      this.loops.push(
        every(scene, 90, 380, () => glow.setAlpha(Phaser.Math.FloatBetween(0.7, 1))),
      );
    } else {
      this.loops.push(every(scene, 2400, 5200, () => this.glitch()));
    }
  }

  /** RGB split and offset slices for a few frames. */
  private glitch(): void {
    if (!this.active) return;
    const W = this.base.width;
    const H = this.base.height;
    const parts: Phaser.GameObjects.Image[] = [];
    const split = (dx: number, color: number) => {
      const img = this.scene.add
        .image(dx, 0, this.keys.base)
        .setScale(this.s)
        .setTint(color)
        .setTintMode(Phaser.TintModes.FILL)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.35);
      parts.push(img);
      this.add(img);
    };
    split(-5, this.t.palette.accent2);
    split(5, this.t.palette.accent);
    for (let i = 0; i < 3; i++) {
      const y = Phaser.Math.Between(0, H - 24);
      const h = Phaser.Math.Between(10, 40);
      const img = this.scene.add
        .image(Phaser.Math.Between(-16, 16), 0, this.keys.base)
        .setScale(this.s)
        .setCrop(0, y, W, h);
      parts.push(img);
      this.add(img);
    }
    this.scene.time.delayedCall(Phaser.Math.Between(90, 170), () => {
      for (const p of parts) p.destroy();
    });
  }

  stopIdle(): void {
    for (const l of this.loops) l.stop();
    this.loops = [];
    this.glowFx?.destroy();
    this.glowFx = undefined;
  }
}
