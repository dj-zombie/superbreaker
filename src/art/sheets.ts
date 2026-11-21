import type Phaser from 'phaser';

/**
 * Queues an animation's frames: a sheet of equal frames, or, when `url` is a JSON, a multi-page
 * atlas from scripts/build-sprite-anims.py, its frames trimmed and named "0", "1", ... Either way an
 * animation asks for its frames by number.
 */
export function loadSheet(
  load: Phaser.Loader.LoaderPlugin,
  key: string,
  url: string,
  frame?: { frameWidth?: number; frameHeight?: number },
): void {
  if (url.endsWith('.json')) {
    // The pages are named relative to the JSON.
    load.multiatlas(key, url, load.path + url.slice(0, url.lastIndexOf('/') + 1));
    return;
  }
  load.spritesheet(key, url, { frameWidth: frame?.frameWidth ?? 0, frameHeight: frame?.frameHeight ?? 0 });
}

/**
 * Frees a sheet that is too big to keep after its scene: the texture and every animation drawn
 * from it, so loading it again builds them fresh. Nothing may still show it.
 */
export function dropSheet(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  for (const anim of scene.anims.getAnimsFromTexture(key)) scene.anims.remove(anim);
  scene.textures.remove(key);
}

/** `count` frame numbers from `first` on. */
export function frameRun(first: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => first + i);
}
