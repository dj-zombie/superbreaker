/**
 * Reusable motion for things that fly about a bonus stage: collectibles and targets alike. A path
 * is where something is `tMs` after it appeared, so it needs no state and replays exactly.
 */
export interface Point {
  x: number;
  y: number;
  /** How far a path turns what follows it, in radians clockwise. Upright when left out. */
  angle?: number;
}

export type Path = (tMs: number) => Point;

/** Stands still at (x, y). */
export function still(x: number, y: number): Path {
  return () => ({ x, y });
}

/** Straight on from (x, y) at (vx, vy) px/s. */
export function linear(x: number, y: number, vx: number, vy: number): Path {
  return (t) => {
    const s = t / 1000;
    return { x: x + vx * s, y: y + vy * s };
  };
}

/** Thrown from (x, y) at (vx, vy) px/s and falling at `gravity` px/s². */
export function fall(x: number, y: number, vx: number, vy: number, gravity: number): Path {
  return (t) => {
    const s = t / 1000;
    return { x: x + vx * s, y: y + vy * s + 0.5 * gravity * s * s };
  };
}

/** Bobs `amp` px up and down about (x, y), once every `periodMs`, drifting at `rise` px/s. */
export function float(x: number, y: number, amp: number, periodMs: number, rise = 0): Path {
  return (t) => ({
    x,
    y: y + rise * (t / 1000) + amp * Math.sin((2 * Math.PI * t) / periodMs),
  });
}

/**
 * Travels from (x, y) at (vx, vy) px/s and weaves `amp` px either side of that line, once every
 * `periodMs`. The weave is square to the travel, so a flyer crossing the field bobs up and down.
 */
export function sine(
  x: number,
  y: number,
  vx: number,
  vy: number,
  amp: number,
  periodMs: number,
  phase = 0,
): Path {
  const speed = Math.hypot(vx, vy);
  // Square to the travel; straight up and down for a path that does not move.
  const nx = speed > 0 ? -vy / speed : 0;
  const ny = speed > 0 ? vx / speed : 1;
  return (t) => {
    const s = t / 1000;
    const w = amp * Math.sin((2 * Math.PI * t) / periodMs + phase);
    return { x: x + vx * s + nx * w, y: y + vy * s + ny * w };
  };
}

/** Circles (cx, cy) at `r` px, once every `periodMs`, starting `phase` radians round. */
export function orbit(cx: number, cy: number, r: number, periodMs: number, phase = 0): Path {
  return (t) => {
    const a = phase + (2 * Math.PI * t) / periodMs;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
}

/**
 * Hangs `length` px under the pivot (px, py) and swings `amp` radians either side of straight
 * down, once every `periodMs`, starting `phase` radians into the swing. Slow at the ends of the
 * arc and fastest through the bottom, like a pendulum. What hangs from it leans along the rope.
 */
export function swing(px: number, py: number, length: number, amp: number, periodMs: number, phase = 0): Path {
  return (t) => {
    const a = amp * Math.sin(phase + (2 * Math.PI * t) / periodMs);
    return { x: px + length * Math.sin(a), y: py + length * Math.cos(a), angle: -a };
  };
}

/** Back and forth between `lo` and `hi` on the line `y`, at `speed` px/s, starting at `x`. */
export function shuttle(lo: number, hi: number, y: number, speed: number, x = lo): Path {
  const span = hi - lo;
  return (t) => {
    if (!(span > 0)) return { x: lo, y };
    const run = ((x - lo + (speed * t) / 1000) % (2 * span) + 2 * span) % (2 * span);
    return { x: lo + (run <= span ? run : 2 * span - run), y };
  };
}

/**
 * `first` until `afterMs`, then whatever `next` makes of where `first` left off. Not named `then`:
 * a module exporting `then` is a thenable, and `await import()` of it never yields the module.
 */
export function chain(first: Path, afterMs: number, next: (from: Point) => Path): Path {
  const rest = next(first(afterMs));
  return (t) => (t < afterMs ? first(t) : rest(t - afterMs));
}

/** The least pull of a magnet, in px/s, so something far away still comes in briskly. */
export const MAGNET_MIN_SPEED = 260;

/**
 * One step of a magnet's pull from `pos` toward `target`: `strength` is the speed per px of
 * distance, per second, on top of the least pull. Never overshoots, so it always arrives.
 */
export function magnet(pos: Point, target: Point, strength: number, dtMs: number): Point {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const far = Math.hypot(dx, dy);
  const step = ((MAGNET_MIN_SPEED + far * Math.max(0, strength)) * Math.max(0, dtMs)) / 1000;
  if (far <= step || far === 0) return { x: target.x, y: target.y };
  return { x: pos.x + (dx / far) * step, y: pos.y + (dy / far) * step };
}
