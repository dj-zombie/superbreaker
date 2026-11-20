/**
 * Engine-free lighting math shared by the light map, the brick tints and the level parser.
 * Brightness is linear: 1 leaves art as painted, below 1 darkens, above 1 brightens.
 */

export const FLICKERS = [
  'steady',
  'candle',
  'torch',
  'pulse',
  'breathe',
  'strobe',
  'glitch',
] as const;
export type Flicker = (typeof FLICKERS)[number];

/** Which layers a light reaches: the painted backdrop, the bricks and paddle, or both. */
export const LIGHT_AFFECTS = ['both', 'backdrop', 'bricks'] as const;
export type LightAffects = (typeof LIGHT_AFFECTS)[number];

/** Patterned light textures. `shaft` is a god ray, `stained` a church window, `grille` a vent. */
export const COOKIES = ['none', 'shaft', 'stained', 'grille'] as const;
export type Cookie = (typeof COOKIES)[number];

/**
 * World ambience effects. `world` uses the world's own; `none` turns them off. `party` is a bonus
 * stage's: it keeps time with the music and gets wilder with the combo.
 */
export const MOODS = ['world', 'none', 'forge', 'storm', 'beat', 'party'] as const;
export type Mood = (typeof MOODS)[number];

/** WCAG 2.3.1: never more than three flashes in any one second. */
export const MAX_FLASH_HZ = 2.5;

/** A light authored in Tiled, in level coordinates (before LEVEL_OFFSET_Y). */
export interface LightSpec {
  /** Tiled object id. */
  id: number;
  /** `point` is radial, `area` a (rotated) rectangle, `path` a radial light moving on a polyline. */
  kind: 'point' | 'area' | 'path';
  /** Point and path: the center. Area: the top-left corner, which is also the rotation pivot. */
  x: number;
  y: number;
  radius: number;
  /** Area lights only. */
  width: number;
  height: number;
  /** Degrees clockwise, as Tiled stores it. */
  rotation: number;
  /** Path lights only: absolute points. */
  path: Array<{ x: number; y: number }>;
  color: number;
  intensity: number;
  flicker: Flicker;
  /** Flicker or pulse rate multiplier; path lights use it as units per second / 60. */
  speed: number;
  /** Seconds added to the flicker clock so neighbours don't flicker in sync. */
  phase: number;
  affects: LightAffects;
  cookie: Cookie;
  /** Path lights: bounce back at the end instead of jumping to the start. */
  pingpong: boolean;
  /** High tier: also lights brick and paddle bevels per pixel (point and path lights). */
  relief: boolean;
}

/** Per-level overrides; anything left undefined falls back to the world look. */
export interface LevelLightingSpec {
  ambient?: number;
  backdropStrength?: number;
  brickFloor?: number;
  vignette?: number;
  mood: Mood;
  lightsOut: boolean;
  /** Lights out: 0 leaves the level dimly visible, 1 shows only what lights reach. */
  darkness?: number;
  /** Lights out: the ball's light radius in playfield units. */
  lanternRadius?: number;
  /** Lights out: seconds the layout stays lit before the lights go. */
  previewTime?: number;
  /** Lightning strikes; on lights-out levels each one briefly shows the layout. */
  lightning: boolean;
  /** Average seconds between strikes. */
  lightningInterval: number;
  /** Lights out: the dead room lights sputter back on now and then, buzzing, and die again. */
  sputter: boolean;
}

/** Defaults for the `Light` class in superbreaker.tiled-project. Keep the two in sync. */
export const LIGHT_DEFAULTS = {
  color: 0xffc070,
  intensity: 0.6,
  radius: 96,
  flicker: 'steady' as Flicker,
  speed: 1,
  phase: 0,
  affects: 'both' as LightAffects,
  cookie: 'none' as Cookie,
  pingpong: true,
  relief: false,
};

/** Defaults for the `LevelLighting` class. Unset numbers mean "use the world look". */
export const LEVEL_LIGHTING_DEFAULTS: LevelLightingSpec = {
  mood: 'world',
  lightsOut: false,
  lightning: false,
  lightningInterval: 6,
  sputter: true,
};

/** Lights-out values when the map leaves them at -1. */
export const LIGHTS_OUT_DEFAULTS = { darkness: 0.75, previewTime: 0 };

/** Lightning strikes never come closer together than this, whatever the map asks for. */
export const MIN_LIGHTNING_INTERVAL = 3;

// ---------------------------------------------------------------- color

/** Tiled writes colors as `#AARRGGBB` or `#RRGGBB`. Alpha is ignored. Empty means unset. */
export function parseColor(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v & 0xffffff;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/^#|^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(s)) return undefined;
  if (s.length === 8) return parseInt(s.slice(2), 16);
  if (s.length === 6) return parseInt(s, 16);
  if (s.length === 3)
    return parseInt(
      s.replace(/./g, (c) => c + c),
      16,
    );
  return undefined;
}

export function red(c: number): number {
  return ((c >> 16) & 255) / 255;
}
export function green(c: number): number {
  return ((c >> 8) & 255) / 255;
}
export function blue(c: number): number {
  return (c & 255) / 255;
}

export function rgbToColor(r: number, g: number, b: number): number {
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

export function scaleColor(c: number, k: number): number {
  return rgbToColor(red(c) * k, green(c) * k, blue(c) * k);
}

export function mixColor(a: number, b: number, t: number): number {
  return rgbToColor(
    red(a) + (red(b) - red(a)) * t,
    green(a) + (green(b) - green(a)) * t,
    blue(a) + (blue(b) - blue(a)) * t,
  );
}

export function luminance(c: number): number {
  return red(c) * 0.3 + green(c) * 0.59 + blue(c) * 0.11;
}

// ---------------------------------------------------------------- falloff and flicker

/** Smooth radial falloff, 1 at the center and 0 at `radius`. Matches the light map texture. */
export function falloff(d2: number, radius: number): number {
  const r2 = radius * radius;
  if (d2 >= r2) return 0;
  const q = 1 - d2 / r2;
  return q * q;
}

/** Deterministic hash of an integer into [0, 1). */
export function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function noise1(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i);
  return a + (hash(i + 1) - a) * u;
}

/** Glitch drop-outs happen on a 1/6 s grid and never two slots in a row, so at most 3 per second. */
function glitchDrop(slot: number): boolean {
  const p = 0.1;
  return hash(slot * 7 + 1) < p && hash((slot - 1) * 7 + 1) >= p && hash((slot - 2) * 7 + 1) >= p;
}

/**
 * Brightness multiplier for a flicker preset at time `t` (seconds), roughly in [0.15, 1].
 * `calm` (reduced motion) keeps a gentle shimmer and drops strobes and glitches entirely.
 */
export function flickerAt(kind: Flicker, t: number, speed = 1, calm = false): number {
  const s = Math.max(0.05, speed);
  switch (kind) {
    case 'steady':
      return 1;
    case 'candle': {
      const n = noise1(t * 7 * s) * 0.6 + noise1(t * 17 * s + 31) * 0.4;
      return calm ? 0.95 + 0.05 * n : 0.76 + 0.24 * n;
    }
    case 'torch': {
      const n =
        noise1(t * 4 * s) * 0.5 + noise1(t * 9 * s + 7) * 0.3 + noise1(t * 21 * s + 3) * 0.2;
      return calm ? 0.93 + 0.07 * n : 0.6 + 0.4 * n;
    }
    case 'pulse': {
      const w = 0.5 + 0.5 * Math.sin(t * s * Math.PI * 2);
      return calm ? 0.85 + 0.15 * w : 0.45 + 0.55 * w;
    }
    case 'breathe': {
      const w = 0.5 + 0.5 * Math.sin(t * s * Math.PI * 0.5);
      return calm ? 0.9 + 0.1 * w : 0.7 + 0.3 * w;
    }
    case 'strobe': {
      if (calm) return 0.8;
      const hz = Math.min(s, MAX_FLASH_HZ);
      return (t * hz) % 1 < 0.5 ? 1 : 0.15;
    }
    case 'glitch': {
      if (calm) return 1;
      return glitchDrop(Math.floor(t * 6 * s)) ? 0.2 : 1;
    }
  }
}

/** One blink of a failing light: on at `at` seconds for `hold` seconds, at `level` (0..1). */
export interface Blink {
  at: number;
  hold: number;
  level: number;
}

/**
 * A dead light trying to come back on: two to five irregular blinks, sometimes ending in a
 * longer hold. Each blink is a whole-screen flash, so no more than MAX_FLASH_HZ of them start
 * in any one second, however the dice fall.
 */
export function sputter(random: () => number = Math.random): Blink[] {
  const range = (a: number, b: number) => a + random() * (b - a);
  const perSecond = Math.floor(MAX_FLASH_HZ);
  const count = 2 + Math.floor(random() * 4);
  const blinks: Blink[] = [];
  for (let i = 0; i < count; i++) {
    const prev = blinks[i - 1];
    let at = 0;
    if (prev) {
      // Quick stutters, then a pause long enough to wonder whether it's over.
      at = prev.at + prev.hold + (random() < 0.5 ? range(0.06, 0.14) : range(0.3, 0.7));
      const window = blinks[i - perSecond];
      if (window) at = Math.max(at, window.at + 1.05);
    }
    const long = i === count - 1 && random() < 0.4;
    blinks.push({
      at,
      hold: long ? range(0.5, 1.1) : range(0.05, 0.12),
      level: long ? range(0.5, 0.7) : range(0.3, 0.6),
    });
  }
  return blinks;
}

// ---------------------------------------------------------------- paths

/** Position at `distance` along a polyline; loops, or bounces back and forth with `pingpong`. */
export function pointOnPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  distance: number,
  pingpong: boolean,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  const lengths: number[] = [];
  let total = 0;
  const segments = pingpong ? points.length - 1 : points.length;
  for (let i = 0; i < segments; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(l);
    total += l;
  }
  if (total <= 0) return { ...points[0]! };
  let d: number;
  if (pingpong) {
    const m = ((distance % (2 * total)) + 2 * total) % (2 * total);
    d = m > total ? 2 * total - m : m;
  } else {
    d = ((distance % total) + total) % total;
  }
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i]!;
    if (d <= l || i === lengths.length - 1) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const t = l > 0 ? Math.min(1, d / l) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= l;
  }
  return { ...points[0]! };
}

// ---------------------------------------------------------------- sampling

/** A light reduced to what the CPU sampler needs, with flicker and intensity already applied. */
export interface SampleLight {
  x: number;
  y: number;
  radius: number;
  /** Color times brightness; negative lights darken. */
  r: number;
  g: number;
  b: number;
  /** Area lights: rectangle in its own rotated frame, with the pivot at (x, y). */
  area?: { width: number; height: number; cos: number; sin: number; shaft: boolean };
}

function smoothEdge(d: number, feather: number): number {
  if (d <= 0) return 0;
  if (d >= feather) return 1;
  const t = d / feather;
  return t * t * (3 - 2 * t);
}

/** Contribution of one light at (x, y), as a 0..1 weight before color. */
export function lightWeight(l: SampleLight, x: number, y: number): number {
  const dx = x - l.x;
  const dy = y - l.y;
  if (!l.area) return falloff(dx * dx + dy * dy, l.radius);
  const a = l.area;
  // Rotate into the rectangle's frame: Tiled rotates clockwise around the top-left corner.
  const lx = dx * a.cos + dy * a.sin;
  const ly = -dx * a.sin + dy * a.cos;
  if (lx < 0 || ly < 0 || lx > a.width || ly > a.height) return 0;
  const fx = Math.max(4, a.width * 0.3);
  const fy = Math.max(4, a.height * 0.3);
  const edge =
    smoothEdge(Math.min(lx, a.width - lx), fx) * smoothEdge(Math.min(ly, a.height - ly), fy);
  return a.shaft ? edge * (1 - (ly / a.height) * 0.75) : edge;
}

/** Bounding radius used for culling, measured from (x, y). */
export function reach(l: SampleLight): number {
  return l.area ? Math.hypot(l.area.width, l.area.height) : l.radius;
}

/** Adds every light's color at (x, y) into `out[i..i+2]`. */
export function accumulate(
  lights: readonly SampleLight[],
  x: number,
  y: number,
  out: Float32Array,
  i: number,
): void {
  for (const l of lights) {
    const w = lightWeight(l, x, y);
    if (w <= 0) continue;
    out[i] = out[i]! + l.r * w;
    out[i + 1] = out[i + 1]! + l.g * w;
    out[i + 2] = out[i + 2]! + l.b * w;
  }
}

// ---------------------------------------------------------------- budget

export interface Budgeted {
  x: number;
  y: number;
  radius: number;
  /** Higher survives first: gameplay lights (balls, explosions) outrank decoration. */
  priority: number;
  /** Current brightness, used to rank lights of equal priority. */
  level: number;
}

/**
 * Lights that touch the view, highest priority first, then the brightest and largest,
 * capped at `cap`. Lights fully outside `view` are dropped.
 */
export function selectLights<T extends Budgeted>(
  lights: readonly T[],
  cap: number,
  view: { x: number; y: number; width: number; height: number },
): T[] {
  const visible = lights.filter(
    (l) =>
      l.level > 0.002 &&
      l.x + l.radius > view.x &&
      l.x - l.radius < view.x + view.width &&
      l.y + l.radius > view.y &&
      l.y - l.radius < view.y + view.height,
  );
  if (visible.length <= cap) return visible;
  return visible
    .sort((a, b) => b.priority - a.priority || b.level * b.radius - a.level * a.radius)
    .slice(0, cap);
}
