import Phaser from 'phaser';
import {
  KEY_BINDINGS,
  SLOT_ACTIONS,
  actionsFor,
  guessLayout,
  keyName,
  labelFor,
  type KeyAction,
} from '../core/KeyLayout';

interface KeyboardApi {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
}

const learned = new Map<string, string>();
let layoutMap: ReadonlyMap<string, string> | undefined;
const guess = guessLayout(
  typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
);
const listeners = new Set<() => void>();
let installed = false;

function changed(): void {
  for (const l of listeners) l();
}

/**
 * Learns how the player's keyboard names each letter key: from the Keyboard API's layout map
 * where it is allowed (not in cross-origin iframes, so not on CrazyGames), and from every real
 * key press. Until then, labels follow a guess from the browser language.
 */
export function installKeyboard(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted || e.ctrlKey || e.metaKey || e.altKey || !e.code.startsWith('Key')) return;
      const name = keyName(e.key);
      if (!name || learned.get(e.code) === name) return;
      learned.set(e.code, name);
      changed();
    },
    true,
  );
  try {
    const kb = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
    void kb
      ?.getLayoutMap?.()
      .then((map) => {
        layoutMap = map;
        changed();
      })
      .catch(() => {});
  } catch {
    // The API throws synchronously in some embedders; the guess and learned keys cover it.
  }
}

/** How the player's keyboard names a physical key, e.g. "Q" for `KeyA` on AZERTY. */
export function keyLabel(code: string): string {
  return labelFor(code, { learned, map: layoutMap, guess });
}

/** The labels of every key bound to an action, in binding order. */
export function actionLabels(action: Exclude<KeyAction, 'pause'>): string[] {
  return KEY_BINDINGS[action].map(keyLabel);
}

/** The key that fires ability slot `i`, e.g. "Q" for the first slot on QWERTY. */
export function slotKeyLabel(i: number): string {
  return keyLabel(KEY_BINDINGS[SLOT_ACTIONS[i] ?? 'slot1'][0]!);
}

/** The pause key's label. It follows the P character, so it is the same everywhere. */
export const PAUSE_LABEL = 'P';

/** Calls `fn` whenever a key label may have changed. Returns an unsubscribe function. */
export function onKeyLabels(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Keys the page would otherwise scroll on, inside an iframe. */
const SCROLL_KEYCODES = [
  Phaser.Input.Keyboard.KeyCodes.SPACE,
  Phaser.Input.Keyboard.KeyCodes.UP,
  Phaser.Input.Keyboard.KeyCodes.DOWN,
  Phaser.Input.Keyboard.KeyCodes.LEFT,
  Phaser.Input.Keyboard.KeyCodes.RIGHT,
];

/**
 * A scene's game keys, matched by physical position. Presses with Ctrl, Cmd or Alt held are left
 * to the browser, so shortcuts like Ctrl/Cmd+W never double as game input. Runs on the scene's
 * keyboard plugin, so a paused scene hears nothing, and held keys reset on pause and blur.
 */
export class KeyBindings {
  private readonly down = new Set<string>();
  private readonly handlers = new Map<KeyAction, Array<(e: KeyboardEvent) => void>>();

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture(SCROLL_KEYCODES);
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onDown, this);
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_UP, this.onUp, this);
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.reset, this);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.reset, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onDown, this);
      kb.off(Phaser.Input.Keyboard.Events.ANY_KEY_UP, this.onUp, this);
      kb.removeCapture(SCROLL_KEYCODES);
      scene.events.off(Phaser.Scenes.Events.PAUSE, this.reset, this);
      scene.game.events.off(Phaser.Core.Events.BLUR, this.reset, this);
      this.handlers.clear();
      this.reset();
    });
  }

  /** Any key bound to `action` is held. */
  held(action: Exclude<KeyAction, 'pause'>): boolean {
    return KEY_BINDINGS[action].some((c) => this.down.has(c));
  }

  /** The physical key `code` is held. */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Calls `fn` on each fresh press of `action`, not on key repeat. */
  on(action: KeyAction, fn: (e: KeyboardEvent) => void): this {
    const list = this.handlers.get(action) ?? [];
    list.push(fn);
    this.handlers.set(action, list);
    return this;
  }

  private onDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.down.add(e.code);
    if (e.repeat) return;
    for (const action of actionsFor(e.code, e.key)) {
      for (const fn of this.handlers.get(action) ?? []) fn(e);
    }
  }

  private onUp(e: KeyboardEvent): void {
    this.down.delete(e.code);
  }

  private reset(): void {
    this.down.clear();
  }
}
