import { lerp, lerpColor } from './ease';

/**
 * A color grade: what the camera's color matrix and vignette do to the whole picture. Every field
 * at its neutral value leaves the image alone, so grades blend by plain interpolation.
 */
export interface Grade {
  /** -1 is gray, 0 untouched, 1 doubly saturated. */
  saturation: number;
  /** Multiplier: 1 untouched. */
  brightness: number;
  /** -1 flat, 0 untouched, 1 harsh. */
  contrast: number;
  /** Hue rotation in degrees. */
  hue: number;
  /** 0..1 mix toward sepia. */
  sepia: number;
  /** Multiply color, and how far toward it, 0..1. */
  tint: number;
  tintAmount: number;
  /** 0..1 darkening toward the corners. */
  vignette: number;
  /** Where the vignette starts, 0 (center) .. 1 (corners). */
  vignetteRadius: number;
  vignetteColor: number;
  /** 0..1 soft blur over the whole picture, for memories and dreams. High tier only. */
  soften: number;
  /**
   * 0..1 of a two-color map over the picture: brightness becomes a blend from `duoShadow` to
   * `duoLight`. Print-like black and white, or an old photograph. Applied after the matrix.
   */
  duotone: number;
  duoShadow: number;
  duoLight: number;
}

export const NEUTRAL: Readonly<Grade> = {
  saturation: 0,
  brightness: 1,
  contrast: 0,
  hue: 0,
  sepia: 0,
  tint: 0xffffff,
  tintAmount: 0,
  vignette: 0,
  vignetteRadius: 0.8,
  vignetteColor: 0x000000,
  soften: 0,
  duotone: 0,
  duoShadow: 0x000000,
  duoLight: 0xffffff,
};

const grade = (g: Partial<Grade>): Grade => ({ ...NEUTRAL, ...g });

/** Named moods. Scripts ask for these by name and may override single fields. */
export const GRADES = {
  neutral: grade({}),
  /** Forge light: warm, a little richer, dark-red corners. */
  ember: grade({
    saturation: 0.12,
    contrast: 0.08,
    tint: 0xffc890,
    tintAmount: 0.22,
    vignette: 0.28,
    vignetteRadius: 0.72,
    vignetteColor: 0x1a0500,
  }),
  /** Late, fading light. */
  dusk: grade({
    saturation: -0.15,
    brightness: 0.92,
    tint: 0xffb08a,
    tintAmount: 0.22,
    vignette: 0.3,
    vignetteRadius: 0.75,
  }),
  /** Cold stone and candle: blue, drained, deep corners. */
  crypt: grade({
    saturation: -0.3,
    brightness: 0.92,
    contrast: 0.1,
    tint: 0xa8c0ff,
    tintAmount: 0.28,
    vignette: 0.35,
    vignetteRadius: 0.7,
    vignetteColor: 0x05040f,
  }),
  /** Plain black and white. */
  bw: grade({ saturation: -1 }),
  /** Hard black and white with heavy corners. */
  noir: grade({
    saturation: -1,
    contrast: 0.35,
    brightness: 0.95,
    vignette: 0.45,
    vignetteRadius: 0.6,
    duotone: 0.6,
    duoShadow: 0x050608,
    duoLight: 0xf4f1ea,
  }),
  /** A memory: sepia, soft, faded. */
  memory: grade({
    saturation: -0.2,
    brightness: 1.05,
    contrast: -0.12,
    sepia: 0.8,
    vignette: 0.4,
    vignetteRadius: 0.62,
    vignetteColor: 0x2a1a08,
    soften: 0.5,
    duotone: 0.35,
    duoShadow: 0x24160a,
    duoLight: 0xfff0d0,
  }),
  /** Something is wrong: sick green, drained and dark. */
  dread: grade({
    saturation: -0.55,
    brightness: 0.9,
    contrast: 0.16,
    tint: 0xb8ffc0,
    tintAmount: 0.15,
    vignette: 0.42,
    vignetteRadius: 0.62,
  }),
  /** Machine glow: punchy and cool-violet. */
  neon: grade({
    saturation: 0.45,
    contrast: 0.15,
    tint: 0xd8b8ff,
    tintAmount: 0.12,
    vignette: 0.2,
  }),
  /** Moonlight. */
  night: grade({
    saturation: -0.4,
    brightness: 0.72,
    tint: 0x7090ff,
    tintAmount: 0.42,
    vignette: 0.4,
    vignetteRadius: 0.65,
    vignetteColor: 0x000010,
  }),
} satisfies Record<string, Grade>;

export type GradeId = keyof typeof GRADES;

export function isGradeId(id: string): id is GradeId {
  return Object.prototype.hasOwnProperty.call(GRADES, id);
}

/** A named grade with some fields overridden, or a partial grade over neutral. */
export function resolveGrade(g: GradeId | Partial<Grade>): Grade {
  return typeof g === 'string' ? { ...GRADES[g] } : grade(g);
}

export const GRADE_COLOR_KEYS: ReadonlySet<keyof Grade> = new Set<keyof Grade>([
  'tint',
  'vignetteColor',
  'duoShadow',
  'duoLight',
]);
const COLOR_KEYS = GRADE_COLOR_KEYS;

export function lerpGrade(a: Grade, b: Grade, p: number, out: Grade = { ...a }): Grade {
  for (const k of Object.keys(NEUTRAL) as Array<keyof Grade>) {
    out[k] = COLOR_KEYS.has(k) ? lerpColor(a[k], b[k], p) : lerp(a[k], b[k], p);
  }
  return out;
}

/** True when the grade changes nothing about the colors (the vignette is separate). */
export function isNeutralColor(g: Grade): boolean {
  const e = 1e-4;
  return (
    Math.abs(g.saturation) < e &&
    Math.abs(g.brightness - 1) < e &&
    Math.abs(g.contrast) < e &&
    Math.abs(g.hue % 360) < e &&
    g.sepia < e &&
    (g.tintAmount < e || g.tint === 0xffffff) &&
    g.duotone < e
  );
}

// ---------------------------------------------------------------------------------------------
// The 4x5 color matrix, row-major, offsets in 0..255 the way Phaser's ColorMatrix takes them.

type M = number[];

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** a then b: the matrix that applies `a` first and `b` to its result. */
function then(a: M, b: M): M {
  const out = new Array<number>(20);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? b[r * 5 + 4]! : 0;
      for (let k = 0; k < 4; k++) v += b[r * 5 + k]! * a[k * 5 + c]!;
      out[r * 5 + c] = v;
    }
  }
  return out;
}

function mix(a: readonly number[], b: readonly number[], p: number): M {
  return a.map((v, i) => lerp(v, b[i]!, p));
}

const SEPIA: readonly number[] = [
  0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0,
];

/** The grade's color matrix (vignette and soften are applied by their own filters). */
export function gradeMatrix(g: Grade): number[] {
  let m: M = [...IDENTITY];
  if (g.sepia > 0) m = mix(IDENTITY, SEPIA, Math.min(1, g.sepia));
  if (g.saturation !== 0) {
    // Same formula as Phaser's ColorMatrix.saturate.
    const x = (g.saturation * 2) / 3 + 1;
    const y = (x - 1) * -0.5;
    m = then(m, [x, y, y, 0, 0, y, x, y, 0, 0, y, y, x, 0, 0, 0, 0, 0, 1, 0]);
  }
  if (g.hue % 360 !== 0) {
    const rad = (g.hue / 180) * Math.PI;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lr = 0.213;
    const lg = 0.715;
    const lb = 0.072;
    m = then(m, [
      lr + cos * (1 - lr) + sin * -lr,
      lg + cos * -lg + sin * -lg,
      lb + cos * -lb + sin * (1 - lb),
      0,
      0,
      lr + cos * -lr + sin * 0.143,
      lg + cos * (1 - lg) + sin * 0.14,
      lb + cos * -lb + sin * -0.283,
      0,
      0,
      lr + cos * -lr + sin * -(1 - lr),
      lg + cos * -lg + sin * lg,
      lb + cos * (1 - lb) + sin * lb,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ]);
  }
  if (g.contrast !== 0) {
    const v = g.contrast + 1;
    const o = -128 * (v - 1);
    m = then(m, [v, 0, 0, 0, o, 0, v, 0, 0, o, 0, 0, v, 0, o, 0, 0, 0, 1, 0]);
  }
  if (g.tintAmount > 0) {
    const k = Math.min(1, g.tintAmount);
    const r = lerp(1, ((g.tint >> 16) & 0xff) / 255, k);
    const gr = lerp(1, ((g.tint >> 8) & 0xff) / 255, k);
    const b = lerp(1, (g.tint & 0xff) / 255, k);
    m = then(m, [r, 0, 0, 0, 0, 0, gr, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0]);
  }
  if (g.brightness !== 1) {
    const b = g.brightness;
    m = then(m, [b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0]);
  }
  return m;
}

/**
 * What a multiply tint can do of the grade, for the low tier with no filters: brightness and the
 * tint survive, the rest is lost. Saturation drags the tint toward its own gray.
 */
export function gradeTint(g: Grade): number {
  const k = Math.min(1, g.tintAmount);
  const r = lerp(1, ((g.tint >> 16) & 0xff) / 255, k);
  let gr = lerp(1, ((g.tint >> 8) & 0xff) / 255, k);
  let b = lerp(1, (g.tint & 0xff) / 255, k);
  if (g.sepia > 0) {
    gr *= lerp(1, 0.88, g.sepia);
    b *= lerp(1, 0.68, g.sepia);
  }
  const dark = Math.min(1, g.brightness) * (1 - Math.max(0, -g.saturation) * 0.15);
  const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v * dark)) * 255);
  return (byte(r) << 16) | (byte(gr) << 8) | byte(b);
}
