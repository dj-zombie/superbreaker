import type Phaser from 'phaser';
import { asChannel, GATE_OPEN_ALPHA, Switchboard, type Channel } from '../core/bricks/gates';
import type { Brick } from '../entities/Brick';
import type { BrickBehavior, BrickHost } from './behavior';

const FADE_MS = 160;

const channelOf = (b: Brick): Channel => asChannel(b.spec.props?.channel);

/** A switch flips every gate on its channel between solid and open. */
export function gatesBehavior(): BrickBehavior {
  const board = new Switchboard();
  const gates: Brick[] = [];
  /** Gates told to close while a ball was inside them. */
  const closing = new Set<Brick>();
  const fades = new Map<Brick, Phaser.Tweens.Tween>();
  let settled = false;

  const show = (g: Brick, open: boolean, host: BrickHost, instant = false) => {
    fades.get(g)?.stop();
    const to = open ? GATE_OPEN_ALPHA : 1;
    if (instant) {
      g.setFade(to);
      return;
    }
    const from = open ? 1 : GATE_OPEN_ALPHA;
    fades.set(
      g,
      host.scene.tweens.addCounter({
        from,
        to,
        duration: FADE_MS,
        onUpdate: (t) => g.setFade(t.getValue() ?? to),
        onComplete: () => fades.delete(g),
      }),
    );
  };

  const setOpen = (g: Brick, open: boolean, host: BrickHost) => {
    closing.delete(g);
    if (!open && host.occupied(g)) {
      closing.add(g);
      return;
    }
    if (g.solid === !open) return;
    show(g, open, host);
    g.solid = !open;
    host.emit({ type: 'gate', brick: g, open });
  };

  const flip = (channel: Channel, from: Brick, host: BrickHost) => {
    if (settled || !board.tryFlip(channel, host.now())) return;
    host.emit({ type: 'switch', brick: from, channel });
    for (const g of gates) {
      if (!g.isAlive || channelOf(g) !== channel) continue;
      // A gate still waiting to close was open: the flip keeps it that way.
      if (closing.has(g)) closing.delete(g);
      else setOpen(g, g.solid, host);
    }
  };

  return {
    kinds: ['switch', 'gate'],
    added(bricks, host) {
      for (const b of bricks) {
        if (b.kind !== 'gate') continue;
        gates.push(b);
        const open = !!b.spec.props?.open;
        b.solid = !open;
        show(b, open, host, true);
      }
    },
    update(_dt, host) {
      for (const g of closing) {
        if (!g.isAlive) closing.delete(g);
        else if (!host.occupied(g)) setOpen(g, false, host);
      }
    },
    hit(b, _damage, cause, _opts, host) {
      if (b.kind !== 'switch' || cause === 'breach' || cause === 'fall') return undefined;
      flip(channelOf(b), b, host);
      return 'trigger';
    },
    blast(b, host) {
      if (b.kind === 'switch') flip(channelOf(b), b, host);
    },
    collapse(host) {
      settled = true;
      closing.clear();
      for (const g of gates) {
        if (!g.isAlive || !g.solid) continue;
        show(g, true, host);
        g.solid = false;
      }
    },
  };
}
