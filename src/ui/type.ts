import Phaser from 'phaser';
import { RENDER_ZOOM } from '../config';
import { css, theme, type UiTheme } from './theme';

type Text = Phaser.GameObjects.Text;

export interface TypeOptions {
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Word wrap width. */
  wrap?: number;
  originX?: number;
  originY?: number;
  t?: UiTheme;
}

function make(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  family: string,
  weight: string,
  color: string,
  opts: TypeOptions,
  spacing = 0,
): Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: family,
    fontSize: `${size}px`,
    fontStyle: weight,
    color,
    align: opts.align ?? 'center',
    resolution: RENDER_ZOOM,
  };
  if (opts.wrap) style.wordWrap = { width: opts.wrap, useAdvancedWrap: true };
  const out = scene.add.text(x, y, text, style);
  if (spacing) out.setLetterSpacing(spacing);
  return out.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
}

/** Paints a vertical gradient over the text's current height. Call again after a resize. */
export function gradientFill(text: Text, stops: readonly string[]): Text {
  const ctx = text.context;
  const h = text.height || 1;
  const g = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.82);
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s));
  text.setFill(g);
  return text;
}

function glowShadow(text: Text, color: number, blur: number, alpha = 0.75): Text {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return text.setShadow(0, 0, `rgba(${c.red},${c.green},${c.blue},${alpha})`, blur, false, true);
}

/** Screen and panel titles: tall condensed caps with a metallic gradient and the world's glow. */
export function heading(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 40,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text.toUpperCase(), size, t.fonts.display, '800', '#ffffff', opts, size * 0.04);
  out.setStroke('rgba(0,0,0,0.55)', Math.max(2, size * 0.07));
  glowShadow(out, t.palette.glow, size * 0.45);
  return gradientFill(out, opts.color ? [opts.color, opts.color] : t.headingStops);
}

/** The world's own lettering: carved serif in Hell and the Crypt, machine type in the Mainframe. */
export function worldTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 44,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text.toUpperCase(), size, t.fonts.world, '700', '#ffffff', opts, size * 0.1);
  out.setStroke('rgba(0,0,0,0.6)', Math.max(2, size * 0.06));
  glowShadow(out, t.palette.glow, size * 0.5, 0.85);
  return gradientFill(out, t.headingStops);
}

/** Big numbers: scores, prices, countdowns. Solid fill, soft drop shadow. */
export function display(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 32,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text, size, t.fonts.display, '800', opts.color ?? t.palette.text, opts, size * 0.02);
  return out.setShadow(0, 2, 'rgba(0,0,0,0.65)', size * 0.18, false, true);
}

/** Small tracked caps: section labels, captions, stat names. */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 13,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text.toUpperCase(), size, t.fonts.display, '700', opts.color ?? t.palette.textDim, opts, size * 0.2);
  return out.setShadow(0, 1, 'rgba(0,0,0,0.7)', 3, false, true);
}

/** Running text. */
export function body(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 18,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text, size, t.fonts.body, '600', opts.color ?? t.palette.text, {
    wrap: 520,
    ...opts,
  });
  out.setLineSpacing(size * 0.15);
  return out.setShadow(0, 1, 'rgba(0,0,0,0.7)', 4, false, true);
}

/** An accent-coloured glow word, e.g. FEVER or NEW BEST. */
export function glowWord(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: number,
  opts: TypeOptions = {},
): Text {
  const t = opts.t ?? theme();
  const out = make(scene, x, y, text.toUpperCase(), size, t.fonts.display, '800', css(color), opts, size * 0.06);
  out.setStroke('rgba(0,0,0,0.5)', Math.max(2, size * 0.08));
  return glowShadow(out, color, size * 0.5, 0.95);
}
