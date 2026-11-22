import {
  asLink,
  insidePortal,
  portalExit,
  PORTAL_COOLDOWN_MS,
  type PortalBox,
} from '../core/bricks/portal';
import type { Brick } from '../entities/Brick';
import type { BallLike, BrickBehavior } from './behavior';

const box = (b: Brick): PortalBox => ({
  x: b.x,
  y: b.y,
  width: b.spec.width,
  height: b.spec.height,
});

/** A ball that reaches a portal's middle comes out of its twin with the same velocity. */
export function portalBehavior(): BrickBehavior {
  const ends: Brick[] = [];
  const cooldown = new WeakMap<BallLike, number>();
  return {
    kinds: ['portal'],
    added(bricks) {
      ends.push(...bricks);
    },
    contact(b, ball, host) {
      if ((cooldown.get(ball) ?? -Infinity) > host.now()) return false;
      if (!insidePortal(box(b), ball.x, ball.y)) return false;
      const link = asLink(b.spec.props?.link);
      const twin = ends.find((e) => e !== b && e.isAlive && asLink(e.spec.props?.link) === link);
      if (!twin) return false;
      const v = ball.body.velocity;
      const vx = v.x;
      const vy = v.y;
      const out = portalExit(box(twin), vx, vy, ball.displayWidth / 2);
      // reset() stops the body, so the velocity goes back on after the move.
      ball.body.reset(out.x, out.y);
      ball.body.velocity.set(vx, vy);
      cooldown.set(ball, host.now() + PORTAL_COOLDOWN_MS);
      host.emit({ type: 'portal', from: b, to: twin, ball });
      return false;
    },
    collapse(host) {
      // Portals close rather than fall: a falling doorway would still throw balls about.
      for (const e of ends) {
        if (!e.isAlive) continue;
        e.markDead();
        host.scene.tweens.add({
          targets: e,
          alpha: 0,
          scaleX: e.scaleX * 0.2,
          scaleY: e.scaleY * 0.2,
          angle: 180,
          duration: 260,
          ease: 'Cubic.In',
          onComplete: () => e.setVisible(false),
        });
      }
      host.changed();
    },
  };
}
