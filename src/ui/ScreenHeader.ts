import Phaser from 'phaser';
import { SAFE_TOP, STAGE_W, WIDTH } from '../config';
import { iconButton, type Button } from './Button';
import { fadeTexture, glowLineTexture } from './frames';
import { theme, type UiTheme } from './theme';
import { heading, label } from './type';
import { CurrencyPill } from './widgets';

export interface HeaderOptions {
  onBack?: () => void;
  /** Small caps line above the title, e.g. the world name. */
  kicker?: string;
  /** Show the coin balance on the right. */
  coins?: boolean;
  t?: UiTheme;
}

export interface ScreenHeader {
  root: Phaser.GameObjects.Container;
  back?: Button;
  title: Phaser.GameObjects.Text;
  coins?: CurrencyPill;
  /** Bottom edge, for laying out content underneath. */
  bottom: number;
}

export const HEADER_HEIGHT = 84;

/** Back button, title and coin balance across the top of a screen, over a shade for contrast. */
export function screenHeader(scene: Phaser.Scene, text: string, opts: HeaderOptions = {}): ScreenHeader {
  const t = opts.t ?? theme();
  const top = SAFE_TOP;
  const cy = top + 40;
  const root = scene.add.container(0, 0).setDepth(40);
  const shade = scene.add
    .image(WIDTH / 2, 0, fadeTexture(scene))
    .setOrigin(0.5, 0)
    .setDisplaySize(STAGE_W + 4, top + HEADER_HEIGHT + 40)
    .setTint(t.palette.base)
    .setAlpha(0.92);
  const rule = scene.add
    .image(WIDTH / 2, top + HEADER_HEIGHT - 6, glowLineTexture(scene))
    .setDisplaySize(WIDTH * 0.8, 12)
    .setTint(t.palette.accent)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.5);
  root.add([shade, rule]);
  const title = heading(scene, WIDTH / 2, cy + (opts.kicker ? 8 : 0), text, 34, { t });
  root.add(title);
  if (opts.kicker) root.add(label(scene, WIDTH / 2, cy - 20, opts.kicker, 12, { t, color: t.palette.textDim }));
  const out: ScreenHeader = { root, title, bottom: top + HEADER_HEIGHT };
  if (opts.onBack) {
    out.back = iconButton(scene, 42, cy, 'back', opts.onBack, 48);
    root.add(out.back);
  }
  if (opts.coins) {
    out.coins = new CurrencyPill(scene, WIDTH - 20, cy);
    root.add(out.coins);
  }
  title.setAlpha(0);
  scene.tweens.add({ targets: title, alpha: 1, duration: 260, delay: 60 });
  return out;
}
