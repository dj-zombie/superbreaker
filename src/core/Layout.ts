import { FIELD_HEIGHT, FIELD_WIDTH } from './types';

/** HUD strip under the notch. The top wall sits right under it. */
export const HUD_STRIP = 44;
/** Air between the top wall and the first brick row. */
export const BELOW_HUD = 12;
/** Top wall to paddle. Levels are authored for ARENA_MAX and must still fit ARENA_MIN. */
export const ARENA_MIN = 640;
export const ARENA_MAX = 840;
/** Paddle center to the bottom safe edge. Touch screens get a thumb zone under the paddle. */
export const DECK_MIN_TOUCH = 150;
export const DECK_MAX_TOUCH = 260;
export const DECK_MOUSE = 60;
/** The deck panel starts this far under the paddle center. */
export const DECK_GAP = 30;
/** A ball is lost once its center passes this far under the paddle center. */
export const LOSE_MARGIN = 40;

export interface LayoutInput {
  /** Visible viewport in CSS pixels. */
  vpW: number;
  vpH: number;
  /** Safe-area insets in CSS pixels. */
  safeTop: number;
  safeBottom: number;
  /** Coarse primary pointer, i.e. a phone or tablet. */
  touch: boolean;
}

/** Every value is in playfield pixels (the field is always FIELD_WIDTH wide). */
export interface Layout {
  height: number;
  /** True when the viewport is taller than 3:4 and the field grows to meet it. */
  coverScreen: boolean;
  safeTop: number;
  safeBottom: number;
  hudHeight: number;
  hudCenter: number;
  arenaHeight: number;
  arenaMid: number;
  paddleY: number;
  deckTop: number;
  deckBottom: number;
  levelOffsetY: number;
  loseY: number;
}

/**
 * Splits the screen into HUD, arena and control deck. The arena is clamped so ball trips stay
 * short on tall phones; the deck takes what is left. Once the deck is full the arena grows
 * again, and levels slide down by the same amount so the brick-to-paddle distance holds.
 */
export function computeLayout(input: LayoutInput): Layout {
  const { vpW, vpH, touch } = input;
  const coverScreen = vpW > 0 && vpH / vpW > FIELD_HEIGHT / FIELD_WIDTH;
  const height = coverScreen ? Math.round(FIELD_WIDTH * (vpH / vpW)) : FIELD_HEIGHT;
  const toWorld = vpW > 0 ? FIELD_WIDTH / vpW : 0;
  const safeTop = input.safeTop * toWorld;
  const safeBottom = input.safeBottom * toWorld;
  const hudHeight = safeTop + HUD_STRIP;
  const available = height - safeBottom - hudHeight;

  const deckMin = touch ? DECK_MIN_TOUCH : DECK_MOUSE;
  const deckMax = touch ? DECK_MAX_TOUCH : DECK_MOUSE;
  let arena = Math.min(clamp(available - deckMin, ARENA_MIN, ARENA_MAX), available - 40);
  const deck = available - arena;
  if (deck > deckMax) arena += deck - deckMax;

  const paddleY = hudHeight + arena;
  return {
    height,
    coverScreen,
    safeTop,
    safeBottom,
    hudHeight,
    hudCenter: safeTop + HUD_STRIP / 2,
    arenaHeight: arena,
    arenaMid: hudHeight + arena / 2,
    paddleY,
    deckTop: paddleY + DECK_GAP,
    deckBottom: height - safeBottom,
    levelOffsetY: hudHeight + BELOW_HUD + Math.max(0, arena - ARENA_MAX),
    // Without a deck panel to hide it, the ball drops off the bottom edge as before.
    loseY: touch ? paddleY + LOSE_MARGIN : height + 30,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
