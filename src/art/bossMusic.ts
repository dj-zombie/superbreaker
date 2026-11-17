import type { MusicPlaylist, MusicTrack } from './music';

/** Cache key of the boss track. It loads with a boss level, so no other level fetches it. */
export const BOSS_MUSIC_KEY = 'boss_music';

/** The song from its first note, then round its loop for as long as the fight lasts. */
const SONG: MusicPlaylist = { play: ['open', 'loop'], loop: 1 };

/**
 * The boss track: a placeholder cut from a recording by scripts/build-boss-music.py, which lays
 * the file out to match this. The playlists are keyed by the moods of the level song that
 * `BOSS_MOOD_FALLBACK` maps the boss moods to, so one engine plays either track. The song is one
 * piece, so every mood plays the same list: a change of phase finds its section already playing
 * and lets it run on.
 */
export const BOSS_TRACK: MusicTrack = {
  path: 'audio/music/boss-placeholder.mp3',
  bpm: 125,
  beat: 0.48,
  click: 0.02322,
  segments: {
    open: { at: 0.25, beats: 120, gain: 1 },
    loop: { at: 57.85, beats: 120, gain: 1 },
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
