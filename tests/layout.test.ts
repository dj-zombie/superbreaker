import { describe, expect, it } from 'vitest';
import {
  ARENA_MAX,
  ARENA_MIN,
  BELOW_HUD,
  DECK_MAX_TOUCH,
  DECK_MIN_TOUCH,
  DECK_MOUSE,
  HUD_STRIP,
  WING_MIN,
  computeLayout,
  computeStage,
  type LayoutInput,
} from '../src/core/Layout';

const DEVICES: Record<string, LayoutInput> = {
  'iPhone SE': { vpW: 375, vpH: 667, safeTop: 20, safeBottom: 0, touch: true },
  'iPhone 15 fullscreen': { vpW: 393, vpH: 852, safeTop: 59, safeBottom: 34, touch: true },
  'iPhone 15 Safari toolbars': { vpW: 393, vpH: 659, safeTop: 0, safeBottom: 0, touch: true },
  'Pixel 8': { vpW: 412, vpH: 915, safeTop: 24, safeBottom: 16, touch: true },
  iPad: { vpW: 820, vpH: 1180, safeTop: 24, safeBottom: 20, touch: true },
  desktop: { vpW: 1280, vpH: 800, safeTop: 0, safeBottom: 0, touch: false },
  'tall desktop window': { vpW: 600, vpH: 1000, safeTop: 0, safeBottom: 0, touch: false },
};

const PHONES = ['iPhone SE', 'iPhone 15 fullscreen', 'iPhone 15 Safari toolbars', 'Pixel 8'];

const deckOf = (l: ReturnType<typeof computeLayout>) => l.height - l.safeBottom - l.paddleY;

describe.each(Object.entries(DEVICES))('%s', (name, input) => {
  const l = computeLayout(input);

  it('stacks HUD, arena and deck inside the screen', () => {
    expect(l.hudHeight).toBeCloseTo(l.safeTop + HUD_STRIP);
    expect(l.paddleY).toBeCloseTo(l.hudHeight + l.arenaHeight);
    expect(l.deckTop).toBeGreaterThan(l.paddleY);
    expect(l.deckBottom).toBeCloseTo(l.height - l.safeBottom);
    expect(l.loseY).toBeGreaterThan(l.paddleY);
    if (input.touch) expect(l.loseY).toBeLessThan(l.deckBottom);
  });

  it('clamps the arena, growing past the max only once the deck is full', () => {
    expect(l.arenaHeight).toBeGreaterThanOrEqual(ARENA_MIN);
    const deckMax = input.touch ? DECK_MAX_TOUCH : DECK_MOUSE;
    if (l.arenaHeight > ARENA_MAX) expect(deckOf(l)).toBeCloseTo(deckMax);
  });

  it('moves levels down by the arena overflow', () => {
    const overflow = Math.max(0, l.arenaHeight - ARENA_MAX);
    expect(l.levelOffsetY).toBeCloseTo(l.hudHeight + BELOW_HUD + overflow);
  });

  if (PHONES.includes(name)) {
    it('leaves a thumb deck above the home indicator', () => {
      expect(deckOf(l)).toBeGreaterThanOrEqual(DECK_MIN_TOUCH);
      expect(l.deckBottom - l.deckTop).toBeGreaterThanOrEqual(100);
    });
  }
});

describe('pacing across screens', () => {
  it('keeps the desktop layout where it was', () => {
    const l = computeLayout(DEVICES.desktop!);
    expect(l.height).toBe(800);
    expect(l.arenaHeight).toBe(696);
    expect(l.paddleY).toBe(740);
  });

  it('raises the paddle to about three quarters down a modern phone', () => {
    const l = computeLayout(DEVICES['iPhone 15 fullscreen']!);
    expect(l.paddleY / l.height).toBeGreaterThan(0.7);
    expect(l.paddleY / l.height).toBeLessThan(0.8);
  });

  it('keeps the first brick row the same distance from the paddle on tall phones', () => {
    const gaps = ['iPhone 15 fullscreen', 'Pixel 8'].map((k) => {
      const l = computeLayout(DEVICES[k]!);
      return l.paddleY - l.levelOffsetY;
    });
    expect(gaps[0]).toBeCloseTo(ARENA_MAX - BELOW_HUD);
    expect(gaps[1]).toBeCloseTo(ARENA_MAX - BELOW_HUD);
  });
});

describe('wide stage', () => {
  it('fills a 1920x1080 window with the field centered between two wings', () => {
    const s = computeStage({ vpW: 1920, vpH: 1080, touch: false });
    expect(s.wide).toBe(true);
    expect(s.width).toBeCloseTo(1422.22, 2);
    expect(s.wing).toBeCloseTo(411.11, 2);
  });

  it('keeps the board HUD when a wing would be under the minimum', () => {
    const s = computeStage({ vpW: 960, vpH: 800, touch: false });
    expect((960 / 800) * 800 - 600).toBeLessThan(WING_MIN * 2);
    expect(s).toEqual({ wide: false, width: 600, wing: 0 });
  });

  it('turns on right at the minimum wing', () => {
    expect(computeStage({ vpW: 1000, vpH: 800, touch: false }).wide).toBe(true);
  });

  it('leaves portrait windows and touch screens alone', () => {
    expect(computeStage({ vpW: 600, vpH: 1000, touch: false }).wide).toBe(false);
    expect(computeStage({ vpW: 1180, vpH: 820, touch: true }).wide).toBe(false);
    expect(computeStage({ vpW: 0, vpH: 0, touch: false }).wide).toBe(false);
  });

  it('caps ultrawide windows at 16:9', () => {
    const s = computeStage({ vpW: 2560, vpH: 1080, touch: false });
    expect(s.width).toBeCloseTo(1422.22, 2);
  });

  it('gives a Steam Deck screen the wide stage', () => {
    const s = computeStage({ vpW: 1280, vpH: 800, touch: false });
    expect(s.wide).toBe(true);
    expect(s.wing).toBeCloseTo(340);
  });
});
