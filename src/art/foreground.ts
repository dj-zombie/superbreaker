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

export function fgKey(world: WorldId, name: string): string {
  return `${world}_${name}`;
}

export function parseFgKey(key: string): { world: WorldId; name: string } | null {
  for (const world of WORLD_IDS) {
    const prefix = `${world}_`;
    if (key.startsWith(prefix)) return { world, name: key.slice(prefix.length) };
  }
  return null;
}

export function foregroundImages(): { key: string; path: string }[] {
  const out: { key: string; path: string }[] = [];
  for (const world of WORLD_IDS) {
    for (const name of FG_SPRITES) {
      out.push({ key: fgKey(world, name), path: `images/foreground/${world}/${name}.png` });
    }
  }
  return out;
}

/** Points any world sprite that failed to load at the shared sprite of the same name. */
export function aliasMissingForeground(scene: Phaser.Scene): void {
  for (const { key } of foregroundImages()) {
    if (scene.textures.exists(key)) continue;
    const name = parseFgKey(key)!.name;
    if (!scene.textures.exists(name)) continue;
    const src = scene.textures.get(name).getSourceImage();
    if (src instanceof HTMLImageElement) scene.textures.addImage(key, src);
    else if (src instanceof HTMLCanvasElement) scene.textures.addCanvas(key, src);
  }
}
