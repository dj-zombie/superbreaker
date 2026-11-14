import { LEVEL_LIGHTING_DEFAULTS } from '../Lighting';
import { validateLevel } from '../LevelParser';
import { Rng, hashSeed } from '../Rng';
import type { BrickSpec, LevelSpec } from '../types';
import { type CheckRules, checkGrid } from './checks';
import { type GenParams, type Mechanic, MIN_SPAN, isUnlocked, tierParams } from './curve';
import { chooseFeatures, decorate, placePowerups } from './decorate';
import {
  BH,
  BOARD_ROWS,
  type BrickStyle,
  COLOR_MODES,
  COLS,
  Grid,
  PALETTE_IDS,
  isBreakableCell,
  isNormalStatic,
  mirrorCol,
  toBricks,
} from './grid';
import { type Area, STRIPS, addBlocks, addNearBand, patternsFor } from './patterns';

/** Drafts tried before a board falls back to plain bands. */
export const MAX_ATTEMPTS = 8;
/** Empty rows between a board's structure and its near band. */
const NEAR_GAP = 3;

export interface Draft {
  grid: Grid;
  style: BrickStyle;
  pattern: string;
}

export interface GeneratedBoard {
  level: LevelSpec;
  grid: Grid;
  pattern: string;
  /** Drafts tried, counting the fallback. */
  attempts: number;
  fallback: boolean;
  /** First id the next board or chunk should use. */
  nextId: number;
}

/** What every Waves board must pass. */
export function boardRules(p: GenParams): CheckRules {
  return {
    breakables: p.breakables,
    minSpan: MIN_SPAN,
    coins: 1,
    powerups: [3, 6],
    powerupPool: p.powerupPool,
  };
}

function pickStyle(rng: Rng, p: GenParams): BrickStyle {
  return {
    palette: rng.pick(PALETTE_IDS),
    colorMode: rng.pick(COLOR_MODES),
    regenDelay: p.regenDelay,
  };
}

/** Moves the structure up so it starts on the area's top row; the gap above the near band grows. */
function lift(g: Grid, area: Area): void {
  let first = area.top;
  while (first <= area.bottom && g.isRowEmpty(first)) first++;
  const dy = first - area.top;
  if (dy === 0 || first > area.bottom) return;
  for (let r = area.top; r <= area.bottom; r++) {
    for (let c = 0; c < COLS; c++) g.set(r, c, r + dy <= area.bottom ? g.get(r + dy, c) : null);
  }
}

/** Takes the outermost plain bricks (and their mirrors) off the fullest rows until at most `max` are left. */
function trim(g: Grid, max: number, area: Area): void {
  const plain = (r: number, c: number) => {
    const cell = g.get(r, c);
    return !!cell && isNormalStatic(cell);
  };
  let n = g.count(isBreakableCell);
  while (n > max) {
    let row = -1;
    let most = 0;
    for (let r = area.top; r <= area.bottom; r++) {
      const k = g.rowCount(r, isNormalStatic);
      if (k > most) [row, most] = [r, k];
    }
    if (row < 0) return;
    let c = 0;
    while (!plain(row, c)) c++;
    for (const x of new Set([c, mirrorCol(c)])) {
      if (!plain(row, x)) continue;
      g.set(row, x, null);
      n--;
    }
  }
}

/** One attempt at a Waves board. Most pass the checks; the rest get another attempt. */
export function draftBoard(seed: number, tier: number, attempt = 0): Draft {
  const p = tierParams(tier);
  const rng = new Rng(hashSeed(seed, 'board', p.tier, attempt));
  const span = rng.int(p.span[0], p.span[1]);
  const top = rng.int(0, Math.min(3, BOARD_ROWS - span));
  const nearTop = top + span - 2;
  const area: Area = { top, bottom: nearTop - 1 - NEAR_GAP };

  const pattern = rng.weighted(
    patternsFor(p.tier, isUnlocked('steel', p.tier)).map((pt) => [pt, pt.weight] as const),
  );
  const g = new Grid(BOARD_ROWS);
  const near = addNearBand(g, rng.fork('near'), nearTop);
  const target = rng.int(p.breakables[0] + 2, p.breakables[1] - 2);
  pattern.build(g, rng.fork('shape'), area, target - near);
  const short = target - g.count(isBreakableCell);
  if (short > 0) addBlocks(g, rng.fork('top-up'), area, short);
  lift(g, area);
  trim(g, p.breakables[1] - p.movers, area);

  const allowed = p.unlocked.filter((m) => !(pattern.steel && m === 'steel'));
  const features = chooseFeatures(p, rng.fork('features'), allowed);
  decorate(g, rng.fork('decorate'), p, { features, area });
  placePowerups(g, rng.fork('powerups'), {
    coins: 1,
    extra: p.powerups,
    pool: p.powerupPool,
    welcome: { top: nearTop, bottom: nearTop + 1 },
  });
  return { grid: g, style: pickStyle(rng.fork('style'), p), pattern: pattern.id };
}

/** Four plain bands over a three-block near band. Always passes, at every tier. */
export function fallbackBoard(seed: number, tier: number): Draft {
  const p = tierParams(tier);
  const rng = new Rng(hashSeed(seed, 'fallback', p.tier));
  const g = new Grid(BOARD_ROWS);
  const near = 24;
  const w = Math.min(COLS, 2 * Math.ceil((p.breakables[0] - near) / 16));
  for (const r of [1, 6, 11, 16]) g.fill(r, (COLS - w) / 2, 2, w, 'normal');
  g.fill(23, 0, 2, 4, 'normal');
  g.fill(23, 8, 2, 4, 'normal');
  g.fill(23, 16, 2, 4, 'normal');
  trim(g, p.breakables[1], { top: 0, bottom: 17 });
  placePowerups(g, rng.fork('powerups'), {
    coins: 1,
    extra: p.powerups,
    pool: p.powerupPool,
    welcome: { top: 23, bottom: 24 },
  });
  return { grid: g, style: pickStyle(rng.fork('style'), p), pattern: 'fallback' };
}

function boardLevel(seed: number, tier: number, bricks: BrickSpec[]): LevelSpec {
  return {
    id: `arcade-${seed.toString(36)}-${tier}`,
    title: `Wave ${tier}`,
    bricks,
    lights: [],
    lighting: { ...LEVEL_LIGHTING_DEFAULTS },
  };
}

/**
 * The Waves board for a tier of a run. The same seed and tier always give the same board.
 * Brick ids start at `idBase` so they stay unique across the run.
 */
export function generateBoard(seed: number, tier: number, idBase = 1): GeneratedBoard {
  const p = tierParams(tier);
  const rules = boardRules(p);
  const finish = (d: Draft, attempts: number, fallback: boolean): GeneratedBoard | null => {
    const bricks = toBricks(d.grid, d.style, { idBase });
    const level = boardLevel(seed, p.tier, bricks);
    if (!fallback && validateLevel(level).length) return null;
    return {
      level,
      grid: d.grid,
      pattern: d.pattern,
      attempts,
      fallback,
      nextId: idBase + bricks.length,
    };
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const draft = draftBoard(seed, p.tier, attempt);
    if (checkGrid(draft.grid, rules).length) continue;
    const board = finish(draft, attempt + 1, false);
    if (board) return board;
  }
  return finish(fallbackBoard(seed, p.tier), MAX_ATTEMPTS + 1, true)!;
}

// ---------------------------------------------------------------- Descent chunks

/** Mechanics a chunk may carry. Steel could wall off the danger line; regen never settles while rows move. */
export const CHUNK_MECHANICS: readonly Mechanic[] = ['explosive', 'armored', 'mover'];
/** A chunk is small, so one blast may clear more of it than of a board. */
export const CHUNK_MAX_CHAIN = 0.6;

/** Breakable bricks a chunk aims for at a tier. */
export function chunkBudget(tier: number): readonly [number, number] {
  const lo = Math.min(30, 14 + Math.max(1, Math.floor(tier)));
  return [lo, lo + 10];
}

export function chunkRules(p: GenParams, index: number): CheckRules {
  return {
    breakables: [6, chunkBudget(p.tier)[1] + 6],
    noKinds: ['steel', 'regen'],
    coins: index % 2 === 0 ? 1 : 0,
    powerupPool: p.powerupPool,
    maxChain: CHUNK_MAX_CHAIN,
  };
}

/** Mechanic counts scaled down to a chunk's size. */
function chunkParams(p: GenParams): GenParams {
  return {
    ...p,
    steel: 0,
    regenClusters: 0,
    explosives: Math.min(1, p.explosives),
    armored: Math.ceil(p.armored / 3),
    movers: Math.min(1, p.movers),
  };
}

export function draftChunk(seed: number, index: number, tier: number, attempt = 0): Draft {
  const p = chunkParams(tierParams(tier));
  const rng = new Rng(hashSeed(seed, 'chunk', index, attempt));
  const g = new Grid(rng.int(3, 5));
  const strip = rng.weighted(STRIPS.map((s) => [s, s.weight] as const));
  const [lo, hi] = chunkBudget(p.tier);
  strip.build(g, rng.fork('shape'), rng.int(lo, hi));

  const features = chooseFeatures(p, rng.fork('features'), CHUNK_MECHANICS);
  const area: Area = { top: 0, bottom: g.rows - 1 };
  decorate(g, rng.fork('decorate'), p, { features, area, maxChain: CHUNK_MAX_CHAIN });
  placePowerups(g, rng.fork('powerups'), {
    coins: index % 2 === 0 ? 1 : 0,
    extra: p.tier >= 8 ? 2 : 1,
    pool: p.powerupPool,
  });
  return { grid: g, style: pickStyle(rng.fork('style'), p), pattern: strip.id };
}

/** One full row of bricks with a two-wide door on each side. */
function fallbackChunk(seed: number, index: number, tier: number): Draft {
  const p = tierParams(tier);
  const rng = new Rng(hashSeed(seed, 'chunk-fallback', index));
  const g = new Grid(3);
  g.fill(1, 0, 2, COLS, 'normal');
  g.fill(1, 4, 2, 2, null);
  g.fill(1, mirrorCol(5), 2, 2, null);
  placePowerups(g, rng.fork('powerups'), {
    coins: index % 2 === 0 ? 1 : 0,
    extra: 1,
    pool: p.powerupPool,
  });
  return { grid: g, style: pickStyle(rng.fork('style'), p), pattern: 'fallback' };
}

export interface GeneratedChunk {
  /** Rows top to bottom, each at y = 0; the caller places them. Empty rows are kept as gaps. */
  rows: BrickSpec[][];
  pattern: string;
  nextId: number;
}

/** Chunk `index` of a Descent run: a few rows that will enter the field from the top. */
export function generateChunk(
  seed: number,
  index: number,
  tier: number,
  idBase: number,
): GeneratedChunk {
  const p = tierParams(tier);
  const rules = chunkRules(p, index);
  let draft: Draft | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !draft; attempt++) {
    const d = draftChunk(seed, index, p.tier, attempt);
    if (!checkGrid(d.grid, rules).length) draft = d;
  }
  draft ??= fallbackChunk(seed, index, p.tier);

  const rows: BrickSpec[][] = Array.from({ length: draft.grid.rows }, () => []);
  const bricks = toBricks(draft.grid, draft.style, { idBase });
  for (const b of bricks) rows[Math.round(b.y / BH)]!.push({ ...b, y: 0 });
  return { rows, pattern: draft.pattern, nextId: idBase + bricks.length };
}
