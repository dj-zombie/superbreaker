import Phaser from 'phaser';
import { KEY_BINDINGS } from '../core/KeyLayout';
import { controlDevice, onInputSource, type ControlDevice } from '../platform/gamepad';
import { keyLabel, onKeyLabels, PAUSE_LABEL } from '../platform/keyboard';
import { framePanel } from './frames';
import { icon, type IconName } from './icons';
import { Keycap } from './Keycap';
import { ring } from './shapes';
import { css, type UiTheme } from './theme';
import { label } from './type';

type Item =
  | { kind: 'key'; label: string; width?: number; round?: boolean }
  | { kind: 'glyph'; name: IconName }
  | { kind: 'slot' }
  | { kind: 'gap' };

interface Row {
  title: string;
  items: Item[];
}

export const CONTROLS_CARD_W = 228;
const W = CONTROLS_CARD_W;
const KEY = 30;
const ROW_H = 60;
const HEAD_H = 44;
const GAP = 4;
const SPACER = 10;

const key = (text: string, width?: number): Item => ({ kind: 'key', label: text, width });
const pad = (text: string): Item => ({ kind: 'key', label: text, round: true });
const glyph = (name: IconName): Item => ({ kind: 'glyph', name });
const gap: Item = { kind: 'gap' };

function rows(device: ControlDevice): Row[] {
  if (device === 'pad') {
    return [
      { title: 'Move', items: [glyph('stick')] },
      { title: 'Launch', items: [pad('A')] },
      { title: 'Abilities', items: [pad('X'), pad('Y')] },
      { title: 'Stock', items: ['LB', 'RB', 'LT', 'RT'].map((b) => key(b)) },
      { title: 'Pause', items: [key('START')] },
    ];
  }
  if (device === 'touch') {
    return [
      { title: 'Move', items: [glyph('hand'), glyph('mover')] },
      { title: 'Launch', items: [glyph('hand')] },
      { title: 'Abilities', items: [{ kind: 'slot' }, { kind: 'slot' }] },
      { title: 'Pause', items: [glyph('pause')] },
    ];
  }
  const [arrowL, letterL] = KEY_BINDINGS.left;
  const [arrowR, letterR] = KEY_BINDINGS.right;
  return [
    {
      title: 'Move',
      items: [glyph('mouse'), gap, key(keyLabel(arrowL!)), key(keyLabel(arrowR!)), gap, key(keyLabel(letterL!)), key(keyLabel(letterR!))],
    },
    { title: 'Launch', items: [glyph('click'), gap, key(keyLabel(KEY_BINDINGS.launch[0]!), 84)] },
    { title: 'Abilities', items: [key(keyLabel(KEY_BINDINGS.slot1[0]!)), key(keyLabel(KEY_BINDINGS.slot2[0]!))] },
    { title: 'Stock', items: ['1', '2', '3', '4'].map((d) => key(d)) },
    { title: 'Pause', items: [key(PAUSE_LABEL)] },
  ];
}

/**
 * Every control at a glance, pictured for the device in hand: mouse and keys (named as the
 * player's layout prints them), touch, or a controller. Switches when the input does.
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
    const body = (this.content = scene.add.container(0, 0));
    body.add(framePanel(scene, 0, h / 2, W, h, t, { variant: 'glass' }));
    body.add(label(scene, 0, 24, 'Controls', 13, { t, color: css(t.palette.accentHi) }));
    list.forEach((row, i) => {
      const y = HEAD_H + i * ROW_H;
      body.add(label(scene, -W / 2 + 18, y + 6, row.title, 11, { t, originX: 0 }));
      this.addItems(body, row.items, y + 34);
    });
    this.add(body);
  }

  private make(item: Item): { obj?: Phaser.GameObjects.Image | Keycap; w: number } {
    const scene = this.scene;
    const tint = this.t.palette.accentHi;
    switch (item.kind) {
      case 'gap':
        return { w: SPACER };
      case 'key': {
        const cap = new Keycap(scene, 0, 0, item.label, { size: KEY, width: item.width, round: item.round, t: this.t });
        return { obj: cap, w: cap.kw };
      }
      case 'glyph':
        return { obj: icon(scene, 0, 0, item.name, KEY, tint), w: KEY };
      case 'slot':
        return { obj: ring(scene, 0, 0, KEY / 2 - 2, 3, tint, 0.85), w: KEY };
    }
  }

  private addItems(body: Phaser.GameObjects.Container, items: Item[], y: number): void {
    const made = items.map((it) => this.make(it));
    const gapAfter = (i: number) => (i < items.length - 1 && items[i]!.kind !== 'gap' && items[i + 1]!.kind !== 'gap' ? GAP : 0);
    const total = made.reduce((sum, m, i) => sum + m.w + gapAfter(i), 0);
    let x = -total / 2;
    made.forEach((m, i) => {
      m.obj?.setPosition(x + m.w / 2, y);
      if (m.obj) body.add(m.obj);
      x += m.w + gapAfter(i);
    });
  }
}
