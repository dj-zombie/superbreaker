import type { MusicPlaylist, MusicTrack } from './music';

/** Cache key of the shooting-gallery track. It loads with that stage, so no other level fetches it. */
export const GALLERY_MUSIC_KEY = 'gallery_music';

/** One loop, for as long as the stage lasts. Every mood plays it, so the campaign's intensity never cuts in. */
const SONG: MusicPlaylist = { play: ['loop'], loop: 0 };

/**
 * The gallery's bed: an original oom-pah written by scripts/build-gallery-audio.py. Replace the
 * mp3 in place when a track you can ship is ready. The layout below has to keep matching the file.
 */
export const GALLERY_TRACK: MusicTrack = {
  path: 'audio/music/gallery-placeholder.mp3',
  bpm: 128,
  beat: 60 / 128,
  click: 0.02,
  segments: {
    loop: { at: 0.25, beats: 32, gain: 1 },
  },
  moods: {
    menu: SONG,
    calm: SONG,
    groove: SONG,
    build: SONG,
    drive: SONG,
    fever: SONG,
    danger: SONG,
  },
};
