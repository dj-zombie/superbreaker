import type { BonusId } from './Bonus';
import type { BossId } from './Boss';
import type { LevelLightingSpec, LightSpec } from './Lighting';

export const BRICK_KINDS = [
  'normal',
  'steel',
  'explosive',
  'armored',
  'regen',
  'fuse',
  'phantom',
  'switch',
  'gate',
  'portal',
  'virus',
] as const;
export type BrickKind = (typeof BRICK_KINDS)[number];

/** Kinds nothing breaks. Every other kind counts toward clearing the level. */
export const UNBREAKABLE_KINDS: readonly BrickKind[] = ['steel', 'switch', 'gate', 'portal'];

export function isBreakableKind(kind: BrickKind): boolean {
  return !UNBREAKABLE_KINDS.includes(kind);
}

/** Settings for the level elements in docs/bricks/design.md. Each kind reads its own. */
export interface BrickProps {
  /** Switches and gates: the color they share, 1-3. */
  channel?: number;
  /** Gates: open (passable) at the start. */
  open?: boolean;
  /** Portals: the pair, 1-3. */
  link?: number;
  /** Phantoms: seconds per fade cycle. */
  period?: number;
  /** Phantoms: where in the cycle it starts, 0-1. */
  phase?: number;
  /** Virus: a core, which spreads the infection. */
  source?: boolean;
  /** Virus cores: ms between infections. */
  spreadMs?: number;
}

export const POWERUP_IDS = [
  'magnet',
  'fireball',
  'laser',
  'balls',
  'bigger',
  'smaller',
  'coin',
  'shield',
  'hyper',
  'extraLife',
  'pierce',
  'mystery',
] as const;
export type PowerupId = (typeof POWERUP_IDS)[number];

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type DifficultyId = (typeof DIFFICULTIES)[number];

export const UPGRADE_IDS = ['magnet', 'fireball', 'laser'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface BrickSpec {
  /** Tiled object id, unique within a level. */
  id: number;
  /** Top-left corner in playfield pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  texture: string;
  kind: BrickKind;
  health: number;
  armor: number;
  powerup?: PowerupId;
  /** Moving bricks slide between x and x + moveX (0 = static, negative = leftward). */
  moveX: number;
  /** Pixels per second. */
  moveSpeed: number;
  /** Seconds before a regen brick grows back. */
  regenDelay: number;
  /** Emissive bricks light their surroundings until they break. */
  light?: { color: number; radius: number; intensity: number };
  props?: BrickProps;
}

export interface LevelSpec {
  id: string;
  title: string;
  bricks: BrickSpec[];
  /** From the `Lights` object layer. */
  lights: LightSpec[];
  lighting: LevelLightingSpec;
  /** From the map property `boss`: the level is a boss fight and ends when the boss dies. */
  boss?: BossId;
  /** From the map property `bonus`: the level is a bonus stage and ends with its tally. */
  bonus?: BonusId;
}

export const FIELD_WIDTH = 600;
export const FIELD_HEIGHT = 800;
/**
 * Lowest brick edge, measured from the top of the level area. It keeps at least 150px
 * between the bricks and the paddle in the smallest arena (Layout ARENA_MIN).
 */
export const LEVEL_MAX_Y = 480;
