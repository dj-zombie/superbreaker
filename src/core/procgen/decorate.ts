import type { Rng } from '../Rng';
import type { PowerupId } from '../types';
import { MAX_CHAIN_FRACTION, MOVER_SPEED, MOVER_TRAVEL, chainSize, chainFraction } from './checks';
import { FRESH_TIERS, MECHANIC_UNLOCK, type GenParams, type Mechanic } from './curve';
import { BW, COLS, type Cell, type Grid, isBreakableCell, isNormalStatic, mirrorCol } from './grid';
import { type Area, isClear } from './patterns';

/**
 * The mechanics this board is about: one to three of the unlocked ones. A mechanic that just
 * unlocked is always featured for its first tiers, so it gets taught before it gets mixed.
 */
export function chooseFeatures(
  p: GenParams,
  rng: Rng,
  allowed: readonly Mechanic[] = p.unlocked,
): Set<Mechanic> {
  const pool = p.unlocked.filter((m) => allowed.includes(m));
  const fresh = pool.filter((m) => p.tier - MECHANIC_UNLOCK[m] < FRESH_TIERS);
  const rest = rng.shuffle(pool.filter((m) => !fresh.includes(m)));
  const want = rng.int(1, 3);
  return new Set([...fresh, ...rest.slice(0, Math.max(0, want - fresh.length))]);
}

export interface DecorateOptions {
  features: ReadonlySet<Mechanic>;
  /** Rows mechanics may use; the near band below stays plain. */
  area: Area;
  /** Worst share of bricks one blast chain may clear. */
  maxChain?: number;
}

/** Turns some normal cells into this board's mechanics. Placements are mirrored, except movers. */
export function decorate(g: Grid, rng: Rng, p: GenParams, opts: DecorateOptions): void {
  const f = opts.features;
  if (f.has('steel')) placeSteel(g, rng.fork('steel'), p.steel, opts.area);
  if (f.has('explosive')) {
    placeExplosives(g, rng.fork('explosive'), p.explosives, opts.area, opts.maxChain);
  }
  if (f.has('armored')) placeArmored(g, rng.fork('armored'), p.armored, p.armor, opts.area);
  if (f.has('regen')) placeRegen(g, rng.fork('regen'), p.regenClusters, opts.area);
  if (f.has('mover')) {
    placeMovers(g, rng.fork('mover'), p.movers, p, opts.area, f.has('armored'));
  }
}

const inArea = (a: Area, r: number) => r >= a.top && r <= a.bottom;

/** One-row steel bars with clear air all around, so they bounce the ball but never seal a pocket. */
export function placeSteel(g: Grid, rng: Rng, cells: number, area: Area): void {
  let placed = 0;
  for (let tries = 0; tries < 60 && placed < cells; tries++) {
    const r = rng.int(area.top, area.bottom);
    const c = rng.int(0, 8);
    if (!isClear(g, r, c, 1, 2) || !isClear(g, r, mirrorCol(c + 1), 1, 2)) continue;
    g.fill(r, c, 1, 2, 'steel');
    g.fill(r, mirrorCol(c + 1), 1, 2, 'steel');
    placed += 4;
  }
}

function breakableNeighbours(g: Grid, r: number, c: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = (dy || dx) && g.get(r + dy, c + dx);
      if (cell && isBreakableCell(cell)) n++;
    }
  }
  return n;
}

/**
 * Bombs inside dense spots, far enough apart that each blast is its own moment. Pairs whose chain
 * would clear too much of the board are turned back into normal bricks.
 */
export function placeExplosives(
  g: Grid,
  rng: Rng,
  count: number,
  area: Area,
  maxChain = MAX_CHAIN_FRACTION,
): void {
  const bombs: Array<[number, number]> = [];
  const spaced = (r: number, c: number) =>
    bombs.every(([br, bc]) => Math.abs(br - r) >= 5 || Math.abs(bc - c) >= 5);
  const spots = rng.shuffle(
    g.positions((cell, r, c) => isNormalStatic(cell) && inArea(area, r) && c < COLS / 2 - 1),
  );
  for (const [r, c] of spots) {
    if (bombs.length >= count) break;
    const m = mirrorCol(c);
    const mirror = g.get(r, m);
    if (!mirror || !isNormalStatic(mirror)) continue;
    if (breakableNeighbours(g, r, c) < 4 || !spaced(r, c) || !spaced(r, m)) continue;
    g.setMirrored(r, c, 'explosive');
    bombs.push([r, c], [r, m]);
  }
  while (chainFraction(g) > maxChain) {
    const live = g.positions((cell) => cell.kind === 'explosive');
    if (!live.length) break;
    const [r, c] = live.reduce((a, b) => (chainSize(g, ...b) > chainSize(g, ...a) ? b : a));
    g.set(r, c, 'normal');
    if (g.get(r, mirrorCol(c))?.kind === 'explosive') g.set(r, mirrorCol(c), 'normal');
  }
}

/** Alternate cells along the fullest rows, like the campaign's Plated. */
export function placeArmored(g: Grid, rng: Rng, count: number, armor: number, area: Area): void {
  const rows: number[] = [];
  for (let r = area.top; r <= area.bottom; r++) rows.push(r);
  rng.shuffle(rows);
  rows.sort((a, b) => g.rowCount(b, isNormalStatic) - g.rowCount(a, isNormalStatic));
  let placed = 0;
  for (const r of rows) {
    if (placed >= count) break;
    const parity = rng.int(0, 1);
    for (let c = 0; c < COLS / 2 && placed < count; c++) {
      if (c % 2 !== parity) continue;
      const cell = g.get(r, c);
      const mirror = g.get(r, mirrorCol(c));
      if (!cell || !mirror || !isNormalStatic(cell) || !isNormalStatic(mirror)) continue;
      g.setMirrored(r, c, { kind: 'armored', armor });
      placed += 2;
    }
  }
}

const REGEN_SHAPES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [1, 3],
  [2, 3],
  [3, 2],
  [1, 2],
];

/** Small regen patches on normal bricks, never touching another patch. */
export function placeRegen(g: Grid, rng: Rng, clusters: number, area: Area): void {
  let placed = 0;
  for (let tries = 0; tries < 80 && placed < clusters; tries++) {
    const [h, w] = rng.pick(REGEN_SHAPES);
    const r = rng.int(area.top, area.bottom - h + 1);
    // Keeping the patch off the two center columns stops it merging with its own mirror.
    const c = rng.int(0, COLS / 2 - 1 - w);
    let ok = true;
    for (let y = r - 1; y <= r + h && ok; y++) {
      for (let x = c - 1; x <= c + w && ok; x++) {
        const cell = g.get(y, x);
        const inside = y >= r && y < r + h && x >= c && x < c + w;
        if (inside ? !cell || !isNormalStatic(cell) : cell?.kind === 'regen') ok = false;
      }
    }
    if (!ok) continue;
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) g.setMirrored(y, x, 'regen');
    }
    placed += 2;
  }
}

/** A lone brick sliding along an empty row. Movers aren't mirrored; they never sit still anyway. */
export function placeMovers(
  g: Grid,
  rng: Rng,
  count: number,
  p: GenParams,
  area: Area,
  armoredOk: boolean,
): void {
  const lanes: number[] = [];
  for (let r = area.top; r <= area.bottom; r++) if (g.isRowEmpty(r)) lanes.push(r);
  rng.shuffle(lanes);
  for (const r of lanes.slice(0, count)) {
    const cols = rng.int(MOVER_TRAVEL[0] / BW, MOVER_TRAVEL[1] / BW);
    const fromLeft = rng.chance(0.5);
    const c = fromLeft ? rng.int(0, COLS - 1 - cols) : rng.int(cols, COLS - 1);
    const speed = Math.min(MOVER_SPEED[1], rng.int(MOVER_SPEED[0] + 4, 56 + p.tier));
    const cell: Cell =
      armoredOk && rng.chance(0.3) ? { kind: 'armored', armor: p.armor } : { kind: 'normal' };
    cell.moveX = (fromLeft ? 1 : -1) * cols * BW;
    cell.moveSpeed = speed;
    g.set(r, c, cell);
  }
}

export interface PowerupOptions {
  coins: number;
  extra: number;
  pool: readonly PowerupId[];
  /** One drop goes in these rows first, so an early break pays out. */
  welcome?: Area;
}

/** A coin and a few powerups on plain bricks, spread out across the board. */
export function placePowerups(g: Grid, rng: Rng, opts: PowerupOptions): void {
  const ids: PowerupId[] = Array.from({ length: opts.coins }, () => 'coin' as const);
  const pool = rng.shuffle([...opts.pool]);
  for (let i = 0; i < opts.extra && pool.length; i++) ids.push(pool[i % pool.length]!);
  rng.shuffle(ids);

  const spots = rng.shuffle(g.positions(isNormalStatic));
  const chosen: Array<[number, number]> = [];
  const far = ([r, c]: [number, number]) =>
    chosen.every(([cr, cc]) => Math.abs(cr - r) + Math.abs(cc - c) >= 3);
  const take = (pred: (s: [number, number]) => boolean): [number, number] | undefined => {
    const i = spots.findIndex(pred);
    return i < 0 ? undefined : spots.splice(i, 1)[0];
  };
  for (const [i, id] of ids.entries()) {
    const welcome = opts.welcome;
    const spot =
      (i === 0 && welcome && take(([r]) => inArea(welcome, r))) || take(far) || take(() => true);
    if (!spot) return;
    chosen.push(spot);
    g.get(spot[0], spot[1])!.powerup = id;
  }
}
