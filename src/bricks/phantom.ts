import { phantomAt, PHANTOM_GHOST_ALPHA, PHANTOM_PERIOD } from '../core/bricks/phantom';
import type { Brick } from '../entities/Brick';
import type { BrickBehavior } from './behavior';

/** The warning flicker's beat. */
const FLICKER_MS = 50;

/** Phantoms fade in and out, and are only solid while they're visible. */
export function phantomBehavior(): BrickBehavior {
  const phantoms: Brick[] = [];
  let settled = false;
  return {
    kinds: ['phantom'],
    added(bricks) {
      phantoms.push(...bricks);
    },
    update(_dt, host) {
      for (const b of phantoms) {
        if (!b.isAlive) continue;
        if (settled || b.falling) {
          b.solid = true;
          b.setFade(1);
          continue;
        }
        const s = phantomAt(
          host.now(),
          b.spec.props?.period ?? PHANTOM_PERIOD,
          b.spec.props?.phase ?? 0,
        );
        // Turning solid waits until no ball is inside it.
        const held = s.solid && !b.solid && host.occupied(b);
        const solid = s.solid && !held;
        if (solid !== b.solid) {
          b.solid = solid;
          host.emit({ type: 'phantom', brick: b, solid });
        }
        const blink = Math.floor(host.now() / FLICKER_MS) % 2 === 0;
        if (held) b.setFade(blink ? 0.4 : PHANTOM_GHOST_ALPHA);
        else if (s.warning) b.setFade(blink ? s.alpha : s.alpha * 0.4);
        else b.setFade(s.alpha);
      }
    },
    collapse() {
      settled = true;
    },
  };
}
