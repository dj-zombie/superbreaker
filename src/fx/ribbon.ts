import Phaser from 'phaser';
import { FX_TEXTURE } from './atlas';

/** A Rope whose half-width can change along its length. */
class TaperedRope extends Phaser.GameObjects.Rope {
  /** Half-width in px at each point. */
  widths!: Float32Array;

  override updateVertices(): this {
    const points = this.points;
    const verts = this.vertices;
    const n = points.length;
    this.dirty = false;
    let px = 0;
    let py = -1;
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(n - 1, i + 1)]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      // Collapsed points keep the last good normal instead of dividing by zero.
      if (len > 1e-4) {
        px = dy / len;
        py = -dx / len;
      }
      const w = this.widths?.[i] ?? 0;
      const p = points[i]!;
      verts[i * 4] = p.x + px * w;
      verts[i * 4 + 1] = p.y + py * w;
      verts[i * 4 + 2] = p.x - px * w;
      verts[i * 4 + 3] = p.y - py * w;
    }
    return this;
  }
}

export interface RibbonStyle {
  /** Width at the head, in px. */
  width: number;
  /** How long the trail is, in ms of travel. */
  life: number;
  color: number;
  /** Color the tail fades toward; defaults to `color`. */
  tail?: number;
  alpha?: number;
  /** A thin hot core inside the trail, at this alpha. */
  core?: number;
  coreColor?: number;
  depth?: number;
}

const POINTS = 24;
/** A new point is laid down once the target has moved this far, in px. */
const SPACING = 5;

function lerpColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * A tapered glowing trail behind a moving target, drawn on two additive Ropes (glow and core).
 * Points are laid down as the target moves and age out over `life`, so a stopped target's trail
 * shrinks into it and a stopped ribbon fades away by itself.
 */
export class FxRibbon {
  private hist: Array<{ x: number; y: number; age: number }> = [];
  private ropes: Array<{ rope: TaperedRope; width: number; alpha: number; head: number; tail: number }> = [];
  private stopped = false;

  constructor(
    scene: Phaser.Scene,
    private target: { x: number; y: number; active?: boolean },
    private style: RibbonStyle,
  ) {
    const depth = style.depth ?? 9;
    const make = (width: number, alpha: number, head: number, tail: number) => {
      const rope = new TaperedRope(scene, 0, 0, FX_TEXTURE, 'band', POINTS);
      rope.widths = new Float32Array(POINTS);
      rope.setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
      scene.add.existing(rope);
      this.ropes.push({ rope, width, alpha, head, tail });
    };
    make(style.width, style.alpha ?? 0.9, style.color, style.tail ?? style.color);
    if (style.core) make(style.width * 0.32, style.core, style.coreColor ?? 0xffffff, style.color);
  }

  get alive(): boolean {
    return this.ropes.length > 0;
  }

  stop(): void {
    this.stopped = true;
  }

  /** Steps the trail; false once it has faded out and been destroyed. */
  update(delta: number): boolean {
    const life = this.style.life;
    const h = this.hist;
    for (const p of h) p.age += delta;
    while (h.length && h[h.length - 1]!.age >= life) h.pop();

    const t = this.target;
    if (!this.stopped && t.active !== false) {
      const head = h[0];
      if (!head || Math.hypot(t.x - head.x, t.y - head.y) >= SPACING) {
        h.unshift({ x: t.x, y: t.y, age: 0 });
        if (h.length > POINTS) h.length = POINTS;
      } else {
        head.x = t.x;
        head.y = t.y;
      }
    } else if (!h.length) {
      this.destroy();
      return false;
    }

    const n = h.length;
    for (const r of this.ropes) {
      const rope = r.rope;
      rope.setVisible(n >= 2);
      if (n < 2) continue;
      for (let i = 0; i < POINTS; i++) {
        const p = h[Math.min(i, n - 1)]!;
        const pt = rope.points[i]!;
        pt.x = p.x;
        pt.y = p.y;
        const k = i < n ? 1 - p.age / life : 0;
        const u = i < n ? i / (n - 1) : 1;
        // Thin toward the tail by position, and fade by age so a fast trail stays long and bright.
        rope.widths[i] = r.width * 0.5 * Math.max(0, k) ** 0.7 * (1 - u * 0.6);
        const a = r.alpha * Math.max(0, k) ** 1.3;
        rope.alphas[i * 2] = a;
        rope.alphas[i * 2 + 1] = a;
        const c = lerpColor(r.head, r.tail, Math.min(1, 1 - k));
        rope.colors[i * 2] = c;
        rope.colors[i * 2 + 1] = c;
      }
      rope.setDirty();
    }
    return true;
  }

  destroy(): void {
    for (const r of this.ropes) r.rope.destroy();
    this.ropes.length = 0;
    this.hist.length = 0;
  }
}
