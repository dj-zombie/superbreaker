import Phaser from 'phaser';
import { fgTexture } from '../art/foreground';
import { ABILITY_INFO, POWERUP_INFO, WIDE } from '../config';
import type { AbilityId } from '../core/Abilities';
import { KEY_BINDINGS } from '../core/KeyLayout';
import type { PowerupId } from '../core/types';
import { controlDevice, onInputSource, type ControlDevice } from '../platform/gamepad';
import { keyLabel, onKeyLabels, PAUSE_LABEL } from '../platform/keyboard';
import { framePanel } from './frames';
import { icon, type IconName } from './icons';
import { Keycap } from './Keycap';
import { disc, ring } from './shapes';
import { css, type UiTheme } from './theme';
import { body, label } from './type';

/** One picture in a row: a key or button, a glyph, or a small copy of what is on screen in play. */
type Item =
  | { kind: 'key'; label: string; width?: number; round?: boolean }
  | { kind: 'glyph'; name: IconName; size?: number; flip?: boolean }
  | { kind: 'paddle' }
  | { kind: 'serve' }
  | { kind: 'slot'; id: AbilityId }
  | { kind: 'stock'; id: PowerupId }
  | { kind: 'pause' }
  | { kind: 'gap' };

interface Row {
  title: string;
  /** How to do it, in words, on the title line. */
  caption: string;
  items: Item[];
}

export const CONTROLS_CARD_W = 228;
const W = CONTROLS_CARD_W;
const PAD_X = 18;
const KEY = 30;
const ROW_H = 60;
const HEAD_H = 44;
const GAP = 4;
const SPACER = 10;
const MINI_PADDLE_W = 52;

const key = (text: string, width?: number): Item => ({ kind: 'key', label: text, width });
const pad = (text: string): Item => ({ kind: 'key', label: text, round: true });
const glyph = (name: IconName): Item => ({ kind: 'glyph', name });
const chevron = (flip: boolean): Item => ({ kind: 'glyph', name: 'back', size: 20, flip });
const gap: Item = { kind: 'gap' };

function rows(device: ControlDevice): Row[] {
  if (device === 'pad') {
    return [
      { title: 'Move', caption: 'Stick or D-pad', items: [chevron(false), pad('L'), chevron(true), gap, glyph('dpad')] },
      { title: 'Launch', caption: 'Press A', items: [pad('A')] },
      { title: 'Abilities', caption: 'Fire a ready slot', items: [pad('X'), pad('Y')] },
      { title: 'Stock', caption: 'Bought powerups', items: ['LB', 'RB', 'LT', 'RT'].map((b) => key(b)) },
      { title: 'Pause', caption: 'Opens this menu', items: [key('START')] },
    ];
  }
  if (device === 'touch') {
    // On the wide stage the slots and the pause button sit in the right-hand panel.
    return [
      { title: 'Move', caption: 'Drag anywhere', items: [chevron(false), { kind: 'paddle' }, chevron(true)] },
      { title: 'Launch', caption: 'Tap anywhere', items: [{ kind: 'serve' }] },
      {
        title: 'Abilities',
        caption: WIDE ? 'Tap one on the right' : 'Tap a corner button',
        items: [
          { kind: 'slot', id: 'meteor' },
          { kind: 'slot', id: 'lightning' },
        ],
      },
      {
        title: 'Stock',
        caption: 'Tap a bought powerup',
        items: [
          { kind: 'stock', id: 'balls' },
          { kind: 'stock', id: 'fireball' },
          { kind: 'stock', id: 'shield' },
        ],
      },
      { title: 'Pause', caption: WIDE ? 'Top of the right panel' : 'Top-left button', items: [{ kind: 'pause' }] },
    ];
  }
  const [arrowL, letterL] = KEY_BINDINGS.left;
  const [arrowR, letterR] = KEY_BINDINGS.right;
  return [
    {
      title: 'Move',
      caption: 'Mouse or keys',
      items: [glyph('mouse'), gap, key(keyLabel(arrowL!)), key(keyLabel(arrowR!)), gap, key(keyLabel(letterL!)), key(keyLabel(letterR!))],
    },
    { title: 'Launch', caption: 'Click or press', items: [glyph('click'), gap, key(keyLabel(KEY_BINDINGS.launch[0]!), 84)] },
    {
      title: 'Abilities',
      caption: 'Fire a ready slot',
      items: [key(keyLabel(KEY_BINDINGS.slot1[0]!)), key(keyLabel(KEY_BINDINGS.slot2[0]!))],
    },
    { title: 'Stock', caption: 'Bought powerups', items: ['1', '2', '3', '4'].map((d) => key(d)) },
    { title: 'Pause', caption: 'Opens this menu', items: [key(PAUSE_LABEL)] },
  ];
}

/**
 * Every control at a glance, pictured and worded for the device in hand: mouse and keys (named as
 * the player's layout prints them), touch with small copies of what is on screen, or a controller.
 * Switches when the input does.
 */
export class ControlsCard extends Phaser.GameObjects.Container {
  private device: ControlDevice;
  private content?: Phaser.GameObjects.Container;
  private shown = '';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly t: UiTheme,
  ) {
    super(scene, x, y);
    this.device = controlDevice();
    const offs = [
      onInputSource((s) => {
        this.device = controlDevice(s);
        this.build();
      }),
      onKeyLabels(() => this.build()),
    ];
    this.once(Phaser.GameObjects.Events.DESTROY, () => offs.forEach((off) => off()));
    this.build();
    scene.add.existing(this);
  }

  /** Card height for the current device, to place it beside other things. */
  get cardHeight(): number {
    return HEAD_H + rows(this.device).length * ROW_H + 8;
  }

  private build(): void {
    const list = rows(this.device);
    const sig = `${this.device}:${JSON.stringify(list)}`;
    if (sig === this.shown) return;
    this.shown = sig;
    this.content?.destroy();
    const scene = this.scene;
    const t = this.t;
    const h = this.cardHeight;
    const root = (this.content = scene.add.container(0, 0));
    root.add(framePanel(scene, 0, h / 2, W, h, t, { variant: 'glass' }));
    root.add(label(scene, 0, 24, 'Controls', 13, { t, color: css(t.palette.accentHi) }));
    list.forEach((row, i) => {
      const y = HEAD_H + i * ROW_H;
      const title = label(scene, -W / 2 + PAD_X, y + 6, row.title, 11, { t, originX: 0 });
      const caption = body(scene, W / 2 - PAD_X, y + 6, row.caption, 12, { t, originX: 1, color: t.palette.textDim });
      // Squeezed rather than wrapped, so a long caption can't run into the title.
      const room = W - PAD_X * 2 - title.width - 8;
      if (caption.width > room) caption.setScale(room / caption.width);
      root.add([title, caption]);
      this.addItems(root, row.items, y + 34);
    });
    this.add(root);
  }

  private make(item: Item): { obj?: Phaser.GameObjects.Image | Phaser.GameObjects.Container; w: number } {
    const scene = this.scene;
    const t = this.t;
    const tint = t.palette.accentHi;
    switch (item.kind) {
      case 'gap':
        return { w: SPACER };
      case 'key': {
        const cap = new Keycap(scene, 0, 0, item.label, { size: KEY, width: item.width, round: item.round, t });
        return { obj: cap, w: cap.kw };
      }
      case 'glyph': {
        const size = item.size ?? KEY;
        return { obj: icon(scene, 0, 0, item.name, size, tint).setFlipX(!!item.flip), w: size };
      }
      case 'paddle':
        return { obj: this.miniPaddle(0), w: MINI_PADDLE_W };
      case 'serve': {
        const ball = scene.add.image(0, -5, ...fgTexture(t.id, 'ball'));
        ball.setScale(12 / ball.width);
        const ripple = ring(scene, 0, -5, 13, 2, tint, 0.8);
        return { obj: scene.add.container(0, 0, [this.miniPaddle(9), ripple, ball]), w: MINI_PADDLE_W };
      }
      case 'slot': {
        const color = ABILITY_INFO[item.id].color;
        const r = KEY / 2;
        const art = scene.add.image(0, 0, `ab_${item.id}`);
        art.setScale(((r - 3) * 2) / art.width);
        const parts = [disc(scene, 0, 0, r, t.palette.base, 0.9), art, ring(scene, 0, 0, r, 2, color)];
        return { obj: scene.add.container(0, 0, parts), w: KEY };
      }
      case 'stock': {
        const info = POWERUP_INFO[item.id];
        const r = KEY / 2 - 3;
        const art = scene.add.image(0, 0, info.texture);
        art.setScale((r * 1.35) / Math.max(art.width, art.height));
        const parts = [disc(scene, 0, 0, r, t.palette.base, 0.9), ring(scene, 0, 0, r, 2, info.color), art];
        return { obj: scene.add.container(0, 0, parts), w: r * 2 };
      }
      case 'pause': {
        const r = KEY / 2;
        const parts = [
          disc(scene, 0, 0, r, t.palette.panelHi, 0.95),
          ring(scene, 0, 0, r, 2, t.palette.edge),
          icon(scene, 0, 0, 'pause', KEY * 0.6, 0xffffff),
        ];
        return { obj: scene.add.container(0, 0, parts), w: KEY };
      }
    }
  }

  /** The paddle as it looks in this world, small. */
  private miniPaddle(y: number): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, y, ...fgTexture(this.t.id, 'paddle'));
    return img.setScale(MINI_PADDLE_W / img.width);
  }

  private addItems(root: Phaser.GameObjects.Container, items: Item[], y: number): void {
    const made = items.map((it) => this.make(it));
    const gapAfter = (i: number) => (i < items.length - 1 && items[i]!.kind !== 'gap' && items[i + 1]!.kind !== 'gap' ? GAP : 0);
    const total = made.reduce((sum, m, i) => sum + m.w + gapAfter(i), 0);
    let x = -total / 2;
    made.forEach((m, i) => {
      m.obj?.setPosition(x + m.w / 2, y);
      if (m.obj) root.add(m.obj);
      x += m.w + gapAfter(i);
    });
  }
}
