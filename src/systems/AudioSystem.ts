import type Phaser from 'phaser';
import type { MusicCue, MusicMood } from '../core/MusicMood';
import { DEFAULT_VOLUME } from '../core/SaveStore';
import { save } from '../services';
import { MusicEngine, type MusicEnding } from './MusicEngine';

type MusicKey = 'menu_music' | 'music';

const MUSIC_VOLUME: Record<MusicKey, number> = { menu_music: 0.4, music: 0.35 };
/** Both play the same song: the menus open on its intro, a level on the kick. */
const MUSIC_START: Record<MusicKey, MusicMood> = { menu_music: 'menu', music: 'calm' };
/** The same sample retriggered faster than this is inaudible but still costs a voice. */
const SFX_GAP_MS = 35;
/** A blast chain breaks dozens of bricks in a frame; a few crunches sound the same as all of them. */
const BREAK_VOICES = 4;
const BREAK_WINDOW_MS = 100;
/** The fanfare rise comes in under the end of the stab. */
const RISE_AT = 0.28;
/** The whoosh played backwards, for sheets and menus that close. */
const WHOOSH_FALL = 'ui_whoosh_fall';

/** A volume slider's position as gain: 1 at the default. Squared so each notch sounds even. */
function sliderGain(position: number): number {
  return (position / DEFAULT_VOLUME) ** 2;
}

/**
 * Game-wide audio. Music survives scene changes because it lives here, not in a scene, and in a
 * level it follows the mood Play reports. Hit sounds walk an arpeggio (G -> C -> D -> G)
 * instead of random blips, like the original.
 */
class AudioSystem {
  private game?: Phaser.Game;
  private sound?: Phaser.Sound.BaseSoundManager;
  private music?: MusicEngine;
  private musicKey?: MusicKey;
  private wantedMusic?: MusicKey;
  private hitCount = 0;
  private note = 0;
  private gestures = false;
  private lastPlayed = new Map<string, number>();
  private breakTimes: number[] = [];
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private loops = new Map<string, Phaser.Sound.BaseSound>();
  /** Each loop's own volume, before the effects slider. */
  private loopVolumes = new Map<string, number>();
  /** The music slider, after everything the music engine does. */
  private musicBus?: GainNode;
  private rises = 0;

  init(game: Phaser.Game): void {
    this.game = game;
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
    if (this.musicKey === this.wantedMusic && this.music?.playing) return;
    this.playMusic(this.wantedMusic, true);
  }

  /** `delay` is in seconds; the gap check counts from the call, not from when it sounds. */
  sfx(key: string, volume = 0.5, detune = 0, delay = 0): void {
    if (!this.sound || !save.state.settings.sfx || this.sound.locked) return;
    const gain = sliderGain(save.state.settings.sfxVolume);
    if (gain <= 0) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < SFX_GAP_MS) return;
    this.lastPlayed.set(key, now);
    this.sound.play(key, { volume: volume * gain, detune, delay });
  }

  /**
   * Level-clear kit: a stab, then a rise that alternates between clears so back-to-back levels
   * don't repeat. `tailAt` (seconds) schedules the held chord; screens with stars play
   * `fanfareTail` when the last one lands instead, so a dropped frame can't split them.
   */
  fanfare(tailAt?: number): void {
    this.sfx('fanfare_stab', 0.55);
    this.sfx(this.rises++ % 2 ? 'fanfare_rise_b' : 'fanfare_rise_a', 0.45, 0, RISE_AT);
    if (tailAt !== undefined) this.fanfareTail(tailAt);
  }

  fanfareTail(delay = 0): void {
    this.sfx('fanfare_tail', 0.5, 0, delay);
  }

  /** Starts or stops a looping effect. Cheap to call every frame. */
  loop(key: string, on: boolean, volume = 0.3): void {
    const playing = this.loops.get(key);
    const want = on && !!this.sound && save.state.settings.sfx && !this.sound.locked;
    if (want === !!playing) return;
    if (playing) {
      playing.stop();
      playing.destroy();
      this.loops.delete(key);
      return;
    }
    const s = this.sound!.add(key, {
      loop: true,
      volume: volume * sliderGain(save.state.settings.sfxVolume),
    });
    s.play();
    this.loops.set(key, s);
    this.loopVolumes.set(key, volume);
  }

  /** Moving from the menus into a level carries the song on instead of restarting it. */
  playMusic(key: MusicKey, force = false): void {
    this.wantedMusic = key;
    if (!this.sound || !save.state.settings.music || this.sound.locked) return;
    const music = this.musicEngine();
    if (!music) return;
    if (force) music.stop();
    else if (this.musicKey === key && music.playing) return;
    this.musicKey = key;
    music.play(MUSIC_START[key], MUSIC_VOLUME[key]);
  }

  /** Play's read on the moment, every frame. The menus keep their own mood. */
  steerMusic(cue: MusicCue): void {
    if (this.musicKey === 'music') this.music?.steer(cue);
  }

  /** The music muffles for a moment and opens back up, for a lost ball. */
  musicDip(): void {
    if (this.musicKey === 'music') this.music?.dip();
  }

  private get webAudio(): Phaser.Sound.WebAudioSoundManager | undefined {
    const s = this.sound as Phaser.Sound.WebAudioSoundManager | undefined;
    return s && 'context' in s && s.context ? s : undefined;
  }

  /**
   * The section-by-section music, once the track has decoded. It needs Web Audio. The music, not
   * the sound effects, also feeds an analyser for beat-synced lighting.
   */
  private musicEngine(): MusicEngine | undefined {
    if (this.music) return this.music;
    const mgr = this.webAudio;
    const buffer = this.game?.cache.audio.get('music') as AudioBuffer | undefined;
    if (!mgr || !(buffer instanceof AudioBuffer)) return undefined;
    this.musicBus = mgr.context.createGain();
    this.musicBus.gain.value = sliderGain(save.state.settings.musicVolume);
    this.musicBus.connect(mgr.destination);
    this.music = new MusicEngine(mgr.context, this.musicBus, buffer);
    // Tapped ahead of the slider, so turning the music down doesn't dim the lights.
    this.analyser = mgr.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.music.output.connect(this.analyser);
    return this.music;
  }

  /** Low-frequency energy of the music, 0..1, or undefined when it can't be measured. */
  musicLevel(): number | undefined {
    if (!this.analyser || !this.bins || !this.music?.playing) return undefined;
    this.analyser.getByteFrequencyData(this.bins);
    // Bins are about 170 Hz wide at 44.1 kHz: the first three cover the kick and bass.
    return (this.bins[0]! + this.bins[1]! + this.bins[2]!) / (3 * 255);
  }

  /** Thunder for a lightning strike, played on its flash. */
  thunder(volume = 0.4): void {
    this.sfx('thunder', volume, Math.random() * 300 - 200);
  }

  /** Air rush for screen changes and sheets. `fall` plays it backwards, for things that close. */
  whoosh(volume = 0.25, fall = false): void {
    if (!fall) {
      this.sfx('ui_whoosh', volume);
      return;
    }
    if (this.reversedWhoosh()) this.sfx(WHOOSH_FALL, volume);
    else this.sfx('ui_whoosh', volume, -700);
  }

  /** Adds the reversed whoosh to the audio cache the first time it's needed. */
  private reversedWhoosh(): boolean {
    const cache = this.game?.cache.audio;
    const ctx = this.webAudio?.context;
    if (!cache || !ctx) return false;
    if (cache.exists(WHOOSH_FALL)) return true;
    const src = cache.get('ui_whoosh') as AudioBuffer | undefined;
    if (!(src instanceof AudioBuffer)) return false;
    const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) {
      const data = new Float32Array(src.getChannelData(c));
      out.copyToChannel(data.reverse(), c);
    }
    cache.add(WHOOSH_FALL, out);
    return true;
  }

  /** The electrical crackle of a failing room light coming on. */
  flicker(volume = 0.3): void {
    this.sfx('flicker', volume, Math.random() * 300 - 150);
  }

  stopMusic(ending: MusicEnding = 'cut'): void {
    this.wantedMusic = undefined;
    this.haltMusic(ending);
  }

  /** Stops the music but remembers what was wanted, for the settings toggle. */
  private haltMusic(ending: MusicEnding): void {
    this.music?.stop(ending);
    this.musicKey = undefined;
  }

  /** Re-applies settings after a toggle or a volume change. */
  refresh(): void {
    const { music, sfx, musicVolume, sfxVolume } = save.state.settings;
    const ctx = this.webAudio?.context;
    if (this.musicBus && ctx) {
      this.musicBus.gain.setTargetAtTime(sliderGain(musicVolume), ctx.currentTime, 0.03);
    }
    for (const [key, s] of this.loops) {
      (s as Phaser.Sound.WebAudioSound).setVolume(
        (this.loopVolumes.get(key) ?? 0) * sliderGain(sfxVolume),
      );
    }
    if (!sfx) {
      for (const key of [...this.loops.keys()]) this.loop(key, false);
    }
    if (!music) this.haltMusic('fade');
    else if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  /** Pause: quieter and muffled. */
  duckMusic(duck: boolean): void {
    this.music?.duck(duck);
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
