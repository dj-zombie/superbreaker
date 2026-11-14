import Phaser from 'phaser';
import { HEIGHT, SAFE_TOP, SCENES, WIDTH } from '../config';
import type { Settings as SettingsData } from '../core/SaveStore';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { applyQuality } from '../systems/Quality';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/controls';
import { glowLineTexture } from '../ui/frames';
import { cascade } from '../ui/fx/motion';
import { onBack } from '../ui/nav';
import { Sheet } from '../ui/Sheet';
import { theme } from '../ui/theme';
import { body, heading, label } from '../ui/type';
import { Overlay } from './Overlay';

interface Row {
  key: keyof SettingsData;
  label: string;
  hint?: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'Audio',
    rows: [
      { key: 'music', label: 'Music' },
      { key: 'sfx', label: 'Sound effects' },
    ],
  },
  {
    title: 'Feel',
    rows: [
      { key: 'haptics', label: 'Vibration', hint: 'On supported phones' },
      { key: 'screenShake', label: 'Screen shake' },
    ],
  },
  {
    title: 'Accessibility & performance',
    rows: [
      { key: 'reducedMotion', label: 'Reduced motion', hint: 'No shake, flashes, glitches or hit-stop' },
      { key: 'batterySaver', label: 'Battery saver', hint: 'Lower resolution, fewer particles' },
    ],
  },
  {
    title: 'Developer',
    rows: [{ key: 'godMode', label: 'God mode', hint: 'Balls bounce back, no lives lost' }],
  },
];

const ROW_H = 54;
const HEAD_H = 40;

/** Settings in sections with switches, in a sheet over whatever opened it. */
export class Settings extends Overlay {
  private sheet!: Sheet;

  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const t = theme();
    const rows = SECTIONS.reduce((n, s) => n + s.rows.length, 0);
    const height = Math.min(HEIGHT - SAFE_TOP - 24, 120 + SECTIONS.length * HEAD_H + rows * ROW_H + 160);
    this.sheet = new Sheet(this, { height, blur: this.scene.get(this.from), onDismiss: () => this.close() });
    onBack(this, () => this.done());
    const root = this.sheet.root;
    const items: Phaser.GameObjects.Container[] = [];
    const left = -WIDTH / 2 + 44;
    const right = WIDTH / 2 - 70;

    root.add(heading(this, 0, this.sheet.top + 54, 'Settings', 36));
    let y = this.sheet.top + 104;
    for (const section of SECTIONS) {
      const head = this.add.container(0, y);
      head.add(label(this, left, 0, section.title, 12, { originX: 0, color: t.palette.textDim }));
      head.add(
        this.add
          .image(0, 14, glowLineTexture(this))
          .setDisplaySize(WIDTH - 80, 8)
          .setTint(t.palette.edge)
          .setAlpha(0.45),
      );
      root.add(head);
      items.push(head);
      y += HEAD_H;
      for (const row of section.rows) {
        const c = this.add.container(0, y);
        c.add(body(this, left, row.hint ? -9 : 0, row.label, 19, { originX: 0, align: 'left' }));
        if (row.hint) c.add(label(this, left, 13, row.hint, 10, { originX: 0 }));
        c.add(
          new Toggle(this, right, 0, save.state.settings[row.key], (on) => {
            save.update((d) => (d.settings[row.key] = on));
            audio.refresh();
            if (row.key === 'batterySaver') applyQuality(this.game);
          }),
        );
        root.add(c);
        items.push(c);
        y += ROW_H;
      }
    }

    const total = this.levels.length;
    const unlock = new Button(this, 0, y + 14, '', () => {
      save.unlockAll(total);
      audio.sfx('ui_on', 0.6);
      paintUnlock();
    }, { width: 300, height: 46, variant: 'secondary', fontSize: 16 });
    const paintUnlock = () => {
      const done = save.state.unlocked >= total;
      unlock.setText(done ? 'All levels unlocked' : 'Unlock all levels').setEnabled(!done);
    };
    paintUnlock();
    root.add(unlock);
    items.push(unlock);

    const doneBtn = new Button(this, 0, this.sheet.top + height - 62, 'Done', () => this.done(), {
      width: 240,
      height: 62,
    });
    root.add(doneBtn);
    items.push(doneBtn);
    cascade(this, items, { delay: 120, stagger: 30, dy: 16 });
  }

  private done(): void {
    this.sheet.close(() => this.close());
  }
}
