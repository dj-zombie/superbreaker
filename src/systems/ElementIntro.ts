import Phaser from 'phaser';
import { PADDLE_Y, WIDTH } from '../config';
import { ELEMENT_INFO, elementsOf, type ElementId } from '../core/bricks/rules';
import type { Brick } from '../entities/Brick';
import { controlDevice } from '../platform/gamepad';
import { save } from '../services';
import { framePanel } from '../ui/frames';
import { icon } from '../ui/icons';
import { ring } from '../ui/shapes';
import { calm, theme, type UiTheme } from '../ui/theme';
import { body, glowWord, label } from '../ui/type';
import { audio } from './AudioSystem';

/** Over the bricks, under the spotlit ones and the callout. */
const SHADE_DEPTH = 4.5;
const SPOT_DEPTH = 4.6;
const DEPTH = 19;
const SHADE_ALPHA = 0.55;
/** Waits out the level's title band. */
const DELAY_MS = 1_900;
const PANEL_W = 470;
const PANEL_H = 118;
const PANEL_Y = PADDLE_Y - 210;
/** Most bricks one intro spotlights, so a wall of phantoms doesn't become a wall of rings. */
const MAX_RINGS = 6;

/**
 * The first time a level shows a new element, the serve waits while a callout names it, gives
 * its rule and spotlights where it is. A tap, click or the launch key moves on; each element is
 * shown once per save.
 */
export class ElementIntro {
  private readonly t: UiTheme;
  private queue: ElementId[];
  private wait = DELAY_MS;
  private layer?: Phaser.GameObjects.Container;
  private shade?: Phaser.GameObjects.Rectangle;
  private spotlit: Array<{ brick: Brick; depth: number }> = [];
  private clock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bricks: () => readonly Brick[],
  ) {
    this.t = theme();
    const seen = new Set(save.state.seenElements);
    this.queue = elementsOf(bricks().map((b) => b.kind)).filter((id) => !seen.has(id));
  }

  /** Something is still to be shown, so the serve waits. */
  get holding(): boolean {
    return this.queue.length > 0;
  }

  /** The callout is up. */
  get showing(): boolean {
    return !!this.layer;
  }

  update(dt: number): void {
    if (!this.queue.length) return;
    this.clock += dt;
    if (!this.layer) {
      this.wait -= dt;
      if (this.wait <= 0) this.show(this.queue[0]!);
      return;
    }
    const pulse = 1 + 0.08 * Math.sin(this.clock / 160);
    for (const r of this.layer.getAll('name', 'spot') as Phaser.GameObjects.Image[]) {
      r.setScale((r.getData('base') as number) * pulse);
    }
  }

  /** A tap or the launch key: dismisses the callout on show; before it shows, it's swallowed. */
  skip(): void {
    if (this.layer) this.next();
  }

  /** The player read it: on to the next element, or back to the serve. */
  next(): void {
    const id = this.queue.shift();
    if (!id) return;
    if (!save.state.seenElements.includes(id)) save.update((d) => d.seenElements.push(id));
    this.hide();
    audio.sfx('ui_on', 0.35);
    if (this.queue.length) this.show(this.queue[0]!);
  }

  destroy(): void {
    this.queue = [];
    this.hide();
  }

  private show(id: ElementId): void {
    const info = ELEMENT_INFO[id];
    const t = this.t;
    const scene = this.scene;
    // The first kind is the one to aim for (the switch, not its gates), so it gets the rings.
    const targets = this.bricks()
      .filter((b) => b.isAlive && !b.owner && info.kinds.includes(b.kind))
      .sort((a, b) => info.kinds.indexOf(a.kind) - info.kinds.indexOf(b.kind));
    // The paddle and the held ball stay lit below it.
    this.shade = scene.add
      .rectangle(WIDTH / 2, 0, WIDTH, PADDLE_Y - 50, t.palette.base, SHADE_ALPHA)
      .setOrigin(0.5, 0)
      .setDepth(SHADE_DEPTH)
      .setAlpha(0);
    scene.tweens.add({ targets: this.shade, alpha: 1, duration: calm() ? 0 : 160 });
    for (const b of targets) {
      this.spotlit.push({ brick: b, depth: b.depth });
      b.setDepth(SPOT_DEPTH);
    }
    const layer = (this.layer = scene.add.container(0, 0).setDepth(DEPTH));
    for (const b of targets.slice(0, MAX_RINGS)) {
      const r = ring(scene, b.x, b.y, 64, 6, t.palette.accentHi, 0.9);
      const base = (r.scaleX * Math.max(b.displayWidth, b.displayHeight) * 0.62) / 64;
      r.setScale(base).setData('base', base).setName('spot');
      layer.add(r);
    }
    const panel = framePanel(scene, WIDTH / 2, PANEL_Y, PANEL_W, PANEL_H, t, { accent: true });
    const left = WIDTH / 2 - PANEL_W / 2 + 34;
    const tap = controlDevice() === 'touch' ? 'Tap to continue' : 'Click or press Space';
    layer.add([
      panel,
      icon(scene, left + 8, PANEL_Y - 18, id, 30, t.palette.accentHi),
      glowWord(scene, left + 40, PANEL_Y - 30, `New: ${info.name}`, 22, t.palette.accentHi, {
        originX: 0,
      }),
      body(scene, left + 40, PANEL_Y + 6, info.rule, 16, { originX: 0, wrap: PANEL_W - 100 }),
      label(scene, WIDTH / 2, PANEL_Y + PANEL_H / 2 - 16, tap, 11, { color: t.palette.textDim }),
    ]);
    layer.setAlpha(0);
    scene.tweens.add({ targets: layer, alpha: 1, duration: calm() ? 0 : 180 });
    audio.sfx('ui_on', 0.45);
  }

  private hide(): void {
    for (const { brick, depth } of this.spotlit) if (brick.scene) brick.setDepth(depth);
    this.spotlit = [];
    this.layer?.destroy();
    this.layer = undefined;
    this.shade?.destroy();
    this.shade = undefined;
  }
}
