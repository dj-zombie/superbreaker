import type { AbilityId } from './core/Abilities';
import { computeLayout, computeStage } from './core/Layout';
import { FIELD_HEIGHT, FIELD_WIDTH, type PowerupId } from './core/types';

export const WIDTH = FIELD_WIDTH;

/** Render at up to 2x internal resolution so text and sprites stay crisp on phones. */
export const MAX_RENDER_ZOOM = Math.min(
  2,
  Math.max(1, Math.round(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)),
);
/** Current internal resolution. Lowered by battery saver and by the frame monitor on slow phones. */
export let RENDER_ZOOM = MAX_RENDER_ZOOM;

export function setRenderZoom(zoom: number): void {
  RENDER_ZOOM = Math.max(1, Math.min(MAX_RENDER_ZOOM, zoom));
}

const SHATTER_GAP = 175;

/** Phones and tablets get a thumb deck under the paddle and bigger corner buttons. */
export const IS_TOUCH =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const initial = computeLayout({ vpW: 0, vpH: 0, safeTop: 0, safeBottom: 0, touch: IS_TOUCH });

/**
 * Visible playfield height. Starts at the designed 800 and grows on tall screens so the
 * 600-wide field can cover the display without cropping the walls.
 */
export let HEIGHT = initial.height;
/** Safe-area insets converted into playfield pixels. */
export let SAFE_TOP = 0;
export let SAFE_BOTTOM = 0;
/** Bottom of the HUD strip. The top wall sits right under it. */
export let HUD_HEIGHT = initial.hudHeight;
/** Vertical center of HUD labels and buttons, below the notch. */
export let HUD_CENTER = initial.hudCenter;
/** Bricks from Tiled levels are shifted down by this much. */
export let LEVEL_OFFSET_Y = initial.levelOffsetY;
export let PADDLE_Y = initial.paddleY;
export let FALL_SHATTER_Y = PADDLE_Y - SHATTER_GAP;
/** Middle of the play arena, for banners and pop-ups. */
export let ARENA_MID = initial.arenaMid;
/** Top and bottom of the control deck under the paddle. */
export let DECK_TOP = initial.deckTop;
export let DECK_BOTTOM = initial.deckBottom;
/** Balls and pickups below this line are gone. */
export let LOSE_Y = initial.loseY;
/** True when the viewport is taller than 3:4 and the field grows to meet it. */
export let coverScreen = false;
/** Desktop wide stage: the play HUD moves out of the board into glass plates on the wings. */
export let WIDE = false;
/** Visible width in playfield units. WIDTH, or wider on the wide stage. */
export let STAGE_W: number = WIDTH;
/** Each side wing on the wide stage (x < 0 and x > WIDTH), 0 otherwise. */
export let WING = 0;

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Body copy and labels. */
export const UI_FONT = `"Barlow Semi Condensed", ${SYSTEM_FONT}`;
/** Headings, buttons and numbers. */
export const DISPLAY_FONT = `"Barlow Condensed", ${SYSTEM_FONT}`;
/** World names: carved capitals for Hell and the Crypt, a machined face for the Mainframe. */
export const CARVED_FONT = `Cinzel, Georgia, serif`;
export const MACHINE_FONT = `Orbitron, ${SYSTEM_FONT}`;

/** Font faces that must be ready before any canvas text or glyph atlas is drawn. */
export const FONT_FACES = [
  `700 32px "Barlow Condensed"`,
  `800 32px "Barlow Condensed"`,
  `600 32px "Barlow Semi Condensed"`,
  `700 32px "Barlow Semi Condensed"`,
  `700 32px Cinzel`,
  `700 32px Orbitron`,
];

export const COLORS = {
  bg: 0x0b0820,
  panel: 0x1a1240,
  panelEdge: 0x7d5cff,
  accent: 0xffc93c,
  hot: 0xff4d6d,
  cool: 0x3ce7ff,
  good: 0x5cff8a,
  text: 0xffffff,
  dim: 0x8a83b8,
};

/** Particle tint per brick texture. */
export const BRICK_TINT: Record<string, number> = {
  brick_blue: 0x3c8dff,
  brick_blue2: 0x2a5fd6,
  brick_green: 0x4ddf6a,
  brick_green2: 0x2fa64a,
  brick_orange: 0xff9a3c,
  brick_orange2: 0xe0701f,
  brick_pink: 0xff6ad5,
  brick_purple2: 0x9b5cff,
  brick_red: 0xff4d4d,
  brick_red2: 0xc92f3a,
  brick_teal: 0x3ce7d6,
  brick_teal2: 0x23b3a6,
  brick_white: 0xf2f2f2,
  brick_white2: 0xc8c8d8,
  brick_yellow: 0xffe14d,
  brick_yellow2: 0xe8b923,
  brick_steel: 0x9aa4b8,
  brick_explosive: 0xff5a1f,
  brick_armored: 0x7f8aa3,
  brick_regen: 0x5cff8a,
};

export const BRICK_COLORS = [
  'blue',
  'blue2',
  'green',
  'green2',
  'orange',
  'orange2',
  'pink',
  'purple2',
  'red',
  'red2',
  'teal',
  'teal2',
  'white',
  'white2',
  'yellow',
  'yellow2',
] as const;

export const NEW_BRICK_KINDS = ['steel', 'explosive', 'armored', 'regen'] as const;

export interface PowerupInfo {
  label: string;
  texture: string;
  color: number;
  fallSpeed: number;
}

export const POWERUP_INFO: Record<PowerupId, PowerupInfo> = {
  magnet: { label: 'Magnet', texture: 'pu_magnet', color: 0xff4d6d, fallSpeed: 100 },
  fireball: { label: 'Fireball', texture: 'pu_fireball', color: 0xff8a1f, fallSpeed: 100 },
  laser: { label: 'Laser', texture: 'pu_laser', color: 0xff3c3c, fallSpeed: 180 },
  balls: { label: 'Multiball', texture: 'pu_balls', color: 0x3ce7ff, fallSpeed: 110 },
  bigger: { label: 'Wide Paddle', texture: 'pu_bigger', color: 0x5cff8a, fallSpeed: 120 },
  smaller: { label: 'Tiny Paddle', texture: 'pu_smaller', color: 0xb05cff, fallSpeed: 140 },
  coin: { label: 'Coin', texture: 'coin', color: 0xffc93c, fallSpeed: 80 },
  shield: { label: 'Shield', texture: 'pu_shield', color: 0x3c9dff, fallSpeed: 110 },
  hyper: { label: 'Hyperspeed', texture: 'pu_hyper', color: 0xffe14d, fallSpeed: 130 },
  extraLife: { label: 'Extra Life', texture: 'pu_extraLife', color: 0xff5c8a, fallSpeed: 90 },
  pierce: { label: 'Pierce', texture: 'pu_pierce', color: 0xd6ff3c, fallSpeed: 120 },
  mystery: { label: 'Mystery Box', texture: 'pu_mystery', color: 0xff5cf0, fallSpeed: 90 },
};

/** Durations for powerups that aren't upgradeable, in ms. */
export const HYPER_DURATION_MS = 6_000;
/** Arcade timeScale below 1 runs physics faster. */
export const HYPER_TIME_SCALE = 0.62;
export const HYPER_DAMAGE_MULT = 2;
export const PIERCE_DURATION_MS = 5_000;
export const EXPLOSION_RADIUS = 52;

export const FEVER_DURATION_MS = 8_000;

export interface AbilityInfo {
  label: string;
  color: number;
}

export const ABILITY_INFO: Record<AbilityId, AbilityInfo> = {
  meteor: { label: 'Meteor Shower', color: 0xff7a1f },
  lightning: { label: 'Chain Lightning', color: 0x7fe9ff },
  bomb: { label: 'Mega Bomb', color: 0xff3c6d },
  sweep: { label: 'Laser Sweep', color: 0xff4d4d },
  blackhole: { label: 'Black Hole', color: 0xb05cff },
  frenzy: { label: 'Ball Frenzy', color: 0x5cff8a },
};

/** Ability slot buttons sit in the corners of the control deck. */
export const SLOT_RADIUS = IS_TOUCH ? 36 : 28;

/** Bought powerups sit in a row inboard of the left slot, leaving the deck center free. */
export const STOCK_RADIUS = IS_TOUCH ? 22 : 18;

/** Vertical center of the deck buttons. Without a deck they hug the bottom edge, as before. */
function deckButtonY(): number {
  const bottom = DECK_BOTTOM - SLOT_RADIUS - 6;
  if (!IS_TOUCH) return HEIGHT - SAFE_BOTTOM - 34;
  return Math.min(bottom, Math.max((DECK_TOP + DECK_BOTTOM) / 2, DECK_TOP + SLOT_RADIUS + 6));
}

export function slotPositions(): ReadonlyArray<{ x: number; y: number }> {
  const y = deckButtonY();
  const inset = SLOT_RADIUS + 10;
  return [
    { x: inset, y },
    { x: WIDTH - inset, y },
  ];
}

/** CSS pixels of the visible viewport, ignoring browser chrome that doesn't cover the page. */
export function viewportPixels(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 0, h: 0 };
  const vv = window.visualViewport;
  return {
    w: Math.round(vv?.width ?? window.innerWidth ?? 0),
    h: Math.round(vv?.height ?? window.innerHeight ?? 0),
  };
}

export function viewportOffsetTop(): number {
  if (typeof window === 'undefined') return 0;
  return Math.round(window.visualViewport?.offsetTop ?? 0);
}

function safeInsetsCss(): { top: number; bottom: number } {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 };
  const probe = document.getElementById('safe-probe');
  if (!probe) return { top: 0, bottom: 0 };
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  };
}

/** Match the playfield to the visible screen. A 3:4 window keeps the designed 800 height. */
export function applyViewport(w?: number, h?: number): void {
  const vp = w === undefined || h === undefined ? viewportPixels() : { w, h };
  const insets = safeInsetsCss();
  const l = computeLayout({
    vpW: vp.w,
    vpH: vp.h,
    safeTop: insets.top,
    safeBottom: insets.bottom,
    touch: IS_TOUCH,
  });
  coverScreen = l.coverScreen;
  HEIGHT = l.height;
  SAFE_TOP = l.safeTop;
  SAFE_BOTTOM = l.safeBottom;
  HUD_HEIGHT = l.hudHeight;
  HUD_CENTER = l.hudCenter;
  LEVEL_OFFSET_Y = l.levelOffsetY;
  PADDLE_Y = l.paddleY;
  FALL_SHATTER_Y = PADDLE_Y - SHATTER_GAP;
  ARENA_MID = l.arenaMid;
  DECK_TOP = l.deckTop;
  DECK_BOTTOM = l.deckBottom;
  LOSE_Y = l.loseY;
  const stage = computeStage({ vpW: vp.w, vpH: vp.h, touch: IS_TOUCH });
  WIDE = stage.wide;
  STAGE_W = stage.width;
  WING = stage.wing;
}

/** The whole visible stage in playfield coordinates, for full-screen fills and emit zones. */
export function stageRect(): { x: number; y: number; width: number; height: number } {
  return { x: -WING, y: 0, width: STAGE_W, height: HEIGHT };
}

/** Canvas size in device pixels for the current stage and render zoom. */
export function canvasSize(): { w: number; h: number } {
  return { w: Math.round(STAGE_W * RENDER_ZOOM), h: Math.round(HEIGHT * RENDER_ZOOM) };
}

/**
 * Map a y authored on the 800-tall field into the safe area.
 * On a taller phone the original block stays intact and sits in the vertical center.
 */
export function designY(y: number): number {
  const top = SAFE_TOP;
  const bottom = HEIGHT - SAFE_BOTTOM;
  const span = bottom - top;
  if (span <= FIELD_HEIGHT) return top + (y / FIELD_HEIGHT) * span;
  return top + (span - FIELD_HEIGHT) / 2 + y;
}

export function stockPositions(count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const slot = slotPositions()[0]!;
  const gap = STOCK_RADIUS * 2 + 8;
  const x0 = slot.x + SLOT_RADIUS + 12 + STOCK_RADIUS;
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * gap, y: slot.y }));
}

export interface ImageAsset {
  key: string;
  path: string;
}

export const IMAGE_ASSETS: ImageAsset[] = [
  ...BRICK_COLORS.map((c) => ({ key: `brick_${c}`, path: `images/bricks/brick_${c}.png` })),
  ...NEW_BRICK_KINDS.map((k) => ({ key: `brick_${k}`, path: `images/bricks/brick_${k}.png` })),
  ...(Object.keys(POWERUP_INFO) as PowerupId[])
    .filter((id) => id !== 'coin' && id !== 'mystery' && id !== 'hyper')
    .map((id) => ({ key: `pu_${id}`, path: `images/powerups/${id}.png` })),
  { key: 'paddle', path: 'images/paddle.png' },
  { key: 'ball', path: 'images/ball.png' },
  { key: 'arrow', path: 'images/arrow.png' },
  { key: 'heart', path: 'images/heart.png' },
  { key: 'fire1', path: 'images/powerups/fire-1.png' },
  { key: 'fire2', path: 'images/powerups/fire-2.png' },
  { key: 'fire3', path: 'images/powerups/fire-3.png' },
  { key: 'fire4', path: 'images/powerups/fire-4.png' },
  { key: 'smoke', path: 'images/powerups/smoke.png' },
  { key: 'logo', path: 'images/ui/logo.png' },
  { key: 'star', path: 'images/ui/star.png' },
  { key: 'star_off', path: 'images/ui/star-bw.png' },
  { key: 'star_big', path: 'images/ui/star-big.png' },
  { key: 'lock', path: 'images/ui/lock.png' },
  { key: 'coin_icon', path: 'images/ui/coin-icon.png' },
];

export const AUDIO_ASSETS: ImageAsset[] = [
  ...[0, 1, 2, 3].flatMap((i) =>
    ['c', 'd', 'f', 'g'].map((n) => ({ key: `${n}${i}`, path: `audio/${n}${i}.mp3` })),
  ),
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ key: `break${i}`, path: `audio/breaks/break${i}.mp3` })),
  { key: 'ui_move', path: 'audio/ui/move.mp3' },
  { key: 'ui_on', path: 'audio/ui/on.mp3' },
  { key: 'ui_off', path: 'audio/ui/off.mp3' },
  { key: 'ui_select', path: 'audio/ui/select.mp3' },
  { key: 'ui_toggle', path: 'audio/ui/toggle.mp3' },
  { key: 'ui_whoosh', path: 'audio/ui/whoosh.mp3' },
  { key: 'ui_logo_piece', path: 'audio/ui/logo-piece.mp3' },
  { key: 'ui_logo_slam', path: 'audio/ui/logo-slam.mp3' },
  { key: 'ui_intro', path: 'audio/ui/intro.mp3' },
  { key: 'ui_purchase', path: 'audio/ui/purchase.mp3' },
  { key: 'ui_coin_land', path: 'audio/ui/coin-land.mp3' },
  { key: 'ui_pip', path: 'audio/ui/pip.mp3' },
  { key: 'ui_deny', path: 'audio/ui/deny.mp3' },
  { key: 'ui_locked', path: 'audio/ui/locked.mp3' },
  { key: 'ui_tab', path: 'audio/ui/tab.mp3' },
  { key: 'ui_tally', path: 'audio/ui/tally.mp3' },
  { key: 'ui_pause', path: 'audio/ui/pause.mp3' },
  { key: 'count_3', path: 'audio/ui/3.mp3' },
  { key: 'count_2', path: 'audio/ui/2.mp3' },
  { key: 'count_1', path: 'audio/ui/1.mp3' },
  { key: 'count_go', path: 'audio/ui/go.mp3' },
  { key: 'fanfare_stab', path: 'audio/ui/fanfare-stab.mp3' },
  { key: 'fanfare_rise_a', path: 'audio/ui/fanfare-rise-a.mp3' },
  { key: 'fanfare_rise_b', path: 'audio/ui/fanfare-rise-b.mp3' },
  { key: 'fanfare_tail', path: 'audio/ui/fanfare-tail.mp3' },
  ...[1, 2, 3].map((i) => ({ key: `star_${i}`, path: `audio/ui/star-${i}.mp3` })),
  { key: 'new_best', path: 'audio/ui/new-best.mp3' },
  { key: 'music', path: 'audio/music/pusher.mp3' },
  { key: 'death', path: 'audio/death.mp3' },
  { key: 'gameover', path: 'audio/gameover.mp3' },
  { key: 'laser_shot', path: 'audio/laser.mp3' },
  { key: 'laser_spinup', path: 'audio/laser/spinup.mp3' },
  { key: 'laser_vent', path: 'audio/laser/vent.mp3' },
  { key: 'laser_ricochet', path: 'audio/laser/ricochet.mp3' },
  { key: 'laser_missile', path: 'audio/laser/missile.mp3' },
  { key: 'laser_impact', path: 'audio/laser/impact.mp3' },
  { key: 'sfx_coin', path: 'audio/powerups/coin.mp3' },
  { key: 'sfx_bigger', path: 'audio/powerups/bigger.mp3' },
  { key: 'sfx_smaller', path: 'audio/powerups/smaller.mp3' },
  { key: 'sfx_laser', path: 'audio/powerups/laser.mp3' },
  { key: 'sfx_balls', path: 'audio/powerups/balls.mp3' },
  { key: 'sfx_magnet', path: 'audio/powerups/magnet2.mp3' },
  { key: 'sfx_fireball', path: 'audio/powerups/fireball.mp3' },
  { key: 'sfx_shield_on', path: 'audio/powerups/shield-on.mp3' },
  { key: 'sfx_shield_break', path: 'audio/powerups/shield-break.mp3' },
  { key: 'sfx_hyper', path: 'audio/powerups/hyper.mp3' },
  { key: 'sfx_pierce', path: 'audio/powerups/pierce.mp3' },
  { key: 'sfx_extra_life', path: 'audio/powerups/extra-life.mp3' },
  { key: 'sfx_mystery', path: 'audio/powerups/mystery.mp3' },
  { key: 'sfx_timeout', path: 'audio/powerups/timeout.mp3' },
  { key: 'ab_meteor_whoosh', path: 'audio/abilities/meteor-whoosh.mp3' },
  { key: 'ab_meteor_impact', path: 'audio/abilities/meteor-impact.mp3' },
  { key: 'ab_lightning', path: 'audio/abilities/lightning.mp3' },
  { key: 'ab_bomb_launch', path: 'audio/abilities/bomb-launch.mp3' },
  { key: 'ab_bomb_blast', path: 'audio/abilities/bomb-blast.mp3' },
  { key: 'ab_sweep', path: 'audio/abilities/sweep.mp3' },
  { key: 'ab_blackhole_open', path: 'audio/abilities/blackhole-open.mp3' },
  { key: 'ab_blackhole_swallow', path: 'audio/abilities/blackhole-swallow.mp3' },
  { key: 'ab_blackhole_close', path: 'audio/abilities/blackhole-close.mp3' },
  { key: 'ab_frenzy', path: 'audio/abilities/frenzy.mp3' },
  { key: 'roulette_tick', path: 'audio/abilities/roulette-tick.mp3' },
  { key: 'roulette_lock', path: 'audio/abilities/roulette-lock.mp3' },
  { key: 'launch', path: 'audio/launch.mp3' },
  { key: 'wall', path: 'audio/wall.mp3' },
  { key: 'brick_steel', path: 'audio/bricks/steel.mp3' },
  { key: 'brick_armor', path: 'audio/bricks/armor.mp3' },
  { key: 'brick_regen', path: 'audio/bricks/regen.mp3' },
  { key: 'brick_tnt', path: 'audio/bricks/tnt.mp3' },
  { key: 'brick_collapse', path: 'audio/bricks/collapse.mp3' },
  { key: 'brick_mover', path: 'audio/bricks/mover.mp3' },
  { key: 'combo', path: 'audio/combo.mp3' },
  { key: 'fever_start', path: 'audio/fever-start.mp3' },
  { key: 'fever_end', path: 'audio/fever-end.mp3' },
  { key: 'wave_clear', path: 'audio/wave-clear.mp3' },
  { key: 'field_clear', path: 'audio/field-clear.mp3' },
  { key: 'gift', path: 'audio/gift.mp3' },
  { key: 'surge', path: 'audio/surge.mp3' },
  { key: 'breach', path: 'audio/breach.mp3' },
  { key: 'thunder', path: 'audio/storm/thunder.mp3' },
  { key: 'flicker', path: 'audio/storm/flicker.mp3' },
];

export const SCENES = {
  boot: 'Boot',
  preload: 'Preload',
  title: 'Title',
  arcadeSelect: 'ArcadeSelect',
  play: 'Play',
  hud: 'Hud',
  pause: 'Pause',
  results: 'Results',
  upgrades: 'Upgrades',
  settings: 'Settings',
  worlds: 'Worlds',
  worldPath: 'WorldPath',
  briefing: 'Briefing',
  transition: 'Transition',
  gallery: 'UiGallery',
} as const;

applyViewport();
