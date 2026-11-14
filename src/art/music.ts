import type { MusicMood } from '../core/MusicMood';
import manifest from './music.json';

export interface MusicSegment {
  /** Seconds into the file of the section's first downbeat. */
  at: number;
  beats: number;
  /** Linear gain it plays at, lifting the quiet sections toward the drops. */
  gain: number;
}

export interface MusicPlaylist {
  /** Sections in play order. */
  play: string[];
  /** Index the list wraps back to, so an intro can play once. */
  loop: number;
}

export interface MusicTrack {
  /** Under public/assets. */
  path: string;
  bpm: number;
  /** Seconds per beat. */
  beat: number;
  /** Seconds into the file of the sync click that measures the decoder's delay. */
  click: number;
  segments: Record<string, MusicSegment>;
  moods: Record<MusicMood, MusicPlaylist>;
}

/** Written by scripts/build-music.py. */
export const MUSIC_TRACK = manifest as MusicTrack;
