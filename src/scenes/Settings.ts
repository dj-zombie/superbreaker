import Phaser from 'phaser';
import { HEIGHT, SAFE_TOP, SCENES, WIDTH } from '../config';
import type { Settings as SettingsData } from '../core/SaveStore';
import { IS_DESKTOP, setFullscreen } from '../platform/desktop';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { applyQuality } from '../systems/Quality';
import { Button } from '../ui/Button';
import { Slider, Toggle } from '../ui/controls';
import { glowLineTexture } from '../ui/frames';
import { cascade } from '../ui/fx/motion';
import { onBack } from '../ui/nav';
import { Sheet } from '../ui/Sheet';
import { theme } from '../ui/theme';
import { body, heading, label } from '../ui/type';
import { Overlay } from './Overlay';

type KeysOf<T> = {
  [K in keyof SettingsData]: SettingsData[K] extends T ? K : never;
}[keyof SettingsData];

interface Row {
  key: KeysOf<boolean>;
  label: string;
  hint?: string;
  /** A volume slider beside the switch. */
  volume?: KeysOf<number>;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'Audio',
    rows: [
      { key: 'music', label: 'Music', volume: 'musicVolume' },
      { key: 'sfx', label: 'Sound effects', volume: 'sfxVolume' },
      { key: 'monoAudio', label: 'Mono audio', hint: 'Same sound in both ears' },
    ],
  },
  {
    title: 'Feel',
    rows: [
      { key: 'haptics', label: 'Vibration', hint: 'Phones and controllers' },
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

/** Desktop app only. */
const DISPLAY: { title: string; rows: Row[] } = {
  title: 'Display',
  rows: [{ key: 'fullscreen', label: 'Fullscreen', hint: 'F11 or Alt+Enter' }],
};

const ROW_H = 54;
const HEAD_H = 40;
const SLIDER_W = 250;
/** The replay-tutorial and unlock buttons, side by side above Done. */
const FOOT_W = 250;
const FOOT_GAP = 14;
/** A volume slider while its sound is switched off. */
const MUTED_ALPHA = 0.4;

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
    const sections = IS_DESKTOP ? [DISPLAY, ...SECTIONS] : SECTIONS;
    const rows = sections.reduce((n, s) => n + s.rows.length, 0);
    const height = Math.min(HEIGHT - SAFE_TOP - 24, 120 + sections.length * HEAD_H + rows * ROW_H + 160);
    // On a short sheet (the desktop app's 800-unit stage plus its Display row) the rows close up
    // so the last ones stay clear of the unlock and Done buttons.
    const room = height - 242;
    const rowH = Phaser.Math.Clamp((room - sections.length * HEAD_H) / rows, 44, ROW_H);
    const headH = Phaser.Math.Clamp((room - rows * rowH) / sections.length, 30, HEAD_H);
    this.sheet = new Sheet(this, { height, blur: this.scene.get(this.from), onDismiss: () => this.close() });
    onBack(this, () => this.done());
    const root = this.sheet.root;
    const items: Phaser.GameObjects.Container[] = [];
    const left = -WIDTH / 2 + 44;
    const right = WIDTH / 2 - 70;

    root.add(heading(this, 0, this.sheet.top + 54, 'Settings', 36));
    let y = this.sheet.top + 104;
    for (const section of sections) {
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
      y += headH;
      for (const row of section.rows) {
        const c = this.add.container(0, y);
        c.add(body(this, left, row.hint ? -9 : 0, row.label, 19, { originX: 0, align: 'left' }));
        if (row.hint) c.add(label(this, left, 13, row.hint, 10, { originX: 0 }));
        let slider: Slider | undefined;
        const toggle = new Toggle(this, right, 0, save.state.settings[row.key], (on) => {
          save.update((d) => (d.settings[row.key] = on));
          audio.refresh();
          slider?.setAlpha(on ? 1 : MUTED_ALPHA);
          if (row.key === 'batterySaver') applyQuality(this.game);
          if (row.key === 'fullscreen') setFullscreen(on);
        });
        c.add(toggle);
        const volume = row.volume;
        if (volume) {
          const x = right - 56 - SLIDER_W / 2;
          slider = new Slider(this, x, 0, SLIDER_W, save.state.settings[volume], (v) => {
            // Turning a switched-off sound up switches it back on.
            if (!toggle.checked) toggle.set(true, true);
            slider?.setAlpha(1);
            save.update((d) => {
              d.settings[volume] = v;
              d.settings[row.key] = true;
            });
            audio.refresh();
          });
          slider.setAlpha(toggle.checked ? 1 : MUTED_ALPHA);
          c.add(slider);
        }
        root.add(c);
        items.push(c);
        y += rowH;
      }
    }

    const total = this.levels.length;
    const pair = { width: FOOT_W, height: 46, variant: 'secondary', fontSize: 16 } as const;
    const replay = new Button(this, -(FOOT_W + FOOT_GAP) / 2, y + 14, '', () => {
      save.update((d) => (d.seenInstructions = false));
      audio.sfx('ui_on', 0.6);
      paintReplay();
    }, pair);
    // Play reads the flag as it builds a level, so the tutorial waits for the next one.
    const paintReplay = () => {
      const queued = !save.state.seenInstructions;
      replay.setText(queued ? 'Tutorial on next level' : 'Replay tutorial').setEnabled(!queued);
    };
    paintReplay();
    const unlock = new Button(this, (FOOT_W + FOOT_GAP) / 2, y + 14, '', () => {
      save.unlockAll(total);
      audio.sfx('ui_on', 0.6);
      paintUnlock();
    }, pair);
    const paintUnlock = () => {
      const done = save.state.unlocked >= total;
      unlock.setText(done ? 'All levels unlocked' : 'Unlock all levels').setEnabled(!done);
    };
    paintUnlock();
    root.add([replay, unlock]);
    items.push(replay, unlock);

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
