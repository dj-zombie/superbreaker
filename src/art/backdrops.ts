import hdManifest from './backdrops-hd.json';
import manifest from './backdrops.json';

/** Each world covers ten levels of the campaign. */
export const WORLD_IDS = ['hell', 'crypt', 'mainframe'] as const;
export type WorldId = (typeof WORLD_IDS)[number];
/** Every painted backdrop: the worlds, and scenery a stage brings with it. */
export const SCENERY_IDS = [...WORLD_IDS, 'carnival', 'crucible', 'abyss', 'kernel'] as const;
export type SceneryId = (typeof SCENERY_IDS)[number];

interface ManifestPart {
  path: string;
  /** Left edge in source pixels; layers are `width` source pixels across the playfield. */
  x: number;
  width: number;
}

export interface ManifestLayer {
  width: number;
  height: number;
  /** A still layer's top row in its source plate, in source pixels: the rows above were empty. */
  y?: number;
  parts: ManifestPart[];
}

interface ManifestWorld {
  sky: string;
  layers: Record<string, ManifestLayer | undefined>;
}

/** Written by scripts/build-backdrops.py. */
const MANIFEST = manifest as Partial<Record<SceneryId, ManifestWorld>>;
/** 4x sheets for the 16:9 stage. Missing worlds fall back to the phone set. */
const HD_MANIFEST = hdManifest as Partial<Record<SceneryId, ManifestWorld>>;

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

/**
 * A painted plate that does not scroll: a room the descent stops in. It waits below the view
 * while the layers scroll, and rises into place as they stop (ParallaxBackdrop.land).
 */
export interface StillLook {
  kind: 'still';
  name: string;
  /** Width on the field, in playfield units, centred on the board. */
  width: number;
  /** Its source plate's top edge, in playfield units under the top of the bricks' area. */
  top: number;
  tint?: number;
  /** How near it is, 0..1, for the fall's perspective: the far layers 0.2, the near ones 1. */
  depth: number;
  /** Light behind its openings, in the plate's own pixels: pulses with `pulse`. */
  glows?: Array<{
    color: number;
    alpha: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /**
   * Girders across its top and bottom edges, the whole stage wide, so it rises as one piece of the
   * room rather than a picture: the manifest layer they tile, how tall they stand in playfield
   * units, and where each one's middle crosses the plate, in the plate's own pixels from its top.
   */
  rails?: { name: string; height: number; at: number[] };
  /** Starts unseen: ParallaxBackdrop.crossStill brings it in over the plates behind it. */
  reveal?: boolean;
  /**
   * Its still water, in the plate's own pixels: glints of `color` drift along the band, and
   * ParallaxBackdrop.reflect draws a light's streak down it.
   */
  water?: { y: number; height: number; color: number; alpha: number };
}

export type LayerLook = TileLook | GlowLook | MoteLook | StillLook;

export interface WorldLook {
  skyTint: number;
  /** Fill behind everything, shown if the sky failed to load. */
  base: number;
  /** Back to front. */
  layers: LayerLook[];
}

export const WORLD_LOOKS: Record<SceneryId, WorldLook> = {
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
  // The Shooting Gallery's: a fairground down the walls of the pit, under a clown-faced moon.
  carnival: {
    skyTint: 0x9888a4,
    base: 0x0e0614,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, sway: 3 },
      { kind: 'glow', color: 0xffa040, alpha: 0.2, y: 1.05, size: 0.9 },
      { kind: 'glow', color: 0x40ffd0, alpha: 0.06, y: -0.1, size: 0.8 },
      {
        // Confetti, drifting down.
        kind: 'motes',
        shape: 'bit',
        colors: [0xffb040, 0xd83a3a, 0xe8dcc8, 0x40ffd0],
        rise: [-18, -6],
        scale: [0.3, 0.5],
        alpha: 0.35,
        count: 20,
      },
      { kind: 'tiles', name: 'fog1', speed: 11, alpha: 0.9, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 17, sway: 8 },
      { kind: 'tiles', name: 'fog2', speed: 26, alpha: 0.8, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 36, sway: 16 },
      {
        kind: 'motes',
        colors: [0xffc060, 0xffe0a0],
        rise: [30, 70],
        scale: [0.2, 0.4],
        alpha: 0.7,
        count: 10,
      },
    ],
  },
  // The Crucible's: an iron shaft a level under Hell, lit by the forge below, ending in the
  // furnace room the boss hangs in.
  crucible: {
    skyTint: 0x8c7068,
    base: 0x140404,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, tint: 0xc8aca4, sway: 3 },
      { kind: 'glow', color: 0xff4810, alpha: 0.42, y: 1.08, size: 1 },
      {
        kind: 'motes',
        colors: [0xff7a2a, 0xffa040],
        rise: [14, 32],
        scale: [0.12, 0.25],
        alpha: 0.6,
        count: 40,
      },
      { kind: 'tiles', name: 'fog1', speed: 11, alpha: 0.85, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 17, tint: 0xc8b8b4, sway: 8 },
      {
        kind: 'still',
        name: 'chamber',
        width: 680,
        top: -40,
        tint: 0xe8dcd8,
        depth: 0.7,
        glows: [
          // Between the furnace doors, and the molten floor in front of them.
          { color: 0xff6a18, alpha: 0.55, x: 360, y: 410, width: 300, height: 320 },
          { color: 0xff8a2a, alpha: 0.45, x: 360, y: 560, width: 460, height: 90 },
        ],
        // Over the feathered top and along the broken floor's edge.
        rails: { name: 'rail', height: 60, at: [24, 612] },
      },
      { kind: 'tiles', name: 'fog2', speed: 26, alpha: 0.7, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 36, sway: 16 },
      {
        kind: 'motes',
        colors: [0xffb050, 0xff6020, 0xffe0a0],
        rise: [50, 110],
        scale: [0.25, 0.5],
        alpha: 0.85,
        count: 22,
      },
    ],
  },
  // The Lantern Angler's: the Crypt's shaft sunk past its last candles, its light gone green,
  // ending at a black lake in a hall of pillars. Under the water is the ark.
  abyss: {
    skyTint: 0xa8a8b4,
    base: 0x04060a,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, sway: 3 },
      { kind: 'glow', color: 0x2aff9a, alpha: 0.12, y: 1.08, size: 1 },
      {
        // Spores, sinking.
        kind: 'motes',
        colors: [0x8affc8, 0xc8ffe8],
        rise: [-10, -3],
        scale: [0.08, 0.16],
        alpha: 0.45,
        count: 36,
      },
      { kind: 'tiles', name: 'fog1', speed: 9, alpha: 0.8, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 17, sway: 8 },
      {
        kind: 'still',
        name: 'lake',
        width: 880,
        top: -300,
        depth: 0.6,
        glows: [
          // The candle shrines down each shore, the mist on the horizon, and the candles' streaks.
          { color: 0xffb050, alpha: 0.4, x: 160, y: 525, width: 220, height: 70 },
          { color: 0xffb050, alpha: 0.4, x: 560, y: 525, width: 220, height: 70 },
          { color: 0x9a7ad8, alpha: 0.22, x: 360, y: 565, width: 300, height: 50 },
          { color: 0xff9a40, alpha: 0.22, x: 150, y: 690, width: 110, height: 200 },
          { color: 0xff9a40, alpha: 0.22, x: 570, y: 690, width: 110, height: 200 },
        ],
        water: { y: 580, height: 262, color: 0xc8d8ff, alpha: 0.32 },
      },
      {
        kind: 'still',
        name: 'ark',
        width: 880,
        top: -300,
        depth: 0.6,
        reveal: true,
        glows: [
          // The pods down the hull, and its strip lights.
          { color: 0x3aff8a, alpha: 0.5, x: 330, y: 445, width: 320, height: 190 },
          { color: 0x3aff8a, alpha: 0.35, x: 300, y: 535, width: 380, height: 60 },
        ],
      },
      { kind: 'tiles', name: 'fog2', speed: 24, alpha: 0.7, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 36, sway: 16 },
      {
        // Stray souls: the only warm thing down here.
        kind: 'motes',
        colors: [0xffc060, 0xffe0a0],
        rise: [6, 16],
        scale: [0.3, 0.6],
        alpha: 0.45,
        count: 8,
      },
    ],
  },
  // The Overseer's: the bottom of the Mainframe, a chamber walled with cameras round an empty socket.
  kernel: {
    skyTint: 0x8c98a8,
    base: 0x02060c,
    layers: [
      { kind: 'tiles', name: 'far', speed: 6, sway: 3 },
      { kind: 'glow', color: 0x1ab8ff, alpha: 0.18, y: 1.05, size: 0.9 },
      {
        kind: 'motes',
        shape: 'bit',
        colors: [0x40e0ff, 0x2a80ff],
        rise: [20, 50],
        scale: [0.4, 0.7],
        alpha: 0.4,
        count: 30,
      },
      { kind: 'tiles', name: 'fog1', speed: 10, alpha: 0.85, sway: 5, optional: true },
      { kind: 'tiles', name: 'mid', speed: 18, sway: 8 },
      {
        kind: 'still',
        name: 'chamber',
        width: 700,
        top: -376,
        depth: 0.6,
        glows: [
          // The socket's rim, the camera walls either side, and the floor's light strip.
          { color: 0x1ab8ff, alpha: 0.3, x: 360, y: 469, width: 320, height: 320 },
          { color: 0xff2a2a, alpha: 0.28, x: 110, y: 600, width: 200, height: 640 },
          { color: 0xff2a2a, alpha: 0.28, x: 610, y: 600, width: 200, height: 640 },
          { color: 0x40c8ff, alpha: 0.3, x: 360, y: 900, width: 140, height: 120 },
        ],
      },
      { kind: 'tiles', name: 'fog2', speed: 26, alpha: 0.7, sway: 10, optional: true },
      { kind: 'tiles', name: 'near', speed: 38, sway: 16 },
      {
        kind: 'motes',
        shape: 'bit',
        colors: [0xff4040, 0x80f0ff],
        rise: [60, 120],
        scale: [0.7, 1.1],
        alpha: 0.6,
        count: 12,
      },
    ],
  },
};

export function worldLayers(world: SceneryId, hd = false): ManifestWorld | undefined {
  return (hd ? HD_MANIFEST[world] : undefined) ?? MANIFEST[world];
}

export function partKey(path: string): string {
  const hd = path.includes('/backdrops-hd/');
  const base = path
    .replace(/^images\/backdrops(-hd)?\//, '')
    .replace(/\.\w+$/, '')
    .replace(/\//g, '_');
  return `bd_${base}${hd ? '_hd' : ''}`;
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

/** Texture keys and paths (relative to assets/) for one world. `hd` is the 16:9 set. */
export function worldAssets(world: SceneryId, hd = false): { key: string; path: string }[] {
  const w = worldLayers(world, hd);
  if (!w) return [];
  return [
    { key: partKey(w.sky), path: w.sky },
    ...Object.values(w.layers).flatMap((l) =>
      (l?.parts ?? []).map((p) => ({ key: partKey(p.path), path: p.path })),
    ),
  ];
}
