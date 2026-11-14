import type { Rng } from '../Rng';
import { COLS, type Grid, mirrorCol } from './grid';

/** Rows a pattern may draw in, inclusive. */
export interface Area {
  top: number;
  bottom: number;
}

export interface Pattern {
  id: string;
  /** First tier the pattern can be picked. */
  minTier: number;
  weight: number;
  /** The pattern draws its own steel, so decorate adds no steel accents. */
  steel?: boolean;
  /**
   * Draws a left-right symmetric shape of normal bricks (and structural steel) into `area`,
   * aiming for about `budget` breakable bricks. Fitting and mechanics come afterwards.
   */
  build(g: Grid, rng: Rng, area: Area, budget: number): void;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const even = (n: number) => 2 * Math.round(n / 2);
const height = (a: Area) => a.bottom - a.top + 1;

/** Fills a rectangle on the left and its mirror on the right. */
function fillMirrored(
  g: Grid,
  r: number,
  c: number,
  h: number,
  w: number,
  kind: 'normal' | 'steel' | null,
) {
  g.fill(r, c, h, w, kind);
  g.fill(r, mirrorCol(c + w - 1), h, w, kind);
}

/** A centered run of `w` columns (w even). */
function fillCentered(
  g: Grid,
  r: number,
  h: number,
  w: number,
  kind: 'normal' | 'steel' | null = 'normal',
) {
  g.fill(r, (COLS - w) / 2, h, w, kind);
}

/** True when the rectangle and a one-cell ring around it hold no bricks. Outside the grid counts as empty. */
export function isClear(g: Grid, r: number, c: number, h: number, w: number): boolean {
  for (let y = r - 1; y <= r + h; y++) {
    for (let x = c - 1; x <= c + w; x++) if (g.get(y, x)) return false;
  }
  return true;
}

/**
 * Mirrored blocks with air around each one, until about `budget` bricks are placed or no spot is
 * left. Returns the bricks placed.
 */
export function addBlocks(g: Grid, rng: Rng, area: Area, budget: number, tries = 80): number {
  let placed = 0;
  for (let i = 0; i < tries && placed < budget; i++) {
    const w = rng.int(2, 5);
    const h = rng.int(1, 3);
    const r = rng.int(area.top, area.bottom - h + 1);
    const c = rng.int(0, COLS / 2 - 1 - w);
    if (!isClear(g, r, c, h, w)) continue;
    fillMirrored(g, r, c, h, w, 'normal');
    placed += 2 * w * h;
  }
  return placed;
}

/** Horizontal bands, whole or split down the middle. */
const bands: Pattern = {
  id: 'bands',
  minTier: 1,
  weight: 3,
  build(g, rng, area, budget) {
    const thick = rng.chance(0.6) ? 2 : 1;
    const most = Math.max(2, Math.min(5, Math.floor((height(area) - thick) / (thick + 3)) + 1));
    const n = rng.int(Math.min(3, most), most);
    const step = n > 1 ? Math.floor((height(area) - thick) / (n - 1)) : 0;
    const perRow = budget / n / thick;
    for (let i = 0; i < n; i++) {
      const r = area.top + i * step;
      const w = clamp(even(perRow * rng.float(0.8, 1.2)), 4, COLS);
      if (w >= 10 && w <= 16 && rng.chance(0.4)) {
        const gap = rng.pick([2, 4]);
        const side = Math.min(w / 2, (COLS - gap) / 2);
        fillMirrored(g, r, (COLS - gap) / 2 - side, thick, side, 'normal');
      } else {
        fillCentered(g, r, thick, w);
      }
    }
  },
};

/** Two-wide pillars standing on the near band's side, with caps over the lanes between them. */
const pillars: Pattern = {
  id: 'pillars',
  minTier: 1,
  weight: 2,
  build(g, rng, area, budget) {
    const five = rng.chance(0.5);
    const starts = five ? [1, 5, 9] : [2, 6];
    const caps = rng.chance(0.6) && height(area) >= 8;
    const maxH = height(area) - (caps ? 3 : 0);
    const columns = five ? 5 : 4;
    const avg = budget / (columns * 2);
    const shape = rng.pick(['rise', 'fall', 'wave'] as const);
    starts.forEach((c, i) => {
      const t = starts.length > 1 ? i / (starts.length - 1) : 0;
      const k =
        shape === 'rise' ? 0.6 + 0.8 * t : shape === 'fall' ? 1.4 - 0.8 * t : i % 2 ? 1.3 : 0.7;
      const h = clamp(Math.round(avg * k), 3, maxH);
      fillMirrored(g, area.bottom - h + 1, c, h, 2, 'normal');
    });
    if (caps) {
      for (const c of five ? [3, 7] : [4, 8]) fillMirrored(g, area.top, c, 1, 2, 'normal');
    }
  },
};

/** A centered diamond, sometimes hollow with a prize in the middle. */
const diamond: Pattern = {
  id: 'diamond',
  minTier: 1,
  weight: 2,
  build(g, rng, area, budget) {
    // A diamond w wide holds w * w / 2 bricks.
    let w = clamp(even(Math.sqrt(budget * 2)), 6, 18);
    while (w - 1 > height(area) && w > 6) w -= 2;
    const rows = w - 1;
    const r0 = area.top + rng.int(0, Math.max(0, height(area) - rows));
    const hollow = w >= 12 && rng.chance(0.4);
    for (let i = 0; i < rows; i++) {
      const rowW = 2 + 2 * Math.min(i, rows - 1 - i);
      fillCentered(g, r0 + i, 1, rowW);
      if (hollow && rowW >= 8) fillCentered(g, r0 + i, 1, rowW - 4, null);
    }
    if (hollow) fillCentered(g, r0 + Math.floor(rows / 2) - 1, 2, 2);
  },
};

/** Offset tiers of 2x2 blocks the ball rattles between. */
const lattice: Pattern = {
  id: 'lattice',
  minTier: 1,
  weight: 2,
  build(g, rng, area, budget) {
    const spacing = rng.pick([4, 5]);
    const tiers = Math.floor((height(area) - 2) / spacing) + 1;
    const want = clamp(Math.round(budget / 18), 2, tiers);
    for (let i = 0; i < want; i++) {
      const r = area.top + i * spacing;
      for (const c of i % 2 === 0 ? [1, 5, 9] : [3, 7]) fillMirrored(g, r, c, 2, 2, 'normal');
    }
  },
};

/** Mirrored rectangular islands with air around each one. */
const islands: Pattern = {
  id: 'islands',
  minTier: 1,
  weight: 2,
  build(g, rng, area, budget) {
    let placed = 0;
    if (rng.chance(0.5)) {
      const w = rng.pick([4, 6]);
      const h = rng.int(2, 3);
      const r = rng.int(area.top, area.bottom - h + 1);
      fillCentered(g, r, h, w);
      placed += w * h;
    }
    addBlocks(g, rng, area, budget - placed);
  },
};

/** Cellular-automaton blobs on the left half, mirrored. Organic, but still reads as designed. */
const mirrorNoise: Pattern = {
  id: 'mirrorNoise',
  minTier: 2,
  weight: 2,
  build(g, rng, area, budget) {
    const bandH = clamp(Math.round(budget / 9), 6, height(area));
    const r0 = area.top + rng.int(0, height(area) - bandH);
    const half = COLS / 2;
    let cells = Array.from({ length: bandH }, () =>
      Array.from({ length: half }, () => rng.chance(0.52)),
    );
    const alive = (y: number, x: number): boolean => {
      if (y < 0 || y >= bandH || x < 0 || x >= COLS) return false;
      return cells[y]![x < half ? x : mirrorCol(x)]!;
    };
    for (let pass = 0; pass < 2; pass++) {
      cells = cells.map((row, y) =>
        row.map((on, x) => {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) if ((dy || dx) && alive(y + dy, x + dx)) n++;
          }
          return n >= 5 || (on && n >= 4);
        }),
      );
    }
    cells.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) g.setMirrored(r0 + y, x, 'normal');
      }),
    );
  },
};

/** Flights of steps that meet in the middle as chevrons. */
const stairs: Pattern = {
  id: 'stairs',
  minTier: 2,
  weight: 2,
  build(g, rng, area, budget) {
    const thick = rng.chance(0.5) ? 2 : 1;
    const flightH = 4 * thick + 2;
    const flights = clamp(
      Math.round(budget / (32 * thick)),
      1,
      Math.floor((height(area) + 2) / flightH),
    );
    for (let f = 0; f < flights; f++) {
      const r0 = area.top + f * flightH;
      const inward = (f + (rng.chance(0.5) ? 1 : 0)) % 2 === 0;
      for (let i = 0; i < 4; i++) {
        const c = inward ? i * 2 : 6 - i * 2;
        fillMirrored(g, r0 + i * thick, c, thick, 4, 'normal');
      }
    }
  },
};

/** A two-thick steel frame with a door at the bottom and bricks inside. */
const frame: Pattern = {
  id: 'frame',
  minTier: 4,
  weight: 1.5,
  steel: true,
  build(g, rng, area, budget) {
    const w = rng.pick([14, 16]);
    const h = clamp(rng.int(11, 14), 11, height(area));
    const c0 = (COLS - w) / 2;
    const top = area.top;
    g.fill(top, c0, h, w, 'steel');
    g.fill(top + 2, c0 + 2, h - 4, w - 4, null);
    fillCentered(g, top + h - 2, 2, 4, null);
    const inner = w - 6;
    let placed = 0;
    for (let r = top + 3; r + 1 <= top + h - 4 && placed < budget; r += 3) {
      fillCentered(g, r, 2, inner);
      placed += 2 * inner;
    }
    // Pillars outside the frame, with a lane between them and the steel.
    const pw = c0 - 1;
    if (placed < budget) {
      const ph = clamp(Math.ceil((budget - placed) / (2 * pw)), 2, h);
      fillMirrored(g, top + h - ph, 0, ph, pw, 'normal');
    }
  },
};

export const PATTERNS: readonly Pattern[] = [
  bands,
  pillars,
  diamond,
  lattice,
  islands,
  mirrorNoise,
  stairs,
  frame,
];

export const FALLBACK_PATTERN = bands;

export function patternsFor(tier: number, steelUnlocked: boolean): Pattern[] {
  return PATTERNS.filter((p) => tier >= p.minTier && (!p.steel || steelUnlocked));
}

/**
 * The short segments along the bottom of every board: quick breaks before the structure, and the
 * reason a formation spans the arena. Draws rows `r` and `r + 1` and returns the bricks placed.
 */
export function addNearBand(g: Grid, rng: Rng, r: number): number {
  const before = g.count();
  switch (rng.int(0, 3)) {
    case 0:
      fillMirrored(g, r, 0, 2, 4, 'normal');
      fillCentered(g, r, 2, 4);
      break;
    case 1:
      fillMirrored(g, r, 0, 2, 2, 'normal');
      fillMirrored(g, r, 6, 2, 2, 'normal');
      break;
    case 2:
      fillCentered(g, r + 1, 1, rng.pick([8, 10, 12]));
      fillMirrored(g, r, 0, 1, 2, 'normal');
      break;
    default:
      fillMirrored(g, r + 1, 0, 1, 6, 'normal');
      fillCentered(g, r, 1, 4);
  }
  return g.count() - before;
}

// ---------------------------------------------------------------- Descent strips

export interface Strip {
  id: string;
  weight: number;
  /** Draws a symmetric strip into the whole grid (3-5 rows), aiming for about `budget` bricks. */
  build(g: Grid, rng: Rng, budget: number): void;
}

/** A wall with doorways, or segments. */
const stripBand: Strip = {
  id: 'band',
  weight: 3,
  build(g, rng, budget) {
    const r = rng.int(0, g.rows - 2);
    const thick = budget > 24 ? 2 : 1;
    fillCentered(g, r, thick, COLS);
    const doors = rng.pick([1, 2]);
    for (let i = 0; i < doors; i++) {
      const c = rng.pick([2, 5]) + i * 3;
      fillMirrored(g, r, Math.min(c, 8), thick, 2, null);
    }
  },
};

/** 2x2 blocks on the lattice columns. */
const stripBlocks: Strip = {
  id: 'blocks',
  weight: 2,
  build(g, rng) {
    const r = rng.int(0, g.rows - 2);
    const odd = rng.chance(0.5);
    for (const c of odd ? [1, 5, 9] : [3, 7]) fillMirrored(g, r, c, 2, 2, 'normal');
  },
};

/** A checkerboard a few rows deep. */
const stripChecker: Strip = {
  id: 'checker',
  weight: 2,
  build(g, rng, budget) {
    const rows = clamp(Math.round(budget / 10), 2, g.rows);
    const r0 = g.rows - rows;
    const parity = rng.int(0, 1);
    for (let r = r0; r < g.rows; r++) {
      for (let c = 0; c < COLS / 2; c++) if ((r + c) % 2 === parity) g.setMirrored(r, c, 'normal');
    }
  },
};

/** Mirrored noise, thinned so it never seals a row. */
const stripNoise: Strip = {
  id: 'noise',
  weight: 2,
  build(g, rng, budget) {
    const density = clamp(budget / (g.rows * COLS), 0.25, 0.6);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < COLS / 2; c++) if (rng.chance(density)) g.setMirrored(r, c, 'normal');
    }
  },
};

export const STRIPS: readonly Strip[] = [stripBand, stripBlocks, stripChecker, stripNoise];
