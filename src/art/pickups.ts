import Phaser from 'phaser';
import type { PowerupId } from '../core/types';

/** Looping pickup animations, built by `scripts/build-anims.py`. */
const MANIFEST = 'pickup_loops';
const PATH = 'images/powerups';

interface PickupLoop {
  frames: number;
  fps: number;
  width: number;
  height: number;
  yoyo?: boolean;
}

export function pickupLoopKey(id: PowerupId): string {
  return `pu_${id}_loop`;
}

export function isPickupLoopKey(key: string): boolean {
  return key.startsWith('pu_') && key.endsWith('_loop');
}

function manifest(scene: Phaser.Scene): Record<string, PickupLoop> {
  return (scene.cache.json.get(MANIFEST) as Record<string, PickupLoop> | undefined) ?? {};
}

/** Queues the manifest, then each sheet it lists. */
export function loadPickupLoops(scene: Phaser.Scene): void {
  scene.load.json(MANIFEST, `${PATH}/loops.json`);
  scene.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}json-${MANIFEST}`, () => {
    for (const [id, loop] of Object.entries(manifest(scene))) {
      scene.load.spritesheet(pickupLoopKey(id as PowerupId), `${PATH}/${id}_loop.webp`, {
        frameWidth: loop.width,
        frameHeight: loop.height,
      });
    }
  });
}

/** Sheets that failed to load are skipped, so those pickups fall back to their still. */
export function createPickupAnims(scene: Phaser.Scene): void {
  for (const [id, loop] of Object.entries(manifest(scene))) {
    const key = pickupLoopKey(id as PowerupId);
    if (!scene.textures.exists(key) || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { end: loop.frames - 1 }),
      frameRate: loop.fps,
      yoyo: loop.yoyo ?? false,
      repeat: -1,
    });
  }
}

/** Starts at a random frame so pickups dropped together don't pulse in step. */
export function playPickupLoop(sprite: Phaser.GameObjects.Sprite, id: PowerupId): void {
  const key = pickupLoopKey(id);
  const anim = sprite.scene.anims.get(key);
  if (!anim) return;
  sprite.play({ key, startFrame: Phaser.Math.Between(0, anim.frames.length - 1) });
}
