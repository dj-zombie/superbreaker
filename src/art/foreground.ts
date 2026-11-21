import type Phaser from 'phaser';
import { BRICK_COLORS, NEW_BRICK_KINDS } from '../config';
import { WORLD_IDS, type WorldId } from './backdrops';

/** Sprites rendered per world by scripts/build-foreground.py. */
export const FG_SPRITES = [
  ...BRICK_COLORS.map((c) => `brick_${c}`),
  ...NEW_BRICK_KINDS.map((k) => `brick_${k}`),
  'paddle',
  'ball',
] as const;

/**
 * Each world's sprites share one atlas, so bricks still batch when the High tier lights them per
 * pixel (lit sprites can't use multi-texture batching).
 */
export function fgAtlas(world: WorldId): string {
  return `fg_${world}`;
}

/** Texture key and frame of a world sprite, ready to spread into an Image constructor. */
export function fgTexture(world: WorldId, name: string): [string, string] {
  return [fgAtlas(world), name];
}

/** World sprites that also have a looping animation, packed as `<name>_00`, `<name>_01`, ... */
export const FG_ANIMS = ['paddle', 'ball'] as const;
export type FgAnim = (typeof FG_ANIMS)[number];

/** Used when an atlas doesn't say how fast its loops run. */
const FG_ANIM_FPS = 20;

export function fgAnimKey(world: WorldId, name: FgAnim): string {
  return `${fgAtlas(world)}_${name}`;
}

/**
 * Texture and first frame for a sprite that will play its world loop. Physics bodies take their
 * size from the frame they are created with, so animated sprites must start on a loop frame.
 */
export function fgAnimTexture(scene: Phaser.Scene, world: WorldId, name: FgAnim): [string, string] {
  const anim = scene.anims.get(fgAnimKey(world, name));
  const first = anim?.frames[0]?.frame.name;
  return [fgAtlas(world), first !== undefined ? String(first) : name];
}

/** Starts the world loop on a sprite made with `fgAnimTexture`, at a random point unless `sync`. */
export function playFgAnim(
  sprite: Phaser.GameObjects.Sprite,
  world: WorldId,
  name: FgAnim,
  sync = false,
): void {
  const key = fgAnimKey(world, name);
  const anim = sprite.scene.anims.get(key);
  if (!anim) return;
  const startFrame = sync ? 0 : Math.floor(Math.random() * anim.frames.length);
  sprite.play({ key, startFrame });
}

/** Builds each world's paddle and ball loops from the frames its atlas holds. */
export function createForegroundAnims(scene: Phaser.Scene): void {
  for (const world of WORLD_IDS) {
    const atlas = fgAtlas(world);
    if (!scene.textures.exists(atlas)) continue;
    const texture = scene.textures.get(atlas);
    const names = texture.getFrameNames();
    const meta = (texture.customData as { meta?: { anims?: Record<string, { fps?: number }> } })
      .meta;
    for (const name of FG_ANIMS) {
      const key = fgAnimKey(world, name);
      const frames = names.filter((f) => f.startsWith(`${name}_`)).sort();
      if (scene.anims.exists(key) || frames.length < 2) continue;
      scene.anims.create({
        key,
        frames: frames.map((frame) => ({ key: atlas, frame })),
        frameRate: meta?.anims?.[name]?.fps ?? FG_ANIM_FPS,
        repeat: -1,
      });
    }
  }
}

const normalKey = (world: WorldId) => `${fgAtlas(world)}_n`;

/**
 * Queues the atlases. Normal maps are separate images, fetched only when per-pixel relief can be
 * used, so one that fails to load costs the relief and not the world's sprites.
 */
export function loadForeground(load: Phaser.Loader.LoaderPlugin, normals: boolean): void {
  for (const world of WORLD_IDS) {
    load.atlas(
      fgAtlas(world),
      `images/foreground/${world}.webp`,
      `images/foreground/${world}.json`,
    );
    if (normals) load.image(normalKey(world), `images/foreground/${world}_n.png`);
  }
}

export function isForegroundKey(key: string): boolean {
  return WORLD_IDS.some((world) => key === fgAtlas(world) || key === normalKey(world));
}

/** Hands each loaded normal map to its atlas, which is where Phaser's light shader looks. */
export function attachNormalMaps(scene: Phaser.Scene): void {
  for (const world of WORLD_IDS) {
    const key = normalKey(world);
    if (!scene.textures.exists(key)) continue;
    if (scene.textures.exists(fgAtlas(world))) {
      scene.textures.get(fgAtlas(world)).setDataSource(scene.textures.get(key).getSourceImage());
    }
    scene.textures.remove(key);
  }
}

/** True once the world's atlas has a normal map, i.e. relief lighting can be turned on. */
export function hasNormalMap(scene: Phaser.Scene, world: WorldId): boolean {
  return (
    scene.textures.exists(fgAtlas(world)) &&
    scene.textures.get(fgAtlas(world)).dataSource.length > 0
  );
}

/**
 * A world atlas that failed to load is rebuilt on a canvas from the shared sprites of the same
 * names, so every `fgTexture` frame still exists.
 */
export function rebuildMissingForeground(scene: Phaser.Scene): void {
  for (const world of WORLD_IDS) {
    const key = fgAtlas(world);
    if (scene.textures.exists(key)) continue;
    const sources = FG_SPRITES.filter((name) => scene.textures.exists(name)).map((name) => ({
      name,
      img: scene.textures.get(name).getSourceImage() as CanvasImageSource & {
        width: number;
        height: number;
      },
    }));
    const width = sources.reduce((w, s) => w + s.img.width + 2, 0);
    const height = Math.max(1, ...sources.map((s) => s.img.height));
    const tex = scene.textures.createCanvas(key, Math.max(1, width), height);
    if (!tex) continue;
    let x = 0;
    for (const { name, img } of sources) {
      tex.context.drawImage(img, x, 0);
      tex.add(name, 0, x, 0, img.width, img.height);
      x += img.width + 2;
    }
    tex.refresh();
  }
}
