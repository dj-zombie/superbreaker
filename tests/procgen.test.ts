import { describe, expect, it } from 'vitest';
import { BRICK_COLORS, NEW_BRICK_KINDS } from '../src/config';
import { validateLevel } from '../src/core/LevelParser';
import { Rng, hashSeed } from '../src/core/Rng';
import {
  chainSize,
  checkGrid,
  enclosedStubborn,
  isEnclosed,
  moverProblems,
  regenClusterSizes,
  unreachableBricks,
} from '../src/core/procgen/checks';
import { MECHANICS, MECHANIC_UNLOCK, tierParams } from '../src/core/procgen/curve';
import {
  CHUNK_MECHANICS,
  boardRules,
  fallbackBoard,
  generateBoard,
  generateChunk,
} from '../src/core/procgen/generate';
import { BH, COLS, Grid, toBricks } from '../src/core/procgen/grid';
import { FRAME_DOOR, PATTERNS } from '../src/core/procgen/patterns';
import { FIELD_WIDTH } from '../src/core/types';

const TEXTURES = new Set([...BRICK_COLORS, ...NEW_BRICK_KINDS].map((c) => `brick_${c}`));
const TIERS = Array.from({ length: 30 }, (_, i) => i + 1);
const SEEDS = Array.from({ length: 40 }, (_, i) => hashSeed('fuzz', i));

describe('Rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('keeps int() inside its inclusive bounds and reaches both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = rng.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('forks streams that ignore how much the parent has drawn', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    b.next();
    b.next();
    expect(a.fork('shape').next()).toBe(b.fork('shape').next());
    expect(a.fork('shape').next()).not.toBe(a.fork('style').next());
  });
});

describe('checks', () => {
  it('follows a blast chain through neighbouring bombs', () => {
    const g = new Grid(3);
    g.fill(1, 0, 1, 12, 'normal');
    g.set(1, 2, 'explosive');
    g.set(1, 4, 'explosive');
    // 2 cols each side of each bomb: cols 0-6.
    expect(chainSize(g, 1, 2)).toBe(7);
  });

  it('finds bricks sealed inside steel', () => {
    const g = new Grid(10);
    g.fill(2, 4, 5, 6, 'steel');
    g.fill(3, 5, 3, 4, null);
    g.set(4, 6, 'normal');
    g.set(8, 0, 'normal');
    expect(unreachableBricks(g)).toEqual([[4, 6]]);
    g.fill(6, 6, 1, 2, null);
    expect(unreachableBricks(g)).toEqual([]);
  });

  it('measures regen clusters including diagonal touches', () => {
    const g = new Grid(4);
    g.fill(0, 0, 2, 2, 'regen');
    g.set(2, 2, 'regen');
    g.set(0, 10, 'regen');
    expect(regenClusterSizes(g)).toEqual([5, 1]);
  });

  it('finds cells walled in by steel on the left, the right and above', () => {
    const g = new Grid(8);
    g.fill(0, 4, 1, 8, 'steel');
    g.fill(1, 4, 5, 1, 'steel');
    g.fill(1, 11, 5, 1, 'steel');
    expect(isEnclosed(g, 3, 7)).toBe(true);
    expect(isEnclosed(g, 5, 5)).toBe(true);
    expect(isEnclosed(g, 7, 7)).toBe(false);
    expect(isEnclosed(g, 3, 14)).toBe(false);
    expect(isEnclosed(g, 3, 1)).toBe(false);
  });

  it('flags regen and armored bricks inside a steel U, but not plain ones', () => {
    const g = new Grid(8);
    g.fill(0, 4, 1, 8, 'steel');
    g.fill(1, 4, 5, 1, 'steel');
    g.fill(1, 11, 5, 1, 'steel');
    g.set(3, 6, 'normal');
    expect(enclosedStubborn(g)).toEqual([]);
    g.set(3, 7, 'regen');
    g.set(4, 8, { kind: 'armored', armor: 2 });
    g.set(7, 0, 'regen');
    expect(enclosedStubborn(g)).toEqual([
      [3, 7],
      [4, 8],
    ]);
    expect(checkGrid(g, {}).some((p) => p.includes('behind steel'))).toBe(true);
  });

  it('flags movers that leave the field or sweep into a brick', () => {
    const g = new Grid(2);
    g.set(0, 0, { kind: 'normal', moveX: 120, moveSpeed: 60 });
    expect(moverProblems(g)).toEqual([]);
    g.set(0, 3, 'normal');
    expect(moverProblems(g)).toHaveLength(1);
    g.set(1, 19, { kind: 'normal', moveX: 90, moveSpeed: 60 });
    expect(moverProblems(g).some((p) => p.includes('leaves the field'))).toBe(true);
  });
});

describe('generateBoard', () => {
  it('gives the same board for the same seed and tier', () => {
    expect(generateBoard(1234, 9)).toEqual(generateBoard(1234, 9));
    expect(generateBoard(1234, 9).grid.toString()).not.toBe(generateBoard(1235, 9).grid.toString());
  });

  it.each(TIERS)('passes every rule at tier %i', (tier) => {
    const p = tierParams(tier);
    for (const seed of SEEDS) {
      const board = generateBoard(seed, tier, 1000);
      const where = `seed ${seed} tier ${tier} (${board.pattern})\n${board.grid}`;
      expect(checkGrid(board.grid, boardRules(p)), where).toEqual([]);
      expect(enclosedStubborn(board.grid), where).toEqual([]);
      expect(validateLevel(board.level), where).toEqual([]);
      expect(board.fallback, where).toBe(false);

      const ids = board.level.bricks.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(Math.min(...ids)).toBe(1000);
      expect(board.nextId).toBe(1000 + ids.length);
      for (const b of board.level.bricks) {
        expect(TEXTURES.has(b.texture), b.texture).toBe(true);
        if (b.kind !== 'normal') expect(b.powerup).toBeUndefined();
      }
      for (const m of MECHANICS) {
        if (tier >= MECHANIC_UNLOCK[m]) continue;
        const present =
          m === 'mover'
            ? board.level.bricks.some((b) => b.moveX !== 0)
            : board.level.bricks.some((b) => b.kind === m);
        expect(present, `${m} before tier ${MECHANIC_UNLOCK[m]}: ${where}`).toBe(false);
      }
    }
  });

  it('leaves a wide door in the bottom of every frame', () => {
    let frames = 0;
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const board = generateBoard(seed, tier);
        if (board.pattern !== 'frame') continue;
        frames++;
        const g = board.grid;
        const bottom = Math.max(...g.positions((cell) => cell.kind === 'steel').map(([r]) => r));
        const steel = (c: number) => g.get(bottom, c)?.kind === 'steel';
        let lo = COLS / 2 - 1;
        let hi = COLS / 2;
        while (lo > 0 && !steel(lo - 1)) lo--;
        while (hi < COLS - 1 && !steel(hi + 1)) hi++;
        expect(hi - lo + 1, `seed ${seed} tier ${tier}\n${g}`).toBeGreaterThanOrEqual(FRAME_DOOR);
      }
    }
    expect(frames).toBeGreaterThan(0);
  });

  it('features a mechanic on most boards of the tier it unlocks', () => {
    for (const m of MECHANICS) {
      const tier = MECHANIC_UNLOCK[m];
      const featured = SEEDS.filter((seed) => {
        const g = generateBoard(seed, tier).grid;
        return g.count((cell) => (m === 'mover' ? !!cell.moveX : cell.kind === m)) > 0;
      });
      expect(featured.length / SEEDS.length, m).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('uses every pattern somewhere in the first 30 tiers', () => {
    const used = new Set<string>();
    for (const tier of TIERS)
      for (const seed of SEEDS.slice(0, 10)) used.add(generateBoard(seed, tier).pattern);
    for (const p of PATTERNS) expect(used).toContain(p.id);
  });

  it('builds a passing fallback board at any tier', () => {
    for (const tier of [1, 5, 10, 20, 30, 60]) {
      const draft = fallbackBoard(3, tier);
      expect(checkGrid(draft.grid, boardRules(tierParams(tier))), `tier ${tier}`).toEqual([]);
    }
  });

  it('stays fast enough to build between waves', () => {
    const start = performance.now();
    for (const tier of TIERS) generateBoard(hashSeed('speed', tier), tier);
    // Typically a few ms per board; the budget leaves room for slow CI machines.
    expect((performance.now() - start) / TIERS.length).toBeLessThan(40);
  });
});

describe('generateChunk', () => {
  it('gives the same chunk for the same seed and index', () => {
    expect(generateChunk(77, 3, 6, 1)).toEqual(generateChunk(77, 3, 6, 1));
  });

  it('feeds rows without steel or regen, inside the field, with unique ids', () => {
    let id = 1;
    const ids = new Set<number>();
    for (let index = 0; index < 120; index++) {
      const tier = 1 + (index % 30);
      const chunk = generateChunk(hashSeed('descent', 5), index, tier, id);
      expect(chunk.rows.length).toBeGreaterThanOrEqual(3);
      expect(chunk.rows.length).toBeLessThanOrEqual(5);
      const bricks = chunk.rows.flat();
      expect(bricks.length).toBeGreaterThan(0);
      expect(chunk.nextId).toBe(id + bricks.length);
      id = chunk.nextId;

      const coins = bricks.filter((b) => b.powerup === 'coin').length;
      expect(coins).toBe(index % 2 === 0 ? 1 : 0);
      for (const b of bricks) {
        expect(ids.has(b.id)).toBe(false);
        ids.add(b.id);
        expect(b.y).toBe(0);
        expect(b.height).toBe(BH);
        expect(['normal', ...CHUNK_MECHANICS.filter((m) => m !== 'mover')]).toContain(b.kind);
        expect(Math.min(b.x, b.x + b.moveX)).toBeGreaterThanOrEqual(0);
        expect(Math.max(b.x, b.x + b.moveX) + b.width).toBeLessThanOrEqual(FIELD_WIDTH);
      }
    }
  });
});

describe('toBricks', () => {
  it('places cells on the 30x16 grid and numbers them from idBase', () => {
    const g = new Grid(3);
    g.set(2, COLS - 1, { kind: 'armored', armor: 3 });
    const style = { palette: 'ocean', colorMode: 'row', regenDelay: 5 } as const;
    const [b] = toBricks(g, style, { idBase: 50, rowOffset: 1 });
    expect(b).toMatchObject({
      id: 50,
      x: 570,
      y: 48,
      kind: 'armored',
      armor: 3,
      texture: 'brick_armored',
    });
  });
});
