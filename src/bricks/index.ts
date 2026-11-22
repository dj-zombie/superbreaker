import type { BrickKind } from '../core/types';
import type { BrickBehavior } from './behavior';
import { fuseBehavior } from './fuse';
import { gatesBehavior } from './gates';
import { phantomBehavior } from './phantom';
import { portalBehavior } from './portal';
import { virusBehavior } from './virus';

export type { BallLike, BrickBehavior, BrickHost, ElementEvent } from './behavior';

/** A fresh set of behaviors for one board, by the kinds each one handles. */
export function createBehaviors(): Map<BrickKind, BrickBehavior> {
  const out = new Map<BrickKind, BrickBehavior>();
  for (const behavior of [
    fuseBehavior(),
    phantomBehavior(),
    gatesBehavior(),
    portalBehavior(),
    virusBehavior(),
  ]) {
    for (const kind of behavior.kinds) out.set(kind, behavior);
  }
  return out;
}
