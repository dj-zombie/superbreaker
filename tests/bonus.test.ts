import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BONUS_SKIP_GUARD_MS,
  INTRO_MS,
  MEDAL_LAND_MS,
  MEDAL_PAUSE_MS,
  SCORING_MS,
  TALLY_HOLD_MS,
  TALLY_LEAD_MS,
  TALLY_MAX_TICKS,
  TALLY_TICK_MS,
  BonusState,
  comboMultiplier,
  medalFor,
  rewardFor,
  starsFor,
  tallyTimeline,
  tallyValue,
  type BonusSpec,
  type BonusStep,
  type TallyRow,
} from '../src/core/Bonus';
import { parseLevel, validateLevel, type TiledMap, type TiledTileset } from '../src/core/LevelParser';
import { SaveStore, defaultSave, normalizeSave, type KeyValueStorage } from '../src/core/SaveStore';
import { MAX_ABILITY_STOCK } from '../src/core/Session';

const SPEC: BonusSpec = {
  durationMs: 10_000,
  medals: [1_000, 2_000, 3_000],
  ballLost: { score: 200, combo: 'reset' },
  tally: (stats) => [{ label: 'Hits', value: stats.counts.hits ?? 0 }],
};

/** A state already in play, past the intro. */
const playing = (spec: BonusSpec = SPEC) => new BonusState(spec, { intro: false });

/** Ticks `ms` in steps of `step`, gathering the steps entered. */
function run(state: BonusState, ms: number, step = 16): BonusStep[] {
  const seen: BonusStep[] = [];
  for (let t = 0; t < ms; t += step) for (const e of state.tick(step)) seen.push(e.step);
  return seen;
}

describe('BonusState lifecycle', () => {
  it('runs intro, play, scoring, tally and done in order', () => {
    const s = new BonusState(SPEC);
    expect(s.step).toBe('intro');
    const seen = run(s, INTRO_MS + SPEC.durationMs + SCORING_MS + 60_000);
    expect(seen).toEqual(['play', 'scoring', 'tally', 'done']);
  });

  it('starts in play without an intro', () => {
    expect(playing().step).toBe('play');
  });

  it('runs the stage clock only in play', () => {
    const s = new BonusState(SPEC);
    s.tick(INTRO_MS - 1);
    expect(s.clock).toBe(0);
    s.tick(1);
    s.tick(2_500);
    expect(s.clock).toBe(2_500);
    expect(s.timeLeftMs).toBe(7_500);
    expect(s.progress).toBeCloseTo(0.25);
  });

  it('carries left-over time into the next step', () => {
    const s = new BonusState(SPEC);
    expect(s.tick(INTRO_MS + 300).map((e) => e.step)).toEqual(['play']);
    expect(s.stepMs).toBe(300);
  });

  it('leaves the clocks alone on a bad dt', () => {
    const s = playing();
    s.tick(Number.NaN);
    s.tick(-50);
    expect(s.clock).toBe(0);
  });

  it('skips the intro only after the guard', () => {
    const s = new BonusState(SPEC);
    s.tick(BONUS_SKIP_GUARD_MS - 1);
    expect(s.skip()).toEqual([]);
    s.tick(1);
    expect(s.skip().map((e) => e.step)).toEqual(['play']);
  });

  it('runs the timer out for the dev tools, intro or not', () => {
    const s = new BonusState(SPEC);
    expect(s.endTimer().map((e) => e.step)).toEqual(['play', 'scoring']);
    expect(s.timeLeftMs).toBe(0);
  });
});

describe('BonusState scoring', () => {
  it('multiplies by the combo and records the best', () => {
    const s = playing();
    let total = 0;
    for (let i = 0; i < 10; i++) total += s.award(100);
    // Four at x1, five at x1.5 (combo 5..9), one at x2 (combo 10).
    expect(total).toBe(400 + 750 + 200);
    expect(s.score).toBe(total);
    expect(s.combo).toBe(10);
    expect(s.bestCombo).toBe(10);
  });

  it('gives flat points when told not to combo', () => {
    const s = playing();
    for (let i = 0; i < 12; i++) s.award(100);
    expect(s.award(500, { combo: false })).toBe(500);
    expect(s.combo).toBe(12);
  });

  it('scores only in play', () => {
    const s = new BonusState(SPEC);
    expect(s.award(100)).toBe(0);
    s.endTimer();
    expect(s.award(100)).toBe(0);
    expect(s.score).toBe(0);
  });

  it('steps the multiplier at 5, 10 and 20', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(comboMultiplier)).toEqual([1, 1, 1.5, 1.5, 2, 2, 3, 3]);
  });
});

describe("can't fail", () => {
  it('costs a lost ball only score and combo, never below zero', () => {
    const s = playing();
    for (let i = 0; i < 3; i++) s.award(50);
    const took = s.onBallLost();
    expect(took).toEqual({ score: 150, coins: 0, combo: 3 });
    expect(s.score).toBe(0);
    expect(s.combo).toBe(0);
    expect(s.step).toBe('play');
    expect(s.counts.ballsLost).toBe(1);
  });

  it('keeps going however many balls are lost', () => {
    const s = playing();
    for (let i = 0; i < 100; i++) s.onBallLost();
    expect(s.step).toBe('play');
    run(s, SPEC.durationMs + 16);
    expect(s.step).toBe('scoring');
  });

  it('halves or keeps the combo as the penalty says', () => {
    const s = playing();
    for (let i = 0; i < 9; i++) s.award(10);
    expect(s.penalty({ combo: 'halve' }).combo).toBe(5);
    expect(s.combo).toBe(4);
    expect(s.penalty({ score: 5 })).toEqual({ score: 5, coins: 0, combo: 0 });
    expect(s.combo).toBe(4);
  });

  it('takes coins back from the haul, never below zero', () => {
    const s = playing();
    s.addCoins(3);
    expect(s.penalty({ coins: 5 }).coins).toBe(3);
    expect(s.coins).toBe(0);
  });
});

describe('medals by coins', () => {
  it('measures the medal on the coins when the stage says so', () => {
    const s = playing({ ...SPEC, medalBy: 'coins', medals: [10, 20, 30] });
    s.award(5_000);
    expect(s.medal).toBe('none');
    s.addCoins(21);
    expect(s.medalValue).toBe(21);
    expect(s.medal).toBe('silver');
  });

  it('measures the score by default', () => {
    const s = playing();
    s.addCoins(99_999);
    expect(s.medal).toBe('none');
    expect(s.medalBy).toBe('score');
  });
});

describe('medals and rewards', () => {
  it('gives the best medal the score reaches', () => {
    const m: [number, number, number] = [1_000, 2_000, 3_000];
    expect(medalFor(999, m)).toBe('none');
    expect(medalFor(1_000, m)).toBe('bronze');
    expect(medalFor(2_999, m)).toBe('silver');
    expect(medalFor(9_999, m)).toBe('gold');
  });

  it('rewards better medals with more', () => {
    const tiers = (['none', 'bronze', 'silver', 'gold'] as const).map(rewardFor);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.coins).toBeGreaterThan(tiers[i - 1]!.coins);
      expect(tiers[i]!.abilityCharges).toBeGreaterThanOrEqual(tiers[i - 1]!.abilityCharges);
    }
    expect(rewardFor('gold').abilityCharges).toBeGreaterThan(0);
  });

  it('always clears the level with at least a star', () => {
    expect(starsFor('none')).toBe(1);
    expect(starsFor('bronze')).toBe(1);
    expect(starsFor('silver')).toBe(2);
    expect(starsFor('gold')).toBe(3);
  });
});

describe('tally', () => {
  const rows: TallyRow[] = [
    { label: 'Hits', value: 7 },
    { label: 'Score', value: 12_345, kind: 'score' },
    { label: 'Coins', value: 0, kind: 'coins' },
  ];
  const tl = tallyTimeline(rows);

  it('counts each row in turn after the lead', () => {
    expect(tl.rows[0]!.start).toBe(TALLY_LEAD_MS);
    for (let i = 1; i < tl.rows.length; i++) expect(tl.rows[i]!.start).toBeGreaterThan(tl.rows[i - 1]!.end);
  });

  it('ticks once a unit for small numbers and caps large ones', () => {
    const per = (row: number) => tl.ticks.filter((t) => t.row === row).length;
    expect(per(0)).toBe(7);
    expect(per(1)).toBe(TALLY_MAX_TICKS);
    expect(per(2)).toBe(0);
    expect(tl.rows[1]!.end - tl.rows[1]!.start).toBe(TALLY_MAX_TICKS * TALLY_TICK_MS);
  });

  it('ends each row on its value, climbing in pitch', () => {
    for (let r = 0; r < 2; r++) {
      const ticks = tl.ticks.filter((t) => t.row === r);
      expect(ticks[ticks.length - 1]!.value).toBe(rows[r]!.value);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]!.value).toBeGreaterThanOrEqual(ticks[i - 1]!.value);
        expect(ticks[i]!.pitch).toBeGreaterThan(ticks[i - 1]!.pitch);
      }
    }
  });

  it('slams the medal after the last row, then waits', () => {
    expect(tl.medalAt).toBe(tl.rows[2]!.end + MEDAL_PAUSE_MS);
    expect(tl.readyAt).toBe(tl.medalAt + MEDAL_LAND_MS);
    expect(tl.endAt).toBe(tl.readyAt + TALLY_HOLD_MS);
  });

  it('shows nothing before a row starts and all of it once counted', () => {
    expect(tallyValue(tl, rows, 1, tl.rows[1]!.start - 1)).toBe(0);
    const mid = tallyValue(tl, rows, 1, (tl.rows[1]!.start + tl.rows[1]!.end) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(12_345);
    expect(tallyValue(tl, rows, 1, tl.rows[1]!.end)).toBe(12_345);
  });

  it('builds the rows from the stage, then the score and the coins', () => {
    const s = playing();
    s.count('hits', 4);
    s.award(300);
    s.addCoins(6);
    s.endTimer();
    run(s, SCORING_MS);
    expect(s.step).toBe('tally');
    expect(s.tallyRows.map((r) => [r.label, r.value, r.kind])).toEqual([
      ['Hits', 4, 'stat'],
      ['Score', 300, 'score'],
      ['Coins', 6, 'coins'],
    ]);
  });

  it('finishes the count on the first tap and ends on a tap once the medal lands', () => {
    const s = playing();
    s.endTimer();
    run(s, SCORING_MS);
    const tally = s.tally!;
    expect(s.skip()).toEqual([]); // inside the guard
    s.tick(BONUS_SKIP_GUARD_MS);
    expect(s.skip()).toEqual([]);
    expect(s.stepMs).toBe(tally.medalAt);
    s.tick(MEDAL_LAND_MS);
    expect(s.skip().map((e) => e.step)).toEqual(['done']);
  });

  it('ends by itself if nobody taps', () => {
    const s = playing();
    s.endTimer();
    run(s, SCORING_MS);
    const seen = run(s, s.tally!.endAt + 32);
    expect(seen).toEqual(['done']);
  });
});

describe('bonus saves', () => {
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

  it('defaults and normalizes bonus bests', () => {
    expect(defaultSave().bonus).toEqual({});
    const s = normalizeSave({ bonus: { gallery: { bestScore: -4, medal: 'platinum' }, x: { bestScore: 9, medal: 'gold' } } });
    expect(s.bonus.gallery).toEqual({ bestScore: 0, medal: 'none' });
    expect(s.bonus.x).toEqual({ bestScore: 9, medal: 'gold' });
  });

  it('keeps the best score and the best medal apart', async () => {
    const store = new SaveStore(memoryStorage());
    await store.load();
    expect(store.recordBonus('gallery', 5_000, 'silver')).toBe(true);
    expect(store.recordBonus('gallery', 4_000, 'gold')).toBe(false);
    expect(store.state.bonus.gallery).toEqual({ bestScore: 5_000, medal: 'gold' });
    expect(store.recordBonus('gallery', 6_000, 'bronze')).toBe(true);
    expect(store.state.bonus.gallery).toEqual({ bestScore: 6_000, medal: 'gold' });
  });

  it('grants ability charges up to the stock limit, and only unlocked ones', async () => {
    const store = new SaveStore(memoryStorage());
    await store.load();
    const unlocked = (Object.keys(store.state.abilities) as Array<keyof typeof store.state.abilities>).filter(
      (id) => store.state.abilities[id] > 0,
    );
    const locked = (Object.keys(store.state.abilities) as Array<keyof typeof store.state.abilities>).find(
      (id) => store.state.abilities[id] <= 0,
    );
    expect(unlocked.length).toBeGreaterThan(0);
    if (locked) expect(store.grantStockAbility(locked)).toBe(false);
    for (let i = 0; i < MAX_ABILITY_STOCK; i++) expect(store.grantStockAbility(unlocked[0]!)).toBe(true);
    expect(store.grantStockAbility(unlocked[0]!)).toBe(false);
    expect(store.state.stock.abilities).toHaveLength(MAX_ABILITY_STOCK);
  });
});

describe('bonus map property', () => {
  const ASSETS = join(__dirname, '..', 'public', 'assets');
  const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
  const tileset = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
  const resolve = (source: string) => (source.endsWith('bricks.tsj') ? tileset : undefined);
  const empty = (properties?: TiledMap['properties']): TiledMap => ({
    tilesets: [{ firstgid: 1, source: 'bricks.tsj' }],
    layers: [{ type: 'objectgroup', name: 'Bricks', objects: [] }],
    properties,
  });

  it('reads the shipped gallery map as a bonus stage with no bricks', () => {
    const map = readJson<TiledMap>(join(ASSETS, 'levels', 'gallery.tmj'));
    const { level, warnings } = parseLevel(map, 'gallery', resolve);
    expect(warnings).toEqual([]);
    expect(level.bonus).toBe('gallery');
    expect(level.boss).toBeUndefined();
    expect(level.title).toBe('Shooting Gallery');
    expect(level.lighting?.mood).toBe('party');
    expect(validateLevel(level)).toEqual([]);
  });

  it('warns about an unknown stage and leaves the level without one', () => {
    const { level, warnings } = parseLevel(empty({ bonus: 'whackamole' }), 'lab', resolve);
    expect(level.bonus).toBeUndefined();
    expect(warnings).toEqual(['Map: unknown bonus stage "whackamole"']);
  });

  it('gives no stage when the property is missing or empty', () => {
    expect(parseLevel(empty(), 'lab', resolve).level.bonus).toBeUndefined();
    const blank = parseLevel(empty({ bonus: '' }), 'lab', resolve);
    expect(blank.level.bonus).toBeUndefined();
    expect(blank.warnings).toEqual([]);
    const none = parseLevel(empty({ bonus: 'none' }), 'lab', resolve);
    expect(none.level.bonus).toBeUndefined();
    expect(none.warnings).toEqual([]);
  });

  it('warns when a map names a boss and a bonus stage', () => {
    const { warnings } = parseLevel(empty({ bonus: 'gallery', boss: 'warden' }), 'lab', resolve);
    expect(warnings).toContain('Map: a level is a boss fight or a bonus stage, not both');
  });
});
