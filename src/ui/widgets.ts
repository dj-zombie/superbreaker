import Phaser from 'phaser';
import { RENDER_ZOOM } from '../config';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { canvasTexture, raysTexture, ringFrame, ringStripTexture, softDiscTexture, stylePath, TEX_SCALE } from './frames';
import { countUp, punch, shake } from './fx/motion';
import { icon, type IconName } from './icons';
import { calm, css, theme, type UiTheme } from './theme';

type Ctx = CanvasRenderingContext2D;

/** Small horizontal slot: coin pill, meters. Nine-sliced. */
function pillTexture(scene: Phaser.Scene, t: UiTheme): string {
  return canvasTexture(scene, `ui_pill_${t.frame}`, 48, 32, (ctx: Ctx, w, h) => {
    const cut = t.frame === 'gothic' ? 7 : 10;
    stylePath(ctx, t.frame, 1, 1, w - 2, h - 2, cut);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const [a, b, edge] =
      t.frame === 'forged'
        ? ['rgba(30,16,10,0.92)', 'rgba(8,4,2,0.92)', 'rgba(255,150,70,0.55)']
        : t.frame === 'gothic'
          ? ['rgba(24,24,54,0.9)', 'rgba(6,6,18,0.92)', 'rgba(210,214,240,0.6)']
          : ['rgba(4,30,40,0.85)', 'rgba(1,10,14,0.9)', 'rgba(60,231,255,0.8)'];
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = edge;
    ctx.stroke();
  });
}

function pill(scene: Phaser.Scene, t: UiTheme, w: number, h: number): Phaser.GameObjects.NineSlice {
  const s = 12 * TEX_SCALE;
  return scene.add
    .nineslice(0, 0, pillTexture(scene, t), undefined, w * TEX_SCALE, h * TEX_SCALE, s, s, s, s)
    .setScale(1 / TEX_SCALE);
}

/** Coin balance anchored at its right edge. Counts up when coins arrive and shakes red on refusal. */
export class CurrencyPill extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.NineSlice;
  private coin: Phaser.GameObjects.Image;
  private text: Phaser.GameObjects.Text;
  private shown: number;
  private readonly t: UiTheme;
  private readonly color: number;
  private readonly fmt: (n: number) => string;

  constructor(
    scene: Phaser.Scene,
    right: number,
    y: number,
    value = save.state.coins,
    opts: { icon?: string; color?: number; suffix?: string } = {},
  ) {
    super(scene, right, y);
    this.t = theme();
    this.color = opts.color ?? this.t.palette.gold;
    this.fmt = (n) => `${Math.round(n).toLocaleString()}${opts.suffix ?? ''}`;
    this.shown = value;
    this.bg = pill(scene, this.t, 100, 36).setOrigin(1, 0.5);
    this.coin = scene.add.image(0, 0, opts.icon ?? 'coin_icon');
    this.coin.setScale(24 / this.coin.width);
    this.text = scene.add
      .text(0, 0, this.fmt(value), {
        fontFamily: this.t.fonts.display,
        fontSize: '22px',
        fontStyle: '800',
        color: css(this.color),
        resolution: RENDER_ZOOM,
      })
      .setOrigin(1, 0.5)
      .setShadow(0, 1, 'rgba(0,0,0,0.7)', 3, false, true);
    this.add([this.bg, this.coin, this.text]);
    this.layout();
    scene.add.existing(this);
  }

  private layout(): void {
    const w = Math.max(84, this.text.width + 56);
    this.bg.setSize(w * TEX_SCALE, 36 * TEX_SCALE);
    this.text.setPosition(-14, 1);
    this.coin.setPosition(-w + 22, 0);
    this.setSize(w, 36);
  }

  /** World position of the coin icon, where flying coins land. */
  target(): { x: number; y: number } {
    const m = this.getWorldTransformMatrix();
    return { x: m.tx + this.coin.x * m.scaleX, y: m.ty + this.coin.y * m.scaleY };
  }

  /** Rolls the shown balance to `value`. */
  setValue(value: number, animate = true): void {
    const from = this.shown;
    this.shown = value;
    if (!animate) {
      this.text.setText(this.fmt(value));
      this.layout();
      return;
    }
    countUp(this.scene, this.text, from, value, {
      duration: 520,
      format: this.fmt,
      onTick: () => this.layout(),
      onComplete: () => this.layout(),
    });
    punch(this.scene, this.coin, 1.35);
  }

  /** Bumps for each coin landing without changing the number. */
  bump(): void {
    punch(this.scene, this.coin, 1.3, 90);
  }

  refresh(): void {
    this.setValue(save.state.coins, save.state.coins !== this.shown);
  }

  /** Not enough coins: red flash and a shake. */
  deny(): void {
    this.text.setColor(css(this.t.palette.danger));
    this.bg.setTint(this.t.palette.danger);
    shake(this.scene, this, 6);
    this.scene.time.delayedCall(420, () => {
      if (!this.active) return;
      this.text.setColor(css(this.color));
      this.bg.clearTint();
    });
  }
}

/** Row of three stars, filled up to `count`. */
export function starRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  size = 22,
  gap = 4,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  for (let i = 0; i < 3; i++) {
    const s = scene.add.image((i - 1) * (size + gap), 0, i < count ? 'star' : 'star_off');
    s.setScale(size / s.width);
    if (i >= count) s.setAlpha(0.45);
    c.add(s);
  }
  return c;
}

/**
 * Three big stars that slam in one by one with light rays behind the earned ones. Empty
 * sockets are shown first so the row reads before it fills.
 */
export function revealStars(
  scene: Phaser.Scene,
  x: number,
  y: number,
  earned: number,
  opts: { size?: number; delay?: number; t?: UiTheme; onStar?: (i: number) => void } = {},
): Phaser.GameObjects.Container {
  const t = opts.t ?? theme();
  const size = opts.size ?? 64;
  const gap = size * 0.28;
  const c = scene.add.container(x, y);
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * (size + gap);
    const sy = i === 1 ? -size * 0.18 : 0;
    const off = scene.add.image(sx, sy, 'star_off').setAlpha(0.35);
    off.setScale((size * 0.9) / off.width);
    c.add(off);
    if (i >= earned) continue;
    const rays = scene.add
      .image(sx, sy, raysTexture(scene))
      .setTint(t.palette.accentHi)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScale((size * 2.4) / 256);
    const star = scene.add.image(sx, sy, 'star_big').setAlpha(0);
    const s = size / star.width;
    c.add([rays, star]);
    const delay = (opts.delay ?? 300) + i * 380;
    if (calm()) {
      star.setScale(s);
      scene.tweens.add({ targets: star, alpha: 1, delay, duration: 160 });
      scene.time.delayedCall(delay, () => opts.onStar?.(i));
      continue;
    }
    star.setScale(s * 2.6).setAngle(-40);
    scene.tweens.add({
      targets: star,
      scale: s,
      angle: 0,
      alpha: 1,
      delay,
      duration: 300,
      ease: 'Back.Out',
      onStart: () => opts.onStar?.(i),
    });
    scene.tweens.add({ targets: rays, alpha: 0.75, delay: delay + 120, duration: 200 });
    scene.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
    scene.tweens.add({
      targets: rays,
      alpha: 0.35,
      delay: delay + 700,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
  return c;
}

/** Horizontal meter with a bright spark riding the leading edge. */
export class Meter extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  private sheen: Phaser.GameObjects.Rectangle;
  private spark: Phaser.GameObjects.Image;
  private value = 0;
  private readonly inner: number;
  private readonly t: UiTheme;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    private readonly h: number,
    value = 0,
    color?: number,
  ) {
    super(scene, x, y);
    this.t = theme();
    this.inner = w - 6;
    const bg = pill(scene, this.t, w, h + 6);
    const c = color ?? this.t.palette.accent;
    this.fill = scene.add.rectangle(-this.inner / 2, 0, this.inner, h - 2, c).setOrigin(0, 0.5);
    this.sheen = scene.add
      .rectangle(-this.inner / 2, -(h - 2) / 4, this.inner, (h - 2) / 2, 0xffffff, 0.22)
      .setOrigin(0, 0.5);
    this.spark = scene.add
      .image(0, 0, softDiscTexture(scene))
      .setTint(this.t.palette.accentHi)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(h * 2.6, h * 2.6);
    this.add([bg, this.fill, this.sheen, this.spark]);
    this.set(value, false);
    scene.add.existing(this);
  }

  setColor(color: number): this {
    this.fill.setFillStyle(color);
    return this;
  }

  set(value: number, animate = true): this {
    const v = Phaser.Math.Clamp(value, 0, 1);
    if (!animate || calm()) {
      this.value = v;
      this.paint();
      return this;
    }
    this.scene.tweens.add({
      targets: this,
      value: v,
      duration: 380,
      ease: 'Cubic.Out',
      onUpdate: () => this.paint(),
    });
    return this;
  }

  private paint(): void {
    const w = Math.max(0.001, this.inner * this.value);
    this.fill.setSize(w, this.h - 2);
    this.sheen.setSize(w, (this.h - 2) / 2);
    this.spark.setX(-this.inner / 2 + w).setVisible(this.value > 0.01 && this.value < 0.999);
  }
}

/** Radial countdown drawn from a 32-step strip, so it costs no geometry per frame. */
export class RingTimer extends Phaser.GameObjects.Container {
  private ring: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number, color: number) {
    super(scene, x, y);
    const key = ringStripTexture(scene);
    const back = scene.add.image(0, 0, key, ringFrame(1)).setAlpha(0.18).setDisplaySize(size, size);
    this.ring = scene.add
      .image(0, 0, key, ringFrame(1))
      .setTint(color)
      .setDisplaySize(size, size);
    this.add([back, this.ring]);
    scene.add.existing(this);
  }

  set(fraction: number): this {
    this.ring.setFrame(ringFrame(fraction));
    return this;
  }

  setColor(color: number): this {
    this.ring.setTint(color);
    return this;
  }
}

/** Plays a soft tick for count-ups, pitched by progress. */
export function tick(progress: number): void {
  audio.sfx('ui_move', 0.12, Phaser.Math.Clamp(progress, 0, 1) * 600);
}

/** Small tag with a glyph: "Steel", "Lights out". Its width is set for laying out rows. */
export function chip(
  scene: Phaser.Scene,
  glyph: IconName,
  text: string,
  t: UiTheme = theme(),
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const caption = scene.add
    .text(0, 0, text.toUpperCase(), {
      fontFamily: t.fonts.display,
      fontSize: '13px',
      fontStyle: '700',
      color: t.palette.text,
      resolution: RENDER_ZOOM,
    })
    .setOrigin(0, 0.5)
    .setLetterSpacing(1.5);
  const w = Math.round(caption.width + 46);
  const bg = pill(scene, t, w, 30);
  const glyphImg = icon(scene, -w / 2 + 16, 0, glyph, 16, t.palette.accentHi);
  caption.setX(-w / 2 + 30);
  c.add([bg, glyphImg, caption]);
  c.setSize(w, 30);
  return c;
}

/** Lays containers out left to right, centred on x, wrapping at `maxWidth`. Returns the rows used. */
export function flowRow(
  items: Phaser.GameObjects.Container[],
  x: number,
  y: number,
  maxWidth: number,
  gap = 8,
  rowHeight = 38,
): number {
  const rows: Phaser.GameObjects.Container[][] = [[]];
  let used = 0;
  for (const item of items) {
    if (used > 0 && used + gap + item.width > maxWidth) {
      rows.push([]);
      used = 0;
    }
    used += (used ? gap : 0) + item.width;
    rows[rows.length - 1]!.push(item);
  }
  rows.forEach((row, r) => {
    const total = row.reduce((s, it) => s + it.width, 0) + gap * (row.length - 1);
    let cx = x - total / 2;
    for (const it of row) {
      it.setPosition(cx + it.width / 2, y + r * rowHeight);
      cx += it.width + gap;
    }
  });
  return rows.length;
}
