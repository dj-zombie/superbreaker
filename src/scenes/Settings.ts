import { COLORS, HEIGHT, SCENES, WIDTH } from '../config';
import type { Settings as SettingsData } from '../core/SaveStore';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { applyQuality } from '../systems/Quality';
import { Button, bodyText, panel, title } from '../ui/Button';
import { Overlay } from './Overlay';

const ROWS: Array<{ key: keyof SettingsData; label: string; hint: string }> = [
  { key: 'music', label: 'Music', hint: '' },
  { key: 'sfx', label: 'Sound effects', hint: '' },
  { key: 'haptics', label: 'Vibration', hint: 'On supported phones' },
  { key: 'screenShake', label: 'Screen shake', hint: '' },
  { key: 'reducedMotion', label: 'Reduced motion', hint: 'No shake, flashes or hit-stop' },
  { key: 'batterySaver', label: 'Battery saver', hint: 'Lower resolution, fewer particles' },
];

export class Settings extends Overlay {
  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    this.openOverlay(0.7);
    const root = this.add.container(WIDTH / 2, HEIGHT / 2);
    root.add(panel(this, 0, 0, 500, 640));
    root.add(title(this, 0, -270, 'SETTINGS', 38));
    this.popIn(root);

    ROWS.forEach((row, i) => {
      const y = -185 + i * 72;
      root.add(bodyText(this, -90, y - (row.hint ? 10 : 0), row.label, 22).setOrigin(0.5, 0.5));
      if (row.hint) root.add(bodyText(this, -90, y + 16, row.hint, 14, '#8a83b8'));
      const toggle = new Button(
        this,
        160,
        y,
        '',
        () => {
          save.update((d) => (d.settings[row.key] = !d.settings[row.key]));
          audio.refresh();
          if (row.key === 'batterySaver') applyQuality(this.game);
          audio.sfx(save.state.settings[row.key] ? 'ui_on' : 'ui_off', 0.6);
          paint();
        },
        { width: 110, height: 52, fontSize: 18 },
      );
      const paint = () => {
        const on = save.state.settings[row.key];
        toggle.setText(on ? 'ON' : 'OFF').setFill(on ? COLORS.good : 0x3a3366);
        toggle.label.setColor(on ? '#1a0629' : '#ffffff');
      };
      paint();
      root.add(toggle);
    });

    root.add(
      new Button(this, 0, 262, 'DONE', () => this.close(), {
        width: 220,
        height: 60,
        fill: COLORS.good,
        textColor: '#1a0629',
      }),
    );
  }
}
