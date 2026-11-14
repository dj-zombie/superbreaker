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
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private noise?: AudioBuffer;
  private hiss?: AudioBuffer;

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
    this.tapMusic();
  }

  private get webAudio(): Phaser.Sound.WebAudioSoundManager | undefined {
    const s = this.sound as Phaser.Sound.WebAudioSoundManager | undefined;
    return s && 'context' in s && s.context ? s : undefined;
  }

  /** Feeds the music (not the sound effects) into an analyser for beat-synced lighting. */
  private tapMusic(): void {
    const m = this.music as Phaser.Sound.WebAudioSound | undefined;
    const ctx = this.webAudio?.context;
    if (!ctx || !m || !('volumeNode' in m)) return;
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    }
    m.volumeNode.connect(this.analyser);
  }

  /** Low-frequency energy of the music, 0..1, or undefined when it can't be measured. */
  musicLevel(): number | undefined {
    if (!this.analyser || !this.bins || !this.music?.isPlaying) return undefined;
    this.analyser.getByteFrequencyData(this.bins);
    // Bins are about 170 Hz wide at 44.1 kHz: the first three cover the kick and bass.
    return (this.bins[0]! + this.bins[1]! + this.bins[2]!) / (3 * 255);
  }

  /** Rolling thunder synthesized from filtered noise, so storms need no audio asset. */
  thunder(volume = 0.5): void {
    const mgr = this.webAudio;
    if (!mgr || !save.state.settings.sfx || mgr.locked) return;
    const ctx = mgr.context;
    const seconds = 2.6;
    if (!this.noise) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buf.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.08) * 0.985;
        data[i] = brown * 3;
      }
      this.noise = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const t = ctx.currentTime;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 1.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.06);
    gain.gain.setValueAtTime(volume * 0.7, t + 0.35);
    gain.gain.exponentialRampToValueAtTime(volume * 0.9, t + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(lp).connect(gain).connect(mgr.destination);
    src.start(t);
    src.stop(t + seconds);
  }

  /** Air rush for screen transitions: band-passed noise swept upward, or down for `fall`. */
  whoosh(volume = 0.18, fall = false): void {
    const mgr = this.webAudio;
    if (!mgr || !save.state.settings.sfx || mgr.locked) return;
    const ctx = mgr.context;
    if (!this.hiss) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.hiss = buf;
    }
    const t = ctx.currentTime;
    const len = 0.42;
    const src = ctx.createBufferSource();
    src.buffer = this.hiss;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(fall ? 2600 : 320, t);
    band.frequency.exponentialRampToValueAtTime(fall ? 260 : 2800, t + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + len * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(band).connect(gain).connect(mgr.destination);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  /** The mains buzz of a failing light, on for `seconds`. The hard attack is its click. */
  buzz(seconds: number, volume = 0.2): void {
    const mgr = this.webAudio;
    if (!mgr || !save.state.settings.sfx || mgr.locked) return;
    const ctx = mgr.context;
    const t = ctx.currentTime;
    const end = t + Math.max(0.04, seconds);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 120;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1100;
    band.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.005);
    gain.gain.setValueAtTime(volume, end - 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    hum.connect(band).connect(gain).connect(mgr.destination);
    hum.start(t);
    hum.stop(end + 0.02);
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
