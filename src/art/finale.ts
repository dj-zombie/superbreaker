import type Phaser from 'phaser';
import type { BossId } from '../core/Boss';

/**
 * The finale's art and music, built with the ending cutscene's by scripts/build-cutscene-art.py
 * and build-cutscene-audio.py. The screens after the ending load what they show themselves, so a
 * replay from the Title or a skipped ending still finds them.
 */

/** Fireworks over the conquered citadel: the ending's last plate, behind the credits and Victory. */
export const VICTORY_PLATE = 'cs_plate_victory';
export const CROWN = 'cs_crown';
/** Each boss's trophy, in the order the campaign meets them. */
export const TROPHIES: readonly { boss: BossId; key: string; name: string }[] = [
  { boss: 'crucible', key: 'cs_trophy_crucible', name: 'The Crucible Heart' },
  { boss: 'warden', key: 'cs_trophy_warden', name: "The Warden's Eye" },
  { boss: 'angler', key: 'cs_trophy_angler', name: "Vesper's Lantern" },
  { boss: 'overseer', key: 'cs_trophy_overseer', name: "The Overseer's Lens" },
];

/** The credits stage's groove. */
export const CREDITS_BED = 'cs_credits';
/** The ending's anthem: the Victory screen's loop. */
export const ANTHEM_BED = 'cs_anthem';
/** The hit the Victory screen opens on, in the anthem's key. */
export const VICTORY_STING = 'cs_victory_sting';

function imagePath(key: string): string {
  return `assets/images/cutscenes/${key}.${key.startsWith('cs_plate_') ? 'jpg' : 'png'}`;
}

/** Queues whichever of these images and sounds the game hasn't loaded yet, from a scene's `preload`. */
export function loadFinale(
  scene: Phaser.Scene,
  images: readonly string[],
  sounds: readonly string[] = [],
): void {
  for (const key of images) if (!scene.textures.exists(key)) scene.load.image(key, imagePath(key));
  for (const key of sounds) {
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, `assets/audio/cutscenes/${key}.mp3`);
  }
}
