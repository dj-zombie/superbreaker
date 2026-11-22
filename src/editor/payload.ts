import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../core/LevelParser';
import type { BossStop } from '../core/Campaign';
import type { LevelSpec } from '../core/types';

/** What the Tiled fork's Live Preview dock sends after every edit. */
export interface EditorPayload {
  /** The open map as Tiled would save it to a .tmj, saved or not. */
  map: TiledMap;
  /** The map's file name, e.g. `level07.tmj`. Empty for a map that was never saved. */
  file: string;
  /** The map's external tilesets as Tiled holds them now, keyed by the `source` the map names. */
  tilesets?: Record<string, TiledTileset>;
}

/** The tileset and templates the game loaded, for whatever the payload doesn't carry. */
export interface CachedResolvers {
  tileset: (source: string) => TiledTileset | undefined;
  template: (path: string) => TiledTemplate | undefined;
}

export interface EditorLevel {
  level: LevelSpec;
  /** Parser warnings, then what validateLevel finds. */
  warnings: string[];
}

/** The level id a file name gives, as Preload names campaign maps. */
export function editorLevelId(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? '';
  return name.replace(/\.tmj$/i, '') || 'untitled';
}

/** Parses a pushed map, preferring the tilesets that came with it over the ones on disk. */
export function levelFromPayload(payload: EditorPayload, cached: CachedResolvers): EditorLevel {
  const pushed = payload.tilesets ?? {};
  const resolveTileset = (source: string) => pushed[source] ?? cached.tileset(source);
  const { level, warnings } = parseLevel(
    payload.map,
    editorLevelId(payload.file),
    resolveTileset,
    cached.template,
  );
  return { level, warnings: [...warnings, ...validateLevel(level)] };
}

/**
 * Where a previewed map sits in the campaign: its level number, or the level a boss or bonus
 * stop follows. Undefined for a map the campaign doesn't list.
 */
export function campaignIndexOf(id: string, levels: LevelSpec[], stops: BossStop[]): number | undefined {
  const i = levels.findIndex((l) => l.id === id);
  if (i >= 0) return i + 1;
  return stops.find((s) => s.level?.id === id || s.bonus?.id === id)?.after;
}
