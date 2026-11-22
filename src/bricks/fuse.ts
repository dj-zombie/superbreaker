import { touches } from '../core/bricks/cells';
import { FUSE_CHAIN_CAP, FUSE_DIAGONAL, FUSE_STEP_MS } from '../core/bricks/fuse';
import { rectOf, type BrickBehavior } from './behavior';

/** Any hit lights a fuse; the flame pops it and moves on to every fuse or TNT touching it. */
export function fuseBehavior(): BrickBehavior {
  return {
    kinds: ['fuse'],
    hit(b) {
      b.takeHit(0, { lethal: true });
      return 'destroyed';
    },
    destroyed(b, cause, chain, host) {
      // A fuse that falls or crosses the danger line doesn't light: nobody aimed at it.
      if (cause === 'fall' || cause === 'breach') return;
      if (!b.lit) {
        b.lit = true;
        host.emit({ type: 'fuseLit', brick: b });
      }
      const box = rectOf(b);
      for (const n of host.bricks) {
        if (n === b || n.lit || !n.isAlive || n.owner || n.falling) continue;
        if (n.kind !== 'fuse' && n.kind !== 'explosive') continue;
        if (!touches(box, rectOf(n), FUSE_DIAGONAL)) continue;
        n.lit = true;
        host.emit({ type: 'fuseStep', brick: n });
        host.scene.time.delayedCall(FUSE_STEP_MS, () => {
          if (n.isAlive) host.destroy(n, 'explosion', Math.min(chain + 1, FUSE_CHAIN_CAP));
        });
      }
    },
  };
}
