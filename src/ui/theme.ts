import { WORLD_IDS, availableWorlds, worldForLevel, type WorldId } from '../art/backdrops';
import { CARVED_FONT, DISPLAY_FONT, MACHINE_FONT, UI_FONT } from '../config';
import { save } from '../services';
import { lightingTier } from '../systems/Quality';

export type FrameStyle = 'forged' | 'gothic' | 'holo';

export interface UiPalette {
  /** Darkest fill: transitions, shades and the backs of panels. */
  base: number;
  panel: number;
  panelHi: number;
  /** Frame lines. */
  edge: number;
  /** Primary call to action and selection. */
  accent: number;
  accentHi: number;
  accentLo: number;
  /** Secondary highlight: links, secondary meters. */
  accent2: number;
  /** Additive glow behind lit elements. */
  glow: number;
  text: string;
  textDim: string;
  textOnAccent: string;
  good: number;
  danger: number;
  gold: number;
}

export interface UiTheme {
  id: WorldId;
  name: string;
  /** Short line under the world name. */
  tagline: string;
  palette: UiPalette;
  fonts: { display: string; body: string; world: string };
  frame: FrameStyle;
  ambient: 'embers' | 'dust' | 'bits';
  transition: 'burn' | 'shroud' | 'glitch';
  textFx: 'heat' | 'candle' | 'scramble';
  /** Heading fill, top to bottom. */
  headingStops: [string, string];
}

export const THEMES: Record<WorldId, UiTheme> = {
  hell: {
    id: 'hell',
    name: 'Hell Foundry',
    tagline: 'Where the first bricks are forged',
    palette: {
      base: 0x0b0503,
      panel: 0x150c08,
      panelHi: 0x24150f,
      edge: 0x5a3626,
      accent: 0xff8a2a,
      accentHi: 0xffd27a,
      accentLo: 0x9a1c08,
      accent2: 0xff3c1f,
      glow: 0xff6a1a,
      text: '#fff1e2',
      textDim: '#b8907c',
      textOnAccent: '#240a02',
      good: 0xffc04a,
      danger: 0xff3c2a,
      gold: 0xffc93c,
    },
    fonts: { display: DISPLAY_FONT, body: UI_FONT, world: CARVED_FONT },
    frame: 'forged',
    ambient: 'embers',
    transition: 'burn',
    textFx: 'heat',
    headingStops: ['#fff6dc', '#ffae5c'],
  },
  crypt: {
    id: 'crypt',
    name: 'The Crypt',
    tagline: 'Candlelight, stone and old glass',
    palette: {
      base: 0x05050f,
      panel: 0x0d0e22,
      panelHi: 0x1a1c3a,
      edge: 0x8f93bf,
      accent: 0xa58cff,
      accentHi: 0xe4dcff,
      accentLo: 0x3b2a8f,
      accent2: 0x7fd0ff,
      glow: 0x9a82ff,
      text: '#eef0ff',
      textDim: '#8d91b8',
      textOnAccent: '#ffffff',
      good: 0x9ee6ff,
      danger: 0xff5a7a,
      gold: 0xffd080,
    },
    fonts: { display: DISPLAY_FONT, body: UI_FONT, world: CARVED_FONT },
    frame: 'gothic',
    ambient: 'dust',
    transition: 'shroud',
    textFx: 'candle',
    headingStops: ['#ffffff', '#c4b8ff'],
  },
  mainframe: {
    id: 'mainframe',
    name: 'The Mainframe',
    tagline: 'Deep in the machine',
    palette: {
      base: 0x01070b,
      panel: 0x04141c,
      panelHi: 0x08222e,
      edge: 0x2fb8d8,
      accent: 0x3ce7ff,
      accentHi: 0xd8fdff,
      accentLo: 0x0b6f96,
      accent2: 0xff3cbe,
      glow: 0x2ad8ff,
      text: '#e6fbff',
      textDim: '#6f9fb0',
      textOnAccent: '#021018',
      good: 0x5cffc0,
      danger: 0xff3c78,
      gold: 0xffc93c,
    },
    fonts: { display: DISPLAY_FONT, body: UI_FONT, world: MACHINE_FONT },
    frame: 'holo',
    ambient: 'bits',
    transition: 'glitch',
    textFx: 'scramble',
    headingStops: ['#ffffff', '#9af4ff'],
  },
};

export function css(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Dev only: `?world=crypt` dresses the menus in that world. */
function devWorld(): WorldId | undefined {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const w = new URLSearchParams(location.search).get('world');
  return WORLD_IDS.find((id) => id === w);
}

let picked: WorldId | undefined;
let active: WorldId = 'hell';

/** The world the menus are dressed in: the one browsed or last played, else the one reached. */
export function menuWorld(): WorldId {
  const dev = devWorld();
  if (dev) return dev;
  const built = availableWorlds();
  if (picked && built.includes(picked)) return picked;
  return worldForLevel(save.state.unlocked);
}

/** Remembers a world browsed in the campaign or played, for the menus to follow. */
export function pickWorld(world: WorldId): void {
  picked = world;
}

/** Sets the world the UI is drawn in. Scenes call this in create(). */
export function useWorld(world: WorldId): UiTheme {
  active = world;
  return THEMES[world];
}

export function theme(): UiTheme {
  return THEMES[active];
}

export function themeFor(world: WorldId): UiTheme {
  return THEMES[world];
}

/** First and last campaign level of a world. */
export function worldLevels(world: WorldId): { first: number; last: number } {
  const i = WORLD_IDS.indexOf(world);
  return { first: i * 10 + 1, last: i * 10 + 10 };
}

/** Motion that only decorates: idle loops, glitches, ambient particles. */
export function calm(): boolean {
  return save.state.settings.reducedMotion;
}

/** Filter passes (blur, glow, transitions) are allowed on Medium and High. */
export function richFx(): boolean {
  return lightingTier() !== 'low';
}
