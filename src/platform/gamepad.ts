import Phaser from 'phaser';
import { IS_TOUCH } from '../config';

/** W3C standard mapping. Xbox, DualSense and Switch Pro all report it in Chromium. */
export const PadButton = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export type InputSource = 'mouse' | 'touch' | 'keyboard' | 'pad';

type ButtonListener = (button: number, down: boolean) => void;
type SourceListener = (source: InputSource) => void;

/** A resting stick must not creep the paddle or the cursor. */
const DEAD_ZONE = 0.18;
/** Analog triggers count as pressed past this. */
const TRIGGER_ON = 0.5;
/** Stick travel that switches the latest input to the pad, so a drifting stick can't steal it. */
const WAKE = 0.5;

let installed = false;
let source: InputSource = 'mouse';
let connected = false;
let lastPad = -1;
const held = new Set<number>();
const stick = { x: 0, y: 0 };
const buttonListeners = new Set<ButtonListener>();
const sourceListeners = new Set<SourceListener>();

function setSource(next: InputSource): void {
  if (next === source) return;
  source = next;
  for (const l of sourceListeners) l(next);
}

function deadZone(v: number): number {
  const a = Math.abs(v);
  if (a < DEAD_ZONE) return 0;
  return Math.sign(v) * Math.min(1, (a - DEAD_ZONE) / (1 - DEAD_ZONE));
}

/** Merges every connected pad: any pad's press counts, the most deflected stick wins. */
function poll(): void {
  const pads = navigator.getGamepads();
  const now = new Set<number>();
  let sx = 0;
  let sy = 0;
  let any = false;
  for (const p of pads) {
    if (!p?.connected) continue;
    any = true;
    p.buttons.forEach((b, i) => {
      if (!b.pressed && b.value <= TRIGGER_ON) return;
      if (!held.has(i)) lastPad = p.index;
      now.add(i);
    });
    const x = deadZone(p.axes[0] ?? 0);
    const y = deadZone(p.axes[1] ?? 0);
    if (Math.hypot(x, y) > Math.hypot(sx, sy)) {
      sx = x;
      sy = y;
      if (Math.hypot(x, y) > WAKE) lastPad = p.index;
    }
  }
  connected = any;
  stick.x = sx;
  stick.y = sy;
  const pressed = [...now].filter((b) => !held.has(b));
  const released = [...held].filter((b) => !now.has(b));
  held.clear();
  for (const b of now) held.add(b);
  if (pressed.length > 0 || Math.hypot(sx, sy) > WAKE) setSource('pad');
  for (const b of pressed) for (const l of buttonListeners) l(b, true);
  for (const b of released) for (const l of buttonListeners) l(b, false);
}

/**
 * Polls the Gamepad API once per game step. Chromium only exposes a pad after one of its
 * buttons is pressed while the page has focus.
 */
export function installGamepad(game: Phaser.Game): void {
  if (installed || typeof navigator === 'undefined' || !navigator.getGamepads) return;
  installed = true;
  game.events.on(Phaser.Core.Events.PRE_STEP, poll);
  // Only real input counts: the pad cursor sends synthetic mouse events to the canvas.
  window.addEventListener('keydown', (e) => e.isTrusted && setSource('keyboard'));
  window.addEventListener('pointerdown', (e) => {
    if (e.isTrusted) setSource(e.pointerType === 'touch' ? 'touch' : 'mouse');
  });
  window.addEventListener('pointermove', (e) => {
    if (e.isTrusted && e.pointerType === 'mouse' && (e.movementX || e.movementY))
      setSource('mouse');
  });
}

/** Calls `fn` on every button press and release. Returns an unsubscribe function. */
export function onPadButton(fn: ButtonListener): () => void {
  buttonListeners.add(fn);
  return () => buttonListeners.delete(fn);
}

/** Calls `fn` whenever the latest input switches between mouse, touch, keyboard and pad. */
export function onInputSource(fn: SourceListener): () => void {
  sourceListeners.add(fn);
  return () => sourceListeners.delete(fn);
}

export function inputSource(): InputSource {
  return source;
}

/** Which set of controls to picture: a phone's touch, the desktop's mouse and keys, or a pad. */
export type ControlDevice = 'touch' | 'desktop' | 'pad';

export function controlDevice(from: InputSource = source): ControlDevice {
  if (from === 'pad') return 'pad';
  // Until the first touch lands, a phone still reports the default mouse source.
  if (from === 'touch' || (IS_TOUCH && from === 'mouse')) return 'touch';
  return 'desktop';
}

export function padConnected(): boolean {
  return connected;
}

export function padHeld(button: number): boolean {
  return held.has(button);
}

/** Left stick past the dead zone, rescaled so each axis still reaches 1. */
export function padStick(): { x: number; y: number } {
  return stick;
}

/** Rumbles the pad that was used last. `strength` is 0..1. */
export function padRumble(strength: number, ms: number): void {
  if (!connected || lastPad < 0) return;
  const actuator = navigator.getGamepads()[lastPad]?.vibrationActuator;
  if (!actuator?.playEffect) return;
  void actuator
    .playEffect('dual-rumble', {
      duration: ms,
      strongMagnitude: strength,
      weakMagnitude: Math.min(1, strength * 1.4),
    })
    .catch(() => {});
}
