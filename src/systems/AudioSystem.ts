import type Phaser from 'phaser';
import { save } from '../services';

type MusicKey = 'menu_music' | 'music';

const MUSIC_VOLUME: Record<MusicKey, number> = { menu_music: 0.4, music: 0.35 };
/** The same sample retriggered faster than this is inaudible but still costs a voice. */
const SFX_GAP_MS = 35;
/** A blast chain breaks dozens of bricks in a frame; a few crunches sound the same as all of them. */
const BREAK_VOICES = 4;
const BREAK_WINDOW_MS = 100;

/**
 * Game-wide audio. Music survives scene changes because Phaser's sound manager is global.
 * Hit sounds walk an arpeggio (G -> C -> D -> G) instead of random blips, like the original.
 */
class AudioSystem {
  private sound?: Phaser.Sound.BaseSoundManager;
  private music?: Phaser.Sound.BaseSound;
  private musicKey?: MusicKey;
  private wantedMusic?: MusicKey;
  private hitCount = 0;
  private note = 0;
  private gestures = false;
  private lastPlayed = new Map<string, number>();
  private breakTimes: number[] = [];

  init(game: Phaser.Game): void {
    this.sound = game.sound;
    // iOS fires window blur on the same tap that unlocks audio (the URL bar
    // hides, the page refocuses). pauseOnBlur then suspends the context, and
    // Phaser removes its unlock listeners, so later taps never resume it.
    this.sound.pauseOnBlur = false;
    this.requestPlaybackSession();
    this.sound.on('unlocked', () => this.resume());
    if (this.gestures) return;
    this.gestures = true;
    const kick = () => this.resume();
    window.addEventListener('pointerdown', kick, { passive: true });
    window.addEventListener('touchstart', kick, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) kick();
    });
  }

  /** Ask the browser to play even when the ringer is silenced. iOS may ignore this. */
  private requestPlaybackSession(): void {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (!session) return;
    try {
      session.type = 'playback';
    } catch {
      // Unsupported type on this browser. The context resume path still runs.
    }
  }

  /** Resume the Web Audio context and start any music that was requested while locked. */
  private resume(): void {
    const ctx = (this.sound as { context?: AudioContext } | undefined)?.context;
    if (ctx && ctx.state !== 'running') void ctx.resume();
    if (!this.sound || this.sound.locked || !this.wantedMusic) return;
    if (!save.state.settings.music) return;
    if (this.musicKey === this.wantedMusic && this.music?.isPlaying) return;
    this.playMusic(this.wantedMusic, true);
  }

  sfx(key: string, volume = 0.5, detune = 0): void {
    if (!this.sound || !save.state.settings.sfx || this.sound.locked) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < SFX_GAP_MS) return;
    this.lastPlayed.set(key, now);
    this.sound.play(key, { volume, detune });
  }

  playMusic(key: MusicKey, force = false): void {
    this.wantedMusic = key;
    if (!this.sound || !save.state.settings.music) return;
    if (!force && this.musicKey === key && this.music?.isPlaying) return;
    this.stopMusic(false);
    if (this.sound.locked) return;
    this.music = this.sound.add(key, { loop: true, volume: MUSIC_VOLUME[key] });
    this.music.play();
    this.musicKey = key;
  }

  stopMusic(forget = true): void {
    if (forget) this.wantedMusic = undefined;
    this.music?.stop();
    this.music?.destroy();
    this.music = undefined;
    this.musicKey = undefined;
  }

  /** Re-applies settings after a toggle. */
  refresh(): void {
    if (!save.state.settings.music) {
      const wanted = this.wantedMusic;
      this.stopMusic(false);
      this.wantedMusic = wanted;
    } else if (this.wantedMusic) {
      this.playMusic(this.wantedMusic);
    }
  }

  duckMusic(duck: boolean): void {
    const m = this.music as Phaser.Sound.WebAudioSound | undefined;
    if (m && this.musicKey && 'setVolume' in m) {
      m.setVolume(MUSIC_VOLUME[this.musicKey] * (duck ? 0.35 : 1));
    }
  }

  setMusicRate(rate: number): void {
    const m = this.music as Phaser.Sound.WebAudioSound | undefined;
    if (m && 'setRate' in m) m.setRate(rate);
  }

  /** Musical hit sound for paddle and unbroken-brick bounces. */
  hit(): void {
    this.hitCount = (this.hitCount + 1) % 32;
    const chord =
      this.hitCount < 16 ? 'g' : this.hitCount < 24 ? 'c' : this.hitCount < 28 ? 'd' : 'g';
    this.sfx(`${chord}${this.note}`, 0.15);
    this.note = (this.note + 1) % 4;
  }

  resetArpeggio(): void {
    this.hitCount = 0;
    this.note = 0;
  }

  breakSound(pitchUp = 0): void {
    const now = performance.now();
    while (this.breakTimes.length && now - this.breakTimes[0]! > BREAK_WINDOW_MS) {
      this.breakTimes.shift();
    }
    if (this.breakTimes.length >= BREAK_VOICES) return;
    this.breakTimes.push(now);
    this.sfx(`break${Math.floor(Math.random() * 6)}`, 0.5, pitchUp);
  }
}

export const audio = new AudioSystem();
