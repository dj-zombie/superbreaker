import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearedLabel,
  stepAfter,
  stepKey,
  stepLabel,
  stopOf,
  validStops,
  type BossStop,
} from '../src/core/Campaign';
import type { LevelSpec } from '../src/core/types';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../src/core/LevelParser';
import { SaveStore, type KeyValueStorage } from '../src/core/SaveStore';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const LEVELS_DIR = join(ASSETS, 'levels');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

function memoryStorage(): KeyValueStorage {
  const data: Record<string, string> = {};
  return {
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    remove: async (k) => {
      delete data[k];
    },
  };
}

async function freshSave(): Promise<SaveStore> {
  const store = new SaveStore(memoryStorage());
  await store.load();
  return store;
}

describe('campaign steps', () => {
  const stopAfterFive = (after: number) => after === 5;

  it('keys a level by its id and a stop by the level it follows', () => {
    expect(stepKey({ index: 5 })).toBe('level05');
    expect(stepKey({ index: 5, stop: 'boss' })).toBe('boss05');
    expect(stepKey({ index: 5, stop: 'bonus' })).toBe('bonus05');
  });

  it('goes from a level to its boss stop while the boss stands, then on to the next level', () => {
    expect(stepAfter({ index: 5 }, stopAfterFive, () => false)).toEqual({ index: 5, stop: 'boss' });
    expect(stepAfter({ index: 5, stop: 'boss' }, stopAfterFive, () => false)).toEqual({ index: 6 });
    expect(stepAfter({ index: 4 }, stopAfterFive, () => false)).toEqual({ index: 5 });
  });

  it('goes from a beaten boss to its bonus stage, and from there to the next level', () => {
    const bonus = stopAfterFive;
    expect(stepAfter({ index: 5, stop: 'boss' }, stopAfterFive, () => true, bonus)).toEqual({
      index: 5,
      stop: 'bonus',
    });
    expect(stepAfter({ index: 5, stop: 'bonus' }, stopAfterFive, () => true, bonus)).toEqual({ index: 6 });
  });

  it('skips a beaten boss, and its bonus stage, when its level is played again', () => {
    expect(stepAfter({ index: 5 }, stopAfterFive, () => true)).toEqual({ index: 6 });
    expect(stepAfter({ index: 5 }, stopAfterFive, () => true, stopAfterFive)).toEqual({ index: 6 });
  });

  it('plays only the stops the stop after a level has', () => {
    const level = { id: 'x' } as LevelSpec;
    const plain: BossStop = { after: 5, level };
    const party: BossStop = { after: 5, level, bonus: level };
    expect(stopOf(plain, 'boss')).toBe('boss');
    expect(stopOf(plain, 'bonus')).toBeUndefined();
    expect(stopOf(party, 'bonus')).toBe('bonus');
    expect(stopOf(undefined, 'boss')).toBeUndefined();
    expect(stopOf(party, undefined)).toBeUndefined();
  });

  it('names the steps it points the player at', () => {
    expect(stepLabel({ index: 6 })).toBe('Level 6');
    expect(stepLabel({ index: 5, stop: 'boss' })).toBe('Boss fight');
    expect(stepLabel({ index: 5, stop: 'bonus' })).toBe('Bonus stage');
    expect(clearedLabel({ index: 5, stop: 'bonus' })).toBe('Bonus complete');
  });

  it('keeps only stops that sit between two levels, once each, in order', () => {
    const stops = validStops(
      [
        { after: 10, map: 'b.tmj', bonus: 7 },
        { after: 5, map: 'a.tmj', bonus: 'party.tmj' },
        { after: 5, map: 'dup.tmj' },
        { after: 30, map: 'last.tmj' },
        { after: 0, map: 'zero.tmj' },
        { after: 2.5, map: 'half.tmj' },
        { after: 3 },
        null,
      ],
      30,
    );
    expect(stops).toEqual([
      { after: 5, map: 'a.tmj', bonus: 'party.tmj' },
      { after: 10, map: 'b.tmj' },
    ]);
    expect(validStops(undefined, 30)).toEqual([]);
  });
});

describe('boss stop progress', () => {
  it('holds the next level shut until the boss after a level is beaten', async () => {
    const store = await freshSave();
    for (let i = 1; i <= 4; i++) store.recordWin(i, 3, 100, 30);
    expect(store.state.unlocked).toBe(5);
    store.recordWin(5, 2, 100, 30, true);
    expect(store.state.unlocked).toBe(5);
    expect(store.bossBeaten(5)).toBe(false);
    expect(store.recordBoss(5, 1, 900, 30)).toBe(true);
    expect(store.bossBeaten(5)).toBe(true);
    expect(store.state.unlocked).toBe(6);
    expect(store.state.levels.boss05).toEqual({ stars: 1, bestScore: 900 });
  });

  it('never locks a level that was already open', async () => {
    const store = await freshSave();
    store.unlockAll(30);
    store.recordWin(5, 3, 100, 30, true);
    expect(store.state.unlocked).toBe(30);
  });

  it('keeps a bonus stage apart from its boss, and never locks the level after it', async () => {
    const store = await freshSave();
    store.recordWin(5, 2, 100, 30, true);
    store.recordBoss(5, 1, 900, 30);
    expect(store.recordBonusStop(5, 3, 4000, 30)).toBe(true);
    expect(store.state.levels.bonus05).toEqual({ stars: 3, bestScore: 4000 });
    expect(store.state.levels.boss05).toEqual({ stars: 1, bestScore: 900 });
    expect(store.state.unlocked).toBe(6);
  });

  it('counts levels cleared, not boss stops or bonus stages', async () => {
    const store = await freshSave();
    store.recordWin(5, 3, 100, 30, true);
    store.recordBoss(5, 3, 100, 30);
    store.recordBonusStop(5, 3, 100, 30);
    expect(store.clearedCount()).toBe(1);
  });
});

describe('boss stops in levels/index.json', () => {
  const index = readJson<{ levels: string[]; bosses?: unknown }>(join(LEVELS_DIR, 'index.json'));
  const tileset = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
  const resolve = (source: string) => (source.endsWith('bricks.tsj') ? tileset : undefined);
  const templates = new Map(
    readJson<{ templates: string[] }>(join(ASSETS, 'templates', 'index.json')).templates.map(
      (file) => [file, readJson<TiledTemplate>(join(ASSETS, 'templates', file))],
    ),
  );
  const resolveTemplate = (path: string) => templates.get(path.split('/').pop()!);
  const stops = validStops(index.bosses, index.levels.length);

  it('lists every stop it means to, after levels 5 and 10 among them', () => {
    expect(Array.isArray(index.bosses) ? index.bosses.length : 0).toBe(stops.length);
    expect(stops.map((s) => s.after)).toEqual(expect.arrayContaining([5, 10]));
  });

  it.each(stops.map((s) => [s.map, s] as const))('%s names a boss and passes the checks', (_, stop) => {
    const map = readJson<TiledMap>(join(LEVELS_DIR, stop.map));
    const { level, warnings } = parseLevel(map, stop.map.replace('.tmj', ''), resolve, resolveTemplate);
    expect(warnings).toEqual([]);
    expect(validateLevel(level)).toEqual([]);
    expect(level.boss).toBeDefined();
    expect(index.levels).not.toContain(stop.map);
  });

  it('puts the Crucible after level 5 and the Warden after level 10', () => {
    for (const [after, key, boss] of [
      [5, 'boss05', 'crucible'],
      [10, 'boss10', 'warden'],
    ] as const) {
      const stop = stops.find((s) => s.after === after)!;
      const map = readJson<TiledMap>(join(LEVELS_DIR, stop.map));
      expect(parseLevel(map, key, resolve, resolveTemplate).level.boss).toBe(boss);
    }
  });

  it('follows the Crucible with the shooting gallery', () => {
    const five = stops.find((s) => s.after === 5)!;
    expect(five.bonus).toBe('gallery.tmj');
    const map = readJson<TiledMap>(join(LEVELS_DIR, five.bonus!));
    expect(parseLevel(map, 'gallery', resolve, resolveTemplate).level.bonus).toBe('gallery');
  });
});
