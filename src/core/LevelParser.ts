import {
  COOKIES,
  FLICKERS,
  LEVEL_LIGHTING_DEFAULTS,
  LIGHT_AFFECTS,
  LIGHT_DEFAULTS,
  MIN_LIGHTNING_INTERVAL,
  MOODS,
  hash,
  parseColor,
  type Cookie,
  type Flicker,
  type LevelLightingSpec,
  type LightAffects,
  type LightSpec,
  type Mood,
} from './Lighting';
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
  /** Degrees clockwise around the object's origin (top-left, or bottom-left for tiles). */
  rotation?: number;
  type?: string;
  class?: string;
  properties?: TiledProps;
  point?: boolean;
  ellipse?: boolean;
  polyline?: Array<{ x: number; y: number }>;
  polygon?: Array<{ x: number; y: number }>;
  text?: unknown;
  /** Path to an object template (.tj); the instance only stores what it overrides. */
  template?: string;
}

export interface TiledLayer {
  type: string;
  name: string;
  objects?: TiledObject[];
  /** Group layers nest other layers. */
  layers?: TiledLayer[];
  offsetx?: number;
  offsety?: number;
}

export interface TiledMap {
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
  properties?: TiledProps;
  class?: string;
}

/** An object template file (.tj). */
export interface TiledTemplate {
  object: Partial<TiledObject>;
  tileset?: { firstgid: number; source: string };
}

/** Name of the object layer that holds lights. Bricks come from every other layer. */
export const LIGHTS_LAYER = 'Lights';

export interface ParseResult {
  level: LevelSpec;
  warnings: string[];
}

const GID_MASK = 0x1fffffff;
const DEFAULT_HEALTH = 100;
const DEFAULT_ARMOR = 2;
const DEFAULT_MOVE_SPEED = 60;
const DEFAULT_REGEN_DELAY = 4;
const DEFAULT_BRICK_LIGHT_RADIUS = 80;
const DEFAULT_BRICK_LIGHT_INTENSITY = 0.6;

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

function tilesOf(ts: TiledTileset): TiledTile[] {
  return Array.isArray(ts.tiles)
    ? ts.tiles
    : Object.entries(ts.tiles ?? {}).map(([id, t]) => ({ id: Number(id), image: t.image }));
}

/** Tiles by local id. */
function resolveTileset(ts: TiledTileset): Map<number, ResolvedTile> {
  const out = new Map<number, ResolvedTile>();
  for (const t of tilesOf(ts)) {
    if (!t.image) continue;
    out.set(t.id, {
      texture: textureKeyFromImage(t.image),
      props: { ...ts.tileproperties?.[String(t.id)], ...propsToRecord(t.properties) },
    });
  }
  return out;
}

function buildGidTable(
  tilesets: TiledTilesetRef[],
  resolveExternal: (source: string) => TiledTileset | undefined,
  warnings: string[],
): Map<number, ResolvedTile> {
  const table = new Map<number, ResolvedTile>();
  for (const ref of tilesets) {
    const ts = ref.source ? resolveExternal(ref.source) : ref;
    if (!ts) {
      warnings.push(`Missing external tileset "${ref.source}"`);
      continue;
    }
    for (const [id, tile] of resolveTileset(ts)) table.set(ref.firstgid + id, tile);
  }
  return table;
}

/** Every object layer, flattening groups and applying layer offsets. */
function objectLayers(
  layers: TiledLayer[],
  dx = 0,
  dy = 0,
): Array<{ layer: TiledLayer; dx: number; dy: number }> {
  return layers.flatMap((layer) => {
    const ox = dx + (layer.offsetx ?? 0);
    const oy = dy + (layer.offsety ?? 0);
    if (layer.type === 'group') return objectLayers(layer.layers ?? [], ox, oy);
    return layer.type === 'objectgroup' ? [{ layer, dx: ox, dy: oy }] : [];
  });
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
 * Converts a Tiled map into a level spec. Bricks come from every object layer except `Lights`;
 * objects whose gid isn't a brick tile (e.g. decorative background images) are skipped. The
 * `Lights` layer holds lights: points, ellipses, rectangles, polylines and polygons.
 */
export function parseLevel(
  map: TiledMap,
  id: string,
  resolveExternal: (source: string) => TiledTileset | undefined = () => undefined,
  resolveTemplate: (path: string) => TiledTemplate | undefined = () => undefined,
): ParseResult {
  const warnings: string[] = [];
  const gids = buildGidTable(map.tilesets, resolveExternal, warnings);
  const mapProps = propsToRecord(map.properties);
  const bricks: BrickSpec[] = [];
  const lights: LightSpec[] = [];
  const templateTiles = new Map<string, Map<number, ResolvedTile>>();

  /** Template instances only store overrides; the rest (and maybe its own tileset) is in the .tj. */
  const expand = (raw: TiledObject): { obj: TiledObject; tile?: ResolvedTile } => {
    let obj = raw;
    let tile: ResolvedTile | undefined;
    if (raw.template) {
      const tpl = resolveTemplate(raw.template);
      if (!tpl) {
        warnings.push(`Object ${raw.id}: missing template "${raw.template}"`);
      } else {
        const base = tpl.object;
        obj = {
          ...base,
          ...raw,
          properties: { ...propsToRecord(base.properties), ...propsToRecord(raw.properties) },
        } as TiledObject;
        if (raw.gid === undefined && base.gid !== undefined && tpl.tileset) {
          const src = tpl.tileset.source;
          let table = templateTiles.get(src);
          if (!table) {
            const ts = resolveExternal(src);
            table = ts ? resolveTileset(ts) : new Map();
            if (!ts) warnings.push(`Template "${raw.template}": missing tileset "${src}"`);
            templateTiles.set(src, table);
          }
          tile = table.get((base.gid & GID_MASK) - tpl.tileset.firstgid);
        }
      }
    }
    if (!tile && obj.gid) tile = gids.get(obj.gid & GID_MASK);
    return { obj, tile };
  };

  for (const { layer, dx, dy } of objectLayers(map.layers)) {
    const isLights = layer.name.toLowerCase() === LIGHTS_LAYER.toLowerCase();
    for (const raw of layer.objects ?? []) {
      const { obj: o, tile } = expand(raw);
      const obj = { ...o, x: o.x + dx, y: o.y + dy };
      if (isLights) {
        if (obj.gid) {
          warnings.push(`Object ${obj.id}: tile objects on the Lights layer are ignored`);
        } else if (!obj.text) {
          const light = parseLight(obj, warnings);
          if (light) lights.push(light);
        }
        continue;
      }
      if (!tile || !tile.texture.startsWith('brick_')) continue;
      bricks.push(parseBrick(obj, tile, warnings));
    }
  }

  return {
    level: {
      id,
      title: typeof mapProps.title === 'string' ? mapProps.title : id,
      bricks,
      lights,
      lighting: parseLevelLighting(mapProps, warnings),
    },
    warnings,
  };
}

function parseBrick(obj: TiledObject, tile: ResolvedTile, warnings: string[]): BrickSpec {
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
  const glow = parseColor(p.light);
  if (glow !== undefined) {
    brick.light = {
      color: glow,
      radius: Math.max(8, num(p.lightRadius, DEFAULT_BRICK_LIGHT_RADIUS)),
      intensity: Math.max(0, num(p.lightIntensity, DEFAULT_BRICK_LIGHT_INTENSITY)),
    };
  }
  return brick;
}

function enumValue<T extends string>(
  list: readonly T[],
  v: TiledPropValue | undefined,
  fallback: T,
  what: string,
  warnings: string[],
): T {
  if (v === undefined || v === '') return fallback;
  if ((list as readonly string[]).includes(String(v))) return v as T;
  warnings.push(`Unknown ${what} "${String(v)}"`);
  return fallback;
}

/**
 * A `Light` object: point and ellipse objects are radial lights, rectangles are (rotated) area
 * lights, polylines and polygons carry a light along the path. Missing class members fall back
 * to LIGHT_DEFAULTS, because Tiled leaves members at their default value out of the export.
 */
function parseLight(obj: TiledObject, warnings: string[]): LightSpec | undefined {
  const p = propsToRecord(obj.properties);
  const color =
    p.color === undefined || p.color === '' ? LIGHT_DEFAULTS.color : parseColor(p.color);
  if (color === undefined) warnings.push(`Light ${obj.id}: bad color "${String(p.color)}"`);
  const base: LightSpec = {
    id: obj.id,
    kind: 'point',
    x: obj.x,
    y: obj.y,
    radius: Math.max(4, num(p.radius, LIGHT_DEFAULTS.radius)),
    width: 0,
    height: 0,
    rotation: obj.rotation ?? 0,
    path: [],
    color: color ?? LIGHT_DEFAULTS.color,
    intensity: Math.max(0, num(p.intensity, LIGHT_DEFAULTS.intensity)),
    flicker: enumValue<Flicker>(FLICKERS, p.flicker, LIGHT_DEFAULTS.flicker, 'flicker', warnings),
    speed: Math.max(0.01, num(p.speed, LIGHT_DEFAULTS.speed)),
    // Unset phase: derive one from the id so a row of candles never flickers in step.
    phase: p.phase === undefined ? hash(obj.id) * 10 : num(p.phase, 0),
    affects: enumValue<LightAffects>(
      LIGHT_AFFECTS,
      p.affects,
      LIGHT_DEFAULTS.affects,
      'affects',
      warnings,
    ),
    cookie: enumValue<Cookie>(COOKIES, p.cookie, LIGHT_DEFAULTS.cookie, 'cookie', warnings),
    pingpong:
      p.pingpong === undefined
        ? LIGHT_DEFAULTS.pingpong
        : p.pingpong === true || p.pingpong === 'true',
    relief: p.relief === true || p.relief === 'true',
  };
  const path = obj.polyline ?? obj.polygon;
  if (path) {
    if (path.length < 2) {
      warnings.push(`Light ${obj.id}: path needs at least two points`);
      return undefined;
    }
    return {
      ...base,
      kind: 'path',
      path: path.map((pt) => ({ x: obj.x + pt.x, y: obj.y + pt.y })),
      // Polygons are closed loops; polylines bounce unless told otherwise.
      pingpong: obj.polygon ? false : base.pingpong,
    };
  }
  if (obj.ellipse) {
    return {
      ...base,
      x: obj.x + obj.width / 2,
      y: obj.y + obj.height / 2,
      radius: Math.max(4, Math.max(obj.width, obj.height) / 2),
    };
  }
  if (obj.point || obj.width <= 0 || obj.height <= 0) return base;
  return { ...base, kind: 'area', width: obj.width, height: obj.height };
}

function parseLevelLighting(
  p: Record<string, TiledPropValue>,
  warnings: string[],
): LevelLightingSpec {
  const out: LevelLightingSpec = { ...LEVEL_LIGHTING_DEFAULTS };
  const ambient = p.ambient === undefined || p.ambient === '' ? undefined : parseColor(p.ambient);
  if (p.ambient !== undefined && p.ambient !== '' && ambient === undefined) {
    warnings.push(`Map: bad ambient color "${String(p.ambient)}"`);
  }
  if (ambient !== undefined) out.ambient = ambient;
  // Negative numbers are the class defaults and mean "use the world look".
  const opt = (v: TiledPropValue | undefined) => {
    const n = num(v, -1);
    return n >= 0 ? n : undefined;
  };
  const strength = opt(p.backdropStrength);
  if (strength !== undefined) out.backdropStrength = strength;
  const floor = opt(p.brickFloor);
  if (floor !== undefined) out.brickFloor = Math.min(1, floor);
  const vignette = opt(p.vignette);
  if (vignette !== undefined) out.vignette = Math.min(1, vignette);
  out.mood = enumValue<Mood>(MOODS, p.mood, 'world', 'mood', warnings);
  out.lightsOut = p.lightsOut === true || p.lightsOut === 'true';
  const darkness = opt(p.darkness);
  if (darkness !== undefined) out.darkness = Math.min(1, darkness);
  const lantern = opt(p.lanternRadius);
  if (lantern !== undefined) out.lanternRadius = Math.max(16, lantern);
  const preview = opt(p.previewTime);
  if (preview !== undefined) out.previewTime = preview;
  out.lightning = p.lightning === true || p.lightning === 'true';
  out.lightningInterval = Math.max(
    MIN_LIGHTNING_INTERVAL,
    num(p.lightningInterval, LEVEL_LIGHTING_DEFAULTS.lightningInterval),
  );
  return out;
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
