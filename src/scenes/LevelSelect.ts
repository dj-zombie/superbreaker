import { worldForLevel } from '../art/backdrops';
import { COLORS, RENDER_ZOOM, SCENES, UI_FONT, WIDTH, designY } from '../config';
import { DIFFICULTY } from '../core/Difficulty';
import { runCarry } from '../core/Session';
import { levelId } from '../core/SaveStore';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { haptic } from '../platform/haptics';
import { bodyText, fadeIn, fadeTo, iconButton, title } from '../ui/Button';
import { roundBox, roundOutline } from '../ui/shapes';
import { coinCounter, starRow } from '../ui/widgets';
import { BaseScene } from './BaseScene';

const COLS = 5;
const TILE_W = 104;
const TILE_H = 92;
const GAP_X = 10;
const GAP_Y = 20;

export class LevelSelect extends BaseScene {
  constructor() {
    super(SCENES.levelSelect);
  }

  preload(): void {
    ParallaxBackdrop.preload(this, worldForLevel(save.state.unlocked));
  }

  create(): void {
    this.setupCamera();
    fadeIn(this);
    this.input.enabled = true;
    new ParallaxBackdrop(this, worldForLevel(save.state.unlocked), 0.4).setTint(backdropTint(0.5));
    audio.playMusic('menu_music');

    iconButton(this, 44, designY(40), '‹', () => fadeTo(this, SCENES.title));
    title(this, WIDTH / 2, designY(40), 'LEVELS', 34);
    coinCounter(this, WIDTH - 20, designY(40));
    bodyText(
      this,
      WIDTH / 2,
      designY(86),
      `${DIFFICULTY[save.state.difficulty].label} mode · ${this.totalStars()} ★`,
      18,
      '#8a83b8',
    );

    const levels = this.levels;
    const gridW = COLS * TILE_W + (COLS - 1) * GAP_X;
    const x0 = (WIDTH - gridW) / 2 + TILE_W / 2;
    const y0 = designY(150);

    levels.forEach((lv, i) => {
      const index = i + 1;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = x0 + col * (TILE_W + GAP_X);
      const y = y0 + row * (TILE_H + GAP_Y);
      const unlocked = index <= save.state.unlocked;
      const progress = save.state.levels[levelId(index)];
      const isNew = lv.bricks.some((b) => b.kind !== 'normal' || b.moveX !== 0);
      this.tile(x, y, index, unlocked, progress?.stars ?? 0, isNew, i);
    });
  }

  private tile(
    x: number,
    y: number,
    index: number,
    unlocked: boolean,
    stars: number,
    isNew: boolean,
    order: number,
  ): void {
    const c = this.add.container(x, y);
    const fill = unlocked ? (stars > 0 ? 0x2b1d66 : COLORS.panel) : 0x14102a;
    c.add([
      roundBox(this, 0, 5, TILE_W, TILE_H, 18, 0x000000, 0.35),
      roundBox(this, 0, 0, TILE_W, TILE_H, 18, fill, 0.95),
      roundOutline(this, 0, 0, TILE_W, TILE_H, 18, 3, unlocked ? COLORS.panelEdge : 0x2a2450),
    ]);

    if (unlocked) {
      c.add(
        this.add
          .text(0, -8, String(index), {
            fontFamily: UI_FONT,
            fontSize: '30px',
            fontStyle: '900',
            color: '#ffffff',
            resolution: RENDER_ZOOM,
          })
          .setOrigin(0.5),
      );
      c.add(starRow(this, 0, 26, stars, 20));
      if (isNew) {
        c.add(roundBox(this, TILE_W / 2 - 23, -TILE_H / 2 + 13, 34, 16, 6, COLORS.accent));
        c.add(
          this.add
            .text(TILE_W / 2 - 23, -TILE_H / 2 + 13, 'NEW', {
              fontFamily: UI_FONT,
              fontSize: '10px',
              fontStyle: '900',
              color: '#1a0629',
              resolution: RENDER_ZOOM,
            })
            .setOrigin(0.5),
        );
      }
    } else {
      const lock = this.add.image(0, 0, 'lock');
      lock.setScale(40 / lock.height).setAlpha(0.6);
      c.add(lock);
    }

    c.setSize(TILE_W, TILE_H).setInteractive({ useHandCursor: unlocked });
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.94, duration: 80 }));
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 80 }));
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 80 });
      if (!unlocked) {
        audio.sfx('ui_off', 0.5);
        haptic('medium');
        this.tweens.add({ targets: c, x: x + 6, duration: 50, yoyo: true, repeat: 3 });
        return;
      }
      audio.sfx('ui_select', 0.7);
      haptic('light');
      audio.stopMusic();
      runCarry.discard();
      fadeTo(this, SCENES.play, { index });
    });

    c.setScale(0.6).setAlpha(0);
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 1,
      delay: 80 + order * 22,
      duration: 300,
      ease: 'Back.Out',
    });
  }

  private totalStars(): number {
    return Object.values(save.state.levels).reduce((s, l) => s + l.stars, 0);
  }
}
