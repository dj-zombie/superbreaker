/** Seconds per fade cycle, unless the brick sets its own `period`. */
export const PHANTOM_PERIOD = 3.2;
export const PHANTOM_MIN_PERIOD = 1.5;
export const PHANTOM_MAX_PERIOD = 8;
/** Parts of the cycle: solid, then fading out, a ghost, then fading back in. */
export const PHANTOM_SOLID = 0.6;
export const PHANTOM_FADE = 0.12;
/** How see-through a ghost is. */
export const PHANTOM_GHOST_ALPHA = 0.18;
/** The flicker that warns a ghost is about to turn solid. */
export const PHANTOM_WARN_MS = 300;

export interface PhantomState {
  /** The ball bounces off it. True while it is at least half visible. */
  solid: boolean;
  alpha: number;
  /** Turning solid soon: it flickers. */
  warning: boolean;
}

export function phantomPeriod(period: number | undefined): number {
  const p = period ?? PHANTOM_PERIOD;
  return Math.min(PHANTOM_MAX_PERIOD, Math.max(PHANTOM_MIN_PERIOD, p));
}

/** Where a phantom is in its cycle at `ms` into the level. */
export function phantomAt(ms: number, period: number, phase = 0): PhantomState {
  const periodMs = phantomPeriod(period) * 1000;
  const u = (((ms / periodMs + phase) % 1) + 1) % 1;
  const outEnd = PHANTOM_SOLID + PHANTOM_FADE;
  const inStart = 1 - PHANTOM_FADE;
  let alpha: number;
  if (u < PHANTOM_SOLID) alpha = 1;
  else if (u < outEnd) alpha = 1 - ((u - PHANTOM_SOLID) / PHANTOM_FADE) * (1 - PHANTOM_GHOST_ALPHA);
  else if (u < inStart) alpha = PHANTOM_GHOST_ALPHA;
  else alpha = PHANTOM_GHOST_ALPHA + ((u - inStart) / PHANTOM_FADE) * (1 - PHANTOM_GHOST_ALPHA);
  const solid = alpha >= 0.5 + PHANTOM_GHOST_ALPHA / 2;
  // Solid again once the fade-in passes its middle.
  const solidAt = inStart + PHANTOM_FADE / 2;
  const untilSolid = (((solidAt - u) % 1) + 1) % 1;
  return { solid, alpha, warning: !solid && untilSolid * periodMs <= PHANTOM_WARN_MS };
}
