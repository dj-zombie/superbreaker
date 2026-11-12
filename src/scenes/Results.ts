import Phaser from 'phaser';
import { COLORS, HEIGHT, RENDER_ZOOM, SCENES, UI_FONT, WIDTH } from '../config';
import { runCarry } from '../core/Session';
import { audio } from '../systems/AudioSystem';
import { haptic } from '../platform/haptics';
import { Button, bodyText, panel, title } from '../ui/Button';
import { coinCounter } from '../ui/widgets';
import { Overlay } from './Overlay';
import type { ResultsData } from './Play';

export class Results extends Overlay {
  private result!: ResultsData;

  constructor() {
    super(SCENES.results);
  }

  override init(data: ResultsData & { from: string }): void {
    super.init(data);
    this.result = data;
  }

  create(): void {
    this.openOverlay(0.65);
    const d = this.result;
    const total = this.levels.length;
    const hasNext = d.index < total;
    const root = this.add.container(WIDTH / 2, HEIGHT / 2);
    root.add(panel(this, 0, 0, 500, 600));
    root.add(
      title(this, 0, -245, d.win ? (hasNext ? 'LEVEL CLEAR!' : 'ALL CLEAR!') : 'GAME OVER', 40),
    );
    this.popIn(root);
    coinCounter(this, WIDTH - 40, HEIGHT / 2 - 245);

    if (d.win) this.stars(root, d.stars);
    else root.add(bodyText(this, 0, -150, 'Out of lives. Upgrades help!', 20, '#8a83b8'));

    const style = { fontFamily: UI_FONT, fontStyle: '900', resolution: RENDER_ZOOM };
    const scoreText = this.add
      .text(0, -40, '0', { ...style, fontSize: '48px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#1a0629', 8);
    root.add(scoreText);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: d.score,
      duration: 1100,
      delay: 300,
      ease: 'Cubic.Out',
      onUpdate: () => scoreText.setText(Math.round(counter.v).toLocaleString()),
    });

    const bestLine = d.isBest ? 'NEW BEST!' : `Best ${d.bestScore.toLocaleString()}`;
    const best = bodyText(this, 0, 12, bestLine, 20, d.isBest ? '#ffc93c' : '#8a83b8');
    root.add(best);
    if (d.isBest) {
      this.tweens.add({
        targets: best,
        scale: { from: 1, to: 1.12 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }
    root.add(bodyText(this, 0, 50, `+${d.coinsEarned} coins this run`, 18, '#ffc93c'));

    if (d.win && hasNext) {
      root.add(
        new Button(this, 0, 130, 'NEXT LEVEL', () => this.goPlay(d.index + 1), {
          width: 320,
          height: 70,
          fill: COLORS.good,
          textColor: '#1a0629',
          fontSize: 28,
        }),
      );
    } else {
      root.add(
        new Button(this, 0, 130, d.win ? 'PLAY AGAIN' : 'RETRY', () => this.goPlay(d.index), {
          width: 320,
          height: 70,
          fill: d.win ? COLORS.good : COLORS.hot,
          textColor: d.win ? '#1a0629' : '#ffffff',
          fontSize: 28,
        }),
      );
    }
    const small = { width: 140, height: 56, fontSize: 18 };
    root.add(
      new Button(this, -150, 220, 'LEVELS', () => this.goLevels(), { ...small, fill: 0x3a3366 }),
    );
    root.add(
      new Button(this, 0, 220, 'UPGRADES', () => this.openChild(SCENES.upgrades), {
        ...small,
        fill: COLORS.accent,
        textColor: '#1a0629',
      }),
    );
    root.add(
      new Button(
        this,
        150,
        220,
        d.win ? 'REPLAY' : 'MENU',
        () => (d.win ? this.goPlay(d.index) : this.goLevels()),
        { ...small, fill: COLORS.panelEdge },
      ),
    );

    this.events.on(Phaser.Scenes.Events.RESUME, () =>
      coinCounter(this, WIDTH - 40, HEIGHT / 2 - 245),
    );
  }

  private stars(root: Phaser.GameObjects.Container, count: number): void {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 110;
      const y = i === 1 ? -150 : -135;
      const off = this.add.image(x, y, 'star_big').setTint(0x2a2450);
      off.setScale((i === 1 ? 100 : 80) / off.width);
      root.add(off);
      if (i >= count) continue;
      const star = this.add.image(x, y, 'star_big');
      const s = (i === 1 ? 100 : 80) / star.width;
      star.setScale(0).setAngle(-180);
      root.add(star);
      this.tweens.add({
        targets: star,
        scale: s,
        angle: 0,
        delay: 500 + i * 350,
        duration: 450,
        ease: 'Back.Out',
        onStart: () => {
          audio.sfx('sfx_coin', 0.5, i * 200);
          haptic('medium');
        },
      });
    }
  }

  private goPlay(index: number): void {
    if (!(this.result.win && index === this.result.index + 1)) runCarry.discard();
    this.scene.stop(SCENES.hud);
    this.scene.start(SCENES.play, { index });
  }

  private goLevels(): void {
    runCarry.discard();
    this.scene.stop(SCENES.play);
    this.scene.start(SCENES.levelSelect);
  }
}
