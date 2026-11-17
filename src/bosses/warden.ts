import { sway } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import type { ArenaBrick, BossDef } from '../systems/BossDirector';

/** The wall the Warden drops under itself: its first column, its row and how many bricks. */
const WALL_COL = 7;
const WALL_ROW = 16;
const WALL_BRICKS = 6;

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

/**
 * The reference boss: dev-only content that exercises the framework. Its body is the band across
 * the shoulders. The core is the eye, which takes triple damage and hangs below the body, and a
 * steel guard under the core shields it from below, so the ball has to come at it from the side.
 * In the second phase the guard pulls up behind the core and the core can be hit from below.
 */
export const warden: BossDef = {
  id: 'warden',
  name: 'Warden',
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
    },
  ],
};
