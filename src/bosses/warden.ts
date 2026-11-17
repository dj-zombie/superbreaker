import { sway } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import type { ArenaBrick, BossDef, BossStage, Cutscene } from '../systems/BossDirector';

/** The wall the Warden drops under itself: its first column, its row and how many bricks. */
const WALL_COL = 7;
const WALL_ROW = 16;
const WALL_BRICKS = 6;
/** The Warden's own light: the violet of its body and the red of its eye. */
const VIOLET = 0x9b6bff;
const EYE_RED = 0xff3c2a;
/**
 * The blasts that break the Warden up, each further out than the last: ms into the death scene,
 * px from the body's centre, and size. They are far enough apart that two flashes at most burn.
 */
const BREAKUP = [
  { at: 300, dx: -40, dy: -15, scale: 0.7 },
  { at: 650, dx: 60, dy: 15, scale: 0.8 },
  { at: 1000, dx: -85, dy: 40, scale: 0.9 },
  { at: 1350, dx: 105, dy: -25, scale: 1 },
] as const;

function wall(): ArenaBrick[] {
  return Array.from({ length: WALL_BRICKS }, (_, i): ArenaBrick => {
    return {
      x: (WALL_COL + i) * BW,
      y: WALL_ROW * BH,
      width: BW,
      height: BH,
      texture: 'brick_purple2',
      kind: 'normal',
      health: BRICK_HEALTH,
      armor: 0,
      moveX: 0,
      moveSpeed: 0,
      regenDelay: 0,
    };
  });
}

/** Where the eye is now, or the middle of the body once the core is gone. */
function eye(s: BossStage): { x: number; y: number } {
  return s.part('core') ?? s.center;
}

/** It comes out of the dark: a rumble under a swelling glow, then a roar as it lands. */
const entrance: Cutscene = {
  lengthMs: 1800,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = s.center;
        s.audio.sfx('thunder', 0.4, -200);
        const glow = s.light({ x, y, radius: 70, color: VIOLET, intensity: 0.2, priority: 7 });
        s.tween({ targets: glow, radius: 240, intensity: 1.1, duration: 1100, ease: 'Sine.In' });
      },
    },
    {
      at: 1150,
      run: (s) => {
        const { x, y } = s.center;
        s.anim('tell');
        s.impact(x, y, 1.2, VIOLET);
        s.audio.sfx('ab_meteor_impact', 0.55);
      },
    },
  ],
};

/** The guard lets go: a roar, the eye flares, and its light bursts out. */
const exposed: Cutscene = {
  lengthMs: 1200,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        s.anim('tell');
        s.audio.sfx('brick_steel', 0.5, -300);
        const flare = s.light({ x, y, radius: 80, color: EYE_RED, intensity: 0.3, priority: 7 });
        s.tween({ targets: flare, radius: 220, intensity: 1.3, duration: 600, ease: 'Cubic.In' });
      },
    },
    {
      at: 650,
      run: (s) => {
        const { x, y } = eye(s);
        s.impact(x, y, 1.3, EYE_RED);
        s.audio.sfx('surge', 0.5);
      },
    },
  ],
};

/** It breaks up from the eye outward while the eye burns out, then goes all at once. */
const death: Cutscene = {
  lengthMs: 2200,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        const ember = s.light({ x, y, radius: 160, color: EYE_RED, intensity: 1.4, priority: 7 });
        s.tween({ targets: ember, radius: 60, intensity: 0, duration: 1900, ease: 'Sine.In' });
      },
    },
    ...BREAKUP.map(({ at, dx, dy, scale }, i) => ({
      at,
      run: (s: BossStage) => {
        const { x, y } = s.center;
        s.impact(x + dx, y + dy, scale);
        // Each blast a little higher than the last, so the run climbs.
        s.audio.sfx('brick_tnt', 0.4, i * 100, { x: x + dx });
      },
    })),
    {
      at: 1800,
      run: (s) => {
        const { x, y } = s.center;
        s.impact(x, y, 1.6);
        s.audio.sfx('brick_collapse', 0.6);
      },
    },
  ],
};

/**
 * The reference boss: dev-only content that exercises the framework. Its body is the band across
 * the shoulders. The core is the eye, which takes triple damage and hangs below the body, and a
 * steel guard under the core shields it from below, so the ball has to come at it from the side.
 * In the second phase the guard pulls up behind the core and the core can be hit from below.
 */
export const warden: BossDef = {
  id: 'warden',
  name: 'Warden',
  epithet: 'Keeper of the gate',
  parts: [
    { id: 'body', col: 7, row: 3, cols: 6, rows: 2, texture: 'brick_purple2' },
    // The core's top row lies under the body, so only the two rows below it can be hit.
    { id: 'core', col: 9, row: 4, cols: 2, rows: 3, texture: 'brick_red', weak: 3 },
    { id: 'guard', col: 9, row: 7, cols: 2, rows: 1, texture: 'brick_steel', kind: 'steel' },
  ],
  sprite: {
    key: 'boss_warden',
    path: 'images/bosses/warden.png',
    frameWidth: 320,
    frameHeight: 240,
    width: 300,
    height: 225,
    // Puts the eye in the middle of the core and the shoulders across the body.
    dx: 2,
    dy: 49.5,
    anims: {
      idle: { frames: [0, 1, 2, 1], fps: 5 },
      tell: { frames: [3, 4], fps: 8 },
      open: { frames: [5], fps: 1 },
      hurt: { frames: [6], fps: 1 },
      death: { frames: [7, 8], fps: 3 },
    },
  },
  poses: {
    // Three rows up, inside the body and on top of the core, where no ball can reach the guard.
    open: { guard: { dy: -3 * BH } },
  },
  phases: [
    { id: 'guard-up', title: 'Guard up', hits: 12, motion: sway(50, 5200) },
    {
      id: 'core-exposed',
      title: 'Core exposed',
      hits: 12,
      pose: 'open',
      motion: sway(90, 3600),
      setup: (s) => {
        s.spawn(wall());
      },
      enter: exposed,
    },
  ],
  entrance,
  death,
};
