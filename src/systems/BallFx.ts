import type { FxEngine, FxHandle } from '../fx';
import type { Ball } from '../entities/Ball';

type TrailId = 'ball.trail' | 'ball.hyper' | 'ball.fire';

/**
 * Each free ball's trail, attached on the scene's FxEngine: a ribbon plus motes, or fire for a
 * fireball. The trail is swapped when the ball changes mode and dropped when the ball is caught,
 * lost or gone, so Frenzy and multiball only add particles to the engine's shared emitters.
 */
export class BallFx {
  private live = new Map<Ball, { id: TrailId; handle: FxHandle }>();
  private seen = new Set<Ball>();

  constructor(private fx: FxEngine) {}

  update(balls: readonly Ball[]): void {
    const seen = this.seen;
    seen.clear();
    for (const b of balls) {
      seen.add(b);
      const id: TrailId | undefined =
        !b.active || !b.trailOn
          ? undefined
          : b.fireOn
            ? 'ball.fire'
            : b.isHyper
              ? 'ball.hyper'
              : 'ball.trail';
      const cur = this.live.get(b);
      if (cur && (cur.id !== id || !cur.handle.alive)) {
        cur.handle.stop();
        this.live.delete(b);
      }
      if (!id) continue;
      const running = this.live.get(b);
      if (running) running.handle.set({ tint: b.trailTint });
      else this.live.set(b, { id, handle: this.fx.attach(id, b, { tint: b.trailTint }) });
    }
    for (const [b, t] of this.live) {
      if (seen.has(b)) continue;
      t.handle.stop();
      this.live.delete(b);
    }
  }

  /** The ball jumped (through a portal): its trail starts again where it came out. */
  cut(b: Ball): void {
    this.live.get(b)?.handle.stop();
    this.live.delete(b);
  }
}
