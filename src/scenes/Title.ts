import Phaser from 'phaser';
import { worldForLevel, type WorldId } from '../art/backdrops';
import { COLORS, HEIGHT, SAFE_BOTTOM, SCENES, WIDTH, designY } from '../config';
import { DIFFICULTY } from '../core/Difficulty';
import { DIFFICULTIES, type DifficultyId } from '../core/types';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { Button, bodyText, fadeIn, fadeTo } from '../ui/Button';
import { coinCounter } from '../ui/widgets';
import { BaseScene } from './BaseScene';

export class Title extends BaseScene {
  constructor() {
    super(SCENES.title);
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.world);
  }

  /** The menus show the world the player has reached. */
  private get world(): WorldId {
    return worldForLevel(save.state.unlocked);
  }

  create(): void {
    this.setupCamera();
    fadeIn(this);
    this.input.enabled = true;
    new ParallaxBackdrop(this, this.world, 0.6).setTint(backdropTint(0.25));
    this.addFloatingBricks();
    audio.playMusic('menu_music');

    const logo = this.add.image(WIDTH / 2, -200, 'logo');
    logo.setScale(Math.min(1, 520 / logo.width));
    this.tweens.add({ targets: logo, y: designY(190), duration: 900, ease: 'Bounce.Out' });
    this.tweens.add({
      targets: logo,
      angle: { from: -1.5, to: 1.5 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    coinCounter(this, WIDTH - 20, designY(30));

    const play = new Button(
      this,
      WIDTH / 2,
      designY(400),
      'PLAY',
      () => fadeTo(this, SCENES.levelSelect),
      {
        width: 300,
        height: 76,
        fontSize: 34,
      },
    );
    this.dropIn(play, 0);

    this.difficultyPicker(designY(500));

    const upgrades = new Button(
      this,
      WIDTH / 2 - 75,
      designY(600),
      'UPGRADES',
      () => this.scene.launch(SCENES.upgrades, { from: SCENES.title }).pause(),
      { width: 140, height: 56, fontSize: 18, fill: COLORS.accent, textColor: '#1a0629' },
    );
    const settings = new Button(
      this,
      WIDTH / 2 + 75,
      designY(600),
      'SETTINGS',
      () => this.scene.launch(SCENES.settings, { from: SCENES.title }).pause(),
      { width: 140, height: 56, fontSize: 18, fill: COLORS.panelEdge },
    );
    this.dropIn(upgrades, 2);
    this.dropIn(settings, 3);

    bodyText(
      this,
      WIDTH / 2,
      HEIGHT - Math.max(28, SAFE_BOTTOM + 20),
      'Zombie Head Studios',
      16,
      '#8a83b8',
    );

    this.events.on(Phaser.Scenes.Events.RESUME, () => coinCounter(this, WIDTH - 20, designY(30)));
  }

  private difficultyPicker(y: number): void {
    const buttons = new Map<DifficultyId, Button>();
    const paint = () => {
      for (const [id, b] of buttons) {
        b.setFill(save.state.difficulty === id ? COLORS.good : COLORS.panel);
        b.label.setColor(save.state.difficulty === id ? '#1a0629' : '#ffffff');
      }
    };
    DIFFICULTIES.forEach((id, i) => {
      const b = new Button(
        this,
        WIDTH / 2 + (i - 1) * 150,
        y,
        DIFFICULTY[id].label.toUpperCase(),
        () => {
          save.update((d) => (d.difficulty = id));
          paint();
        },
        { width: 140, height: 52, fontSize: 18 },
      );
      buttons.set(id, b);
      this.dropIn(b, 1 + i * 0.3);
    });
    paint();
  }

  private dropIn(obj: Phaser.GameObjects.Container, order: number): void {
    const y = obj.y;
    obj.setY(y + 40).setAlpha(0);
    this.tweens.add({
      targets: obj,
      y,
      alpha: 1,
      delay: 350 + order * 90,
      duration: 420,
      ease: 'Back.Out',
    });
  }

  private addFloatingBricks(): void {
    const keys = ['brick_red', 'brick_blue', 'brick_yellow', 'brick_green', 'brick_explosive'];
    for (let i = 0; i < 14; i++) {
      const b = this.add
        .image(
          Phaser.Math.Between(0, WIDTH),
          Phaser.Math.Between(0, HEIGHT),
          keys[i % keys.length]!,
        )
        .setDisplaySize(60, 32)
        .setAlpha(0.25)
        .setAngle(Phaser.Math.Between(-30, 30));
      this.tweens.add({
        targets: b,
        y: b.y - Phaser.Math.Between(120, 260),
        angle: b.angle + Phaser.Math.Between(-40, 40),
        duration: Phaser.Math.Between(6000, 11000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
  }
}
