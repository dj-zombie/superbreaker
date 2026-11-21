import Phaser from 'phaser';
import type { WorldId } from '../../art/backdrops';
import { buildDialogFont, glyphAdvance } from '../../art/fonts';
import { HEIGHT, WIDTH } from '../../config';
import {
  wrapText,
  type ActorDef,
  type BoxStyle,
  type CompiledLine,
  type DialogFrame,
  type ParsedLine,
} from '../../core/cutscene';
import { framePanel } from '../frames';
import { calm, themeFor, type UiTheme } from '../theme';
import { label } from '../type';
import { viewRect } from './LetterboxView';

const SIZE: Record<BoxStyle, number> = { box: 21, bubble: 18, caption: 21, card: 27 };
const LINE_GAP: Record<BoxStyle, number> = { box: 1.32, bubble: 1.28, caption: 1.34, card: 1.4 };
const BOX_H = 138;
const PORTRAIT = 116;
const POP_MS = 110;
const BUBBLE_MAX_W = 340;
const TEXT_COLOR = 0xf4efe6;

type GlyphData = Phaser.Types.GameObjects.BitmapText.DisplayCallbackConfig;

/** Where an actor stands on screen, in the dialog's own coordinates, for bubbles. */
export type AnchorOf = (id: string) => { x: number; y: number } | undefined;

/**
 * Dialog on screen. It draws what the frame says (which line, how much of it, how solid the box
 * is) and keeps no time of its own beyond the wobble of `{wave}` and `{shake}`. Text is a
 * DynamicBitmapText on a baked atlas: typing a letter moves no pixels, it shows one more quad.
 */
export class DialogView {
  private readonly font: string;
  private readonly root: Phaser.GameObjects.Container;
  private readonly text: Phaser.GameObjects.DynamicBitmapText;
  private readonly next: Phaser.GameObjects.Triangle;
  private readonly bubble: Phaser.GameObjects.Graphics;
  private readonly shade: Phaser.GameObjects.Rectangle;
  private panel?: Phaser.GameObjects.Container;
  private panelKey = '';
  private portrait?: Phaser.GameObjects.Image;
  private name?: Phaser.GameObjects.Text;
  private nameKey = '';
  private line?: CompiledLine;
  private parsed?: ParsedLine;
  private shown = 0;
  private clock = 0;
  private scale = 1;
  private lastShown = 0;
  /** When each glyph appeared, on the view's own clock, which runs on through holds. */
  private bornAt: number[] = [];
  private colors: Array<number | undefined> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly cast: Record<string, ActorDef>,
    private readonly world: () => WorldId,
    depth = 0,
  ) {
    this.font = buildDialogFont(scene);
    this.shade = scene.add.rectangle(0, 0, 10, 10, 0x000000).setOrigin(0).setAlpha(0);
    this.bubble = scene.add.graphics();
    this.text = scene.add.dynamicBitmapText(0, 0, this.font, '', SIZE.box);
    this.text.setDisplayCallback((d) => this.glyph(d));
    this.next = scene.add.triangle(0, 0, 0, 0, 12, 0, 6, 8, 0xffffff).setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [this.shade, this.bubble, this.text, this.next])
      .setDepth(depth);
    this.root.setVisible(false);
  }

  objects(): Phaser.GameObjects.GameObject[] {
    return [this.root];
  }

  /**
   * Draws the frame's line. `waiting` shows the chevron that asks for a tap; `reach` is how far the
   * letterbox bars cover the bottom; `anchor` places bubbles. Returns the letters revealed since
   * the last call, for typing blips.
   */
  apply(
    frame: DialogFrame | null,
    waiting: boolean,
    reach: number,
    anchor: AnchorOf,
    dtMs: number,
  ): number {
    this.clock += dtMs;
    if (!frame || frame.alpha <= 0.001) {
      this.root.setVisible(false);
      this.line = undefined;
      return 0;
    }
    const line = frame.line;
    const t = themeFor(this.world());
    if (line !== this.line) {
      this.line = line;
      this.parsed = line.line;
      this.lastShown = 0;
      this.bornAt = [];
      this.layout(line, t);
    }
    this.shown = frame.shown;
    let revealed = 0;
    if (this.shown > this.lastShown) {
      for (let i = this.lastShown; i < this.shown; i++) {
        const ch = this.parsed!.glyphs[i]?.ch ?? ' ';
        if (ch.trim()) revealed++;
        this.bornAt[i] = this.clock;
      }
    }
    this.lastShown = this.shown;

    this.root.setVisible(true).setAlpha(frame.alpha);
    this.place(line, t, reach, anchor, frame.alpha);
    const showNext = waiting && frame.complete;
    this.next.setVisible(showNext);
    if (showNext) this.next.y += calm() ? 0 : Math.sin(this.clock / 180) * 2.5;
    return revealed;
  }

  private who(line: CompiledLine): ActorDef | undefined {
    return line.who === 'narrator' ? undefined : this.cast[line.who];
  }

  /** What changes once per line: the wrapped text, the panel, the face and the name. */
  private layout(line: CompiledLine, t: UiTheme): void {
    const style = line.style;
    const size = SIZE[style];
    const width = this.textWidth(line);
    const adv = glyphAdvance(this.scene, this.font, size);
    // Line spacing is in the atlas's own units (64 px glyphs), like everything in a bitmap font.
    this.text.setFontSize(size).setLineSpacing(64 * (LINE_GAP[style] - 1));
    this.text.setText(wrapText(line.line.text, width, adv));
    this.scale = size / 64;
    this.resolveColors(line, t);
    if (style === 'caption' || style === 'card') this.text.setCenterAlign().setOrigin(0.5, 0);
    else this.text.setLeftAlign().setOrigin(0, 0);
    const who = this.who(line);
    this.text.setTint(TEXT_COLOR);

    const wantPanel = style === 'box' ? `${t.id}:${this.boxWidth()}` : '';
    if (wantPanel !== this.panelKey) {
      this.panel?.destroy();
      this.panel = undefined;
      this.panelKey = wantPanel;
      if (wantPanel) {
        this.panel = framePanel(this.scene, 0, 0, this.boxWidth(), BOX_H, t, { variant: 'solid' });
        this.root.addAt(this.panel, 1);
      }
    }

    const nameKey = style === 'box' && who ? `${line.who}:${t.id}` : '';
    if (nameKey !== this.nameKey) {
      this.name?.destroy();
      this.name = undefined;
      this.nameKey = nameKey;
      if (nameKey && who) {
        const color = `#${(who.color ?? t.palette.accentHi).toString(16).padStart(6, '0')}`;
        this.name = label(this.scene, 0, 0, who.name, 14, { t, color, originX: 0 });
        this.name.setLetterSpacing(3);
        this.root.add(this.name);
      }
    }

    this.portrait?.destroy();
    this.portrait = undefined;
    if (style === 'box' && who?.portrait && this.scene.textures.exists(who.portrait)) {
      const frame = line.mood !== undefined ? who.moods?.[line.mood] : undefined;
      this.portrait = this.scene.add.image(0, 0, who.portrait, frame);
      const k = PORTRAIT / Math.max(this.portrait.width, this.portrait.height);
      this.portrait.setScale(k).setFlipX(line.side === 'right');
      this.root.addAt(this.portrait, this.panel ? 2 : 1);
    }
    this.next.setFillStyle(t.palette.accentHi);
  }

  private boxWidth(): number {
    return Math.min(viewRect(this.cam).width - 28, 640);
  }

  private textWidth(line: CompiledLine): number {
    const who = this.who(line);
    switch (line.style) {
      case 'box':
        return this.boxWidth() - 44 - (who?.portrait ? PORTRAIT + 18 : 0);
      case 'bubble':
        return BUBBLE_MAX_W - 28;
      case 'caption':
        return Math.min(viewRect(this.cam).width - 60, 560);
      case 'card':
        return Math.min(viewRect(this.cam).width - 80, 500);
    }
  }

  /** Where things go this frame: the box rises with the bars, a bubble follows its speaker. */
  private place(
    line: CompiledLine,
    t: UiTheme,
    reach: number,
    anchor: AnchorOf,
    alpha: number,
  ): void {
    const v = viewRect(this.cam);
    const bottom = v.top + v.height;
    const bounds = this.text.getTextBounds(false).local;
    const tw = bounds.width;
    const th = bounds.height;
    const rise = calm() ? 0 : (1 - alpha) * 10;
    this.bubble.clear();
    this.shade.setVisible(false);

    if (line.style === 'box') {
      const w = this.boxWidth();
      const cy = bottom - reach - BOX_H / 2 - 14 + rise;
      const left = WIDTH / 2 - w / 2;
      const portraitRight = line.side === 'right';
      this.panel?.setPosition(WIDTH / 2, cy);
      let tx = left + 22;
      if (this.portrait) {
        const px = portraitRight ? left + w - 16 - PORTRAIT / 2 : left + 16 + PORTRAIT / 2;
        this.portrait.setPosition(px, cy - 12);
        if (!portraitRight) tx = left + 16 + PORTRAIT + 18;
      }
      const top = cy - BOX_H / 2 + 16;
      this.name?.setPosition(tx, top + 6);
      this.text.setPosition(tx, top + (this.name ? 22 : 10));
      this.next.setPosition(
        left + w - (this.portrait && portraitRight ? PORTRAIT + 40 : 26),
        cy + BOX_H / 2 - 18,
      );
      return;
    }

    if (line.style === 'caption') {
      // On the bottom bar when it is in; on a soft band of shade above the bottom when it is not.
      const onBar = reach > th + 18;
      const cy = onBar ? bottom - reach / 2 : bottom - 70;
      if (!onBar) {
        this.shade
          .setVisible(true)
          .setPosition(v.left, cy - th / 2 - 14)
          .setSize(v.width, th + 28)
          .setAlpha(0.45);
      }
      this.text.setPosition(WIDTH / 2, cy - th / 2 + rise * 0.4);
      this.next.setPosition(WIDTH / 2 + tw / 2 + 16, cy + th / 2 - 6);
      return;
    }

    if (line.style === 'card') {
      this.shade
        .setVisible(true)
        .setPosition(v.left - 8, v.top - 8)
        .setSize(v.width + 16, v.height + 16)
        .setAlpha(0.72);
      const cy = HEIGHT / 2;
      this.text.setPosition(WIDTH / 2, cy - th / 2);
      this.next.setPosition(WIDTH / 2, cy + th / 2 + 26);
      return;
    }

    // A bubble over its speaker, kept on screen, with its tail toward them.
    const at = line.who === 'narrator' ? undefined : anchor(line.who);
    const w = Math.min(BUBBLE_MAX_W, tw + 28);
    const h = th + 24;
    const ax = at?.x ?? WIDTH / 2;
    const ay = at?.y ?? HEIGHT * 0.45;
    const bx = Phaser.Math.Clamp(ax - w / 2, v.left + 10, v.left + v.width - 10 - w);
    const by = Math.max(v.top + reach + 10, ay - 22 - h) + rise;
    const fill = t.palette.panelHi;
    this.bubble.fillStyle(0x000000, 0.35).fillRoundedRect(bx + 2, by + 4, w, h, 14);
    this.bubble.fillStyle(fill, 0.96).fillRoundedRect(bx, by, w, h, 14);
    this.bubble.lineStyle(2, t.palette.edge, 1).strokeRoundedRect(bx, by, w, h, 14);
    const tail = Phaser.Math.Clamp(ax, bx + 22, bx + w - 22);
    this.bubble
      .fillStyle(fill, 0.96)
      .fillTriangle(tail - 9, by + h - 1, tail + 9, by + h - 1, tail, by + h + 12);
    this.text.setPosition(bx + 14, by + 12);
    this.next.setPosition(bx + w - 16, by + h - 12);
  }

  /** Per letter, every frame it draws: hidden past the reveal, popping in, shaking, waving. */
  private glyph(d: GlyphData): GlyphData {
    const g = this.parsed?.glyphs[d.index];
    if (!g || d.index >= this.shown) {
      d.scale = 0;
      return d;
    }
    const still = calm();
    const unit = 1 / Math.max(0.01, this.scale);
    if (!still && g.fx === 'shake') {
      d.x += (Math.random() - 0.5) * 2.4 * unit;
      d.y += (Math.random() - 0.5) * 2.4 * unit;
    }
    if (!still && g.fx === 'wave')
      d.y += Math.sin(this.clock * 0.008 + d.index * 0.55) * 2.6 * unit;
    const age = this.clock - (this.bornAt[d.index] ?? -Infinity);
    if (!still && age < POP_MS) {
      const k = 1 - age / POP_MS;
      const grow = 1 + 0.25 * k;
      d.y -= 3 * k * unit;
      // The renderer scales the glyph's position with it, so it is pulled back to grow in place.
      const cell = this.text.fontData.chars[d.charCode];
      const w = cell?.width ?? 0;
      const h = cell?.height ?? 0;
      d.x = (d.x + w / 2) / grow - w / 2;
      d.y = (d.y + h / 2) / grow - h / 2;
      d.scale *= grow;
    }
    // The WebGL renderer reads `color` (a solid tint for the glyph); the typings leave it out.
    // It starts each glyph from the last one's tint, so every glyph names its own.
    (d as GlyphData & { color: number }).color = this.colors[d.index] ?? TEXT_COLOR;
    return d;
  }

  /** `{color=X}`: a palette name of the world's theme, `speaker`, or a hex color. */
  private resolveColors(line: CompiledLine, t: UiTheme): void {
    const who = this.who(line);
    const named: Record<string, number | undefined> = {
      accent: t.palette.accent,
      accentHi: t.palette.accentHi,
      accent2: t.palette.accent2,
      glow: t.palette.glow,
      edge: t.palette.edge,
      speaker: who?.color ?? t.palette.accentHi,
    };
    this.colors = line.line.glyphs.map((g) => {
      if (g.color === null) return undefined;
      const known = named[g.color];
      if (known !== undefined) return known;
      const hex = Number.parseInt(g.color.replace(/^#|^0x/, ''), 16);
      return Number.isFinite(hex) ? hex & 0xffffff : undefined;
    });
  }

  destroy(): void {
    this.root.destroy();
  }
}
