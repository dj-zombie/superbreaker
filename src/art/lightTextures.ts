import type Phaser from 'phaser';
import type { Cookie } from '../core/Lighting';
import { hash } from '../core/Lighting';

/** Texture keys for the light map. All are white so stamps can tint them. */
export const LIGHT_TEX = {
  soft: 'lm_soft',
  halo: 'lm_halo',
  box: 'lm_box',
  shaft: 'lm_shaft',
  stained: 'lm_stained',
  grille: 'lm_grille',
  vignette: 'lm_vignette',
  px: 'lm_px',
  noise: 'lm_noise',
} as const;

export const SOFT_SIZE = 128;
export const PX_SIZE = 4;

export function cookieKey(cookie: Cookie): string {
  switch (cookie) {
    case 'shaft':
      return LIGHT_TEX.shaft;
    case 'stained':
      return LIGHT_TEX.stained;
    case 'grille':
      return LIGHT_TEX.grille;
    default:
      return LIGHT_TEX.box;
  }
}

type Shader = (u: number, v: number) => [number, number, number, number];

function paintPixels(scene: Phaser.Scene, key: string, w: number, h: number, shader: Shader): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = shader((x + 0.5) / w, (y + 0.5) / h);
      const i = (y * w + x) * 4;
      img.data[i] = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Distance from the nearest edge in UV space, softened over `feather`. */
const edge = (u: number, v: number, feather: number) =>
  smooth(0, feather, Math.min(u, 1 - u)) * smooth(0, feather, Math.min(v, 1 - v));

/** Stained-glass panes: an arched window of colored lead-lined cells. */
const PANES = [0xe0384a, 0x2c5cff, 0xffb02e, 0x2fbf6a, 0x9b4cff, 0xff6ad5];

function stainedPixel(u: number, v: number): [number, number, number, number] {
  // Arch: a half circle on top of a rectangle, centered horizontally.
  const cx = u - 0.5;
  const archY = 0.28;
  const inside =
    v > archY ? Math.abs(cx) < 0.42 : cx * cx + ((v - archY) / 0.62) ** 2 < 0.42 * 0.42;
  if (!inside) return [0, 0, 0, 0];
  const col = Math.floor((u - 0.08) / 0.28);
  const row = Math.floor(v / 0.16);
  const cell = PANES[Math.floor(hash(col * 31 + row * 7) * PANES.length)]!;
  const fu = ((u - 0.08) / 0.28) % 1;
  const fv = (v / 0.16) % 1;
  const lead = Math.min(fu, 1 - fu, fv * 0.6, (1 - fv) * 0.6) < 0.06 ? 0.25 : 1;
  const fade = 1 - v * 0.55;
  const soft = smooth(0, 0.08, Math.min(u, 1 - u)) * smooth(0, 0.05, 1 - v);
  const a = lead * fade * soft;
  return [((cell >> 16) & 255) / 255, ((cell >> 8) & 255) / 255, (cell & 255) / 255, a];
}

/** Generates every light map texture once per game. */
export function ensureLightTextures(scene: Phaser.Scene): void {
  paintPixels(scene, LIGHT_TEX.soft, SOFT_SIZE, SOFT_SIZE, (u, v) => {
    const d2 = ((u - 0.5) * 2) ** 2 + ((v - 0.5) * 2) ** 2;
    const q = Math.max(0, 1 - d2);
    return [1, 1, 1, q * q];
  });
  paintPixels(scene, LIGHT_TEX.halo, 64, 64, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.max(0, Math.exp(-d * d * 5) - Math.exp(-5)) / (1 - Math.exp(-5));
    return [1, 1, 1, a];
  });
  paintPixels(scene, LIGHT_TEX.box, 64, 64, (u, v) => [1, 1, 1, edge(u, v, 0.3)]);
  paintPixels(scene, LIGHT_TEX.shaft, 48, 128, (u, v) => {
    const sides = smooth(0, 0.35, Math.min(u, 1 - u));
    const top = smooth(0, 0.06, v);
    return [1, 1, 1, sides * top * (1 - v * 0.8)];
  });
  paintPixels(scene, LIGHT_TEX.stained, 64, 112, stainedPixel);
  paintPixels(scene, LIGHT_TEX.grille, 64, 64, (u, v) => {
    const bars = Math.pow(0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 6), 2);
    return [1, 1, 1, edge(u, v, 0.25) * (0.25 + 0.75 * bars)];
  });
  paintPixels(scene, LIGHT_TEX.vignette, 64, 64, (u, v) => {
    const d = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / Math.SQRT2;
    return [1, 1, 1, smooth(0.35, 1, d)];
  });
  paintPixels(scene, LIGHT_TEX.px, PX_SIZE, PX_SIZE, () => [1, 1, 1, 1]);
  // Heat haze: two channels of seamlessly tiling waves centered on 0.5 (no displacement).
  // Integer frequencies keep both axes periodic so the scrolling copy has no seam.
  const wave = (u: number, v: number, fu: number, fv: number, p: number) =>
    Math.sin(Math.PI * 2 * (fu * u + fv * v) + p);
  paintPixels(scene, LIGHT_TEX.noise, 64, 64, (u, v) => {
    const a =
      0.5 + 0.2 * wave(u, v, 2, 3, 0) + 0.18 * wave(u, v, 5, -2, 1.3) + 0.1 * wave(u, v, 1, 7, 2.1);
    const b =
      0.5 + 0.2 * wave(u, v, -3, 2, 0.7) + 0.18 * wave(u, v, 2, 5, 2.4) + 0.1 * wave(u, v, 7, 1, 4);
    return [a, b, 0.5, 1];
  });
}
