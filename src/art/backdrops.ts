import manifest from './backdrops.json';

/** Each world covers ten levels of the campaign. */
export const WORLD_IDS = ['hell', 'crypt', 'mainframe'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

interface ManifestPart {
  path: string;
  /** Left edge in source pixels; layers are `width` source pixels across the playfield. */
  x: number;
  width: number;
}

export interface ManifestLayer {
  width: number;
  height: number;
  parts: ManifestPart[];
}

interface ManifestWorld {
  sky: string;
  layers: Record<string, ManifestLayer | undefined>;
}

/** Written by scripts/build-backdrops.py. */
const MANIFEST = manifest as Partial<Record<WorldId, ManifestWorld>>;

/** A scrolling painted or fog layer from the manifest. */
export interface TileLook {
  kind: 'tiles';
  name: string;
  /** Upward scroll in playfield units per second; nearer layers scroll faster. */
  speed: number;
  /** Multiply tint: the depth grade on top of what the build script baked in. */
  tint?: number;
  alpha?: number;
  /** Horizontal shift in units when the paddle is at a wall, opposite to it. */
  sway?: number;
  /** Full-screen translucent layers are skipped in battery saver. */
  optional?: boolean;
}

/** A soft additive light source that flickers and flares on explosions. */
export interface GlowLook {
  kind: 'glow';
  color: number;
  alpha: number;
  /** Center as a fraction of the view height. */
  y: number;
  /** Size as a fraction of the view height. */
  size: number;
}

/** Rising sparks or dust at one depth. */
export interface MoteLook {
  kind: 'motes';
  /** Round glow, or a square pixel for data. */
  shape?: 'dot' | 'bit';
  colors: number[];
  /** Upward speed range in units per second (negative falls). */
  rise: [number, number];
  scale: [number, number];
  alpha: number;
  /** Alive at once at full density. */
  count: number;
}

export type LayerLook = TileLook | GlowLook | MoteLook;

export interface WorldLook {
  skyTint: number;
  /** Fill behind everything, shown if the sky failed to load. */
  base: number;
  /** Back to front. */
  layers: LayerLook[];
}

export const WORLD_LOOKS: Record<WorldId, WorldLook> = {
  hell: {
    skyTint: 0x9a8a88,
    base: 0x1a0606,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, tint: 0xd8c8c8, sway: 3 },
      { kind: 'glow', color: 0xff5a1a, alpha: 0.35, y: 1.05, size: 0.9 },
      {
        kind: 'motes',
        colors: [0xff7a2a, 0xffa040],
        rise: [10, 26],
        scale: [0.12, 0.25],
        alpha: 0.6,
        count: 40,
      },
      { kind: 'tiles', name: 'fog1', speed: 11, alpha: 0.9, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 17, tint: 0xd0c4c4, sway: 8 },
      { kind: 'tiles', name: 'fog2', speed: 26, alpha: 0.8, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 36, sway: 16 },
      {
        kind: 'motes',
        colors: [0xffb050, 0xff6020, 0xffe0a0],
        rise: [40, 90],
        scale: [0.25, 0.5],
        alpha: 0.85,
        count: 20,
      },
    ],
  },
  crypt: {
    skyTint: 0xa8a8bc,
    base: 0x08081a,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, sway: 3 },
      { kind: 'glow', color: 0x8c9cff, alpha: 0.26, y: -0.1, size: 0.95 },
      {
        kind: 'motes',
        colors: [0xb8c4ff, 0xe4e6ff],
        rise: [-14, -4],
        scale: [0.08, 0.18],
        alpha: 0.5,
        count: 40,
      },
      { kind: 'tiles', name: 'fog1', speed: 9, alpha: 0.9, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 17, tint: 0xe4e4ec, sway: 8 },
      { kind: 'tiles', name: 'fog2', speed: 24, alpha: 0.8, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 36, sway: 16 },
      {
        kind: 'motes',
        colors: [0x9ad8ff, 0xc8b8ff],
        rise: [8, 22],
        scale: [0.5, 0.9],
        alpha: 0.28,
        count: 8,
      },
    ],
  },
  mainframe: {
    skyTint: 0xb4bcc8,
    base: 0x020a10,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, sway: 3 },
      { kind: 'glow', color: 0x1ab8ff, alpha: 0.3, y: 1.05, size: 0.9 },
      {
        kind: 'motes',
        shape: 'bit',
        colors: [0x40e0ff, 0x2a80ff],
        rise: [20, 50],
        scale: [0.4, 0.7],
        alpha: 0.5,
        count: 36,
      },
      { kind: 'tiles', name: 'fog1', speed: 12, alpha: 0.9, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 18, sway: 8 },
      { kind: 'tiles', name: 'fog2', speed: 28, alpha: 0.8, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 38, sway: 16 },
      {
        kind: 'motes',
        shape: 'bit',
        colors: [0x80f0ff, 0xffb040],
        rise: [60, 120],
        scale: [0.7, 1.1],
        alpha: 0.7,
        count: 14,
      },
    ],
  },
};

export function worldLayers(world: WorldId): ManifestWorld | undefined {
  return MANIFEST[world];
}

export function partKey(path: string): string {
  return `bd_${path
    .replace(/^images\/backdrops\//, '')
    .replace(/\.\w+$/, '')
    .replace(/\//g, '_')}`;
}

/** Worlds whose art has been built, so missing worlds fall back to one that exists. */
export function availableWorlds(): WorldId[] {
  return WORLD_IDS.filter((w) => MANIFEST[w] && WORLD_LOOKS[w].layers.length > 0);
}

/** Levels 1-10 are Hell, 11-20 the Crypt, 21-30 the Mainframe; later levels cycle. */
export function worldForLevel(index: number): WorldId {
  const wanted = WORLD_IDS[Math.floor((index - 1) / 10) % WORLD_IDS.length]!;
  const built = availableWorlds();
  return built.includes(wanted) ? wanted : (built[0] ?? wanted);
}

/** An Arcade run stays in one world, picked from its seed. */
export function worldForRun(seed: number): WorldId {
  const built = availableWorlds();
  const pool = built.length ? built : WORLD_IDS;
  return pool[(seed >>> 0) % pool.length]!;
}

/** Texture keys and paths (relative to assets/) for one world. */
export function worldAssets(world: WorldId): { key: string; path: string }[] {
  const w = MANIFEST[world];
  if (!w) return [];
  return [
    { key: partKey(w.sky), path: w.sky },
    ...Object.values(w.layers).flatMap((l) =>
      (l?.parts ?? []).map((p) => ({ key: partKey(p.path), path: p.path })),
    ),
  ];
}
