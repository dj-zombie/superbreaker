import Phaser from 'phaser';
import { HEIGHT, SCENES } from '../config';
import { back } from '../ui/nav';
import {
  inputSource,
  onInputSource,
  onPadButton,
  PadButton,
  padConnected,
  padHeld,
  padStick,
} from './gamepad';

/** Playfield units per second at full stick, so the cursor feels the same on any screen. */
const SPEED = 900;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * A DOM cursor for menus, moved by the stick or d-pad. South clicks by sending mouse events to
 * the canvas, which Phaser handles like a real mouse, so every existing button works. East is
 * back. Hidden while Play runs, where the pad has its own bindings.
 */
export function installPadCursor(game: Phaser.Game): void {
  const el = document.getElementById('pad-cursor');
  if (!el) return;
  let x = 0;
  let y = 0;
  let shown = false;
  let recenter = true;
  let pressing = false;
  // Buttons act on release, and only if pressed while the cursor was in charge. Phaser resumes
  // scenes synchronously, so acting on press would let Play see the same press once it resumes.
  const armed = new Set<number>();

  const playing = () => game.scene.isActive(SCENES.play) || game.scene.isActive(SCENES.cutscene);
  const inCharge = () => padConnected() && inputSource() === 'pad' && !playing();

  const place = () => {
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const send = (type: 'mousemove' | 'mousedown' | 'mouseup') => {
    game.canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: pressing ? 1 : 0,
      }),
    );
  };

  game.events.on(Phaser.Core.Events.PRE_STEP, (_time: number, delta: number) => {
    if (playing()) recenter = true;
    const rect = game.canvas.getBoundingClientRect();
    const on = inCharge();
    if (on !== shown) {
      shown = on;
      el.classList.toggle('on', on);
      if (on && recenter) {
        recenter = false;
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
        place();
        send('mousemove');
      }
    }
    if (!on) return;
    const stick = padStick();
    // Squaring the stick keeps small deflections slow enough to land on a button.
    const dx =
      (padHeld(PadButton.right) ? 1 : 0) - (padHeld(PadButton.left) ? 1 : 0) ||
      stick.x * Math.abs(stick.x);
    const dy =
      (padHeld(PadButton.down) ? 1 : 0) - (padHeld(PadButton.up) ? 1 : 0) ||
      stick.y * Math.abs(stick.y);
    const step = SPEED * (rect.height / HEIGHT) * (delta / 1000);
    const nx = clamp(x + dx * step, rect.left, rect.right - 1);
    const ny = clamp(y + dy * step, rect.top, rect.bottom - 1);
    if (nx === x && ny === y) return;
    x = nx;
    y = ny;
    place();
    send('mousemove');
  });

  onPadButton((button, down) => {
    if (down) {
      if (!inCharge()) return;
      if (button === PadButton.south) {
        // The first press after the cursor was hidden only reveals it.
        if (!shown) return;
        pressing = true;
        el.classList.add('down');
        send('mousedown');
      } else if (button === PadButton.start && !game.scene.isActive(SCENES.pause)) {
        return;
      }
      armed.add(button);
      return;
    }
    if (!armed.delete(button)) return;
    if (button === PadButton.south) {
      pressing = false;
      el.classList.remove('down');
      send('mouseup');
    } else if (button === PadButton.east || button === PadButton.start) {
      back();
    }
  });

  onInputSource((source) => document.body.classList.toggle('pad-input', source === 'pad'));
}
