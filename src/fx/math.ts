/** Engine-free helpers for the particle engine, kept apart so they can be unit tested. */

/** A fixed value, or a [min, max] pair rolled uniformly for each particle. */
export type Range = number | readonly [number, number];

export function roll(r: Range | undefined, fallback = 0, rnd: () => number = Math.random): number {
  if (r === undefined) return fallback;
  if (typeof r === 'number') return r;
  return r[0] + (r[1] - r[0]) * rnd();
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How a size moves from its start toward `start * grow` over a particle's life. */
export type SizeEase = 'linear' | 'out' | 'in' | 'expo' | 'pop' | 'pulse';

/** Alpha envelope over a particle's life, multiplied by its peak alpha. */
export type Fade = 'linear' | 'late' | 'inOut' | 'quick' | 'flicker' | 'none' | 'in';

/** 0..1 progress of a size from start (0) to end (1). `pop` overshoots early and settles. */
export function sizeCurve(ease: SizeEase, t: number): number {
  switch (ease) {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'expo':
      return t >= 1 ? 1 : 1 - Math.pow(2, -9 * t);
    case 'pop':
      // Starts at 0, punches past the end by 30% at t = 0.18, then eases back.
      return t < 0.18 ? (t / 0.18) * 1.3 : 1.3 - 0.3 * clamp01((t - 0.18) / 0.5);
    case 'pulse':
      return 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
    case 'out':
    default:
      return 1 - (1 - t) * (1 - t);
  }
}

/** `jitter` (0..1) feeds the flicker envelope. */
export function fadeCurve(fade: Fade, t: number, jitter = 0.5): number {
  switch (fade) {
    case 'none':
      return 1;
    case 'in':
      return clamp01(t / 0.25);
    case 'late':
      return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    case 'inOut':
      return Math.pow(Math.sin(Math.PI * clamp01(t)), 0.7);
    case 'quick':
      return t < 0.08 ? t / 0.08 : (1 - t) * (1 - t);
    case 'flicker':
      return (1 - t) * (0.55 + 0.45 * jitter);
    case 'linear':
    default:
      return 1 - t;
  }
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = ar + (((b >> 16) & 0xff) - ar) * t;
  const g = ag + (((b >> 8) & 0xff) - ag) * t;
  const bl = ab + ((b & 0xff) - ab) * t;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

/** Color at `t` along evenly spaced stops. */
export function rampColor(stops: readonly number[], t: number): number {
  const n = stops.length;
  if (n === 0) return 0xffffff;
  if (n === 1 || t <= 0) return stops[0]!;
  if (t >= 1) return stops[n - 1]!;
  const f = t * (n - 1);
  const i = Math.floor(f);
  return lerpColor(stops[i]!, stops[i + 1]!, f - i);
}

/** Channel-wise multiply, for tinting a palette color by a caller's tint. */
export function multiplyColor(a: number, b: number): number {
  const r = (((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255;
  const g = (((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255;
  const bl = ((a & 0xff) * (b & 0xff)) / 255;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

/** Moves a color toward white by `k` (0..1). */
export function lighten(c: number, k: number): number {
  return lerpColor(c, 0xffffff, k);
}

/** Moves a color toward black by `k` (0..1). */
export function darken(c: number, k: number): number {
  return lerpColor(c, 0x000000, k);
}

/** Small seeded generator, so painted textures come out the same every launch. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Splits what is left of a frame's particle budget over a burst's layers. Each layer keeps its
 * share of the request; essential layers keep at least one particle so a hit never goes unseen.
 */
export function shareBudget(
  wants: readonly number[],
  essential: readonly boolean[],
  left: number,
): number[] {
  const total = wants.reduce((s, n) => s + n, 0);
  if (total <= 0) return wants.map(() => 0);
  const k = total <= left ? 1 : Math.max(0, left) / total;
  return wants.map((n, i) => {
    const got = Math.floor(n * k + 0.5);
    return essential[i] && n > 0 ? Math.max(1, got) : got;
  });
}

/** Particle count multiplier for a quality tier. */
export function tierScale(tier: 'low' | 'medium' | 'high'): number {
  return tier === 'high' ? 1 : tier === 'medium' ? 0.75 : 0.5;
}

export function tierRank(tier: 'low' | 'medium' | 'high'): number {
  return tier === 'high' ? 2 : tier === 'medium' ? 1 : 0;
}

/**
 * A divergence-free flow field (the curl of a sum of sines), so smoke swirls without bunching up.
 * Returns the velocity direction at (x, y) at time `t` seconds into `out`.
 */
export function curl(x: number, y: number, t: number, out: { x: number; y: number }): void {
  const a = 0.021;
  const b = 0.017;
  const d = 0.013;
  const p = a * x + t * 0.9;
  const q = b * y - t * 0.6;
  const r = d * (x + y) + t * 1.3;
  const dpdx = a * Math.cos(p) * Math.cos(q) + d * Math.cos(r);
  const dpdy = -b * Math.sin(p) * Math.sin(q) + d * Math.cos(r);
  // Normalised by the largest gradient the sum can reach, so strength reads as px/s².
  const n = 1 / (a + b + d);
  out.x = dpdy * n;
  out.y = -dpdx * n;
}
