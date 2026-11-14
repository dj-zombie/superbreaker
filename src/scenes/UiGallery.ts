import Phaser from 'phaser';
import { WORLD_IDS, type WorldId } from '../art/backdrops';
import { SCENES, WIDTH } from '../config';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { Button, iconButton } from '../ui/Button';
import { Segmented, Tabs, Toggle } from '../ui/controls';
import { framePanel } from '../ui/frames';
import { cascade, countUp, scramble } from '../ui/fx/motion';
import { ambient, flyCoins } from '../ui/fx/particles';
import { transitionTo } from '../ui/fx/transitions';
import { onBack } from '../ui/nav';
import { screenHeader } from '../ui/ScreenHeader';
import { Sheet } from '../ui/Sheet';
import { menuWorld, useWorld, type UiTheme } from '../ui/theme';
import { body, display, heading, label, worldTitle } from '../ui/type';
import { Meter, RingTimer, revealStars, starRow } from '../ui/widgets';
import { BaseScene } from './BaseScene';

interface GalleryData {
  world?: WorldId;
  page?: number;
}

/** Dev only (`?ui=gallery`): every UI component in one world, for iterating and screenshots. */
export class UiGallery extends BaseScene {
  private world: WorldId = 'hell';
  private page = 0;
  private t!: UiTheme;
  private content?: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.gallery);
  }

  init(data: GalleryData): void {
    this.world = data.world ?? menuWorld();
    this.page = data.page ?? 0;
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.world);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    this.t = useWorld(this.world);
    new ParallaxBackdrop(this, this.world, 0.5).setTint(backdropTint(0.35));
    ambient(this, this.t);
    const header = screenHeader(this, 'UI Kit', {
      kicker: this.t.name,
      coins: true,
      onBack: () => transitionTo(this, SCENES.title),
    });
    onBack(this, () => transitionTo(this, SCENES.title));

    new Segmented(
      this,
      WIDTH / 2,
      header.bottom + 34,
      WORLD_IDS.map((w) => w.toUpperCase()),
      WORLD_IDS.indexOf(this.world),
      (i) => transitionTo(this, SCENES.gallery, { world: WORLD_IDS[i], page: this.page }),
      { width: 440, height: 42 },
    );
    new Tabs(this, WIDTH / 2, header.bottom + 92, ['Buttons', 'Controls', 'Effects'], this.page, (i) => {
      this.page = i;
      this.showPage(header.coins);
    });
    this.showPage(header.coins);
  }

  private showPage(coins?: { target(): { x: number; y: number }; bump(): void; setValue(n: number): void }): void {
    this.content?.destroy();
    const c = (this.content = this.add.container(0, 0));
    const top = 230;
    const items: Array<Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.AlphaSingle> = [];
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle>(o: T): T => {
      c.add(o);
      items.push(o);
      return o;
    };
    const t = this.t;
    if (this.page === 0) {
      add(worldTitle(this, WIDTH / 2, top, t.name, 36));
      add(label(this, WIDTH / 2, top + 36, t.tagline, 13));
      add(heading(this, WIDTH / 2, top + 80, 'Heading text', 30));
      add(body(this, WIDTH / 2, top + 120, 'Body copy sits on panels and under headings, wrapping as needed.', 17, { wrap: 460 }));
      add(new Button(this, WIDTH / 2, top + 190, 'Play', () => {}, { width: 300, height: 64, hero: true }));
      add(new Button(this, WIDTH / 2, top + 266, 'Armory', () => {}, { width: 300, height: 56, variant: 'secondary', icon: 'armory', sub: 'Upgrade ready' }));
      add(new Button(this, WIDTH / 2 - 82, top + 336, 'Quit', () => {}, { width: 150, height: 52, variant: 'danger' }));
      add(new Button(this, WIDTH / 2 + 82, top + 336, 'Cancel', () => {}, { width: 150, height: 52, variant: 'ghost' }));
      const icons = ['back', 'gear', 'pause', 'music', 'sfx', 'retry', 'home'] as const;
      icons.forEach((name, i) => add(iconButton(this, WIDTH / 2 + (i - 3) * 62, top + 406, name, () => {}, 50)));
      add(new Button(this, WIDTH / 2, top + 476, 'Locked', () => {}, { width: 240, height: 52, disabled: true, icon: 'lock' }));
    } else if (this.page === 1) {
      add(framePanel(this, WIDTH / 2, top + 150, 540, 320, t, { ornament: true }));
      add(label(this, 120, top + 30, 'Music', 14, { originX: 0 }));
      add(new Toggle(this, 470, top + 30, true, () => {}));
      add(label(this, 120, top + 80, 'Screen shake', 14, { originX: 0 }));
      add(new Toggle(this, 470, top + 80, false, () => {}));
      add(new Segmented(this, WIDTH / 2, top + 140, ['Easy', 'Normal', 'Hard'], 1, () => {}, { width: 420 }));
      const meter = add(new Meter(this, WIDTH / 2, top + 200, 420, 14, 0.35));
      const ring = add(new RingTimer(this, 150, top + 260, 56, t.palette.accent));
      add(starRow(this, WIDTH / 2, top + 260, 2, 30));
      const score = add(display(this, 450, top + 260, '0', 30));
      const cycle = { v: 0 };
      this.tweens.add({
        targets: cycle,
        v: 1,
        duration: 3000,
        repeat: -1,
        onUpdate: () => ring.set(1 - cycle.v),
        onRepeat: () => {
          meter.set(Math.random());
          countUp(this, score, 0, Phaser.Math.Between(1000, 90000), { duration: 900 });
        },
      });
      add(framePanel(this, WIDTH / 2 - 135, top + 420, 250, 130, t, { variant: 'card' }));
      add(framePanel(this, WIDTH / 2 + 135, top + 420, 250, 130, t, { variant: 'glass' }));
      add(label(this, WIDTH / 2 - 135, top + 420, 'Card', 14));
      add(label(this, WIDTH / 2 + 135, top + 420, 'Glass', 14));
    } else {
      const text = add(display(this, WIDTH / 2, top + 20, 'SYSTEM READY', 30));
      const stars = this.add.container(WIDTH / 2, top + 140);
      add(stars);
      const actions: Array<[string, () => void]> = [
        ['Fly coins', () => {
          if (!coins) return;
          flyCoins(this, { x: WIDTH / 2, y: top + 300 }, coins.target(), {
            count: 10,
            onEach: () => coins.bump(),
            onDone: () => coins.setValue(Phaser.Math.Between(100, 9999)),
          });
        }],
        ['Stars', () => {
          stars.removeAll(true);
          stars.add(revealStars(this, 0, 0, 3, { size: 70, delay: 100 }));
        }],
        ['Scramble', () => scramble(this, text, Phaser.Utils.Array.GetRandom(['SYSTEM READY', 'LEVEL CLEAR', 'NEW BEST', 'GAME OVER']))],
        ['Sheet', () => {
          const sheet = new Sheet(this, { height: 320 });
          sheet.root.add(heading(this, 0, sheet.top + 60, 'Bottom sheet', 30));
          sheet.root.add(new Button(this, 0, sheet.top + 160, 'Close', () => sheet.close(), { width: 260, height: 58 }));
        }],
        ['Transition', () => transitionTo(this, SCENES.gallery, { world: this.world, page: 2 })],
      ];
      actions.forEach(([name, fn], i) => {
        add(new Button(this, WIDTH / 2, top + 260 + i * 62, name, fn, { width: 260, height: 50, variant: i === 0 ? 'primary' : 'secondary' }));
      });
    }
    cascade(this, items, { stagger: 35 });
    c.setDepth(1);
  }
}
