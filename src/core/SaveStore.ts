import { DIFFICULTIES, UPGRADE_IDS, type DifficultyId, type UpgradeId } from './types';
import {
  ABILITY_IDS,
  MAX_ABILITY_TIER,
  STARTER_ABILITIES,
  abilityCost,
  defaultAbilityTiers,
  type AbilityId,
  type AbilityTiers,
} from './Abilities';
import { MAX_UPGRADE_LEVEL, canPurchase, upgradeCost, type PurchaseResult } from './Economy';
import {
  SESSION_ABILITY_COST,
  SESSION_POWERUP_COST,
  emptyStock,
  normalizeStock,
  stockAbilityResult,
  stockPowerupResult,
  type SessionBuyResult,
  type SessionPowerupId,
  type SessionStock,
} from './Session';

/** Async key/value storage so native (Capacitor Preferences) and web share one API. */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface LevelProgress {
  stars: number;
  bestScore: number;
}

export interface RunBest {
  bestScore: number;
  /** Waves cleared, or rows survived in Descent. */
  bestReach: number;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  screenShake: boolean;
  /** Lower render resolution and fewer particles. */
  batterySaver: boolean;
  /** Balls bounce off the floor and no lives are lost. */
  godMode: boolean;
}

export interface SaveData {
  version: 1;
  difficulty: DifficultyId;
  coins: number;
  upgrades: Record<UpgradeId, number>;
  /** Ability slot tiers; 0 = locked. */
  abilities: AbilityTiers;
  /** One-use powerups and abilities. Spent in play, not permanent upgrades. */
  stock: SessionStock;
  /** Keyed by level id, e.g. "level01". */
  levels: Record<string, LevelProgress>;
  /** Number of levels unlocked, counted from the first. */
  unlocked: number;
  /** Arcade bests, keyed by loop and goal, e.g. "waves-endless". */
  runs: Record<string, RunBest>;
  settings: Settings;
  seenInstructions: boolean;
}

export const SAVE_KEY = 'superbreaker.save';

export function defaultSave(): SaveData {
  return {
    version: 1,
    difficulty: 'easy',
    coins: 0,
    upgrades: { magnet: 1, fireball: 1, laser: 1 },
    abilities: defaultAbilityTiers(),
    stock: emptyStock(),
    levels: {},
    unlocked: 1,
    runs: {},
    settings: {
      music: true,
      sfx: true,
      haptics: true,
      reducedMotion: false,
      screenShake: true,
      batterySaver: false,
      godMode: false,
    },
    seenInstructions: false,
  };
}

/** Coerces untrusted JSON into a valid save, filling gaps with defaults. */
export function normalizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  if (DIFFICULTIES.includes(r.difficulty as DifficultyId)) d.difficulty = r.difficulty!;
  d.coins = nonNegInt(r.coins, 0);
  for (const id of UPGRADE_IDS) {
    d.upgrades[id] = clamp(nonNegInt(r.upgrades?.[id], 1), 1, MAX_UPGRADE_LEVEL);
  }
  for (const id of ABILITY_IDS) {
    const min = STARTER_ABILITIES.includes(id) ? 1 : 0;
    d.abilities[id] = clamp(nonNegInt(r.abilities?.[id], min), min, MAX_ABILITY_TIER);
  }
  d.stock = normalizeStock(r.stock);
  if (r.levels && typeof r.levels === 'object') {
    for (const [k, v] of Object.entries(r.levels)) {
      d.levels[k] = {
        stars: clamp(nonNegInt(v?.stars, 0), 0, 3),
        bestScore: nonNegInt(v?.bestScore, 0),
      };
    }
  }
  d.unlocked = Math.max(1, nonNegInt(r.unlocked, 1));
  if (r.runs && typeof r.runs === 'object') {
    for (const [k, v] of Object.entries(r.runs)) {
      d.runs[k] = { bestScore: nonNegInt(v?.bestScore, 0), bestReach: nonNegInt(v?.bestReach, 0) };
    }
  }
  if (r.settings && typeof r.settings === 'object') {
    for (const k of Object.keys(d.settings) as (keyof Settings)[]) {
      if (typeof r.settings[k] === 'boolean') d.settings[k] = r.settings[k];
    }
  }
  d.seenInstructions = r.seenInstructions === true;
  return d;
}

/**
 * Reads the pre-2.0 localStorage keys written by the Cordova build.
 * Returns null when there is nothing to migrate.
 */
export function migrateLegacy(get: (key: string) => string | null): SaveData | null {
  const levelsRaw = get('levels');
  const coinsRaw = get('coins');
  if (levelsRaw === null && coinsRaw === null) return null;
  const d = defaultSave();
  d.coins = nonNegInt(Number(coinsRaw), 0);
  for (const id of UPGRADE_IDS) {
    d.upgrades[id] = clamp(nonNegInt(Number(get(id)), 1), 1, MAX_UPGRADE_LEVEL);
  }
  const diff = get('difficulty');
  if (DIFFICULTIES.includes(diff as DifficultyId)) d.difficulty = diff as DifficultyId;
  d.settings.music = get('music') !== 'off';
  try {
    const arr = JSON.parse(levelsRaw ?? '[]') as Array<{ stars?: unknown; bestScore?: unknown }>;
    let lastCleared = 0;
    arr.forEach((lv, i) => {
      const stars = clamp(nonNegInt(Number(lv?.stars), 0), 0, 3);
      if (stars > 0) {
        d.levels[levelId(i + 1)] = { stars, bestScore: nonNegInt(Number(lv?.bestScore), 0) };
        lastCleared = i + 1;
      }
    });
    d.unlocked = lastCleared + 1;
  } catch {
    // Corrupt legacy level data: keep defaults.
  }
  return d;
}

export function levelId(index: number): string {
  return `level${String(index).padStart(2, '0')}`;
}

export class SaveStore {
  private data: SaveData = defaultSave();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly storage: KeyValueStorage) {}

  async load(legacyGet?: (key: string) => string | null): Promise<SaveData> {
    const raw = await this.storage.get(SAVE_KEY);
    if (raw) {
      try {
        this.data = normalizeSave(JSON.parse(raw));
        return this.data;
      } catch {
        // Fall through to legacy/default.
      }
    }
    this.data = (legacyGet && migrateLegacy(legacyGet)) || defaultSave();
    this.persist();
    return this.data;
  }

  get state(): Readonly<SaveData> {
    return this.data;
  }

  update(mutator: (d: SaveData) => void): void {
    mutator(this.data);
    this.persist();
  }

  addCoins(n: number): void {
    this.update((d) => (d.coins += Math.max(0, Math.floor(n))));
  }

  purchase(id: UpgradeId): PurchaseResult {
    const res = canPurchase(id, this.data.upgrades, this.data.coins);
    if (res === 'ok') {
      const cost = upgradeCost(id, this.data.upgrades[id])!;
      this.update((d) => {
        d.coins -= cost;
        d.upgrades[id] += 1;
      });
    }
    return res;
  }

  /** Buys one powerup charge for the current run. */
  purchaseStockPowerup(id: SessionPowerupId): SessionBuyResult {
    const res = stockPowerupResult(id, this.data.coins, this.data.stock.powerups.length);
    if (res === 'ok') {
      const cost = SESSION_POWERUP_COST[id];
      this.update((d) => {
        d.coins -= cost;
        d.stock.powerups.push(id);
      });
    }
    return res;
  }

  /** Buys one ability charge. It fills an empty slot and is not a permanent tier. */
  purchaseStockAbility(id: AbilityId): SessionBuyResult {
    const res = stockAbilityResult(
      id,
      this.data.coins,
      this.data.stock.abilities.length,
      this.data.abilities[id] > 0,
    );
    if (res === 'ok') {
      const cost = SESSION_ABILITY_COST[id];
      this.update((d) => {
        d.coins -= cost;
        d.stock.abilities.push(id);
      });
    }
    return res;
  }

  /** Removes one stocked powerup so play can apply it. */
  useStockPowerup(index: number): SessionPowerupId | null {
    const id = this.data.stock.powerups[index];
    if (!id) return null;
    this.update((d) => {
      d.stock.powerups.splice(index, 1);
    });
    return id;
  }

  /** Takes the oldest stocked ability, for the first free slot. */
  pullStockAbility(): AbilityId | null {
    const id = this.data.stock.abilities[0];
    if (!id) return null;
    this.update((d) => {
      d.stock.abilities.shift();
    });
    return id;
  }

  /** Puts an unused stocked ability back, for example when a level is abandoned. */
  returnStockAbility(id: AbilityId): void {
    this.update((d) => {
      d.stock.abilities.unshift(id);
    });
  }

  /** Unlocks an ability, or raises its tier. */
  purchaseAbility(id: AbilityId): PurchaseResult {
    const cost = abilityCost(id, this.data.abilities[id]);
    if (cost === null) return 'maxed';
    if (this.data.coins < cost) return 'insufficient';
    this.update((d) => {
      d.coins -= cost;
      d.abilities[id] += 1;
    });
    return 'ok';
  }

  /** Records a cleared level; returns true if it is a new best score. */
  recordWin(index: number, stars: number, score: number, totalLevels: number): boolean {
    const id = levelId(index);
    const prev = this.data.levels[id] ?? { stars: 0, bestScore: 0 };
    const isBest = score > prev.bestScore;
    this.update((d) => {
      d.levels[id] = {
        stars: Math.max(prev.stars, clamp(stars, 0, 3)),
        bestScore: Math.max(prev.bestScore, score),
      };
      d.unlocked = Math.min(totalLevels, Math.max(d.unlocked, index + 1));
    });
    return isBest;
  }

  /** Opens every campaign level. Stars and best scores are left as they are. */
  unlockAll(totalLevels: number): void {
    this.update((d) => (d.unlocked = Math.max(d.unlocked, totalLevels)));
  }

  /** Records the end of an Arcade run; returns true if it is a new best score. */
  recordRun(key: string, score: number, reach: number): boolean {
    const prev = this.data.runs[key] ?? { bestScore: 0, bestReach: 0 };
    const isBest = score > prev.bestScore;
    this.update((d) => {
      d.runs[key] = {
        bestScore: Math.max(prev.bestScore, Math.floor(score)),
        bestReach: Math.max(prev.bestReach, Math.floor(reach)),
      };
    });
    return isBest;
  }

  /** Serializes writes so a slow native write can't land out of order. */
  flush(): Promise<void> {
    return this.writeChain;
  }

  private persist(): void {
    const json = JSON.stringify(this.data);
    this.writeChain = this.writeChain.then(() => this.storage.set(SAVE_KEY, json)).catch(() => {});
  }
}

function nonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
