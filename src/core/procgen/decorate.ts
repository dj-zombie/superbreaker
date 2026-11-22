import type { Rng } from '../Rng';
import type { PowerupId } from '../types';
import {
  MAX_CHAIN_FRACTION,
  MOVER_SPEED,
  MOVER_TRAVEL,
  chainSize,
  chainFraction,
  isEnclosed,
} from './checks';
import { FRESH_TIERS, MECHANIC_UNLOCK, type GenParams, type Mechanic } from './curve';
import {
  BW,
  COLS,
  type Cell,
  type Grid,
  PORTAL_ROWS,
  isBreakableCell,
  isNormalStatic,
  mirrorCol,
} from './grid';
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
  /** Most breakable bricks the board may end with; fuse cords drawn through air count. */
  maxBreakables?: number;
}

/**
 * Turns some normal cells into this board's mechanics. Placements are mirrored, except movers
 * and a lone virus core. Portals go last, into air nothing else wants.
 */
export function decorate(g: Grid, rng: Rng, p: GenParams, opts: DecorateOptions): void {
  const f = opts.features;
  if (f.has('steel')) placeSteel(g, rng.fork('steel'), p.steel, opts.area);
  if (f.has('explosive')) {
    placeExplosives(g, rng.fork('explosive'), p.explosives, opts.area, opts.maxChain);
  }
  if (f.has('fuse')) {
    const room = (opts.maxBreakables ?? Infinity) - g.count(isBreakableCell);
    placeFuses(g, rng.fork('fuse'), p.fuseCords, opts.area, Math.max(0, room), opts.maxChain);
  }
  if (f.has('armored')) placeArmored(g, rng.fork('armored'), p.armored, p.armor, opts.area);
  if (f.has('regen')) placeRegen(g, rng.fork('regen'), p.regenClusters, opts.area);
  if (f.has('phantom')) placePhantoms(g, rng.fork('phantom'), p.phantoms, opts.area);
  if (f.has('virus')) placeVirus(g, rng.fork('virus'), p.virusCores, opts.area);
  if (f.has('mover')) {
    placeMovers(g, rng.fork('mover'), p.movers, p, opts.area, f.has('armored'));
  }
  if (f.has('portal')) placePortals(g, rng.fork('portal'), p.portalLinks, opts.area);
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

/** Cords keep to these columns, so a cord never touches its own mirror. */
const CORD_MAX_COL = COLS / 2 - 3;
/** Down, sideways or diagonally down: a cord hangs, it never climbs back on itself. */
const CORD_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
];

/**
 * Mirrored fuse cords, 3-6 bricks long, through plain bricks or air. When the board has bombs, a
 * cord usually hangs off one, so lighting its tip is a trick shot. Cords drawn through air spend
 * `room`; pairs whose chain would clear too much are put back.
 */
export function placeFuses(
  g: Grid,
  rng: Rng,
  cords: number,
  area: Area,
  room: number,
  maxChain = MAX_CHAIN_FRACTION,
): void {
  const ok = (r: number, c: number) => {
    const cell = g.get(r, c);
    return inArea(area, r) && c >= 0 && c <= CORD_MAX_COL && (!cell || isNormalStatic(cell));
  };
  const both = (r: number, c: number) => ok(r, c) && !g.get(r, c) === !g.get(r, mirrorCol(c));
  const bombs = rng.shuffle(
    g.positions((cell, _r, c) => cell.kind === 'explosive' && c <= CORD_MAX_COL),
  );
  const laid: Array<Array<[number, number, Cell | null]>> = [];
  for (let tries = 0; tries < 30 && laid.length * 2 < cords; tries++) {
    let start: [number, number] | undefined;
    const bomb = bombs[laid.length];
    if (bomb && rng.chance(0.7)) start = [bomb[0] + 1, bomb[1]];
    else
      start = rng.pick(
        g.positions((cell, r, c) => isNormalStatic(cell) && both(r, c)).concat([[-1, -1]]),
      );
    if (!start || !both(...start)) continue;
    const cord: Array<[number, number]> = [start];
    let dir = rng.pick(CORD_STEPS);
    const length = rng.int(3, 6);
    for (let i = 1; i < length * 3 && cord.length < length; i++) {
      if (rng.chance(0.35)) {
        const turn = rng.pick(CORD_STEPS);
        if (!(turn[0] === 0 && dir[0] === 0 && turn[1] === -dir[1])) dir = turn;
      }
      const [r, c] = cord[cord.length - 1]!;
      const next: [number, number] = [r + dir[0], c + dir[1]];
      if (both(...next) && !cord.some(([y, x]) => y === next[0] && x === next[1])) cord.push(next);
    }
    const air = cord.filter(([r, c]) => !g.get(r, c)).length * 2;
    if (cord.length < 3 || air > room) continue;
    room -= air;
    const undo: Array<[number, number, Cell | null]> = [];
    for (const [r, c] of cord) {
      for (const x of [c, mirrorCol(c)]) undo.push([r, x, g.get(r, x)]);
      g.setMirrored(r, c, 'fuse');
    }
    laid.push(undo);
  }
  while (laid.length && chainFraction(g) > maxChain) {
    for (const [r, c, cell] of laid.pop()!) g.set(r, c, cell);
  }
}

/**
 * Runs of phantoms along the fullest rows, mirrored, fading in a wave that meets in the middle.
 * The ball passes them as ghosts, so they're never a wall.
 */
export function placePhantoms(g: Grid, rng: Rng, count: number, area: Area): void {
  const rows: number[] = [];
  for (let r = area.top; r <= area.bottom; r++) rows.push(r);
  rng.shuffle(rows);
  rows.sort((a, b) => g.rowCount(b, isNormalStatic) - g.rowCount(a, isNormalStatic));
  const step = rng.pick([0.06, 0.08, 0.1]);
  let placed = 0;
  for (const [i, r] of rows.entries()) {
    if (placed >= count) break;
    const offset = i * 0.37;
    for (let c = 0; c < COLS / 2 && placed < count; c++) {
      const cell = g.get(r, c);
      const mirror = g.get(r, mirrorCol(c));
      if (!cell || !mirror || !isNormalStatic(cell) || !isNormalStatic(mirror)) continue;
      g.setMirrored(r, c, {
        kind: 'phantom',
        props: { phase: +((offset + c * step) % 1).toFixed(3) },
      });
      placed += 2;
    }
  }
}

const plainAround = (g: Grid, r: number, c: number): number =>
  [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ].filter(([y, x]) => {
    const cell = g.get(y!, x!);
    return !!cell && isNormalStatic(cell);
  }).length;

/**
 * Virus cores deep in plain bricks, so the colony has somewhere to grow and the core is a target
 * worth picking out. One core sits on either side; two are mirrored.
 */
export function placeVirus(g: Grid, rng: Rng, cores: number, area: Area): void {
  const fits = (r: number, c: number, plain: number) => {
    const cell = g.get(r, c);
    return !!cell && isNormalStatic(cell) && plainAround(g, r, c) >= plain && !isEnclosed(g, r, c);
  };
  // The deepest spot there is: three plain neighbours if any spot has them, else two.
  for (const plain of [3, 2]) {
    const spots = rng.shuffle(
      g.positions((_, r, c) => inArea(area, r) && c < COLS / 2 - 1 && fits(r, c, plain)),
    );
    const spot = spots.find(([r, c]) => cores < 2 || fits(r, mirrorCol(c), plain));
    if (!spot) continue;
    const [r, c] = spot;
    const core: Cell = { kind: 'virus', props: { source: true } };
    if (cores >= 2) g.setMirrored(r, c, core);
    else g.set(r, rng.chance(0.5) ? c : mirrorCol(c), core);
    return;
  }
}

/**
 * Mirrored portal links: one end low on one side, its twin high on the other, and a second link
 * the other way round. Each end needs air around it and a row free of movers.
 */
export function placePortals(g: Grid, rng: Rng, links: number, area: Area): void {
  if (links < 1) return;
  const moving = (r: number) => g.rowCount(r, (cell) => !!cell.moveX) > 0;
  const fits = (r: number, c: number) =>
    r >= 0 &&
    r + PORTAL_ROWS < g.rows &&
    isClear(g, r, c, PORTAL_ROWS, 1) &&
    isClear(g, r, mirrorCol(c), PORTAL_ROWS, 1) &&
    !moving(r) &&
    !moving(r + 1);
  const spots: Array<[number, number]> = [];
  for (let r = area.top; r <= area.bottom + 1; r++) {
    for (let c = 1; c < COLS / 2 - 1; c++) if (fits(r, c)) spots.push([r, c]);
  }
  if (spots.length < 2) return;
  const lowest = Math.max(...spots.map(([r]) => r));
  const low = rng.pick(spots.filter(([r]) => r >= lowest - 1));
  const high = rng.shuffle(spots.filter(([r]) => r <= low[0] - 4))[0];
  if (!high) return;
  const end = (link: number): Cell => ({ kind: 'portal', props: { link } });
  g.set(low[0], low[1], end(1));
  g.set(high[0], mirrorCol(high[1]), end(1));
  if (links >= 2) {
    g.set(low[0], mirrorCol(low[1]), end(2));
    g.set(high[0], high[1], end(2));
  }
}

/** Alternate cells along the fullest rows, like the campaign's Plated. Never inside a steel frame. */
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
      if (isEnclosed(g, r, c) || isEnclosed(g, r, mirrorCol(c))) continue;
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

/** Small regen patches on normal bricks, never touching another patch or inside a steel frame. */
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
        if (inside) {
          if (!cell || !isNormalStatic(cell)) ok = false;
          else if (isEnclosed(g, y, x) || isEnclosed(g, y, mirrorCol(x))) ok = false;
        } else if (cell?.kind === 'regen') {
          ok = false;
        }
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
