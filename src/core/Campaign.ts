import { bonusStopId, bossStopId, levelId } from './SaveStore';
import type { LevelSpec } from './types';

/**
 * A stop on the world map, between level `after` and the next one: a boss fight, a bonus stage,
 * or both. A boss's map names the boss, and the next level opens once the boss is beaten; a bonus
 * stage after a boss is its reward on the way to the next level.
 */
export interface BossStop {
  after: number;
  /** The boss fight's map. A stop without one is a bonus stage alone. */
  level?: LevelSpec;
  bonus?: LevelSpec;
}

/** Which stop after a level a step is: its boss fight, or the bonus stage that follows it. */
export type StopKind = 'boss' | 'bonus';

/** The stop asked for, if the stop after the level has one of that kind. */
export function stopOf(stop: BossStop | undefined, asked: StopKind | undefined): StopKind | undefined {
  if (!stop || !asked) return undefined;
  return (asked === 'boss' ? stop.level : stop.bonus) ? asked : undefined;
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
 * bonus stage, and from there on to the next level. A bonus stage with no boss before it is next
 * after its level until it has been played once.
 */
export function stepAfter(
  step: CampaignStep,
  hasBoss: (after: number) => boolean,
  beaten: (after: number) => boolean,
  hasBonus: (after: number) => boolean = () => false,
  bonusPlayed: (after: number) => boolean = () => false,
): CampaignStep {
  const i = step.index;
  if (!step.stop) {
    if (hasBoss(i) && !beaten(i)) return { index: i, stop: 'boss' };
    if (!hasBoss(i) && hasBonus(i) && !bonusPlayed(i)) return { index: i, stop: 'bonus' };
  }
  if (step.stop === 'boss' && hasBonus(i)) return { index: i, stop: 'bonus' };
  return { index: i + 1 };
}

/** The index file's stops, as written: a boss map played after a level, a bonus stage, or both. */
export interface BossStopEntry {
  after: number;
  map?: string;
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
    const map = typeof e?.map === 'string' ? e.map : undefined;
    const bonus = typeof e?.bonus === 'string' ? e.bonus : undefined;
    if ((!map && !bonus) || !Number.isInteger(after)) continue;
    if (after! < 1 || after! >= levelCount || out.some((s) => s.after === after)) continue;
    out.push({ after: after!, ...(map && { map }), ...(bonus && { bonus }) });
  }
  return out.sort((a, b) => a.after - b.after);
}
