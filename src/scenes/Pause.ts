import { worldForLevel } from '../art/backdrops';
import { HEIGHT, SAFE_BOTTOM, SCENES, STAGE_W, WIDTH } from '../config';
import { actionsFor } from '../core/KeyLayout';
import { randomSeed } from '../core/Rng';
import { runCarry } from '../core/Session';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/controls';
import { CONTROLS_CARD_W, ControlsCard } from '../ui/ControlsCard';
import { fadeTexture } from '../ui/frames';
import { cascade, type Movable } from '../ui/fx/motion';
import { BehindFx } from '../ui/fx/sceneFx';
import { transitionTo } from '../ui/fx/transitions';
import { icon } from '../ui/icons';
import { onBack } from '../ui/nav';
import { css, themeFor } from '../ui/theme';
import { display, heading, label } from '../ui/type';
import { Overlay } from './Overlay';
import type { Play } from './Play';

const BTN_W = 300;

/** Left-aligned stack over the blurred game (resume, restart, armory, settings, quit), with the controls on the right. */
export class Pause extends Overlay {
  constructor() {
    super(SCENES.pause);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const play = this.scene.get(SCENES.play) as Play;
    const t = themeFor(play.world);
    new BehindFx(this).blur([play, this.scene.get(SCENES.hud)], 1.2);
    audio.sfx('ui_pause', 0.45);

    const shade = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, t.palette.base, 0.55)
      .setInteractive()
      .setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 180 });
    this.add
      .image(0, HEIGHT / 2, fadeTexture(this))
      .setOrigin(0.5, 0.5)
      .setAngle(-90)
      .setDisplaySize(HEIGHT, WIDTH * 0.9)
      .setTint(0x000000)
      .setAlpha(0.6);

    const run = play.runConfig;
    const left = 40;
    const items: Movable[] = [];
    let y = Math.max(HEIGHT * 0.2, 120);
    items.push(label(this, left, y, run ? 'Arcade run' : t.name, 13, { originX: 0, color: css(t.palette.accentHi), t }));
    items.push(heading(this, left, y + 40, 'Paused', 52, { originX: 0, t }));
    items.push(label(this, left, y + 82, play.hud.title, 12, { originX: 0, t }));
    items.push(display(this, left, y + 112, play.hud.score.toLocaleString(), 30, { originX: 0, t }));

    y += 180;
    const stackTop = y - 33;
    const bx = left + BTN_W / 2;
    const add = (text: string, onClick: () => void, variant: 'primary' | 'secondary' | 'danger', glyph?: 'play' | 'retry' | 'armory' | 'gear' | 'home') => {
      const b = new Button(this, bx, y, text, onClick, {
        width: BTN_W,
        height: variant === 'primary' ? 66 : 54,
        variant,
        hero: variant === 'primary',
        icon: glyph,
        fontSize: variant === 'primary' ? 28 : 20,
        t,
      });
      items.push(b);
      y += variant === 'primary' ? 82 : 66;
      return b;
    };
    add('Resume', () => this.close(), 'primary', 'play');
    add(run ? 'New run' : 'Restart', () => {
      const data = run ? { run: { ...run, seed: randomSeed() } } : play.campaignStep;
      transitionTo(this, SCENES.play, data);
    }, 'secondary', 'retry');
    add('Armory', () => this.openChild(SCENES.upgrades), 'secondary', 'armory');
    add('Settings', () => this.openChild(SCENES.settings), 'secondary', 'gear');
    add(run ? 'Quit to arcade' : 'Quit to map', () => {
      audio.stopMusic();
      runCarry.discard();
      if (run) transitionTo(this, SCENES.arcadeSelect, undefined, { stop: [SCENES.play, SCENES.hud] });
      else transitionTo(this, SCENES.worldPath, { world: worldForLevel(play.levelIndex) }, { stop: [SCENES.play, SCENES.hud] });
    }, 'danger', 'home');

    const qy = HEIGHT - Math.max(SAFE_BOTTOM + 30, 44);
    const quick = (x: number, glyph: 'music' | 'sfx', key: 'music' | 'sfx') => {
      items.push(icon(this, x, qy, glyph, 24, t.palette.accentHi));
      items.push(
        new Toggle(this, x + 58, qy, save.state.settings[key], (on) => {
          save.update((d) => (d.settings[key] = on));
          audio.refresh();
        }),
      );
    };
    quick(left + 12, 'music', 'music');
    quick(left + 152, 'sfx', 'sfx');

    const card = new ControlsCard(this, WIDTH - 14 - CONTROLS_CARD_W / 2, stackTop, t);
    const room = qy - 30 - stackTop;
    if (card.cardHeight > room) card.setScale(Math.max(0.7, room / card.cardHeight));
    items.push(card);

    cascade(this, items, { dx: -40, dy: 0, stagger: 40, ease: 'Cubic.Out' });
    onBack(this, () => this.close());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && actionsFor(e.code, e.key).includes('pause')) {
        this.close();
      }
    });
  }

  protected override close(): void {
    audio.whoosh(0.18, true);
    super.close();
  }
}
