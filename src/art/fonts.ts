import type Phaser from 'phaser';
import { DISPLAY_FONT, UI_FONT } from '../config';

/** Plain white glyphs for HUD numbers and labels; tint them per use. */
export const HUD_FONT = 'ui-plain';
/** White glyphs with a dark outline, for pop-up text over the playfield. */
export const POP_FONT = 'ui-pop';
/** The body face for cutscene dialog, with typographic quotes, dashes and the ellipsis. */
export const DIALOG_FONT = 'ui-dialog';

const BASE = 64;
const ATLAS_W = 1024;
const OUTLINE = '#06050a';
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·×‹›';
const DIALOG_CHARS = CHARS + '‘’“”…—–éèêàçñöü¡¿';

/**
 * Bakes UI_FONT into glyph atlases so labels that change often can be BitmapText. A canvas Text
 * re-rasterizes and re-uploads its texture on every change; BitmapText only moves quads.
 */
export function buildUiFonts(scene: Phaser.Scene): void {
  bake(scene, HUD_FONT, 0);
  bake(scene, POP_FONT, Math.round(BASE * 0.2));
}

/** Bakes the dialog face on first use, once the web fonts have loaded. */
export function buildDialogFont(scene: Phaser.Scene): string {
  bake(scene, DIALOG_FONT, 0, `600 ${BASE}px ${UI_FONT}`, DIALOG_CHARS);
  return DIALOG_FONT;
}

/** How far the pen moves for `ch` in a baked font at `size` px. */
export function glyphAdvance(
  scene: Phaser.Scene,
  key: string,
  size: number,
): (ch: string) => number {
  const data = scene.cache.bitmapFont.get(key)?.data as
    { size: number; chars: Record<number, { xAdvance: number }> } | undefined;
  if (!data) return () => size * 0.5;
  const k = size / data.size;
  const space = (data.chars[32]?.xAdvance ?? data.size * 0.3) * k;
  return (ch) => {
    const adv = data.chars[ch.charCodeAt(0)]?.xAdvance;
    return adv === undefined ? space : adv * k;
  };
}

function bake(
  scene: Phaser.Scene,
  key: string,
  outline: number,
  font = `800 ${BASE}px ${DISPLAY_FONT}`,
  chars = CHARS,
): void {
  if (scene.cache.bitmapFont.exists(key)) return;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return;
  probe.font = font;
  const m = probe.measureText('Mg|');
  const ascent = Math.ceil(m.fontBoundingBoxAscent || BASE * 0.95);
  const descent = Math.ceil(m.fontBoundingBoxDescent || BASE * 0.25);
  const lineHeight = ascent + descent;
  const pad = Math.ceil(outline / 2) + 2;
  const cellH = lineHeight + pad * 2;

  const cells: Array<{ ch: string; x: number; y: number; w: number; adv: number }> = [];
  let x = 0;
  let y = 0;
  for (const ch of chars) {
    const ink = probe.measureText(ch);
    const adv = ink.width;
    const w = Math.ceil(adv) + pad * 2;
    // Ink past the advance (the hook of a j, an italic f) is left clear, so it never shows at
    // the edge of the glyph beside it.
    const left = Math.max(0, Math.ceil(ink.actualBoundingBoxLeft) - pad);
    const right = Math.max(0, Math.ceil(ink.actualBoundingBoxRight - adv) - pad);
    if (x + left + w + right > ATLAS_W) {
      x = 0;
      y += cellH;
    }
    cells.push({ ch, x: x + left, y, w, adv });
    x += left + w + right;
  }
  const atlasH = y + cellH;

  const tex = scene.textures.createCanvas(key, ATLAS_W, atlasH);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = '#ffffff';
  const glyphs: Record<number, object> = {};
  for (const c of cells) {
    const bx = c.x + pad;
    const by = c.y + pad + ascent;
    if (outline > 0) ctx.strokeText(c.ch, bx, by);
    ctx.fillText(c.ch, bx, by);
    glyphs[c.ch.charCodeAt(0)] = {
      x: c.x,
      y: c.y,
      width: c.w,
      height: cellH,
      centerX: Math.floor(c.w / 2),
      centerY: Math.floor(cellH / 2),
      xOffset: -pad,
      yOffset: -pad,
      xAdvance: Math.round(c.adv),
      data: {},
      kerning: {},
      // Phaser's WebGL UVs count v from the bottom of the texture.
      u0: c.x / ATLAS_W,
      v0: 1 - c.y / atlasH,
      u1: (c.x + c.w) / ATLAS_W,
      v1: 1 - (c.y + cellH) / atlasH,
    };
  }
  tex.refresh();
  scene.cache.bitmapFont.add(key, {
    data: { font: key, size: BASE, lineHeight, chars: glyphs },
    texture: key,
    frame: null,
  });
}
