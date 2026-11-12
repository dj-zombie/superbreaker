import { ABILITY_IDS, type AbilityId } from './Abilities';
import type { DifficultyId } from './types';

/** Powerups you can buy as a single use. Tiny paddle and coins stay as drops only. */
export const SESSION_POWERUP_IDS = [
  'laser',
  'fireball',
  'magnet',
  'balls',
  'bigger',
  'shield',
  'hyper',
  'extraLife',
  'pierce',
] as const;
export type SessionPowerupId = (typeof SESSION_POWERUP_IDS)[number];

const POWERUP_SET = new Set<string>(SESSION_POWERUP_IDS);
const ABILITY_SET = new Set<string>(ABILITY_IDS);

export const MAX_POWERUP_STOCK = 4;
export const MAX_ABILITY_STOCK = 2;

/** One use, cheaper than the permanent upgrade of the same thing. */
export const SESSION_POWERUP_COST: Record<SessionPowerupId, number> = {
  magnet: 4,
  bigger: 4,
  balls: 5,
  shield: 5,
  pierce: 5,
  fireball: 6,
  laser: 6,
  hyper: 6,
  extraLife: 8,
};

export const SESSION_ABILITY_COST: Record<AbilityId, number> = {
  meteor: 8,
  lightning: 8,
  frenzy: 8,
  bomb: 10,
  sweep: 10,
  blackhole: 12,
};

export interface SessionStock {
  powerups: SessionPowerupId[];
  abilities: AbilityId[];
}

export function emptyStock(): SessionStock {
  return { powerups: [], abilities: [] };
}

export type SessionBuyResult = 'ok' | 'insufficient' | 'full' | 'locked';

export function normalizeStock(raw: unknown): SessionStock {
  const out = emptyStock();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { powerups?: unknown; abilities?: unknown };
  if (Array.isArray(r.powerups)) {
    for (const id of r.powerups) {
      if (out.powerups.length >= MAX_POWERUP_STOCK) break;
      if (typeof id === 'string' && POWERUP_SET.has(id)) out.powerups.push(id as SessionPowerupId);
    }
  }
  if (Array.isArray(r.abilities)) {
    for (const id of r.abilities) {
      if (out.abilities.length >= MAX_ABILITY_STOCK) break;
      if (typeof id === 'string' && ABILITY_SET.has(id)) out.abilities.push(id as AbilityId);
    }
  }
  return out;
}

export function stockPowerupResult(
  id: SessionPowerupId,
  coins: number,
  held: number,
): SessionBuyResult {
  if (held >= MAX_POWERUP_STOCK) return 'full';
  if (coins < SESSION_POWERUP_COST[id]) return 'insufficient';
  return 'ok';
}

export function stockAbilityResult(
  id: AbilityId,
  coins: number,
  held: number,
  unlocked: boolean,
): SessionBuyResult {
  if (!unlocked) return 'locked';
  if (held >= MAX_ABILITY_STOCK) return 'full';
  if (coins < SESSION_ABILITY_COST[id]) return 'insufficient';
  return 'ok';
}

/** Easy and normal keep unused abilities for the next level. Hard starts each level clean. */
export function abilitiesCarryOver(difficulty: DifficultyId): boolean {
  return difficulty !== 'hard';
}

/** Abilities held at the end of a cleared level, waiting for the next one. Not saved. */
export class RunCarry {
  private ids: AbilityId[] = [];
  private forLevel: number | null = null;

  stage(ids: readonly AbilityId[], nextLevel: number): void {
    this.ids = [...ids];
    this.forLevel = nextLevel;
  }

  /** Returns the staged abilities when `levelIndex` is the level they were staged for. */
  take(levelIndex: number): AbilityId[] {
    const ids = this.forLevel === levelIndex ? [...this.ids] : [];
    this.discard();
    return ids;
  }

  discard(): void {
    this.ids = [];
    this.forLevel = null;
  }
}

export const runCarry = new RunCarry();
