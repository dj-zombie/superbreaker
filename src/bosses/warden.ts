import type { BossDef } from '../systems/BossDirector';

/**
 * The reference boss: dev-only content that exercises the framework. A wide body, a small core
 * under its middle that takes triple damage, and a steel guard that shields the core from below,
 * so the ball has to come at the core from the side.
 */
export const warden: BossDef = {
  id: 'warden',
  name: 'Warden',
  parts: [
    { id: 'body', col: 5, row: 3, cols: 10, rows: 3, texture: 'brick_purple2' },
    { id: 'core', col: 9, row: 6, cols: 2, rows: 2, texture: 'brick_red', weak: 3 },
    { id: 'guard', col: 8, row: 8, cols: 4, rows: 1, texture: 'brick_steel', kind: 'steel' },
  ],
  phases: [
    { id: 'lockdown', title: 'Lockdown', hits: 12 },
    { id: 'breakout', title: 'Breakout', hits: 12 },
  ],
};
