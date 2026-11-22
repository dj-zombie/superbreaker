import { ARENA_MIN, BELOW_HUD } from '../Layout';
import { FIELD_WIDTH, type BrickKind, type PowerupId } from '../types';
import { BH, BW, COLS, type Cell, type Grid, PORTAL_ROWS, isBreakableCell } from './grid';

/** EXPLOSION_RADIUS in config.ts. */
const BLAST_R = 52;
/** Half of BALL_SIZE in entities/Ball.ts. */
const BALL_R = 11;
/** Flood resolution in px. Coarser than the campaign builder's 2 px so it can run in game. */
const STEP = 4;
/** The flood covers the smallest arena, from the first brick row down to the paddle. */
const FLOOD_H = ARENA_MIN - BELOW_HUD;

export const MAX_CHAIN_FRACTION = 0.42;
export const MAX_REGEN_CLUSTER = 6;
export const MOVER_TRAVEL = [60, 270] as const;
export const MOVER_SPEED = [36, 90] as const;

function inBlast(ar: number, ac: number, br: number, bc: number): boolean {
  const dx = Math.max(Math.abs(ac - bc) * BW - BW / 2, 0);
  const dy = Math.max(Math.abs(ar - br) * BH - BH / 2, 0);
  return dx * dx + dy * dy <= BLAST_R * BLAST_R;
}

const lights = (cell: Cell | null) => cell?.kind === 'explosive' || cell?.kind === 'fuse';

/**
 * Breakable bricks one explosion or lit fuse at (r, c) takes. A fuse burns into every fuse and
 * bomb touching it, diagonals included; a blast breaks what's in range and sets off what it hits.
 */
export function chainSize(g: Grid, r: number, c: number): number {
  const key = (y: number, x: number) => y * COLS + x;
  const gone = new Set<number>([key(r, c)]);
  const queue: Array<[number, number]> = [[r, c]];
  for (let head = 0; head < queue.length; head++) {
    const [sr, sc] = queue[head]!;
    const fuse = g.get(sr, sc)?.kind === 'fuse';
    const [dy, dx] = fuse ? [1, 1] : [4, 3];
    for (let y = sr - dy; y <= sr + dy; y++) {
      for (let x = sc - dx; x <= sc + dx; x++) {
        const cell = g.get(y, x);
        if (!cell || !isBreakableCell(cell) || gone.has(key(y, x))) continue;
        if (fuse ? !lights(cell) : !inBlast(sr, sc, y, x)) continue;
        gone.add(key(y, x));
        if (lights(cell)) queue.push([y, x]);
      }
    }
  }
  return gone.size;
}

/** The share of breakable bricks the worst single explosion or fuse chain clears. */
export function chainFraction(g: Grid): number {
  const total = g.count(isBreakableCell);
  if (total === 0) return 0;
  let worst = 0;
  for (const [r, c] of g.positions(lights)) {
    worst = Math.max(worst, chainSize(g, r, c));
  }
  return worst / total;
}

/** Sizes of the regen clusters (touching, including diagonally), largest first. */
export function regenClusterSizes(g: Grid): number[] {
  const regen = g.positions((cell) => cell.kind === 'regen');
  const parent = regen.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < regen.length; i++) {
    for (let j = i + 1; j < regen.length; j++) {
      const [r1, c1] = regen[i]!;
      const [r2, c2] = regen[j]!;
      if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) parent[find(i)] = find(j);
    }
  }
  const sizes = new Map<number, number>();
  regen.forEach((_, i) => sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1));
  return [...sizes.values()].sort((a, b) => b - a);
}

/**
 * True when steel walls the cell in on the left, the right and above, like the inside of a frame.
 * The ball only gets in through a door, so bricks that hold it up (regen, armor) don't belong here.
 */
export function isEnclosed(g: Grid, r: number, c: number): boolean {
  const steel = (y: number, x: number) => g.get(y, x)?.kind === 'steel';
  let left = false;
  for (let x = c - 1; x >= 0 && !left; x--) left = steel(r, x);
  if (!left) return false;
  let right = false;
  for (let x = c + 1; x < COLS && !right; x++) right = steel(r, x);
  if (!right) return false;
  for (let y = r - 1; y >= 0; y--) if (steel(y, c)) return true;
  return false;
}

const STUBBORN: readonly BrickKind[] = ['regen', 'armored', 'virus'];

/** Regen, armored and virus bricks that sit inside a steel enclosure. */
export function enclosedStubborn(g: Grid): Array<[number, number]> {
  return g.positions((cell, r, c) => STUBBORN.includes(cell.kind) && isEnclosed(g, r, c));
}

/**
 * Portals come in linked pairs, with the cell under each left for its lower half and air beside
 * and below, so the ball always comes out clear.
 */
export function portalProblems(g: Grid): string[] {
  const problems: string[] = [];
  const ends = new Map<number, number>();
  g.forEach((cell, r, c) => {
    if (cell.kind !== 'portal') return;
    const link = cell.props?.link ?? 1;
    ends.set(link, (ends.get(link) ?? 0) + 1);
    if (r + PORTAL_ROWS > g.rows) problems.push(`portal at ${r},${c} runs off the grid`);
    for (let y = r; y <= r + PORTAL_ROWS; y++) {
      for (let x = c - 1; x <= c + 1; x++) {
        if ((y !== r || x !== c) && (y < r + PORTAL_ROWS || x === c) && g.get(y, x)) {
          problems.push(`portal at ${r},${c} is boxed in at ${y},${x}`);
        }
      }
    }
  });
  for (const [link, n] of ends) if (n !== 2) problems.push(`portal link ${link} has ${n} ends`);
  return problems;
}

/** Movers stay in the field, keep to their own row and never sweep through another brick. */
export function moverProblems(g: Grid): string[] {
  const problems: string[] = [];
  g.forEach((cell, r, c) => {
    if (!cell.moveX) return;
    const travel = Math.abs(cell.moveX);
    const speed = cell.moveSpeed ?? 60;
    if (travel < MOVER_TRAVEL[0] || travel > MOVER_TRAVEL[1]) {
      problems.push(`mover at ${r},${c} travels ${travel}px`);
    }
    if (speed < MOVER_SPEED[0] || speed > MOVER_SPEED[1]) {
      problems.push(`mover at ${r},${c} moves at ${speed}px/s`);
    }
    const x = c * BW;
    const lo = Math.min(x, x + cell.moveX);
    const hi = Math.max(x, x + cell.moveX) + BW;
    if (lo < 0 || hi > FIELD_WIDTH) problems.push(`mover at ${r},${c} leaves the field`);
    for (let cc = 0; cc < COLS; cc++) {
      // A portal above reaches down into this row.
      if (cc === c || (!g.get(r, cc) && g.get(r - 1, cc)?.kind !== 'portal')) continue;
      const ox = cc * BW;
      if (ox < hi - 0.1 && ox + BW > lo + 0.1)
        problems.push(`mover at ${r},${c} sweeps into ${r},${cc}`);
    }
  });
  return problems;
}

/**
 * Breakable bricks a ball can never reach. A ball-sized flood fills from the paddle; every brick it
 * touches is removed and the flood runs again, until nothing new is reached. Movers never block.
 * Only steel can seal a brick in, so grids without steel skip the flood.
 */
export function unreachableBricks(g: Grid): Array<[number, number]> {
  const targets = g.positions(isBreakableCell);
  if (!g.count((cell) => cell.kind === 'steel')) return [];
  // The ball passes ghosts and portals (which only ever take it somewhere else), so neither seals.
  const passable = (cell: Cell) =>
    !!cell.moveX || cell.kind === 'phantom' || cell.kind === 'portal';

  const gw = Math.floor(FIELD_WIDTH / STEP);
  const gh = Math.floor(FLOOD_H / STEP);
  const rect = (r: number, c: number): Rect => ({ x: c * BW, y: r * BH, w: BW, h: BH });
  const blockers = new Map<number, Rect>();
  g.forEach((cell, r, c) => {
    if (!passable(cell)) blockers.set(r * COLS + c, rect(r, c));
  });

  type Rect = { x: number; y: number; w: number; h: number };
  /** Calls `fn` for every flood cell within `radius` of the rectangle; stops when it returns true. */
  const around = (b: Rect, radius: number, fn: (i: number) => boolean | void): boolean => {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor((b.x - radius) / STEP) - 1);
    const x1 = Math.min(gw - 1, Math.floor((b.x + b.w + radius) / STEP) + 1);
    const y0 = Math.max(0, Math.floor((b.y - radius) / STEP) - 1);
    const y1 = Math.min(gh - 1, Math.floor((b.y + b.h + radius) / STEP) + 1);
    for (let iy = y0; iy <= y1; iy++) {
      const py = iy * STEP + STEP / 2;
      for (let ix = x0; ix <= x1; ix++) {
        const px = ix * STEP + STEP / 2;
        const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
        const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
        if (dx * dx + dy * dy <= r2 && fn(iy * gw + ix)) return true;
      }
    }
    return false;
  };

  const flood = (): Uint8Array => {
    const blocked = new Uint8Array(gw * gh);
    for (let ix = 0; ix < gw; ix++) {
      const px = ix * STEP + STEP / 2;
      if (px < BALL_R || px > FIELD_WIDTH - BALL_R) {
        for (let iy = 0; iy < gh; iy++) blocked[iy * gw + ix] = 1;
      }
    }
    for (const b of blockers.values()) {
      around(b, BALL_R, (i) => {
        blocked[i] = 1;
      });
    }
    const seen = new Uint8Array(gw * gh);
    const queue: number[] = [];
    for (let ix = 0; ix < gw; ix++) {
      const i = (gh - 1) * gw + ix;
      if (!blocked[i]) {
        seen[i] = 1;
        queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const ix = i % gw;
      const iy = (i - ix) / gw;
      const visit = (n: number) => {
        if (!seen[n] && !blocked[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      };
      if (ix > 0) visit(i - 1);
      if (ix < gw - 1) visit(i + 1);
      if (iy > 0) visit(i - gw);
      if (iy < gh - 1) visit(i + gw);
    }
    return seen;
  };

  const remaining = new Set(targets.map(([r, c]) => r * COLS + c));
  const reach = BALL_R + STEP;
  for (;;) {
    const seen = flood();
    const newly: number[] = [];
    for (const k of remaining) {
      const c = k % COLS;
      const r = (k - c) / COLS;
      if (around(rect(r, c), reach, (i) => seen[i] === 1)) newly.push(k);
    }
    if (!newly.length) break;
    for (const k of newly) {
      remaining.delete(k);
      blockers.delete(k);
    }
  }
  return [...remaining].map((k) => [Math.floor(k / COLS), k % COLS] as [number, number]);
}

export interface CheckRules {
  breakables?: readonly [number, number];
  minSpan?: number;
  /** Total powerups including the coin. */
  powerups?: readonly [number, number];
  coins?: number;
  /** Drops allowed at this tier. Coins are always allowed. */
  powerupPool?: readonly PowerupId[];
  noKinds?: readonly BrickKind[];
  /** Worst share of bricks one blast chain may clear. */
  maxChain?: number;
}

/** Every rule a generated grid must pass. Returns human-readable problems, empty when it passes. */
export function checkGrid(g: Grid, rules: CheckRules = {}): string[] {
  const problems: string[] = [];
  const breakables = g.count(isBreakableCell);
  if (breakables === 0) problems.push('no breakable bricks');
  if (rules.breakables) {
    const [lo, hi] = rules.breakables;
    if (breakables < lo || breakables > hi) {
      problems.push(`${breakables} breakable bricks (want ${lo}-${hi})`);
    }
  }
  if (rules.minSpan) {
    const span = g.span();
    const rows = span ? span.bottom - span.top + 1 : 0;
    if (rows < rules.minSpan) problems.push(`spans ${rows} rows (want ${rules.minSpan}+)`);
  }
  for (const kind of rules.noKinds ?? []) {
    if (g.count((cell) => cell.kind === kind)) problems.push(`has ${kind} bricks`);
  }

  const chain = chainFraction(g);
  if (chain > (rules.maxChain ?? MAX_CHAIN_FRACTION)) {
    problems.push(`one blast chain clears ${Math.round(chain * 100)}% of the bricks`);
  }
  const cluster = regenClusterSizes(g)[0] ?? 0;
  if (cluster > MAX_REGEN_CLUSTER) problems.push(`regen cluster of ${cluster}`);
  const stubborn = enclosedStubborn(g);
  if (stubborn.length) {
    problems.push(`${stubborn.length} regen or armored bricks behind steel, first at ${stubborn[0]!.join(',')}`);
  }
  problems.push(...moverProblems(g));
  problems.push(...portalProblems(g));

  const powerups = g.positions((cell) => !!cell.powerup).map(([r, c]) => g.get(r, c)!);
  for (const cell of powerups) {
    if (cell.kind !== 'normal' || cell.moveX) problems.push(`powerup on a ${cell.kind} brick`);
  }
  const ids = powerups.map((cell) => cell.powerup!);
  if (rules.coins !== undefined) {
    const coins = ids.filter((id) => id === 'coin').length;
    if (coins !== rules.coins) problems.push(`${coins} coin drops (want ${rules.coins})`);
  }
  if (rules.powerups) {
    const [lo, hi] = rules.powerups;
    if (ids.length < lo || ids.length > hi)
      problems.push(`${ids.length} powerups (want ${lo}-${hi})`);
  }
  if (rules.powerupPool) {
    for (const id of ids) {
      if (id !== 'coin' && !rules.powerupPool.includes(id)) problems.push(`${id} is not unlocked`);
    }
  }

  const sealed = unreachableBricks(g);
  if (sealed.length)
    problems.push(`${sealed.length} unreachable bricks, first at ${sealed[0]!.join(',')}`);
  return problems;
}
