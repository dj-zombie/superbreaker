import Phaser from 'phaser';
import type { FrameStyle, UiTheme } from './theme';
import { calm } from './theme';

/**
 * Panels, button faces, glows and ornaments for the three world styles, painted once into
 * canvas textures. Panels nine-slice; buttons are painted at their exact size so the stained
 * glass, rivets and scanlines never smear.
 */
const SCALE = 2;
/** Canvas textures are painted at this density; draw them at 1 / TEX_SCALE. */
export const TEX_SCALE = SCALE;

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, w: number, h: number) => void;

export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: Draw,
  scale = SCALE,
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(scale, scale);
  draw(ctx, w, h);
  ctx.restore();
  tex.refresh();
  return key;
}

// ---------------------------------------------------------------- shape paths

type Corners = [boolean, boolean, boolean, boolean];

function chamfer(ctx: Ctx, x: number, y: number, w: number, h: number, c: number, on: Corners) {
  const [tl, tr, br, bl] = on;
  ctx.beginPath();
  ctx.moveTo(x + (tl ? c : 0), y);
  ctx.lineTo(x + w - (tr ? c : 0), y);
  if (tr) ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - (br ? c : 0));
  if (br) ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + (bl ? c : 0), y + h);
  if (bl) ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + (tl ? c : 0));
  if (tl) ctx.lineTo(x + c, y);
  ctx.closePath();
}

/** Rectangle with concave quarter-circle corners, like carved stone. */
function notched(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x, y + h, r, 0, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arc(x, y, r, Math.PI / 2, 0, true);
  ctx.closePath();
}

/** The outline every frame of a style shares; `size` is the corner cut. */
export function stylePath(
  ctx: Ctx,
  style: FrameStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
): void {
  if (style === 'forged') chamfer(ctx, x, y, w, h, size, [true, true, true, true]);
  else if (style === 'gothic') notched(ctx, x, y, w, h, size);
  else chamfer(ctx, x, y, w, h, size, [true, false, true, false]);
}

function grad(ctx: Ctx, y0: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

/** Deterministic speckle so a texture looks the same on every load. */
function speckle(ctx: Ctx, w: number, h: number, count: number, color: string, seed = 7) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const r = 0.4 + rnd() * 1.1;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rivet(ctx: Ctx, x: number, y: number, r = 2.6) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  g.addColorStop(0, '#c99a7c');
  g.addColorStop(0.5, '#6a4430');
  g.addColorStop(1, '#1e100a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function fleuron(ctx: Ctx, x: number, y: number, sx: number, sy: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -3.2);
  ctx.lineTo(2.2, 0);
  ctx.lineTo(0, 3.2);
  ctx.lineTo(-2.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, 0, 3, Math.PI, Math.PI * 1.9);
  ctx.moveTo(0, 7);
  ctx.arc(0, 7, 3, Math.PI * 1.5, Math.PI * 0.4, true);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- panels

const PANEL_TEX = 72;
const PANEL_SLICE = 24;

function panelKey(style: FrameStyle, variant: PanelVariant): string {
  return `ui_panel_${style}_${variant}`;
}

export type PanelVariant = 'solid' | 'glass' | 'card';

function paintPanel(ctx: Ctx, s: number, t: UiTheme, variant: PanelVariant): void {
  const style = t.frame;
  const a = variant === 'glass' ? 0.72 : variant === 'card' ? 0.86 : 0.94;
  if (style === 'forged') {
    stylePath(ctx, style, 1, 1, s - 2, s - 2, 12);
    ctx.fillStyle = grad(ctx, 0, s, [
      [0, `rgba(42,26,19,${a})`],
      [0.35, `rgba(24,14,10,${a})`],
      [1, `rgba(12,7,5,${a})`],
    ]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    speckle(ctx, s, s, 60, 'rgba(0,0,0,0.18)');
    speckle(ctx, s, s, 30, 'rgba(255,170,110,0.05)', 13);
    ctx.restore();
    stylePath(ctx, style, 1, 1, s - 2, s - 2, 12);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#090402';
    ctx.stroke();
    stylePath(ctx, style, 4.5, 4.5, s - 9, s - 9, 10);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,140,70,0.32)';
    ctx.stroke();
    for (const [x, y] of [
      [12, 12],
      [s - 12, 12],
      [12, s - 12],
      [s - 12, s - 12],
    ] as const) {
      rivet(ctx, x, y);
    }
  } else if (style === 'gothic') {
    notched(ctx, 1, 1, s - 2, s - 2, 9);
    ctx.fillStyle = grad(ctx, 0, s, [
      [0, `rgba(30,32,64,${a})`],
      [0.4, `rgba(16,17,40,${a})`],
      [1, `rgba(8,8,22,${a})`],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(206,210,238,0.85)';
    ctx.stroke();
    notched(ctx, 5.5, 5.5, s - 11, s - 11, 7);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(165,140,255,0.38)';
    ctx.stroke();
    const c = 'rgba(214,218,244,0.9)';
    fleuron(ctx, 14, 14, 1, 1, c);
    fleuron(ctx, s - 14, 14, -1, 1, c);
    fleuron(ctx, 14, s - 14, 1, -1, c);
    fleuron(ctx, s - 14, s - 14, -1, -1, c);
  } else {
    stylePath(ctx, style, 1, 1, s - 2, s - 2, 14);
    ctx.fillStyle = `rgba(4,22,30,${a * 0.9})`;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(60,231,255,0.8)';
    ctx.stroke();
    stylePath(ctx, style, 5, 5, s - 10, s - 10, 11);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,231,255,0.16)';
    ctx.stroke();
    ctx.strokeStyle = '#9af4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s - 15, 1.5);
    ctx.lineTo(s - 1.5, 1.5);
    ctx.lineTo(s - 1.5, 15);
    ctx.moveTo(1.5, s - 15);
    ctx.lineTo(1.5, s - 1.5);
    ctx.lineTo(15, s - 1.5);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(154,244,255,0.7)';
    ctx.beginPath();
    for (const d of [5, 9]) {
      ctx.moveTo(d, 15 + d * 0.2);
      ctx.lineTo(15 + d * 0.2, d);
    }
    ctx.stroke();
  }
}

export interface PanelOptions {
  variant?: PanelVariant;
  /** Crest on the top edge. */
  ornament?: boolean;
  /** Molten seam, candle glow or scan beam, animated. */
  accent?: boolean;
  shadow?: boolean;
}

/** A framed panel in the theme's material, centred on (x, y). */
export function framePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  t: UiTheme,
  opts: PanelOptions = {},
): Phaser.GameObjects.Container {
  const variant = opts.variant ?? 'solid';
  const key = panelKey(t.frame, variant);
  canvasTexture(scene, key, PANEL_TEX, PANEL_TEX, (ctx, s) => paintPanel(ctx, s, t, variant));
  const c = PANEL_SLICE * SCALE;
  const slice = (alpha = 1) =>
    scene.add
      .nineslice(0, 0, key, undefined, w * SCALE, h * SCALE, c, c, c, c)
      .setScale(1 / SCALE)
      .setAlpha(alpha);
  const root = scene.add.container(x, y);
  if (opts.shadow !== false) {
    root.add(slice(0.55).setTint(0x000000).setY(8));
  }
  root.add(slice());
  if (t.frame === 'holo') {
    const scan = scene.add
      .tileSprite(0, 0, w - 8, h - 8, scanTexture(scene))
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    root.add(scan);
  }
  if (opts.accent !== false) addPanelAccent(scene, root, w, h, t);
  if (opts.ornament) {
    const orn = scene.add.image(0, -h / 2, ornamentTexture(scene, t)).setScale(1 / SCALE);
    root.add(orn);
  }
  return root;
}

function addPanelAccent(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  t: UiTheme,
): void {
  const still = calm();
  if (t.frame === 'forged') {
    const seam = scene.add
      .image(0, h / 2 - 3, glowLineTexture(scene))
      .setDisplaySize(w * 0.86, 22)
      .setTint(t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.55);
    root.add(seam);
    if (!still) {
      scene.tweens.add({
        targets: seam,
        alpha: { from: 0.35, to: 0.75 },
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
  } else if (t.frame === 'gothic') {
    const halo = scene.add
      .image(0, -h / 2 + 4, glowLineTexture(scene))
      .setDisplaySize(w * 0.7, 26)
      .setFlipY(true)
      .setTint(t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.32);
    root.add(halo);
    if (!still) {
      scene.tweens.add({
        targets: halo,
        alpha: { from: 0.22, to: 0.42 },
        duration: 260,
        yoyo: true,
        repeat: -1,
        repeatDelay: 900,
        ease: 'Stepped',
        easeParams: [3],
      });
    }
  } else if (!still) {
    const beam = scene.add
      .image(0, -h / 2 + 10, beamTexture(scene))
      .setDisplaySize(w - 10, 40)
      .setTint(t.palette.accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    root.add(beam);
    scene.tweens.add({
      targets: beam,
      y: { from: -h / 2 + 20, to: h / 2 - 20 },
      duration: 2600,
      repeat: -1,
      repeatDelay: 2400,
      onUpdate: (tw) => {
        const p = tw.progress;
        beam.setAlpha(Math.sin(Math.PI * p) * 0.45);
      },
    });
  }
}

// ---------------------------------------------------------------- buttons

export type FaceVariant = 'primary' | 'secondary' | 'danger';

export function buttonCut(style: FrameStyle, h: number): number {
  if (style === 'forged') return Math.round(h * 0.3);
  if (style === 'gothic') return Math.round(h * 0.22);
  return Math.round(h * 0.34);
}

function paintButton(ctx: Ctx, w: number, h: number, style: FrameStyle, v: FaceVariant): void {
  const cut = buttonCut(style, h);
  if (style === 'forged') {
    stylePath(ctx, style, 1, 1, w - 2, h - 2, cut);
    const stops: Record<FaceVariant, Array<[number, string]>> = {
      primary: [
        [0, '#ffeab0'],
        [0.14, '#ffc35a'],
        [0.5, '#ff7a1f'],
        [0.86, '#c2300c'],
        [1, '#701205'],
      ],
      secondary: [
        [0, '#45322a'],
        [0.5, '#251812'],
        [1, '#130b08'],
      ],
      danger: [
        [0, '#ff9a86'],
        [0.5, '#d4321c'],
        [1, '#5a0a06'],
      ],
    };
    ctx.fillStyle = grad(ctx, 0, h, stops[v]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    speckle(ctx, w, h, Math.round(w * h * 0.012), 'rgba(40,10,0,0.14)', w + h);
    ctx.restore();
    stylePath(ctx, style, 1, 1, w - 2, h - 2, cut);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#140602';
    ctx.stroke();
    stylePath(ctx, style, 3.5, 3.5, w - 7, h - 7, cut - 1.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = v === 'secondary' ? 'rgba(255,138,60,0.6)' : 'rgba(255,245,210,0.55)';
    ctx.stroke();
    if (v !== 'secondary') {
      rivet(ctx, cut * 0.75 + 2, h / 2, 2);
      rivet(ctx, w - cut * 0.75 - 2, h / 2, 2);
    }
  } else if (style === 'gothic') {
    notched(ctx, 1, 1, w - 2, h - 2, cut);
    const base: Record<FaceVariant, Array<[number, string]>> = {
      primary: [
        [0, '#c2b2ff'],
        [0.45, '#7c5ef2'],
        [1, '#2e1d82'],
      ],
      secondary: [
        [0, '#282a54'],
        [1, '#0b0c20'],
      ],
      danger: [
        [0, '#ff8aa6'],
        [0.5, '#c22456'],
        [1, '#4e0622'],
      ],
    };
    ctx.fillStyle = grad(ctx, 0, h, base[v]);
    ctx.fill();
    if (v !== 'secondary') {
      ctx.save();
      ctx.clip();
      const pane = Math.max(18, h * 0.9);
      const tints = ['rgba(110,220,255,0.30)', '', 'rgba(255,196,120,0.24)', ''];
      let i = 0;
      for (let x = cut * 0.6; x < w; x += pane, i++) {
        const tint = tints[i % tints.length];
        if (tint) {
          ctx.fillStyle = tint;
          ctx.fillRect(x, 0, pane, h);
        }
      }
      ctx.strokeStyle = 'rgba(18,10,46,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = cut * 0.6; x < w; x += pane) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.moveTo(x, h * 0.5);
        ctx.lineTo(x + pane, h * 0.5 - pane * 0.25);
      }
      ctx.stroke();
      ctx.fillStyle = grad(ctx, 0, h * 0.45, [
        [0, 'rgba(255,255,255,0.32)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(0, 0, w, h * 0.45);
      ctx.restore();
    }
    notched(ctx, 1, 1, w - 2, h - 2, cut);
    ctx.lineWidth = v === 'secondary' ? 1.5 : 2;
    ctx.strokeStyle = v === 'secondary' ? 'rgba(210,214,240,0.85)' : '#eceefc';
    ctx.stroke();
    notched(ctx, 4, 4, w - 8, h - 8, Math.max(2, cut - 3));
    ctx.lineWidth = 1;
    ctx.strokeStyle = v === 'secondary' ? 'rgba(165,140,255,0.35)' : 'rgba(24,14,60,0.7)';
    ctx.stroke();
  } else {
    stylePath(ctx, style, 1, 1, w - 2, h - 2, cut);
    const fills: Record<FaceVariant, Array<[number, string]>> = {
      primary: [
        [0, 'rgba(190,252,255,0.97)'],
        [0.5, 'rgba(60,222,255,0.95)'],
        [1, 'rgba(12,118,178,0.95)'],
      ],
      secondary: [
        [0, 'rgba(10,46,60,0.78)'],
        [1, 'rgba(3,22,30,0.78)'],
      ],
      danger: [
        [0, 'rgba(255,150,190,0.96)'],
        [0.5, 'rgba(255,60,120,0.94)'],
        [1, 'rgba(130,8,58,0.94)'],
      ],
    };
    ctx.fillStyle = grad(ctx, 0, h, fills[v]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = v === 'secondary' ? 'rgba(120,240,255,0.07)' : 'rgba(0,30,50,0.13)';
    for (let y = 1; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = v === 'secondary' ? 'rgba(60,231,255,0.95)' : '#eafeff';
    ctx.stroke();
    ctx.strokeStyle = v === 'secondary' ? '#bdf8ff' : 'rgba(2,16,24,0.55)';
    ctx.lineWidth = 2.5;
    const l = Math.max(6, h * 0.34);
    ctx.beginPath();
    ctx.moveTo(w - 1 - l, 2);
    ctx.lineTo(w - 2, 2);
    ctx.lineTo(w - 2, 1 + l);
    ctx.moveTo(2, h - 1 - l);
    ctx.lineTo(2, h - 2);
    ctx.lineTo(1 + l, h - 2);
    ctx.stroke();
    ctx.fillStyle = v === 'secondary' ? 'rgba(154,244,255,0.6)' : 'rgba(2,16,24,0.45)';
    if (w >= 90) for (let i = 0; i < 3; i++) ctx.fillRect(w - cut * 0.5 - 14 - i * 5, h - 7, 3, 3);
  }
}

export function buttonTexture(
  scene: Phaser.Scene,
  style: FrameStyle,
  variant: FaceVariant,
  w: number,
  h: number,
): string {
  const W = Math.round(w);
  const H = Math.round(h);
  return canvasTexture(scene, `ui_btn_${style}_${variant}_${W}x${H}`, W, H, (ctx) =>
    paintButton(ctx, W, H, style, variant),
  );
}

/** Soft halo around a style's outline, hollow in the middle, for additive glows. */
export function glowTexture(
  scene: Phaser.Scene,
  style: FrameStyle,
  w: number,
  h: number,
  spread = 14,
): string {
  const W = Math.round(w);
  const H = Math.round(h);
  const key = `ui_glow_${style}_${W}x${H}_${spread}`;
  return canvasTexture(scene, key, W + spread * 2, H + spread * 2, (ctx) => {
    const cut = buttonCut(style, H);
    const off = 4000;
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = spread * SCALE * 0.9;
    ctx.shadowOffsetX = off * SCALE;
    ctx.fillStyle = '#ffffff';
    stylePath(ctx, style, spread - off, spread, W, H, cut);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-out';
    stylePath(ctx, style, spread + 1, spread + 1, W - 2, H - 2, cut);
    ctx.fill();
  });
}

// ---------------------------------------------------------------- ornaments

export function ornamentTexture(scene: Phaser.Scene, t: UiTheme): string {
  const key = `ui_orn_${t.frame}`;
  if (t.frame === 'forged') {
    return canvasTexture(scene, key, 96, 24, (ctx) => {
      chamfer(ctx, 14, 4, 68, 16, 7, [true, true, true, true]);
      ctx.fillStyle = grad(ctx, 4, 20, [
        [0, '#4a3226'],
        [1, '#160c08'],
      ]);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#090402';
      ctx.stroke();
      rivet(ctx, 24, 12, 2);
      rivet(ctx, 72, 12, 2);
      const g = ctx.createRadialGradient(48, 12, 0, 48, 12, 7);
      g.addColorStop(0, '#fff2c0');
      g.addColorStop(0.4, '#ff9a2a');
      g.addColorStop(1, '#5a1004');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(48, 5);
      ctx.lineTo(54, 12);
      ctx.lineTo(48, 19);
      ctx.lineTo(42, 12);
      ctx.closePath();
      ctx.fill();
    });
  }
  if (t.frame === 'gothic') {
    return canvasTexture(scene, key, 80, 30, (ctx) => {
      ctx.fillStyle = '#0d0e22';
      ctx.strokeStyle = '#dfe2f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(22, 24);
      ctx.quadraticCurveTo(26, 6, 40, 2);
      ctx.quadraticCurveTo(54, 6, 58, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const g = ctx.createRadialGradient(40, 15, 0, 40, 15, 7);
      g.addColorStop(0, '#f2eaff');
      g.addColorStop(0.5, '#a58cff');
      g.addColorStop(1, '#2a1a6a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(40, 15, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(16,10,40,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        ctx.moveTo(40 + Math.cos(a) * 6, 15 + Math.sin(a) * 6);
        ctx.lineTo(40 - Math.cos(a) * 6, 15 - Math.sin(a) * 6);
      }
      ctx.stroke();
      ctx.strokeStyle = '#dfe2f6';
      ctx.beginPath();
      ctx.moveTo(4, 24);
      ctx.lineTo(20, 24);
      ctx.moveTo(60, 24);
      ctx.lineTo(76, 24);
      ctx.stroke();
      fleuron(ctx, 8, 24, 0.8, 0.8, '#dfe2f6');
      fleuron(ctx, 72, 24, -0.8, 0.8, '#dfe2f6');
    });
  }
  return canvasTexture(scene, key, 120, 14, (ctx) => {
    chamfer(ctx, 20, 2, 80, 10, 5, [false, false, true, true]);
    ctx.fillStyle = 'rgba(8,40,52,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#3ce7ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#9af4ff';
    for (let i = 0; i < 6; i++) ctx.fillRect(34 + i * 9, 6, 5, 2);
    ctx.fillStyle = '#ff3cbe';
    ctx.fillRect(90, 6, 3, 2);
    ctx.strokeStyle = 'rgba(60,231,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(18, 2);
    ctx.moveTo(102, 2);
    ctx.lineTo(120, 2);
    ctx.stroke();
  });
}

// ---------------------------------------------------------------- utility textures

/** White line fading downward: seams, edge glows and the HUD rule. */
export function glowLineTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_glowline',
    64,
    24,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(0.2, 'rgba(0,0,0,0)');
      fade.addColorStop(0.8, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
    },
    1,
  );
}

export function scanTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_scan',
    4,
    4,
    (ctx) => {
      ctx.fillStyle = 'rgba(150,240,255,0.07)';
      ctx.fillRect(0, 0, 4, 1);
    },
    1,
  );
}

export function beamTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_beam',
    8,
    64,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
      g.addColorStop(0.53, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    1,
  );
}

/** Black at the top fading to clear: screen vignettes and transition edges. */
export function fadeTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_fade',
    4,
    128,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    1,
  );
}

/** A soft diagonal band in a wide clear strip, scrolled across buttons as a shine. */
export function shineTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_shine',
    360,
    64,
    (ctx, w, h) => {
      ctx.save();
      ctx.transform(1, 0, -0.45, 1, 0, 0);
      const x0 = w * 0.45;
      const g = ctx.createLinearGradient(x0, 0, x0 + 46, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, 46, h);
      ctx.restore();
    },
    1,
  );
}

/** Light rays around a point, for star reveals and logo flares. */
export function raysTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_rays',
    256,
    256,
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, w / 2, a - 0.07, a + 0.07);
        ctx.closePath();
        ctx.fill();
      }
    },
    1,
  );
}

/** Soft disc for glows behind icons and hearts. */
export function softDiscTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_softdisc',
    64,
    64,
    (ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
    },
    1,
  );
}

/** Square data bit for Mainframe particles. */
export function bitTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_bit',
    6,
    6,
    (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, 0, 6, 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(1.5, 1.5, 3, 3);
    },
    2,
  );
}

export const RING_FRAMES = 32;
const RING_SIZE = 96;
const RING_COLS = 8;

/** A ring drawn in 32 steps, for radial timers without per-frame tessellation. */
export function ringStripTexture(scene: Phaser.Scene): string {
  const key = 'ui_ringstrip';
  if (scene.textures.exists(key)) return key;
  const rows = Math.ceil((RING_FRAMES + 1) / RING_COLS);
  const tex = scene.textures.createCanvas(key, RING_SIZE * RING_COLS, RING_SIZE * rows);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.lineCap = 'round';
  for (let i = 0; i <= RING_FRAMES; i++) {
    const x = (i % RING_COLS) * RING_SIZE;
    const y = Math.floor(i / RING_COLS) * RING_SIZE;
    const cx = x + RING_SIZE / 2;
    const cy = y + RING_SIZE / 2;
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ffffff';
    if (i > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + (i / RING_FRAMES) * Math.PI * 2);
      ctx.stroke();
    }
    tex.add(`r${i}`, 0, x, y, RING_SIZE, RING_SIZE);
  }
  tex.refresh();
  return key;
}

export function ringFrame(fraction: number): string {
  return `r${Math.round(Phaser.Math.Clamp(fraction, 0, 1) * RING_FRAMES)}`;
}

/** Dashed rim that spins around ready ability sockets. */
export function rimTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_rim',
    96,
    96,
    (ctx, w) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(w / 2, w / 2, 44, a, a + (Math.PI * 2) / n / 2.2);
        ctx.stroke();
      }
    },
    1,
  );
}

/** Bright dash on clear, scrolled along path links. */
export function flowTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_flow',
    48,
    8,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.8, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.25, w, h * 0.5);
    },
    1,
  );
}

/** One iron link and half of each neighbour, tiling into a chain along x. */
export function chainTexture(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'ui_chain', 32, 16, (ctx, w, h) => {
    const link = (cx: number, ry: number, light: string) => {
      ctx.beginPath();
      ctx.ellipse(cx, h / 2, w * 0.34, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0d0b0b';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = light;
      ctx.stroke();
    };
    link(0, 3, '#8d8986');
    link(w, 3, '#8d8986');
    link(w / 2, 5.5, '#c9c4bf');
  });
}

export function dotsTexture(scene: Phaser.Scene): string {
  return canvasTexture(
    scene,
    'ui_dots',
    14,
    8,
    (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4, 4, 2, 0, Math.PI * 2);
      ctx.fill();
    },
    2,
  );
}

// ---------------------------------------------------------------- HUD pieces

/** Vertical gradient strip under the HUD numbers. */
export function hudStripTexture(scene: Phaser.Scene, t: UiTheme): string {
  return canvasTexture(
    scene,
    `ui_hudstrip_${t.frame}`,
    8,
    64,
    (ctx, w, h) => {
      const top = t.frame === 'forged' ? '20,10,6' : t.frame === 'gothic' ? '10,10,26' : '2,14,20';
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(${top},0.96)`);
      g.addColorStop(0.75, `rgba(${top},0.82)`);
      g.addColorStop(1, `rgba(${top},0.55)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (t.frame === 'holo') {
        ctx.fillStyle = 'rgba(150,240,255,0.06)';
        for (let y = 1; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      }
    },
    1,
  );
}

export function deckPanelTexture(scene: Phaser.Scene, t: UiTheme): string {
  return canvasTexture(
    scene,
    `ui_deck_${t.frame}`,
    16,
    250,
    (ctx, w, h) => {
      const tone =
        t.frame === 'forged'
          ? ['rgba(34,18,12,0.95)', 'rgba(10,5,3,0.98)', '255,138,42']
          : t.frame === 'gothic'
            ? ['rgba(22,22,52,0.95)', 'rgba(6,6,18,0.98)', '165,140,255']
            : ['rgba(4,28,38,0.92)', 'rgba(1,8,12,0.98)', '60,231,255'];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, tone[0]!);
      g.addColorStop(1, tone[1]!);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createLinearGradient(0, 0, 0, 18);
      glow.addColorStop(0, `rgba(${tone[2]},0.55)`);
      glow.addColorStop(1, `rgba(${tone[2]},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, 18);
      ctx.fillStyle = `rgba(${tone[2]},0.95)`;
      ctx.fillRect(0, 0, w, 2);
      if (t.frame === 'holo') {
        ctx.fillStyle = 'rgba(150,240,255,0.05)';
        for (let y = 4; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      }
    },
    1,
  );
}

export function deckKnobTexture(scene: Phaser.Scene, t: UiTheme): string {
  return canvasTexture(scene, `ui_knob_${t.frame}`, 72, 20, (ctx, w, h) => {
    const v: FaceVariant = 'primary';
    paintButton(ctx, w, h, t.frame, v);
  });
}
