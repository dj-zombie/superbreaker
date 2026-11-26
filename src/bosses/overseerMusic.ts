import type { MusicPlaylist, MusicTrack } from '../art/music';

/** The fight's mood, played round. */
const loop = (name: string): MusicPlaylist => ({ play: [name], loop: 0 });

/**
 * The Overseer's track, written note by note by scripts/build-overseer-music.py at 120 BPM, which
 * lays the file out to match this. The playlists are keyed by the level-song moods that
 * `BOSS_MOOD_FALLBACK` maps the boss moods to: the rise under the title card, then one section a
 * phase (Recognition, Prediction, Kernel). Each section loops on itself without a seam.
 */
export const OVERSEER_TRACK: MusicTrack = {
  path: 'audio/music/boss-overseer.mp3',
  bpm: 120,
  beat: 0.5,
  click: 1024 / 44100,
  segments: {
    rise: { at: 0.25, beats: 32, gain: 1 },
    low: { at: 16.25, beats: 64, gain: 1 },
    mid: { at: 48.25, beats: 64, gain: 1 },
    high: { at: 80.25, beats: 64, gain: 1 },
  },
  moods: {
    menu: loop('low'),
    calm: loop('low'),
    build: { play: ['rise', 'low'], loop: 1 },
    groove: loop('low'),
    drive: loop('mid'),
    fever: loop('high'),
    danger: loop('high'),
  },
};
