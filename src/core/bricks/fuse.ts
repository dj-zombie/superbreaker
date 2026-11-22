import { stepsFrom, type Rect } from './cells';

/** Time the flame takes from one fuse brick to the next. */
export const FUSE_STEP_MS = 80;

/** A cord runs at any angle: fuse bricks that touch at a corner are joined. */
export const FUSE_DIAGONAL = true;

/** A long cord's chain bonus stops growing here, so one cord can't outscore a level. */
export const FUSE_CHAIN_CAP = 10;

/**
 * When each fuse brick of a cord pops after `start` is lit: 0 for `start`, then one step per
 * brick along the cord. -1 for bricks on another cord.
 */
export function fuseSchedule(cord: readonly Rect[], start: number): number[] {
  return stepsFrom(cord, start, FUSE_DIAGONAL).map((s) => (s < 0 ? -1 : s * FUSE_STEP_MS));
}
