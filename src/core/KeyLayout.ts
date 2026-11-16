/**
 * Keyboard controls by physical key position (`KeyboardEvent.code`), so the movement cluster sits
 * under the same fingers on any layout: WASD on QWERTY is ZQSD on AZERTY. Labels name each key as
 * the player's own keyboard prints it.
 */

export type KeyAction =
  | 'left'
  | 'right'
  | 'launch'
  | 'slot1'
  | 'slot2'
  | 'gun'
  | 'slowmo'
  | 'stock1'
  | 'stock2'
  | 'stock3'
  | 'stock4'
  | 'pause';

export const KEY_BINDINGS: Readonly<Record<Exclude<KeyAction, 'pause'>, readonly string[]>> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  launch: ['Space', 'ArrowUp', 'KeyW'],
  slot1: ['KeyQ'],
  slot2: ['KeyE'],
  gun: ['KeyF'],
  slowmo: ['KeyS', 'ShiftLeft', 'ShiftRight'],
  stock1: ['Digit1', 'Numpad1'],
  stock2: ['Digit2', 'Numpad2'],
  stock3: ['Digit3', 'Numpad3'],
  stock4: ['Digit4', 'Numpad4'],
};

export const SLOT_ACTIONS = ['slot1', 'slot2'] as const;
export const STOCK_ACTIONS = ['stock1', 'stock2', 'stock3', 'stock4'] as const;

const BOUND = Object.entries(KEY_BINDINGS) as Array<[KeyAction, readonly string[]]>;

/**
 * The actions a key press triggers. Pause follows the P character so the letter still means
 * Pause; a layout with no Latin letters falls back to the key where P sits on QWERTY.
 */
export function actionsFor(code: string, key: string): KeyAction[] {
  const out: KeyAction[] = [];
  for (const [action, codes] of BOUND) if (codes.includes(code)) out.push(action);
  const latin = /^[a-z]$/i.test(key);
  if (latin ? key.toLowerCase() === 'p' : code === 'KeyP') out.push('pause');
  return out;
}

export type LayoutGuess = 'qwerty' | 'azerty';

/** French and Belgian keyboards are AZERTY. French Canada types on QWERTY, Switzerland on QWERTZ. */
export function guessLayout(languages: readonly string[]): LayoutGuess {
  const lang = (languages[0] ?? '').toLowerCase();
  if (lang === 'fr-ca' || lang === 'fr-ch') return 'qwerty';
  if (lang === 'fr' || lang.startsWith('fr-') || lang === 'nl-be') return 'azerty';
  return 'qwerty';
}

const AZERTY: Readonly<Record<string, string>> = { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W' };

const FIXED: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
};

/**
 * What a key's cap shows, from the character it typed or the layout map. Only printable ASCII
 * counts: a Cyrillic or Greek keyboard prints the Latin letter too, and that is the one to name.
 */
export function keyName(key: string): string | null {
  if (key.length !== 1 || key === ' ') return null;
  if (!/^[\x21-\x7e]$/.test(key)) return null;
  return key.toUpperCase();
}

export interface LabelSources {
  /** Characters seen on real key presses this session, by code. */
  learned?: ReadonlyMap<string, string>;
  /** The browser's keyboard layout map, where the Keyboard API allows it. */
  map?: ReadonlyMap<string, string>;
  guess: LayoutGuess;
}

/** The label for a physical key: arrows, Space and digits are fixed, letters follow the layout. */
export function labelFor(code: string, sources: LabelSources): string {
  const fixed = FIXED[code];
  if (fixed) return fixed;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1]!;
  const typed = sources.learned?.get(code);
  if (typed) return typed;
  const mapped = sources.map?.get(code);
  const named = mapped ? keyName(mapped) : null;
  if (named) return named;
  if (sources.guess === 'azerty' && AZERTY[code]) return AZERTY[code]!;
  const letter = /^Key([A-Z])$/.exec(code);
  return letter ? letter[1]! : code;
}
