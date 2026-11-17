import { bossStopId, levelId } from './SaveStore';
import type { LevelSpec } from './types';

/**
 * A boss fight on the world map, between level `after` and the next one. Its map names the boss,
 * and the next level opens once the boss is beaten.
 */
export interface BossStop {
  after: number;
  level: LevelSpec;
}

/** A place in the campaign: a level, or the boss stop after it. */
export interface CampaignStep {
  index: number;
  /** The boss stop after level `index`, rather than the level. */
  stop?: boolean;
}

/** Where a step's stars and best score are saved, and what carried abilities wait for. */
export function stepKey(step: CampaignStep): string {
  return step.stop ? bossStopId(step.index) : levelId(step.index);
}

/** Where a win leads: to the level's boss stop while its boss stands, else to the next level. */
export function stepAfter(
  step: CampaignStep,
  hasStop: (after: number) => boolean,
  beaten: (after: number) => boolean,
): CampaignStep {
  if (!step.stop && hasStop(step.index) && !beaten(step.index)) return { index: step.index, stop: true };
  return { index: step.index + 1 };
}

/** The index file's boss stops, as written: a map played after a level. */
export interface BossStopEntry {
  after: number;
  map: string;
}

/** The stops an index file lists, in order, minus any that don't sit between two of its levels. */
export function validStops(entries: unknown, levelCount: number): BossStopEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: BossStopEntry[] = [];
  for (const e of entries as Array<Partial<BossStopEntry> | null>) {
    const after = e?.after;
    const map = e?.map;
    if (typeof map !== 'string' || !Number.isInteger(after)) continue;
    if (after! < 1 || after! >= levelCount || out.some((s) => s.after === after)) continue;
    out.push({ after: after!, map });
  }
  return out.sort((a, b) => a.after - b.after);
}
