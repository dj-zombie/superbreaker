import Phaser from 'phaser';

/**
 * Rounded boxes, outlines, discs and rings painted once into small white canvas textures and
 * tinted per use. Phaser's Graphics re-triangulates every rounded corner and circle on every
 * frame, which was a large share of frame time on phones.
 */
const SCALE = 2;

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;

function texture(scene: Phaser.Scene, key: string, size: number, draw: Draw): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, size * SCALE, size * SCALE);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  draw(ctx, size);
  tex.refresh();
  return key;
}

function cornerRadius(r: number, w: number, h: number): number {
  return Math.max(1, Math.floor(Math.min(r, w / 2, h / 2)));
}

/** Filled rounded rectangle centred on (x, y). */
export function roundBox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.NineSlice {
  const rr = cornerRadius(r, w, h);
  const key = texture(scene, `box_${rr}`, rr * 2 + 2, (ctx, size) => {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, rr);
    ctx.fill();
  });
  const c = rr * SCALE;
  return scene.add
    .nineslice(x, y, key, undefined, w * SCALE, h * SCALE, c, c, c, c)
    .setScale(1 / SCALE)
    .setTint(color)
    .setAlpha(alpha);
}

/** Rounded rectangle outline centred on (x, y); the line straddles the edge like strokeRoundedRect. */
export function roundOutline(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  lineWidth: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.NineSlice {
  const rr = cornerRadius(r, w, h);
  const pad = Math.ceil(lineWidth / 2);
  const corner = rr + pad;
  const key = texture(scene, `outline_${rr}_${lineWidth}`, corner * 2 + 2, (ctx, size) => {
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, rr);
    ctx.stroke();
  });
  const c = corner * SCALE;
  return scene.add
    .nineslice(x, y, key, undefined, (w + pad * 2) * SCALE, (h + pad * 2) * SCALE, c, c, c, c)
    .setScale(1 / SCALE)
    .setTint(color)
    .setAlpha(alpha);
}

export function disc(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Image {
  const key = texture(scene, `disc_${radius}`, radius * 2 + 2, (ctx, size) => {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  return scene.add
    .image(x, y, key)
    .setScale(1 / SCALE)
    .setTint(color)
    .setAlpha(alpha);
}

export function ring(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  lineWidth: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Image {
  const key = texture(scene, `ring_${radius}_${lineWidth}`, radius * 2 + lineWidth + 2, (ctx, size) => {
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  });
  return scene.add
    .image(x, y, key)
    .setScale(1 / SCALE)
    .setTint(color)
    .setAlpha(alpha);
}
