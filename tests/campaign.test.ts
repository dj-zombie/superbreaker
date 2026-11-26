import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  campaignSummary,
  clearedLabel,
  isFinalStep,
  sceneBetween,
  stepAfter,
  stepKey,
  stepLabel,
  stepState,
  stopOf,
  validScenes,
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
    expect(stepAfter({ index: 5, stop: 'bonus' }, stopAfterFive, () => true, bonus)).toEqual({
      index: 6,
    });
  });

  it('skips a beaten boss, and its bonus stage, when its level is played again', () => {
    expect(stepAfter({ index: 5 }, stopAfterFive, () => true)).toEqual({ index: 6 });
    expect(stepAfter({ index: 5 }, stopAfterFive, () => true, stopAfterFive)).toEqual({ index: 6 });
  });

  it('goes from a level to a bonus stage with no boss until it has been played', () => {
    const none = () => false;
    expect(stepAfter({ index: 5 }, none, none, stopAfterFive)).toEqual({ index: 5, stop: 'bonus' });
    expect(stepAfter({ index: 5, stop: 'bonus' }, none, none, stopAfterFive)).toEqual({ index: 6 });
    expect(stepAfter({ index: 5 }, none, none, stopAfterFive, () => true)).toEqual({ index: 6 });
  });

  it('plays only the stops the stop after a level has', () => {
    const level = { id: 'x' } as LevelSpec;
    const plain: BossStop = { after: 5, level };
    const party: BossStop = { after: 5, level, bonus: level };
    const solo: BossStop = { after: 5, bonus: level };
    expect(stopOf(plain, 'boss')).toBe('boss');
    expect(stopOf(plain, 'bonus')).toBeUndefined();
    expect(stopOf(party, 'bonus')).toBe('bonus');
    expect(stopOf(solo, 'boss')).toBeUndefined();
    expect(stopOf(solo, 'bonus')).toBe('bonus');
    expect(stopOf(undefined, 'boss')).toBeUndefined();
    expect(stopOf(party, undefined)).toBeUndefined();
  });

  it('names the steps it points the player at', () => {
    expect(stepLabel({ index: 6 })).toBe('Level 6');
    expect(stepLabel({ index: 5, stop: 'boss' })).toBe('Boss fight');
    expect(stepLabel({ index: 5, stop: 'bonus' })).toBe('Bonus stage');
    expect(clearedLabel({ index: 5, stop: 'bonus' })).toBe('Bonus complete');
  });

  it('keeps only stops that follow one of the levels, once each, in order', () => {
    const stops = validStops(
      [
        { after: 10, map: 'b.tmj', bonus: 7 },
        { after: 5, map: 'a.tmj', bonus: 'party.tmj' },
        { after: 5, map: 'dup.tmj' },
        { after: 30, map: 'last.tmj' },
        { after: 31, map: 'past.tmj' },
        { after: 0, map: 'zero.tmj' },
        { after: 2.5, map: 'half.tmj' },
        { after: 3 },
        { after: 8, bonus: 'solo.tmj' },
        null,
      ],
      30,
    );
    expect(stops).toEqual([
      { after: 5, map: 'a.tmj', bonus: 'party.tmj' },
      { after: 8, bonus: 'solo.tmj' },
      { after: 10, map: 'b.tmj' },
      { after: 30, map: 'last.tmj' },
    ]);
    expect(validStops(undefined, 30)).toEqual([]);
  });

  it('ends the campaign at a boss after the last level: it is next until beaten, and nothing follows it', () => {
    const last = (after: number) => after === 30;
    expect(stepAfter({ index: 30 }, last, () => false)).toEqual({ index: 30, stop: 'boss' });
    // Past the last level: Play hands Results no next step, which plays the ending.
    expect(stepAfter({ index: 30, stop: 'boss' }, last, () => false).index).toBeGreaterThan(30);
    expect(stepAfter({ index: 30 }, last, () => true).index).toBeGreaterThan(30);
  });

  it('ends the campaign on its last step only, not on a replay of the level before a beaten boss', () => {
    const last = (after: number) => after === 30;
    const none = () => false;
    expect(isFinalStep({ index: 30, stop: 'boss' }, last, none, 30)).toBe(true);
    expect(isFinalStep({ index: 30 }, last, none, 30)).toBe(false);
    expect(isFinalStep({ index: 29 }, last, none, 30)).toBe(false);
    // With no stop after it, the last level is the last step; with a bonus after its boss, the bonus is.
    expect(isFinalStep({ index: 30 }, none, none, 30)).toBe(true);
    expect(isFinalStep({ index: 30, stop: 'boss' }, last, last, 30)).toBe(false);
    expect(isFinalStep({ index: 30, stop: 'bonus' }, last, last, 30)).toBe(true);
  });
});

describe('stepState', () => {
  const access = (unlocked: number, allUnlocked = false, levels: Record<string, unknown> = {}) => ({
    unlocked,
    allUnlocked,
    levels,
  });

  it('keeps the boss after the last level shut until that level is cleared', () => {
    const earned = access(30, false, { level29: { stars: 3 } });
    expect(stepState({ index: 30 }, earned, true)).toBe('open');
    expect(stepState({ index: 30, stop: 'boss' }, earned, true)).toBe('locked');
    expect(stepState({ index: 30, stop: 'boss' }, access(30, false, { level30: {} }), true)).toBe('open');
  });

  it('opens every level and the boss after the last one once all levels are unlocked', () => {
    const open = access(30, true);
    expect(stepState({ index: 1 }, open, false)).toBe('open');
    expect(stepState({ index: 21 }, open, false)).toBe('open');
    expect(stepState({ index: 30 }, open, false)).toBe('open');
    expect(stepState({ index: 30, stop: 'boss' }, open, true)).toBe('open');
    expect(stepState({ index: 10, stop: 'boss' }, open, true)).toBe('open');
    expect(stepState({ index: 5, stop: 'bonus' }, open, true)).toBe('open');
    expect(stepState({ index: 8, stop: 'bonus' }, open, false)).toBe('open');
  });

  it('opens a boss with its level cleared, and a bonus with its boss beaten', () => {
    const at = access(5);
    expect(stepState({ index: 5, stop: 'boss' }, at, true)).toBe('locked');
    expect(stepState({ index: 6 }, at, false)).toBe('locked');
    const cleared = access(5, false, { level05: {} });
    expect(stepState({ index: 5, stop: 'boss' }, cleared, true)).toBe('open');
    expect(stepState({ index: 5, stop: 'bonus' }, cleared, true)).toBe('locked');
    expect(stepState({ index: 5, stop: 'bonus' }, access(5, false, { level05: {}, boss05: {} }), true)).toBe('open');
    expect(stepState({ index: 8, stop: 'bonus' }, access(8, false, { level08: {} }), false)).toBe('open');
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

  it('records the boss after the last level without opening a level past it', async () => {
    const store = await freshSave();
    store.unlockAll(30);
    store.recordWin(30, 3, 100, 30, true);
    expect(store.bossBeaten(30)).toBe(false);
    store.recordBoss(30, 2, 5000, 30);
    expect(store.bossBeaten(30)).toBe(true);
    expect(store.state.unlocked).toBe(30);
    expect(store.state.levels.boss30).toEqual({ stars: 2, bestScore: 5000 });
  });

  it('counts levels cleared, not boss stops or bonus stages', async () => {
    const store = await freshSave();
    store.recordWin(5, 3, 100, 30, true);
    store.recordBoss(5, 3, 100, 30);
    store.recordBonusStop(5, 3, 100, 30);
    expect(store.clearedCount()).toBe(1);
  });
});

describe('cutscenes between steps', () => {
  const entries = validScenes([
    { id: 'chapter-2', before: 'level11' },
    { id: 'ending', after: 'level30' },
    { id: 'warden-intro', before: 'boss10' },
  ]);
  const none = () => false;

  it('keeps entries with an id and a place, and drops unknown scenes', () => {
    expect(validScenes(null)).toEqual([]);
    expect(
      validScenes([
        { id: 'a' },
        { before: 'level02' },
        { id: '', after: 'level01' },
        null,
        { id: 'b', after: 'level03' },
      ]),
    ).toEqual([{ id: 'b', after: 'level03' }]);
    expect(validScenes([{ id: 'x', before: 'level02' }], (id) => id !== 'x')).toEqual([]);
  });

  it('plays on the way into a step, from wherever the player comes', () => {
    expect(sceneBetween({ index: 10, stop: 'bonus' }, { index: 11 }, entries, none)).toBe(
      'chapter-2',
    );
    expect(sceneBetween({ index: 10, stop: 'boss' }, { index: 11 }, entries, none)).toBe(
      'chapter-2',
    );
    expect(sceneBetween(undefined, { index: 11 }, entries, none)).toBe('chapter-2');
    expect(sceneBetween({ index: 10 }, { index: 10, stop: 'boss' }, entries, none)).toBe(
      'warden-intro',
    );
  });

  it('plays on the way out of a step, even with nowhere to go', () => {
    expect(sceneBetween({ index: 30 }, undefined, entries, none)).toBe('ending');
    const final = validScenes([{ id: 'ending', after: 'boss30' }]);
    expect(sceneBetween({ index: 30, stop: 'boss' }, undefined, final, none)).toBe('ending');
  });

  it('plays the ending after the final boss once, then wins go straight to Victory', () => {
    const final = validScenes([{ id: 'ending', after: 'boss30' }]);
    const won = { index: 30, stop: 'boss' as const };
    expect(sceneBetween(won, undefined, final, none)).toBe('ending');
    expect(sceneBetween(won, undefined, final, (id) => id === 'ending')).toBeUndefined();
  });

  it('plays a scene once', () => {
    expect(
      sceneBetween(undefined, { index: 11 }, entries, (id) => id === 'chapter-2'),
    ).toBeUndefined();
  });

  it('plays nothing elsewhere', () => {
    expect(sceneBetween({ index: 11 }, { index: 12 }, entries, none)).toBeUndefined();
    expect(sceneBetween(undefined, undefined, entries, none)).toBeUndefined();
  });
});

describe('campaign summary', () => {
  const boss = { id: 'b', title: 'b', bricks: [], lights: [], lighting: {} } as unknown as LevelSpec;
  const stops = [
    { after: 2, level: boss, bonus: boss },
    { after: 3, bonus: boss },
    { after: 4, level: boss },
  ];
  const progress = (stars: number, bestScore: number) => ({ stars, bestScore });

  it('adds up stars, cleared levels and every best score, and lists the bosses beaten', () => {
    const s = campaignSummary(
      {
        levels: {
          level01: progress(3, 1000),
          level02: progress(2, 2000),
          level04: progress(1, 500),
          boss02: progress(3, 7000),
          bonus02: progress(0, 300),
          bonus03: progress(0, 200),
          level09: progress(3, 99999),
        },
      },
      4,
      stops,
    );
    expect(s).toMatchObject({ stars: 6, maxStars: 12, cleared: 3, levels: 4, score: 11000 });
    expect(s.bosses).toEqual([
      { after: 2, beaten: true },
      { after: 4, beaten: false },
    ]);
  });

  it('ranks by the share of stars: Breaker, Hero from two thirds, Legend with all', () => {
    const all = (n: number, stars: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`level0${i + 1}`, progress(stars, 0)]));
    expect(campaignSummary({ levels: {} }, 3, [])).toMatchObject({ rank: 'Breaker', nextGoal: '6 more stars to Hero' });
    expect(campaignSummary({ levels: all(3, 2) }, 3, [])).toMatchObject({
      rank: 'Hero',
      nextGoal: '3 more stars to Legend',
    });
    const one = { ...all(3, 3), level03: progress(2, 0) };
    expect(campaignSummary({ levels: one }, 3, []).nextGoal).toBe('1 more star to Legend');
    expect(campaignSummary({ levels: all(3, 3) }, 3, [])).toMatchObject({ rank: 'Legend', nextGoal: 'Every star found' });
  });

  it('is a Breaker with no levels to rank by', () => {
    expect(campaignSummary({ levels: {} }, 0, [])).toMatchObject({ stars: 0, maxStars: 0, rank: 'Breaker' });
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

  it('lists every stop it means to, after levels 5, 8, 10, 20 and 30 among them', () => {
    expect(Array.isArray(index.bosses) ? index.bosses.length : 0).toBe(stops.length);
    expect(stops.map((s) => s.after)).toEqual(expect.arrayContaining([5, 8, 10, 20, 30]));
  });

  const fights = stops.filter((s) => s.map).map((s) => [s.map!, s.map!] as const);
  it.each(fights)('%s names a boss and passes the checks', (_, file) => {
    const map = readJson<TiledMap>(join(LEVELS_DIR, file));
    const { level, warnings } = parseLevel(map, file.replace('.tmj', ''), resolve, resolveTemplate);
    expect(warnings).toEqual([]);
    expect(validateLevel(level)).toEqual([]);
    expect(level.boss).toBeDefined();
    expect(index.levels).not.toContain(file);
  });

  it('puts the Crucible after level 5, the Warden after 10, the Angler after 20 and the Overseer after 30', () => {
    for (const [after, key, boss] of [
      [5, 'boss05', 'crucible'],
      [10, 'boss10', 'warden'],
      [20, 'boss20', 'angler'],
      [30, 'boss30', 'overseer'],
    ] as const) {
      const stop = stops.find((s) => s.after === after)!;
      const map = readJson<TiledMap>(join(LEVELS_DIR, stop.map!));
      expect(parseLevel(map, key, resolve, resolveTemplate).level.boss).toBe(boss);
    }
  });

  it('follows the Crucible with the shooting gallery, and level 8 with the piñata', () => {
    for (const [after, file, bonus] of [
      [5, 'gallery.tmj', 'gallery'],
      [8, 'pinata.tmj', 'pinata'],
    ] as const) {
      const stop = stops.find((s) => s.after === after)!;
      expect(stop.bonus).toBe(file);
      const map = readJson<TiledMap>(join(LEVELS_DIR, file));
      expect(parseLevel(map, bonus, resolve, resolveTemplate).level.bonus).toBe(bonus);
    }
    expect(stops.find((s) => s.after === 8)!.map).toBeUndefined();
    expect(stops.find((s) => s.after === 10)!.bonus).toBeUndefined();
  });

  it('ends the campaign on the Overseer, after the last level and with nothing after it', () => {
    const last = stops[stops.length - 1]!;
    expect(last.after).toBe(index.levels.length);
    expect(last.map).toBe('boss30.tmj');
    expect(last.bonus).toBeUndefined();
  });
});
