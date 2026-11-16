import Phaser from 'phaser';
import { RENDER_ZOOM } from '../config';
import { canvasTexture, TEX_SCALE } from './frames';
import { theme, type UiTheme } from './theme';

type Ctx = CanvasRenderingContext2D;

/** How far the face sits above the skirt, and travels when pressed. */
const TRAVEL = 4;

function capPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function radius(w: number, h: number, round: boolean): number {
  return round ? Math.min(w, h) / 2 : Math.min(8, h * 0.22);
}

/** The dark base the face presses into. */
function skirtTexture(scene: Phaser.Scene, w: number, h: number, round: boolean): string {
  return canvasTexture(scene, `ui_keyskirt_${w}x${h}${round ? 'r' : ''}`, w, h, (ctx) => {
    capPath(ctx, 1, 1, w - 2, h - 2, radius(w, h, round));
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
  });
}

/** White face so it can be tinted; the gradient and sheen give it a raised look. */
function faceTexture(scene: Phaser.Scene, w: number, h: number, round: boolean): string {
  return canvasTexture(scene, `ui_keyface_${w}x${h}${round ? 'r' : ''}`, w, h, (ctx) => {
    const r = radius(w, h, round);
    capPath(ctx, 1, 1, w - 2, h - 2, r);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a5868');
    g.addColorStop(1, '#2a2834');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
    capPath(ctx, 4, 3, w - 8, h * 0.42, Math.max(2, r - 3));
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  });
}

export interface KeycapOptions {
  /** Cap height; the width fits the label unless given. */
  size?: number;
  width?: number;
  /** A round controller button instead of a key. */
  round?: boolean;
  t?: UiTheme;
}

/**
 * A keyboard key (or a controller face button) that names a control. It can show a press, so
 * the tutorial can demonstrate a key and light it when the player uses it.
 */
export class Keycap extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private readonly t: UiTheme;
  private down = false;
  readonly kw: number;
  readonly kh: number;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, opts: KeycapOptions = {}) {
    super(scene, x, y);
    this.t = opts.t ?? theme();
    const h = Math.round(opts.size ?? 40);
    const round = !!opts.round;
    const w = Math.round(round ? h : (opts.width ?? Math.max(h, h * 0.62 + label.length * h * 0.3)));
    this.kw = w;
    this.kh = h;
    const faceH = h - TRAVEL;
    const skirt = scene.add.image(0, 0, skirtTexture(scene, w, h, round)).setScale(1 / TEX_SCALE);
    this.face = scene.add
      .image(0, -TRAVEL / 2, faceTexture(scene, w, faceH, round))
      .setScale(1 / TEX_SCALE);
    const fontSize = Math.round(label.length > 1 ? h * 0.32 : h * 0.46);
    this.text = scene.add
      .text(0, -TRAVEL / 2, label, {
        fontFamily: this.t.fonts.display,
        fontStyle: '800',
        fontSize: `${fontSize}px`,
        color: this.t.palette.text,
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5)
      .setLetterSpacing(label.length > 1 ? 1 : 0);
    this.add([skirt, this.face, this.text]);
    this.setSize(w, h);
    scene.add.existing(this);
  }

  setLabel(label: string): this {
    if (this.text.text !== label) this.text.setText(label);
    return this;
  }

  /** Pushes the face down and lights it in the world's accent. */
  press(on: boolean): this {
    if (on === this.down) return this;
    this.down = on;
    const y = on ? TRAVEL / 2 - 1 : -TRAVEL / 2;
    this.face.setY(y).setTint(on ? this.t.palette.accentHi : 0xffffff);
    this.text.setY(y).setColor(on ? this.t.palette.textOnAccent : this.t.palette.text);
    return this;
  }

  get pressed(): boolean {
    return this.down;
  }
}
