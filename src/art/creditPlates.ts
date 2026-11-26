import type Phaser from 'phaser';
import { UI_FONT } from '../config';
import { fgAtlas } from './foreground';

/**
 * The credits stage's plates: giant Mainframe bricks. The riveted steel frame is cut from the
 * world's own brick sprite and the circuit glass inside is drawn fresh at the plate's size, so it
 * stays sharp, in the brick's gem colour. Cracks spread across the glass as the plate is hit.
 */

export interface Gem {
  /** The Mainframe brick the frame is cut from. */
  frame: string;
  /** The glass's light: its glow, its sparks and the plate's light on the room. */
  glow: number;
  /** Glass shades, top to bottom. */
  deep: string;
  mid: string;
  /** Lettering on the glass. */
  ink: string;
}

export const GEMS = {
  teal: { frame: 'brick_teal2', glow: 0x3ff2d0, deep: '#03201d', mid: '#0b5148', ink: '#c9fff4' },
  blue: { frame: 'brick_blue', glow: 0x4aa8ff, deep: '#03122a', mid: '#0c3a78', ink: '#cfe6ff' },
  purple: {
    frame: 'brick_purple2',
    glow: 0xb57bff,
    deep: '#140826',
    mid: '#3d1d74',
    ink: '#ead9ff',
  },
  pink: { frame: 'brick_pink', glow: 0xff6ad5, deep: '#26061c', mid: '#701a58', ink: '#ffd9f3' },
  green: { frame: 'brick_green2', glow: 0x4dff8a, deep: '#03200e', mid: '#0d5a2c', ink: '#d4ffe2' },
  gold: { frame: 'brick_yellow2', glow: 0xffd27a, deep: '#2a1802', mid: '#7a4c08', ink: '#fff1cc' },
} as const satisfies Record<string, Gem>;

export type GemId = keyof typeof GEMS;

/** Plates are drawn at twice their size on the field. */
const RES = 2;
/** The steel frame's corner, in px of the brick sprite, and how much bigger it is drawn here. */
const CORNER_SRC = 22;
const FRAME_SCALE = 1.5;
/** The glass's cut corners and its inset from the frame, in px of the texture. */
const CHAMFER = 18;

/** A small fixed random stream, so a plate's circuits and cracks are the same every time. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

function css(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

function glassPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** The brick's steel frame, nine-sliced: corners as drawn, edges stretched along their length. */
function drawFrame(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  gem: Gem,
  w: number,
  h: number,
): boolean {
  const atlas = fgAtlas('mainframe');
  if (!scene.textures.exists(atlas) || !scene.textures.get(atlas).has(gem.frame)) return false;
  const f = scene.textures.getFrame(atlas, gem.frame);
  const img = f.source.image as CanvasImageSource;
  const sx = f.cutX;
  const sy = f.cutY;
  const sw = f.cutWidth;
  const sh = f.cutHeight;
  const c = CORNER_SRC;
  const d = c * FRAME_SCALE;
  const piece = (
    x: number,
    y: number,
    pw: number,
    ph: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => ctx.drawImage(img, sx + x, sy + y, pw, ph, dx, dy, dw, dh);
  piece(0, 0, c, c, 0, 0, d, d);
  piece(sw - c, 0, c, c, w - d, 0, d, d);
  piece(0, sh - c, c, c, 0, h - d, d, d);
  piece(sw - c, sh - c, c, c, w - d, h - d, d, d);
  piece(c, 0, sw - 2 * c, c, d, 0, w - 2 * d, d);
  piece(c, sh - c, sw - 2 * c, c, d, h - d, w - 2 * d, d);
  piece(0, c, c, sh - 2 * c, 0, d, d, h - 2 * d);
  piece(sw - c, c, c, sh - 2 * c, w - d, d, d, h - 2 * d);
  return true;
}

/** A fallback frame when the world's atlas is missing: brushed steel with rivets. */
function drawSteel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c9ced8');
  g.addColorStop(0.5, '#6d7381');
  g.addColorStop(1, '#3a3e48');
  ctx.fillStyle = g;
  glassPath(ctx, 0, 0, w, h, CHAMFER * 1.4);
  ctx.fill();
  ctx.fillStyle = '#2a2d34';
  const r = 6;
  for (const [x, y] of [
    [16, 16],
    [w - 16, 16],
    [16, h - 16],
    [w - 16, h - 16],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Circuit traces: runs that turn at 45°, ending in pads, lit in the gem's colour. */
function drawCircuits(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  gem: Gem,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const runs = Math.round((w * h) / 9000);
  for (let i = 0; i < runs; i++) {
    let px = x + rnd() * w;
    let py = y + rnd() * h;
    ctx.beginPath();
    ctx.moveTo(px, py);
    let dir = Math.floor(rnd() * 8);
    const steps = 2 + Math.floor(rnd() * 4);
    for (let s = 0; s < steps; s++) {
      const len = 14 + rnd() * 46;
      const a = (dir * Math.PI) / 4;
      px = Math.min(x + w, Math.max(x, px + Math.cos(a) * len));
      py = Math.min(y + h, Math.max(y, py + Math.sin(a) * len));
      ctx.lineTo(px, py);
      dir = (dir + (rnd() < 0.5 ? 1 : 7)) % 8;
    }
    const bright = rnd() < 0.25;
    ctx.strokeStyle = css(gem.glow, bright ? 0.55 : 0.22);
    ctx.lineWidth = bright ? 2 : 1.4;
    ctx.shadowColor = css(gem.glow, 0.9);
    ctx.shadowBlur = bright ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = css(gem.glow, bright ? 0.85 : 0.4);
    ctx.beginPath();
    ctx.arc(px, py, bright ? 3 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** One impact: rays out from the point, joined by a ring of fractures, light glinting in them. */
function drawCrack(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  cx: number,
  cy: number,
  size: number,
): void {
  const rays: Array<Array<[number, number]>> = [];
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const len = size * (0.45 + rnd() * 0.65);
    const pts: Array<[number, number]> = [[cx, cy]];
    const segs = 4 + Math.floor(rnd() * 3);
    for (let s = 1; s <= segs; s++) {
      const k = s / segs;
      const jit = (rnd() - 0.5) * 0.5;
      pts.push([cx + Math.cos(a + jit) * len * k, cy + Math.sin(a + jit) * len * k]);
    }
    rays.push(pts);
  }
  const stroke = (pts: ReadonlyArray<[number, number]>) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.stroke();
  };
  const ring = (k: number) =>
    rays.map((r) => r[Math.min(r.length - 1, Math.max(1, Math.round(k * (r.length - 1))))]!);
  const webs = [ring(0.35), ring(0.7)];
  ctx.save();
  ctx.lineJoin = 'miter';
  // Shadow side first, then the glint along the fracture.
  for (const [width, style] of [
    [4.5, 'rgba(0,0,0,0.55)'],
    [1.6, 'rgba(255,255,255,0.92)'],
  ] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    for (const r of rays) stroke(r);
    for (const web of webs) {
      for (let i = 0; i < web.length; i++)
        if (rnd() < 0.8) stroke([web[i]!, web[(i + 1) % web.length]!]);
    }
  }
  const star = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.22);
  star.addColorStop(0, 'rgba(255,255,255,0.95)');
  star.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = star;
  ctx.fillRect(cx - size * 0.22, cy - size * 0.22, size * 0.44, size * 0.44);
  ctx.restore();
}

/** A shard knocked out of the glass: a dark hole with a bright broken edge. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  cx: number,
  cy: number,
  size: number,
): void {
  const pts: Array<[number, number]> = [];
  const n = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const r = size * (0.5 + rnd() * 0.5);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2,3,8,0.88)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  ctx.restore();
}

export interface PlateArt {
  gem: GemId;
  /** Field size, in px. */
  width: number;
  height: number;
  /** The small line along the top of the glass, e.g. "Game design". */
  role: string;
  /** How broken it is: 0 whole, then a crack more each stage, with shards out from stage 3. */
  cracks: number;
  /** Picks its circuits and where it cracks. */
  seed: number;
}

/** The plate's texture key, drawn the first time it's asked for. */
/** Every plate texture's key starts with this. */
const PLATE_KEY = 'credit:';

/** Lets go of every plate texture: drawn at twice size, one per plate and crack, they are big. */
export function dropPlateTextures(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    if (key.startsWith(PLATE_KEY)) scene.textures.remove(key);
  }
}

export function plateTexture(scene: Phaser.Scene, art: PlateArt): string {
  const key = `${PLATE_KEY}${art.gem}:${art.width}x${art.height}:${art.seed}:${art.cracks}:${art.role}`;
  if (scene.textures.exists(key)) return key;
  const w = art.width * RES;
  const h = art.height * RES;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return '__WHITE';
  const ctx = tex.context;
  const gem: Gem = GEMS[art.gem];
  const rnd = seeded(art.seed + 1);

  if (!drawFrame(scene, ctx, gem, w, h)) drawSteel(ctx, w, h);

  const inset = CORNER_SRC * FRAME_SCALE * 0.52;
  const gx = inset;
  const gy = inset;
  const gw = w - inset * 2;
  const gh = h - inset * 2;
  ctx.save();
  glassPath(ctx, gx, gy, gw, gh, CHAMFER);
  ctx.clip();
  const base = ctx.createLinearGradient(0, gy, 0, gy + gh);
  base.addColorStop(0, gem.deep);
  base.addColorStop(0.55, gem.mid);
  base.addColorStop(1, gem.deep);
  ctx.fillStyle = base;
  ctx.fillRect(gx, gy, gw, gh);
  // Light pooled in the glass's middle, where the name sits.
  const pool = ctx.createRadialGradient(w / 2, gy + gh * 0.62, 0, w / 2, gy + gh * 0.62, gw * 0.55);
  pool.addColorStop(0, css(gem.glow, 0.34));
  pool.addColorStop(1, css(gem.glow, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(gx, gy, gw, gh);
  drawCircuits(ctx, rnd, gem, gx, gy, gw, gh);
  // Scanlines, then the gloss of the glass's top half.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(gx, y, gw, 1.5);
  const gloss = ctx.createLinearGradient(0, gy, 0, gy + gh * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.26)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(gx, gy, gw, gh * 0.5);
  // A slant of reflected light across the glass.
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createLinearGradient(gx + gw * 0.2, gy, gx + gw * 0.42, gy + gh);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.globalCompositeOperation = 'source-over';

  // A band behind the role, so the small line reads over the circuits.
  if (art.role) {
    const roleSize = Math.round(Math.min(28, gh * 0.17));
    const ry = gy + gh * 0.2;
    const band = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(gx, ry - roleSize * 0.85, gw, roleSize * 1.7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${roleSize}px ${UI_FONT}`;
    ctx.letterSpacing = `${Math.round(roleSize * 0.38)}px`;
    ctx.shadowColor = css(gem.glow, 1);
    ctx.shadowBlur = 10;
    ctx.fillStyle = gem.ink;
    ctx.fillText(art.role.toUpperCase(), w / 2 + roleSize * 0.19, ry);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
    // Hairlines either side of the role.
    const tw = ctx.measureText(art.role.toUpperCase()).width + roleSize * art.role.length * 0.38;
    ctx.strokeStyle = css(gem.glow, 0.7);
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x0 = w / 2 + side * (tw / 2 + 14);
      ctx.beginPath();
      ctx.moveTo(x0, ry);
      ctx.lineTo(x0 + side * Math.min(90, gw * 0.12), ry);
      ctx.stroke();
    }
  }

  for (let i = 0; i < art.cracks; i++) {
    const cx = gx + gw * (0.15 + rnd() * 0.7);
    const cy = gy + gh * (0.25 + rnd() * 0.5);
    drawCrack(ctx, rnd, cx, cy, Math.min(gw, gh * 2.2) * (0.42 + i * 0.08));
    if (i >= 2)
      drawChip(ctx, rnd, cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 20, 10 + rnd() * 10);
  }
  ctx.restore();

  // The bright inner rim the Mainframe's bricks have, over the glass's edge.
  ctx.save();
  glassPath(ctx, gx, gy, gw, gh, CHAMFER);
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(gem.glow, 0.95);
  ctx.shadowColor = css(gem.glow, 1);
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();

  tex.refresh();
  return key;
}
