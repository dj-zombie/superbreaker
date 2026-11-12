import { COLORS, HEIGHT, SCENES, WIDTH } from '../config';
import { runCarry } from '../core/Session';
import { audio } from '../systems/AudioSystem';
import { Button, panel, title } from '../ui/Button';
import { Overlay } from './Overlay';
import type { Play } from './Play';

export class Pause extends Overlay {
  constructor() {
    super(SCENES.pause);
  }

  create(): void {
    this.openOverlay();
    const play = this.scene.get(SCENES.play) as Play;
    const root = this.add.container(WIDTH / 2, HEIGHT / 2);
    root.add(panel(this, 0, 0, 440, 560));
    root.add(title(this, 0, -220, 'PAUSED', 42));
    this.popIn(root);

    const btn = (y: number, text: string, onClick: () => void, fill: number, dark = false) =>
      root.add(
        new Button(this, 0, y, text, onClick, {
          width: 300,
          height: 62,
          fill,
          textColor: dark ? '#1a0629' : '#ffffff',
          fontSize: 24,
        }),
      );

    btn(-120, 'RESUME', () => this.close(), COLORS.good, true);
    btn(
      -40,
      'RESTART',
      () => this.scene.start(SCENES.play, { index: play.levelIndex }),
      COLORS.hot,
    );
    btn(40, 'UPGRADES', () => this.openChild(SCENES.upgrades), COLORS.accent, true);
    btn(120, 'SETTINGS', () => this.openChild(SCENES.settings), COLORS.panelEdge);
    btn(
      200,
      'QUIT TO LEVELS',
      () => {
        audio.stopMusic();
        runCarry.discard();
        this.scene.stop(SCENES.play);
        this.scene.start(SCENES.levelSelect);
      },
      0x3a3366,
    );

    this.input.keyboard?.addKey('ESC').on('down', () => this.close());
  }
}
