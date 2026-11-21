import { bonusStopId, bossStopId, levelId } from './SaveStore';
import type { LevelSpec } from './types';

/**
 * A boss fight on the world map, between level `after` and the next one. Its map names the boss,
 * and the next level opens once the boss is beaten. A stop can also name a bonus stage, played
 * as the boss's reward on the way to the next level.
 */
export interface BossStop {
  after: number;
  level: LevelSpec;
  bonus?: LevelSpec;
}

/** Which stop after a level a step is: its boss fight, or the bonus stage that follows it. */
export type StopKind = 'boss' | 'bonus';

/** The stop asked for, if the stop after the level has one of that kind. */
export function stopOf(stop: BossStop | undefined, asked: StopKind | undefined): StopKind | undefined {
  if (!stop || !asked) return undefined;
  return asked === 'boss' || stop.bonus ? asked : undefined;
}

/** The map a stop plays. */
export function stopLevel(stop: BossStop | undefined, kind: StopKind): LevelSpec | undefined {
  return kind === 'bonus' ? stop?.bonus : stop?.level;
}

/** A place in the campaign: a level, or one of the stops after it. */
export interface CampaignStep {
  index: number;
  /** A stop after level `index`, rather than the level. */
  stop?: StopKind;
}

/** Where a step's stars and best score are saved, and what carried abilities wait for. */
export function stepKey(step: CampaignStep): string {
  if (step.stop === 'boss') return bossStopId(step.index);
  if (step.stop === 'bonus') return bonusStopId(step.index);
  return levelId(step.index);
}

/** What a step is called where the game points the player at it. */
export function stepLabel(step: CampaignStep): string {
  if (step.stop === 'boss') return 'Boss fight';
  if (step.stop === 'bonus') return 'Bonus stage';
  return `Level ${step.index}`;
}

/** The heading over a won step. */
export function clearedLabel(step: CampaignStep): string {
  if (step.stop === 'boss') return 'Boss beaten';
  if (step.stop === 'bonus') return 'Bonus complete';
  return `Level ${step.index} clear`;
}

/**
 * Where a win leads: to the level's boss stop while its boss stands, from a beaten boss to its
 * bonus stage, and from there on to the next level.
 */
export function stepAfter(
  step: CampaignStep,
  hasStop: (after: number) => boolean,
  beaten: (after: number) => boolean,
  hasBonus: (after: number) => boolean = () => false,
): CampaignStep {
  if (!step.stop && hasStop(step.index) && !beaten(step.index)) return { index: step.index, stop: 'boss' };
  if (step.stop === 'boss' && hasBonus(step.index)) return { index: step.index, stop: 'bonus' };
  return { index: step.index + 1 };
}

/** The index file's boss stops, as written: a map played after a level, and its bonus stage's. */
export interface BossStopEntry {
  after: number;
  map: string;
  bonus?: string;
}

/**
 * A cutscene the index file places in the campaign: played on the way into the step `before`
 * names, or on the way out of the one `after` names. Both are `stepKey` strings.
 */
export interface SceneEntry {
  id: string;
  before?: string;
  after?: string;
}

/** The index file's cutscenes, minus entries without an id, a place, or a scene `known` has. */
export function validScenes(entries: unknown, known: (id: string) => boolean = () => true): SceneEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: SceneEntry[] = [];
  for (const e of entries as Array<Partial<SceneEntry> | null>) {
    const id = e?.id;
    const before = typeof e?.before === 'string' ? e.before : undefined;
    const after = typeof e?.after === 'string' ? e.after : undefined;
    if (typeof id !== 'string' || !id || (!before && !after) || !known(id)) continue;
    out.push({ id, ...(before && { before }), ...(after && { after }) });
  }
  return out;
}

/**
 * The cutscene to play when the player goes from `from` to `to`: the first not yet `seen` that
 * follows `from` or leads into `to`. Either end may be missing: a level started from the map has
 * no `from`, and the campaign's last win has no `to`.
 */
export function sceneBetween(
  from: CampaignStep | undefined,
  to: CampaignStep | undefined,
  entries: readonly SceneEntry[],
  seen: (id: string) => boolean,
): string | undefined {
  const out = from && stepKey(from);
  const into = to && stepKey(to);
  const hit = entries.find(
    (e) => !seen(e.id) && ((out !== undefined && e.after === out) || (into !== undefined && e.before === into)),
  );
  return hit?.id;
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
    out.push(typeof e?.bonus === 'string' ? { after: after!, map, bonus: e.bonus } : { after: after!, map });
  }
  return out.sort((a, b) => a.after - b.after);
}
