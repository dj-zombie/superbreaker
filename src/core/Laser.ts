import type { PowerupStats } from './Economy';

/** Each laser pickup rolls one of these; it keeps firing that way until the laser runs out. */
export const LASER_MODES = ['gun', 'helix', 'scatter', 'swarm', 'ricochet'] as const;
export type LaserMode = (typeof LASER_MODES)[number];

export interface LaserModeDef {
  /** Called out when the pickup is caught. */
  label: string;
  /** Volleys per second at full speed on tier 1. */
  volleys: number;
  /** Bolts fired in volley `i` (0-based). */
  bolts: (i: number) => number;
  /** Launch speed in px/s. */
  speed: number;
  /**
   * Share of the budget this mode gets, for how often its bolts land compared with a straight
   * shot: spread modes waste more and get a little extra, homing hardly misses and gets less.
   */
  efficiency: number;
  /** Relative chance of being rolled. */
  weight: number;
}

export const LASER_MODE_DEFS: Record<LaserMode, LaserModeDef> = {
  gun: { label: 'Machine Gun', volleys: 14, bolts: () => 1, speed: 820, efficiency: 1, weight: 1 },
  helix: { label: 'Helix', volleys: 7, bolts: () => 2, speed: 700, efficiency: 1, weight: 1 },
  scatter: {
    label: 'Scatter',
    volleys: 5,
    bolts: (i) => (i % 4 === 3 ? 5 : 3),
    speed: 760,
    efficiency: 1.1,
    weight: 1,
  },
  swarm: { label: 'Swarm', volleys: 7, bolts: () => 1, speed: 380, efficiency: 0.75, weight: 0.6 },
  ricochet: { label: 'Ricochet', volleys: 12, bolts: () => 1, speed: 720, efficiency: 0.9, weight: 1 },
};

/** The guns rev from SPIN_FLOOR to full speed over this long. */
export const LASER_SPIN_UP_MS = 700;
/** Over the last stretch the fire rate sags to COOL_FLOOR as the barrels overheat. */
export const LASER_COOL_MS = 600;
const SPIN_FLOOR = 0.35;
const COOL_FLOOR = 0.45;

/** Fire-rate multiplier, 0..1: an ease-out rev at the start and a linear sag at the end. */
export function laserCadence(elapsedMs: number, remainingMs: number): number {
  const rev = clamp01(elapsedMs / LASER_SPIN_UP_MS);
  const up = SPIN_FLOOR + (1 - SPIN_FLOOR) * (1 - (1 - rev) ** 2);
  const down = COOL_FLOOR + (1 - COOL_FLOOR) * clamp01(remainingMs / LASER_COOL_MS);
  return Math.min(up, down);
}

type LaserStats = Pick<PowerupStats, 'laserDurationMs' | 'laserBudget' | 'laserRate'>;

/** Milliseconds from one volley to the next. */
export function volleyGap(
  mode: LaserMode,
  stats: LaserStats,
  elapsedMs: number,
  remainingMs: number,
): number {
  const rate = LASER_MODE_DEFS[mode].volleys * stats.laserRate * laserCadence(elapsedMs, remainingMs);
  return 1000 / rate;
}

export interface LaserPlan {
  volleys: number;
  bolts: number;
  /** Damage per bolt, in quarter points so brick health stays exact. */
  damage: number;
}

/**
 * Walks the fire loop over a whole pickup, the way LaserSystem runs it: the first volley fires at
 * once and each one after waits `volleyGap`. The budget is shared out over every bolt it fires.
 */
export function laserSchedule(mode: LaserMode, stats: LaserStats): LaserPlan {
  const def = LASER_MODE_DEFS[mode];
  const total = stats.laserDurationMs;
  let t = 0;
  let volleys = 0;
  let bolts = 0;
  while (t < total) {
    bolts += def.bolts(volleys);
    volleys++;
    t += volleyGap(mode, stats, t, total - t);
  }
  const damage = Math.max(0.25, Math.round(((stats.laserBudget * def.efficiency) / bolts) * 4) / 4);
  return { volleys, bolts, damage };
}

/**
 * Most standard bricks a full laser can break if every bolt hits a fresh brick.
 * Real levels waste shots on armor, steel, gaps and overkill, so this is a ceiling.
 */
export function laserClearCeiling(stats: LaserStats, mode: LaserMode, brickHealth = 100): number {
  const plan = laserSchedule(mode, stats);
  return Math.floor(plan.bolts / Math.ceil(brickHealth / plan.damage));
}

/** A weighted pick that never repeats `previous`, so back-to-back lasers feel different. */
export function rollLaserMode(rand: () => number = Math.random, previous?: LaserMode): LaserMode {
  const pool = LASER_MODES.filter((m) => m !== previous);
  const total = pool.reduce((s, m) => s + LASER_MODE_DEFS[m].weight, 0);
  let r = rand() * total;
  for (const m of pool) {
    r -= LASER_MODE_DEFS[m].weight;
    if (r < 0) return m;
  }
  return pool[pool.length - 1]!;
}

/** Laser damage that breaks one armor point, however many bolts it takes to deliver. */
export const ARMOR_CHIP = 30;

/**
 * Banks laser damage against armor. Every ARMOR_CHIP breaks a point; once the armor is gone the
 * bank empties, and the bolts that follow go into health.
 */
export function chipArmor(
  armor: number,
  banked: number,
  damage: number,
): { armor: number; banked: number } {
  let a = Math.max(0, armor);
  let b = banked + damage;
  while (a > 0 && b >= ARMOR_CHIP) {
    a--;
    b -= ARMOR_CHIP;
  }
  return { armor: a, banked: a > 0 ? b : 0 };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
