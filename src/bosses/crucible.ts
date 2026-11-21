import type { BossDef } from '../systems/BossDirector';

/**
 * The first boss: a furnace-engine with a living heart caged behind iron ribs, at the bottom of
 * the forge's shaft.
 */
export const crucible: BossDef = {
  id: 'crucible',
  name: 'The Crucible',
  epithet: 'Heart of the forge',
  parts: [
    { id: 'shell', col: 6, row: 2, cols: 8, rows: 2, texture: 'brick_steel', kind: 'steel' },
    { id: 'heart', col: 8, row: 4, cols: 4, rows: 5, texture: 'brick_red', weak: 0 },
    { id: 'rib1', col: 7, row: 5, cols: 1, rows: 4, texture: 'brick_orange2' },
    { id: 'rib2', col: 8, row: 9, cols: 2, rows: 1, texture: 'brick_orange2' },
    { id: 'rib3', col: 10, row: 9, cols: 2, rows: 1, texture: 'brick_orange2' },
    { id: 'rib4', col: 12, row: 5, cols: 1, rows: 4, texture: 'brick_orange2' },
  ],
  phases: [{ id: 'caged', title: 'Caged', hits: 24 }],
  trophy: 'Crucible Heart',
};
