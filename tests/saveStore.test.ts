import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  SaveStore,
  defaultSave,
  migrateLegacy,
  normalizeSave,
  type KeyValueStorage,
} from '../src/core/SaveStore';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    remove: async (k) => {
      delete data[k];
    },
  };
}

describe('normalizeSave', () => {
  it('fills defaults and clamps bad values', () => {
    const s = normalizeSave({
      coins: -5,
      upgrades: { magnet: 99 },
      difficulty: 'nightmare',
      levels: { level01: { stars: 7, bestScore: 100 } },
    });
    expect(s.coins).toBe(0);
    expect(s.upgrades.magnet).toBe(5);
    expect(s.difficulty).toBe('easy');
    expect(s.levels.level01).toEqual({ stars: 3, bestScore: 100 });
  });

  it('returns defaults for garbage', () => {
    expect(normalizeSave('nope')).toEqual(defaultSave());
  });
});

describe('migrateLegacy', () => {
  it('converts old Cordova localStorage keys', () => {
    const old: Record<string, string> = {
      levels: JSON.stringify([{ stars: 3 }, { stars: 1 }, { stars: 0 }]),
      coins: '243',
      magnet: '3',
      fireball: '1',
      laser: '2',
      music: 'off',
      difficulty: 'hard',
    };
    const s = migrateLegacy((k) => old[k] ?? null)!;
    expect(s.coins).toBe(243);
    expect(s.upgrades).toEqual({ magnet: 3, fireball: 1, laser: 2 });
    expect(s.settings.music).toBe(false);
    expect(s.difficulty).toBe('hard');
    expect(s.levels.level01?.stars).toBe(3);
    expect(s.unlocked).toBe(3);
  });

  it('returns null with no legacy data', () => {
    expect(migrateLegacy(() => null)).toBeNull();
  });
});

describe('ability save data', () => {
  it('defaults old saves to the starter abilities and clamps tiers', () => {
    const s = normalizeSave({ abilities: { bomb: 99, meteor: 0 } });
    expect(s.abilities.bomb).toBe(3);
    expect(s.abilities.meteor).toBe(1);
    expect(s.abilities.sweep).toBe(0);
    expect(s.settings.screenShake).toBe(true);
  });
});

describe('settings', () => {
  it('adds battery saver to older saves and keeps a stored choice', () => {
    expect(normalizeSave({ settings: { music: false } }).settings.batterySaver).toBe(false);
    expect(normalizeSave({ settings: { batterySaver: true } }).settings.batterySaver).toBe(true);
  });
});

describe('SaveStore', () => {
  it('persists purchases and wins', async () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    await store.load();
    store.addCoins(10);
    expect(store.purchase('magnet')).toBe('ok');
    expect(store.state.coins).toBe(2);
    expect(store.purchase('laser')).toBe('insufficient');
    store.addCoins(30);
    expect(store.purchaseAbility('meteor')).toBe('ok');
    expect(store.state.abilities.meteor).toBe(2);
    expect(store.purchaseAbility('bomb')).toBe('insufficient');
    expect(store.recordWin(1, 2, 5000, 24)).toBe(true);
    expect(store.recordWin(1, 3, 4000, 24)).toBe(false);
    await store.flush();

    const reloaded = new SaveStore(storage);
    const s = await reloaded.load();
    expect(s.coins).toBe(12);
    expect(s.abilities.meteor).toBe(2);
    expect(s.upgrades.magnet).toBe(2);
    expect(s.levels.level01).toEqual({ stars: 3, bestScore: 5000 });
    expect(s.unlocked).toBe(2);
  });

  it('buys one-use stock and keeps it in the save', async () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    await store.load();
    expect(store.purchaseStockPowerup('laser')).toBe('insufficient');
    expect(store.purchaseStockAbility('bomb')).toBe('locked');
    store.addCoins(40);
    expect(store.purchaseStockPowerup('laser')).toBe('ok');
    expect(store.purchaseStockAbility('meteor')).toBe('ok');
    expect(store.useStockPowerup(0)).toBe('laser');
    expect(store.state.stock.powerups).toEqual([]);
    expect(store.pullStockAbility()).toBe('meteor');
    store.returnStockAbility('meteor');
    expect(store.state.stock.abilities).toEqual(['meteor']);
    await store.flush();

    const reloaded = await new SaveStore(storage).load();
    expect(reloaded.stock.abilities).toEqual(['meteor']);
    expect(reloaded.coins).toBe(40 - 6 - 8);
  });

  it('prefers an existing save over legacy keys', async () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...defaultSave(), coins: 9 }) });
    const s = await new SaveStore(storage).load(() => '1000');
    expect(s.coins).toBe(9);
  });
});
