/** Easing curves for cutscene moves, 0..1 in and out. Engine-free so the samplers can be tested. */
export type Ease =
  | 'linear'
  | 'in'
  | 'out'
  | 'inOut'
  | 'sine'
  | 'back'
  | 'expoIn'
  | 'expoOut'
  | 'snap'
  | 'bounce'
  | 'step';

export const EASES: Record<Ease, (p: number) => number> = {
  linear: (p) => p,
  in: (p) => p * p * p,
  out: (p) => 1 - (1 - p) ** 3,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  sine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  back: (p) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
  },
  expoIn: (p) => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
  expoOut: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  /** A whip: almost all of the move in the middle fifth. */
  snap: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  bounce: (p) => {
    const n = 7.5625;
    const d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  },
  step: (p) => (p >= 1 ? 1 : 0),
};

export function ease(kind: Ease | undefined, p: number): number {
  const k = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return EASES[kind ?? 'inOut'](k);
}

export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** Blends two 0xRRGGBB colors channel by channel. */
export function lerpColor(a: number, b: number, p: number): number {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, p));
  const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, p));
  const bl = Math.round(lerp(a & 0xff, b & 0xff, p));
  return (r << 16) | (g << 8) | bl;
}

/**
 * 0..1..0 over `lengthMs`: rises over `inMs`, holds, falls over the last `outMs`. Same shape as
 * the boss cinema's envelope, kept here so the cutscene core imports nothing from the fight.
 */
export function envelope(ms: number, lengthMs: number, inMs: number, outMs: number): number {
  if (ms < 0 || ms > lengthMs) return 0;
  const rise = inMs > 0 ? Math.min(1, ms / inMs) : 1;
  const fall = outMs > 0 ? Math.min(1, (lengthMs - ms) / outMs) : 1;
  return Math.max(0, Math.min(rise, fall));
}
