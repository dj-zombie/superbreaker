import Phaser from 'phaser';
import { RENDER_ZOOM, UI_FONT } from '../config';
import { save } from '../services';

const COUNTER_NAME = '__coinCounter';

/** Coin balance badge anchored at its right edge; recreated in place if it already exists. */
export function coinCounter(scene: Phaser.Scene, right: number, y: number) {
  scene.children.getByName(COUNTER_NAME)?.destroy();
  const c = scene.add.container(right, y).setName(COUNTER_NAME);
  const text = scene.add
    .text(0, 0, String(save.state.coins), {
      fontFamily: UI_FONT,
      fontSize: '24px',
      fontStyle: '900',
      color: '#ffc93c',
      resolution: RENDER_ZOOM,
    })
    .setOrigin(1, 0.5)
    .setStroke('#1a0629', 6);
  const icon = scene.add.image(-text.width - 22, 0, 'coin_icon');
  icon.setScale(28 / icon.width);
  c.add([icon, text]);
  return c;
}

/** Row of three stars, filled up to `count`. */
export function starRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  size = 22,
  gap = 4,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  for (let i = 0; i < 3; i++) {
    const s = scene.add.image((i - 1) * (size + gap), 0, i < count ? 'star' : 'star_off');
    s.setScale(size / s.width);
    c.add(s);
  }
  return c;
}
