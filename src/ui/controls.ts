import Phaser from 'phaser';
import { RENDER_ZOOM } from '../config';
import { haptic } from '../platform/haptics';
import { audio } from '../systems/AudioSystem';
import { buttonTexture, canvasTexture, glowLineTexture, stylePath, TEX_SCALE } from './frames';
import { theme, type UiTheme } from './theme';

/** Recessed slot that toggles and segmented controls sit in. */
function trackTexture(scene: Phaser.Scene, t: UiTheme, w: number, h: number): string {
  const W = Math.round(w);
  const H = Math.round(h);
  return canvasTexture(scene, `ui_track_${t.frame}_${W}x${H}`, W, H, (ctx) => {
    const cut = t.frame === 'gothic' ? H * 0.2 : H * 0.3;
    stylePath(ctx, t.frame, 1, 1, W - 2, H - 2, cut);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const dark =
      t.frame === 'forged'
        ? ['#070302', '#1c110c']
        : t.frame === 'gothic'
          ? ['#05050e', '#151630']
          : ['rgba(1,10,14,0.92)', 'rgba(4,26,34,0.92)'];
    g.addColorStop(0, dark[0]!);
    g.addColorStop(1, dark[1]!);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle =
      t.frame === 'forged'
        ? 'rgba(255,138,60,0.35)'
        : t.frame === 'gothic'
          ? 'rgba(200,204,240,0.45)'
          : 'rgba(60,231,255,0.6)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cut, 2, W - cut * 2, 2);
  });
}

function text(
  scene: Phaser.Scene,
  str: string,
  size: number,
  color: string,
  t: UiTheme,
): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, str.toUpperCase(), {
      fontFamily: t.fonts.display,
      fontSize: `${size}px`,
      fontStyle: '800',
      color,
      resolution: RENDER_ZOOM,
    })
    .setOrigin(0.5)
    .setLetterSpacing(size * 0.1);
}

/** On/off switch. The knob springs across and the slot lights up. */
export class Toggle extends Phaser.GameObjects.Container {
  private knob: Phaser.GameObjects.Image;
  private fill: Phaser.GameObjects.Image;
  private value: boolean;
  private readonly t: UiTheme;
  private static readonly W = 66;
  private static readonly H = 32;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: boolean,
    private onChange: (on: boolean) => void,
  ) {
    super(scene, x, y);
    this.t = theme();
    this.value = value;
    const { W, H } = Toggle;
    const track = scene.add.image(0, 0, trackTexture(scene, this.t, W, H)).setScale(1 / TEX_SCALE);
    this.fill = scene.add
      .image(0, 0, glowLineTexture(scene))
      .setDisplaySize(W - 8, H)
      .setTint(this.t.palette.accent)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.knob = scene.add
      .image(0, 0, buttonTexture(scene, this.t.frame, 'secondary', 30, H - 8))
      .setScale(1 / TEX_SCALE);
    this.add([track, this.fill, this.knob]);
    this.setSize(W + 20, H + 16);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => {
      this.set(!this.value, true);
      audio.sfx(this.value ? 'ui_on' : 'ui_off', 0.5);
      haptic('light');
      this.onChange(this.value);
    });
    this.set(value, false);
    scene.add.existing(this);
  }

  set(on: boolean, animate: boolean): this {
    this.value = on;
    const { W, H } = Toggle;
    const x = on ? W / 2 - 19 : -W / 2 + 19;
    this.knob.setTexture(buttonTexture(this.scene, this.t.frame, on ? 'primary' : 'secondary', 30, H - 8));
    if (animate) {
      this.scene.tweens.add({ targets: this.knob, x, duration: 240, ease: 'Back.Out' });
      this.scene.tweens.add({ targets: this.fill, alpha: on ? 0.55 : 0, duration: 200 });
    } else {
      this.knob.setX(x);
      this.fill.setAlpha(on ? 0.55 : 0);
    }
    return this;
  }

  get checked(): boolean {
    return this.value;
  }
}

export interface SegmentedOptions {
  width?: number;
  height?: number;
  fontSize?: number;
}

/** A row of mutually exclusive choices with a lit indicator that slides between them. */
export class Segmented extends Phaser.GameObjects.Container {
  private indicator: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private index: number;
  private readonly seg: number;
  private readonly span: number;
  private readonly t: UiTheme;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    options: readonly string[],
    index: number,
    private onChange: (index: number) => void,
    opts: SegmentedOptions = {},
  ) {
    super(scene, x, y);
    this.t = theme();
    const w = (this.span = opts.width ?? 420);
    const h = opts.height ?? 46;
    this.seg = w / options.length;
    this.index = index;
    const track = scene.add.image(0, 0, trackTexture(scene, this.t, w, h)).setScale(1 / TEX_SCALE);
    this.indicator = scene.add
      .image(this.segX(index), 0, buttonTexture(scene, this.t.frame, 'primary', this.seg - 6, h - 8))
      .setScale(1 / TEX_SCALE);
    this.add([track, this.indicator]);
    const size = opts.fontSize ?? Math.round(h * 0.38);
    options.forEach((o, i) => {
      const l = text(scene, o, size, this.t.palette.textDim, this.t).setPosition(this.segX(i), 0);
      this.labels.push(l);
      const hit = scene.add
        .zone(this.segX(i), 0, this.seg, h + 10)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.select(i));
      this.add([l, hit]);
    });
    this.paint();
    scene.add.existing(this);
  }

  private segX(i: number): number {
    return -this.span / 2 + (i + 0.5) * this.seg;
  }

  select(i: number, silent = false): void {
    if (i === this.index) return;
    this.index = i;
    this.scene.tweens.add({
      targets: this.indicator,
      x: this.segX(i),
      duration: 280,
      ease: 'Back.Out',
    });
    this.scene.tweens.add({
      targets: this.indicator,
      scaleX: { from: 1.12 / TEX_SCALE, to: 1 / TEX_SCALE },
      duration: 280,
      ease: 'Cubic.Out',
    });
    this.paint();
    if (silent) return;
    audio.sfx('ui_tab', 0.45);
    haptic('light');
    this.onChange(i);
  }

  private paint(): void {
    const p = this.t.palette;
    this.labels.forEach((l, i) => {
      l.setColor(i === this.index ? p.textOnAccent : p.textDim);
      if (i === this.index && this.t.frame !== 'gothic') l.setShadow(0, 1, 'rgba(255,255,255,0.3)', 0);
      else l.setShadow(0, 1, 'rgba(0,0,0,0.6)', 3);
    });
  }

  get value(): number {
    return this.index;
  }
}

export interface TabsOptions {
  width?: number;
  fontSize?: number;
}

/** Text tabs with a glowing bar that slides and stretches to the active one. */
export class Tabs extends Phaser.GameObjects.Container {
  private bar: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private index: number;
  private readonly t: UiTheme;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tabs: readonly string[],
    index: number,
    private onChange: (index: number) => void,
    opts: TabsOptions = {},
  ) {
    super(scene, x, y);
    this.t = theme();
    const w = opts.width ?? 520;
    const step = w / tabs.length;
    const size = opts.fontSize ?? 18;
    const rule = scene.add
      .rectangle(0, 18, w, 1, this.t.palette.edge, 0.5)
      .setOrigin(0.5);
    this.bar = scene.add
      .image(0, 18, glowLineTexture(scene))
      .setTint(this.t.palette.accent)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.add([rule, this.bar]);
    tabs.forEach((label, i) => {
      const lx = -w / 2 + step * (i + 0.5);
      const l = text(scene, label, size, this.t.palette.textDim, this.t).setPosition(lx, 0);
      const hit = scene.add
        .zone(lx, 4, step, 44)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.select(i));
      this.labels.push(l);
      this.add([l, hit]);
    });
    this.index = index;
    this.placeBar(false);
    this.paint();
    scene.add.existing(this);
  }

  select(i: number): void {
    if (i === this.index) return;
    this.index = i;
    this.placeBar(true);
    this.paint();
    audio.sfx('ui_tab', 0.45);
    haptic('light');
    this.onChange(i);
  }

  private placeBar(animate: boolean): void {
    const l = this.labels[this.index];
    if (!l) return;
    const sx = (l.width + 26) / 64;
    const sy = 18 / 24;
    if (!animate) {
      this.bar.setPosition(l.x, 18).setScale(sx, sy);
      return;
    }
    this.scene.tweens.add({ targets: this.bar, x: l.x, scaleX: sx, duration: 300, ease: 'Back.Out' });
  }

  private paint(): void {
    const p = this.t.palette;
    this.labels.forEach((l, i) => {
      const on = i === this.index;
      l.setColor(on ? p.text : p.textDim);
      if (on) {
        const c = Phaser.Display.Color.IntegerToColor(p.glow);
        l.setShadow(0, 0, `rgba(${c.red},${c.green},${c.blue},0.8)`, 10, false, true);
      } else {
        l.setShadow(0, 1, 'rgba(0,0,0,0.6)', 3, false, true);
      }
    });
  }

  get value(): number {
    return this.index;
  }
}

/** Above every sheet and overlay. */
const SHIELD_DEPTH = 100_000;

/** A level from 0 to 1 in even notches. Tap or drag along the slot; it lights up to the knob. */
export class Slider extends Phaser.GameObjects.Container {
  private knob: Phaser.GameObjects.Image;
  private fill: Phaser.GameObjects.Image;
  private level: number;
  /** Covers the screen while dragging, so letting go over a sheet's backdrop can't close it. */
  private shield?: Phaser.GameObjects.Zone;
  private readonly t: UiTheme;
  private readonly span: number;
  private static readonly H = 14;
  private static readonly KNOB_W = 24;
  private static readonly KNOB_H = 32;
  private static readonly STEPS = 20;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly slotW: number,
    value: number,
    private onChange: (value: number) => void,
  ) {
    super(scene, x, y);
    this.t = theme();
    const { H, KNOB_W, KNOB_H } = Slider;
    const w = slotW;
    this.span = w - KNOB_W;
    const track = scene.add.image(0, 0, trackTexture(scene, this.t, w, H)).setScale(1 / TEX_SCALE);
    this.fill = scene.add
      .image(-w / 2 + 2, 0, glowLineTexture(scene))
      .setOrigin(0, 0.5)
      .setTint(this.t.palette.accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7);
    this.knob = scene.add
      .image(0, 0, buttonTexture(scene, this.t.frame, 'primary', KNOB_W, KNOB_H))
      .setScale(1 / TEX_SCALE);
    this.add([track, this.fill, this.knob]);
    this.level = this.notch(value);
    this.paint();
    this.setSize(w + KNOB_W, KNOB_H + 12);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', (p: Phaser.Input.Pointer) => this.grab(p));
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.drop());
    scene.add.existing(this);
  }

  get value(): number {
    return this.level;
  }

  private readonly onMove = (p: Phaser.Input.Pointer) => {
    if (p.isDown) this.drag(p);
  };

  private readonly onUp = () => this.release();

  private notch(v: number): number {
    return Math.round(Phaser.Math.Clamp(v, 0, 1) * Slider.STEPS) / Slider.STEPS;
  }

  private grab(p: Phaser.Input.Pointer): void {
    if (this.shield) return;
    const view = this.scene.cameras.main.worldView;
    this.shield = this.scene.add
      .zone(view.centerX, view.centerY, view.width * 2, view.height * 2)
      .setDepth(SHIELD_DEPTH)
      .setInteractive({ useHandCursor: true });
    const input = this.scene.input;
    input.on('pointermove', this.onMove);
    input.on('pointerup', this.onUp);
    input.on('pointerupoutside', this.onUp);
    this.scene.tweens.add({
      targets: this.knob,
      scale: 1.15 / TEX_SCALE,
      duration: 120,
      ease: 'Back.Out',
    });
    haptic('light');
    this.drag(p);
  }

  private drag(p: Phaser.Input.Pointer): void {
    const world = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const local = this.getWorldTransformMatrix().applyInverse(world.x, world.y);
    const next = this.notch((local.x + this.span / 2) / this.span);
    if (next === this.level) return;
    this.level = next;
    this.paint();
    this.onChange(next);
    audio.sfx('ui_tally', 0.3, next * 600);
  }

  private release(): void {
    if (!this.shield) return;
    this.drop();
    this.scene.tweens.add({
      targets: this.knob,
      scale: 1 / TEX_SCALE,
      duration: 160,
      ease: 'Cubic.Out',
    });
  }

  /** Ends a drag without animating, also when the slider goes away mid-drag. */
  private drop(): void {
    const input = this.scene.input;
    input.off('pointermove', this.onMove);
    input.off('pointerup', this.onUp);
    input.off('pointerupoutside', this.onUp);
    this.shield?.destroy();
    this.shield = undefined;
  }

  private paint(): void {
    const x = -this.span / 2 + this.level * this.span;
    this.knob.setX(x);
    this.fill
      .setDisplaySize(Math.max(1, x + this.slotW / 2 - 2), Slider.H)
      .setVisible(this.level > 0);
  }
}