import {
  BRICK_KINDS,
  FIELD_WIDTH,
  LEVEL_MAX_Y,
  POWERUP_IDS,
  type BrickKind,
  type BrickSpec,
  type LevelSpec,
  type PowerupId,
} from './types';

/** Minimal subset of the Tiled JSON format that Super Breaker uses. */
type TiledPropValue = string | number | boolean;
type TiledProps =
  Array<{ name: string; type?: string; value: TiledPropValue }> | Record<string, TiledPropValue>;

export interface TiledTile {
  id: number;
  image?: string;
  properties?: TiledProps;
}

export interface TiledTileset {
  name?: string;
  tiles?: TiledTile[] | Record<string, { image?: string }>;
  /** Legacy (pre-1.2) embedded tilesets keep per-tile properties here. */
  tileproperties?: Record<string, Record<string, TiledPropValue>>;
}

export interface TiledTilesetRef extends TiledTileset {
  firstgid: number;
  source?: string;
}

export interface TiledObject {
  id: number;
  gid?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
  class?: string;
  properties?: TiledProps;
}

export interface TiledLayer {
  type: string;
  name: string;
  objects?: TiledObject[];
}

export interface TiledMap {
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
  properties?: TiledProps;
}

export interface ParseResult {
  level: LevelSpec;
  warnings: string[];
}

const GID_MASK = 0x1fffffff;
const DEFAULT_HEALTH = 100;
const DEFAULT_ARMOR = 2;
const DEFAULT_MOVE_SPEED = 60;
const DEFAULT_REGEN_DELAY = 4;

export function propsToRecord(props: TiledProps | undefined): Record<string, TiledPropValue> {
  if (!props) return {};
  if (Array.isArray(props)) return Object.fromEntries(props.map((p) => [p.name, p.value]));
  return { ...props };
}

interface ResolvedTile {
  texture: string;
  props: Record<string, TiledPropValue>;
}

/** Texture key = image file name without extension, e.g. "brick_blue". */
export function textureKeyFromImage(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.[a-z0-9]+$/i, '');
}

function buildGidTable(
  map: TiledMap,
  resolveExternal: (source: string) => TiledTileset | undefined,
  warnings: string[],
): Map<number, ResolvedTile> {
  const table = new Map<number, ResolvedTile>();
  for (const ref of map.tilesets) {
    const ts = ref.source ? resolveExternal(ref.source) : ref;
    if (!ts) {
      warnings.push(`Missing external tileset "${ref.source}"`);
      continue;
    }
    const tiles: Array<{ id: number; image?: string; properties?: TiledProps }> = Array.isArray(
      ts.tiles,
    )
      ? ts.tiles
      : Object.entries(ts.tiles ?? {}).map(([id, t]) => ({ id: Number(id), image: t.image }));
    for (const t of tiles) {
      if (!t.image) continue;
      table.set(ref.firstgid + t.id, {
        texture: textureKeyFromImage(t.image),
        props: { ...ts.tileproperties?.[String(t.id)], ...propsToRecord(t.properties) },
      });
    }
  }
  return table;
}

function asKind(v: TiledPropValue | undefined): BrickKind | undefined {
  return typeof v === 'string' && (BRICK_KINDS as readonly string[]).includes(v)
    ? (v as BrickKind)
    : undefined;
}

const isUnbreakable = (p: Record<string, TiledPropValue>) =>
  p.breakable === false || p.breakable === 'false';

/** Object `kind` > object legacy flags > tile `kind` > tile legacy flags. */
function resolveKind(
  tileProps: Record<string, TiledPropValue>,
  objProps: Record<string, TiledPropValue>,
  objType: string,
): BrickKind {
  return (
    asKind(objProps.kind) ??
    (isUnbreakable(objProps) || objType === 'solid' ? 'steel' : undefined) ??
    asKind(tileProps.kind) ??
    (isUnbreakable(tileProps) ? 'steel' : 'normal')
  );
}

function num(v: TiledPropValue | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Converts a Tiled map into a level spec. Any object layer is scanned; objects whose gid
 * isn't a known brick tile (e.g. decorative background images) are skipped.
 */
export function parseLevel(
  map: TiledMap,
  id: string,
  resolveExternal: (source: string) => TiledTileset | undefined = () => undefined,
): ParseResult {
  const warnings: string[] = [];
  const gids = buildGidTable(map, resolveExternal, warnings);
  const mapProps = propsToRecord(map.properties);
  const bricks: BrickSpec[] = [];

  for (const layer of map.layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const obj of layer.objects ?? []) {
      if (!obj.gid) continue;
      const tile = gids.get(obj.gid & GID_MASK);
      if (!tile) continue;
      if (!tile.texture.startsWith('brick_')) continue;

      const objProps = propsToRecord(obj.properties);
      const p = { ...tile.props, ...objProps };
      const kind = resolveKind(tile.props, objProps, obj.type ?? obj.class ?? '');
      // Legacy unbreakable bricks reuse colored art; show them as steel so players can tell.
      const texture =
        kind === 'steel' || kind === 'explosive' || kind === 'armored' || kind === 'regen'
          ? `brick_${kind}`
          : tile.texture;
      let powerup: PowerupId | undefined;
      if (typeof p.powerup === 'string' && p.powerup !== '') {
        if ((POWERUP_IDS as readonly string[]).includes(p.powerup)) {
          powerup = p.powerup as PowerupId;
        } else {
          warnings.push(`Brick ${obj.id}: unknown powerup "${p.powerup}"`);
        }
      }
      // Tile objects are anchored bottom-left in Tiled.
      const brick: BrickSpec = {
        id: obj.id,
        x: obj.x,
        y: obj.y - obj.height,
        width: obj.width,
        height: obj.height,
        texture,
        kind,
        health: Math.max(1, num(p.healthPts ?? p.health, DEFAULT_HEALTH)),
        armor: kind === 'armored' ? Math.max(1, Math.floor(num(p.armor, DEFAULT_ARMOR))) : 0,
        moveX: num(p.moveX, 0),
        moveSpeed: Math.max(1, num(p.moveSpeed, DEFAULT_MOVE_SPEED)),
        regenDelay: Math.max(0.5, num(p.regenDelay, DEFAULT_REGEN_DELAY)),
      };
      if (powerup) brick.powerup = powerup;
      bricks.push(brick);
    }
  }

  return {
    level: { id, title: typeof mapProps.title === 'string' ? mapProps.title : id, bricks },
    warnings,
  };
}

export function isBreakable(b: Pick<BrickSpec, 'kind'>): boolean {
  return b.kind !== 'steel';
}

/** Authoring checks, used by tests and logged in dev builds. */
export function validateLevel(level: LevelSpec): string[] {
  const issues: string[] = [];
  if (!level.bricks.some(isBreakable)) issues.push('Level has no breakable bricks');
  for (const b of level.bricks) {
    const minX = Math.min(b.x, b.x + b.moveX);
    const maxX = Math.max(b.x, b.x + b.moveX) + b.width;
    if (minX < 0 || maxX > FIELD_WIDTH || b.y < 0 || b.y + b.height > LEVEL_MAX_Y) {
      issues.push(`Brick ${b.id} at (${b.x}, ${b.y}) is outside the play area`);
    }
  }
  const statics = level.bricks.filter((b) => b.moveX === 0);
  const seen = new Map<string, number>();
  for (const b of statics) {
    const key = `${Math.round(b.x)},${Math.round(b.y)}`;
    const other = seen.get(key);
    if (other !== undefined) issues.push(`Bricks ${other} and ${b.id} overlap at ${key}`);
    else seen.set(key, b.id);
  }
  return issues;
}
