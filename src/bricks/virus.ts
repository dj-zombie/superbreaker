import { touches } from '../core/bricks/cells';
import {
  purgeBonus,
  spreadCandidates,
  spreadInterval,
  VIRUS_ARMOR,
  VIRUS_CAP,
  VIRUS_INCUBATE_MS,
} from '../core/bricks/virus';
import type { Brick } from '../entities/Brick';
import { rectOf, type BrickBehavior, type BrickHost } from './behavior';

interface Colony {
  core: Brick;
  members: Set<Brick>;
  infections: number;
  /** Level time of the next infection. Its clock waits while the ball is on the paddle. */
  nextAt: number;
  turning?: { brick: Brick; at: number };
  purged: boolean;
}

/** Only plain bricks that sit still turn. */
const infectable = (b: Brick) =>
  b.isAlive && b.kind === 'normal' && !b.owner && !b.falling && !b.infecting && b.spec.moveX === 0;

/** While a core lives, its colony spreads into the plain bricks it touches. Kill the core first. */
export function virusBehavior(): BrickBehavior {
  const colonies = new Map<number, Colony>();
  let halted = false;

  const interval = (c: Colony) => spreadInterval(c.core.spec.props?.spreadMs);

  const cancel = (c: Colony) => {
    if (c.turning) c.turning.brick.infecting = false;
    c.turning = undefined;
  };

  const tick = (c: Colony, dt: number, host: BrickHost) => {
    if (!c.core.isAlive || c.purged) {
      cancel(c);
      return;
    }
    if (c.turning) {
      if (host.now() < c.turning.at) return;
      const b = c.turning.brick;
      cancel(c);
      c.nextAt = host.now() + interval(c);
      if (!b.isAlive || b.kind !== 'normal' || b.falling) return;
      b.infect(c.core.spec.id, VIRUS_ARMOR);
      c.members.add(b);
      c.infections++;
      host.changed();
      host.emit({ type: 'infected', brick: b });
      return;
    }
    if (!host.live()) {
      c.nextAt += dt;
      return;
    }
    if (host.now() < c.nextAt || c.infections >= VIRUS_CAP) return;
    const live = [...c.members].filter((m) => m.isAlive).map(rectOf);
    const options = spreadCandidates(
      live,
      host.bricks.map((b) => ({ ...rectOf(b), brick: b })),
      (o) => infectable(o.brick),
    );
    if (!options.length) {
      c.nextAt = host.now() + interval(c);
      return;
    }
    const pick = options[Math.floor(Math.random() * options.length)]!.brick;
    pick.infecting = true;
    c.turning = { brick: pick, at: host.now() + VIRUS_INCUBATE_MS };
    host.emit({ type: 'infecting', brick: pick, core: c.core });
  };

  return {
    kinds: ['virus'],
    added(bricks, host) {
      for (const b of bricks) {
        if (!b.spec.props?.source) continue;
        b.colony = b.spec.id;
        colonies.set(b.spec.id, {
          core: b,
          members: new Set([b]),
          infections: 0,
          nextAt: host.now() + spreadInterval(b.spec.props.spreadMs),
          purged: false,
        });
      }
      // Bricks placed already infected join the colony they touch.
      let joined = true;
      while (joined) {
        joined = false;
        for (const b of bricks) {
          if (b.colony >= 0) continue;
          for (const c of colonies.values()) {
            if (![...c.members].some((m) => touches(rectOf(m), rectOf(b), false))) continue;
            b.colony = c.core.spec.id;
            c.members.add(b);
            joined = true;
            break;
          }
        }
      }
    },
    update(dt, host) {
      if (halted) return;
      for (const c of colonies.values()) tick(c, dt, host);
    },
    destroyed(b, _cause, _chain, host) {
      const c = colonies.get(b.colony);
      // Bricks falling in the collapse aren't a purge: nobody aimed at them.
      if (!c || c.purged || halted) return;
      if (b === c.core) cancel(c);
      if ([...c.members].some((m) => m.life !== 'dead')) return;
      c.purged = true;
      const bonus = purgeBonus(c.infections);
      host.emit({ type: 'purged', x: b.x, y: b.y, infections: c.infections, bonus });
    },
    collapse() {
      halted = true;
      for (const c of colonies.values()) cancel(c);
    },
  };
}
