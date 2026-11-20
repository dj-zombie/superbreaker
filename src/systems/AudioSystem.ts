import type Phaser from 'phaser';
import { BOSS_MUSIC_KEY, BOSS_TRACK } from '../art/bossMusic';
import { GALLERY_MUSIC_KEY, GALLERY_TRACK } from '../art/galleryMusic';
import { WIDTH } from '../config';
import { audibleMs, detunedMs, panAt, variation } from '../core/AudioMix';
import { BOSS_MOOD_FALLBACK, BOSS_STINGER, BOSS_SWELL_S, type BossMood } from '../core/Boss';
import type { MusicCue, MusicMood } from '../core/MusicMood';
import { DEFAULT_VOLUME } from '../core/SaveStore';
import { save } from '../services';
import { DREAM_CENTS, MusicEngine, hold, type MusicEnding } from './MusicEngine';

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
/** Master limiter, so a pile of overlapping blasts can't clip. */
const LIMIT_DB = -3;
const LIMIT_RATIO = 20;
const LIMIT_ATTACK_S = 0.002;
const LIMIT_RELEASE_S = 0.12;
/** Music gain under a big hit, how long it holds, and its recovery time constant (s). */
const DUCK_DEPTH = 0.45;
const DUCK_HOLD_MS = 120;
const DUCK_RELEASE_TC = 0.12;
/** The music muffle under a hit-stop (Hz), and how fast it opens after (time constant, s). */
const HIT_STOP_HZ = 900;
const HIT_STOP_RELEASE_TC = 0.05;
/** An open black hole drags the sound effects down: low-pass corner (Hz) and pitch (cents). */
const GRAVITY_HZ = 1_200;
const GRAVITY_CENTS = -250;
const OPEN_HZ = 20_000;
/** Bullet time takes the top off the sound effects (Hz); they drop as far as the music does. */
const DREAM_SFX_HZ = 2_400;
/** Bullet time's reverb: its length (s), the swell before it blooms (s), and its pre-delay (s). */
const REVERB_S = 2.8;
const REVERB_SWELL_S = 0.08;
const REVERB_PREDELAY_S = 0.025;
/** The reverb leaves the kick and bass dry, and rolls off its own top end (Hz). */
const REVERB_LOW_HZ = 280;
const REVERB_HIGH_HZ = 4_500;
/** How much of the music and the sound effects bullet time sends into the reverb. */
const DREAM_MUSIC_WET = 0.75;
const DREAM_SFX_WET = 0.6;
/** The reverb fades in over this long, and the sends close over this long when it ends (s). */
const DREAM_SEND_IN_S = 0.25;
const DREAM_SEND_OUT_S = 0.6;

/** A volume slider's position as gain: 1 at the default. Squared so each notch sounds even. */
function sliderGain(position: number): number {
  return (position / DEFAULT_VOLUME) ** 2;
}

/**
 * A hall for the reverb: stereo noise that swells in after a short pre-delay and dies away 60 dB
 * over `REVERB_S`. Each ear gets its own noise, so the tail spreads wide.
 */
function hallImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.round(REVERB_S * rate);
  const pre = Math.round(REVERB_PREDELAY_S * rate);
  const swell = REVERB_SWELL_S * rate;
  const decay = 10 ** (-3 / (REVERB_S * rate));
  const out = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const data = out.getChannelData(c);
    let env = 1;
    for (let i = pre; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * env * Math.min(1, (i - pre) / swell);
      env *= decay;
    }
  }
  return out;
}

/** Where a sound plays from in the play field, and when. */
export interface SfxOptions {
  /** Seconds; the gap check counts from the call, not from when it sounds. */
  delay?: number;
  /** Play-field x; the sound pans toward it. Omit for the centre. */
  x?: number;
}

/**
 * The mix ahead of Phaser's master volume: sound effects through a low-pass (the black hole),
 * music through a ducking gain, both into one limiter that can also fold to mono. Each also
 * sends into bullet time's reverb, closed the rest of the time.
 */
interface Mix {
  ctx: AudioContext;
  /** The Phaser node this mix feeds; Phaser can replace it, and then the mix is rebuilt. */
  out: AudioNode;
  sfx: GainNode;
  sfxFilter: BiquadFilterNode;
  duck: GainNode;
  limiter: DynamicsCompressorNode;
  sfxVerb: GainNode;
  musicVerb: GainNode;
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
  /** The boss track, on the same bus as the level song. Only one song plays at a time. */
  private boss?: MusicEngine;
  /** The shooting gallery's bed, on the same bus. It takes over for that stage and then bows out. */
  private gallery?: MusicEngine;
  private musicKey?: MusicKey;
  private wantedMusic?: MusicKey;
  private hitCount = 0;
  private note = 0;
  private gestures = false;
  private lastPlayed = new Map<string, number>();
  /** Each loaded sound's audible length at its own pitch, in ms, worked out on first use. */
  private audible = new Map<string, number>();
  /** `performance.now()` by which every one-shot played so far has rung out. */
  private ringsUntil = 0;
  private breakTimes: number[] = [];
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private loops = new Map<string, Phaser.Sound.BaseSound>();
  /** Each loop's own volume, before the effects slider. */
  private loopVolumes = new Map<string, number>();
  /** The music slider, after everything the music engine does. */
  private musicBus?: GainNode;
  private rises = 0;
  private mixNodes?: Mix;
  private gravity = false;
  private dreaming = false;
  private paused = false;
  private platformMute = false;

  init(game: Phaser.Game): void {
    this.game = game;
    this.sound = game.sound;
    this.applyPlatformMute();
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
      if (document.hidden) this.sleep();
      else kick();
    });
    if (document.hidden) this.sleep();
  }

  /**
   * A hidden tab, minimized window or backgrounded app goes quiet, menus included. Phaser's loop
   * stops while hidden, so nothing resumes the context until the page is back in view.
   */
  private sleep(): void {
    const ctx = this.webAudio?.context;
    if (ctx?.state === 'running') void ctx.suspend();
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
    // Phaser rebuilds its master nodes with a new context, which clears the mute.
    this.applyPlatformMute();
    if (!this.sound || this.sound.locked || !this.wantedMusic) return;
    if (!save.state.settings.music) return;
    if (this.musicKey === this.wantedMusic && this.musicPlaying) return;
    this.playMusic(this.wantedMusic, true);
  }

  /**
   * Plays a one-shot, panned toward `opts.x`. Frequent sounds get a little random pitch and
   * volume so repeats don't sound mechanical. Returns the sound, so a moving source can keep
   * its pan up to date; undefined when nothing played.
   */
  sfx(
    key: string,
    volume = 0.5,
    detune = 0,
    opts: SfxOptions = {},
  ): Phaser.Sound.WebAudioSound | undefined {
    if (!this.sound || !save.state.settings.sfx || this.sound.locked) return undefined;
    const gain = sliderGain(save.state.settings.sfxVolume);
    if (gain <= 0) return undefined;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < SFX_GAP_MS) return undefined;
    this.lastPlayed.set(key, now);
    const vary = variation(key);
    const config = {
      volume: volume * gain * vary.volume,
      detune:
        detune + vary.detune + (this.dragged ? GRAVITY_CENTS : 0) + (this.dreamy ? DREAM_CENTS : 0),
      delay: opts.delay ?? 0,
      pan: opts.x === undefined ? 0 : panAt(opts.x, WIDTH),
    };
    const ends = now + config.delay * 1000 + detunedMs(this.heardMs(key), config.detune);
    this.ringsUntil = Math.max(this.ringsUntil, ends);
    const bus = this.mix()?.sfx;
    if (!bus) {
      this.sound.play(key, config);
      return undefined;
    }
    const s = this.sound.add(key) as Phaser.Sound.WebAudioSound;
    route(s, bus);
    s.once('complete', () => s.destroy());
    s.play(config);
    return s;
  }

  /**
   * How long a loaded sound is heard for at its own pitch, in ms, ignoring a quiet tail. 0 when it
   * is not loaded, or not decoded for Web Audio.
   */
  heardMs(key: string): number {
    const known = this.audible.get(key);
    if (known !== undefined) return known;
    const buffer: unknown = this.game?.cache.audio.get(key);
    if (typeof AudioBuffer === 'undefined' || !(buffer instanceof AudioBuffer)) return 0;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const ms = audibleMs(channels, buffer.sampleRate);
    this.audible.set(key, ms);
    return ms;
  }

  /** How long until every one-shot played so far has rung out, in ms. */
  ringingMs(): number {
    return Math.max(0, this.ringsUntil - performance.now());
  }

  /**
   * Level-clear kit: a stab, then a rise that alternates between clears so back-to-back levels
   * don't repeat. `tailAt` (seconds) schedules the held chord; screens with stars play
   * `fanfareTail` when the last one lands instead, so a dropped frame can't split them.
   */
  fanfare(tailAt?: number): void {
    this.sfx('fanfare_stab', 0.55);
    this.sfx(this.rises++ % 2 ? 'fanfare_rise_b' : 'fanfare_rise_a', 0.45, 0, { delay: RISE_AT });
    if (tailAt !== undefined) this.fanfareTail(tailAt);
  }

  fanfareTail(delay = 0): void {
    this.sfx('fanfare_tail', 0.5, 0, { delay });
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
    const bus = this.mix()?.sfx;
    if (bus) route(s as Phaser.Sound.WebAudioSound, bus);
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
    else if (this.musicKey === key && this.musicPlaying) return;
    // A named song never plays under the boss track or the gallery bed.
    this.boss?.stop(force ? 'cut' : 'fade');
    this.gallery?.stop(force ? 'cut' : 'fade');
    this.musicKey = key;
    music.play(MUSIC_START[key], MUSIC_VOLUME[key]);
  }

  /** Play's read on the moment, every frame. The menus keep their own mood. */
  steerMusic(cue: MusicCue): void {
    if (this.musicKey === 'music') this.music?.steer(cue);
  }

  /**
   * The shooting gallery's bed. `on` swells it in and sits the level song out; `off` lets the bed
   * finish. Play asks every frame it is on, so music switched back on mid-stage finds it.
   */
  bonusMusic(on: boolean): void {
    if (!on) {
      this.gallery?.stop('fade');
      return;
    }
    if (!this.sound || !save.state.settings.music || this.sound.locked) return;
    const level = this.musicEngine();
    const gallery = this.galleryEngine();
    if (!level || !gallery) return;
    this.wantedMusic = 'music';
    this.musicKey = 'music';
    level.stop('fade');
    this.boss?.stop('fade');
    if (gallery.playing) return;
    gallery.play('groove', MUSIC_VOLUME.music, 0.7);
  }

  /**
   * The boss track at `mood`: swells in from silence, or moves there on the next beat. Play asks
   * every frame, so music switched back on in the middle of a fight finds its mood by itself.
   */
  bossMusic(mood: BossMood): void {
    if (!this.sound || !save.state.settings.music || this.sound.locked) return;
    const level = this.musicEngine();
    if (!level) return;
    this.wantedMusic = 'music';
    this.musicKey = 'music';
    // The calm after the fight is the level song's. So is every mood when no boss track loaded.
    const boss = mood === 'rest' ? undefined : this.bossEngine();
    const on = boss ?? level;
    const off = boss ? level : this.boss;
    off?.stop('fade');
    const mapped = BOSS_MOOD_FALLBACK[mood];
    if (on.playing) on.setMood(mapped, true);
    else on.play(mapped, MUSIC_VOLUME.music, BOSS_SWELL_S);
  }

  /** The phrase that ends a boss fight, over the silence the final hit leaves. */
  bossStinger(): void {
    this.sfx(BOSS_STINGER, 0.55);
  }

  /** The music muffles for a moment and opens back up, for a lost ball. */
  musicDip(): void {
    if (this.musicKey !== 'music') return;
    this.music?.dip();
    this.boss?.dip();
    this.gallery?.dip();
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
    const m = this.mix();
    if (m) this.routeMusic(m);
    else this.musicBus.connect(mgr.destination);
    this.music = new MusicEngine(mgr.context, this.musicBus, buffer);
    // Tapped ahead of the slider, so turning the music down doesn't dim the lights.
    this.analyser = mgr.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.music.output.connect(this.analyser);
    return this.music;
  }

  /** The boss track's engine, once a boss level has loaded the track. It shares the song's bus. */
  private bossEngine(): MusicEngine | undefined {
    if (this.boss) return this.boss;
    const mgr = this.webAudio;
    const buffer = this.game?.cache.audio.get(BOSS_MUSIC_KEY) as AudioBuffer | undefined;
    if (!mgr || !this.musicBus || !(buffer instanceof AudioBuffer)) return undefined;
    this.boss = new MusicEngine(mgr.context, this.musicBus, buffer, BOSS_TRACK);
    if (this.analyser) this.boss.output.connect(this.analyser);
    return this.boss;
  }

  /** The gallery bed's engine, once that stage has loaded the track. It shares the song's bus. */
  private galleryEngine(): MusicEngine | undefined {
    if (this.gallery) return this.gallery;
    const mgr = this.webAudio;
    const buffer = this.game?.cache.audio.get(GALLERY_MUSIC_KEY) as AudioBuffer | undefined;
    if (!mgr || !this.musicBus || !(buffer instanceof AudioBuffer)) return undefined;
    this.gallery = new MusicEngine(mgr.context, this.musicBus, buffer, GALLERY_TRACK);
    if (this.analyser) this.gallery.output.connect(this.analyser);
    return this.gallery;
  }

  /** Any of the songs is sounding. */
  private get musicPlaying(): boolean {
    return !!this.music?.playing || !!this.boss?.playing || !!this.gallery?.playing;
  }

  /** The mix, built on first use and rebuilt if Phaser swaps its master node. */
  private mix(): Mix | undefined {
    const mgr = this.webAudio;
    if (!mgr) return undefined;
    if (this.mixNodes?.out === mgr.destination) return this.mixNodes;
    const ctx = mgr.context;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMIT_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = LIMIT_RATIO;
    limiter.attack.value = LIMIT_ATTACK_S;
    limiter.release.value = LIMIT_RELEASE_S;
    limiter.connect(mgr.destination);
    const verbLow = ctx.createBiquadFilter();
    verbLow.type = 'highpass';
    verbLow.frequency.value = REVERB_LOW_HZ;
    const verb = ctx.createConvolver();
    verb.buffer = hallImpulse(ctx);
    const verbHigh = ctx.createBiquadFilter();
    verbHigh.type = 'lowpass';
    verbHigh.frequency.value = REVERB_HIGH_HZ;
    verbLow.connect(verb).connect(verbHigh).connect(limiter);
    const sfxVerb = ctx.createGain();
    sfxVerb.gain.value = 0;
    sfxVerb.connect(verbLow);
    const musicVerb = ctx.createGain();
    musicVerb.gain.value = 0;
    musicVerb.connect(verbLow);
    const sfxFilter = ctx.createBiquadFilter();
    sfxFilter.type = 'lowpass';
    sfxFilter.frequency.value = OPEN_HZ;
    sfxFilter.connect(limiter);
    sfxFilter.connect(sfxVerb);
    const sfx = ctx.createGain();
    sfx.connect(sfxFilter);
    const duck = ctx.createGain();
    duck.connect(limiter);
    const out = mgr.destination;
    this.mixNodes = { ctx, out, sfx, sfxFilter, duck, limiter, sfxVerb, musicVerb };
    this.routeMusic(this.mixNodes);
    this.applyMono();
    this.applySfxTone();
    this.applyDream();
    return this.mixNodes;
  }

  /** The music slider feeds the ducker, and bullet time's reverb. */
  private routeMusic(m: Mix): void {
    if (!this.musicBus) return;
    this.musicBus.disconnect();
    this.musicBus.connect(m.duck);
    this.musicBus.connect(m.musicVerb);
  }

  /** Mono audio folds everything, music included, to one signal in both ears. */
  private applyMono(): void {
    const limiter = this.mixNodes?.limiter;
    if (!limiter) return;
    limiter.channelCountMode = 'explicit';
    limiter.channelInterpretation = 'speakers';
    limiter.channelCount = save.state.settings.monoAudio ? 1 : 2;
  }

  /** Low-frequency energy of the music, 0..1, or undefined when it can't be measured. */
  musicLevel(): number | undefined {
    if (!this.analyser || !this.bins || !this.musicPlaying) return undefined;
    this.analyser.getByteFrequencyData(this.bins);
    // Bins are about 170 Hz wide at 44.1 kHz: the first three cover the kick and bass.
    return (this.bins[0]! + this.bins[1]! + this.bins[2]!) / (3 * 255);
  }

  /** Beats into the section of whichever song is playing, as heard; undefined when none is. */
  musicBeat(): number | undefined {
    for (const engine of [this.gallery, this.boss, this.music]) {
      if (engine?.playing) return engine.beats();
    }
    return undefined;
  }

  /** Thunder for a lightning strike, played on its flash and panned toward the bolt. */
  thunder(volume = 0.4, x?: number): void {
    this.sfx('thunder', volume, Math.random() * 300 - 200, { x });
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
    this.boss?.stop(ending);
    this.gallery?.stop(ending);
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
    this.applyMono();
    if (!sfx) {
      for (const key of [...this.loops.keys()]) this.loop(key, false);
    }
    if (!music) this.haltMusic('fade');
    else if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  /**
   * Silences everything for a host page's mute button and while a video ad plays. It sits on
   * Phaser's master mute node, past the mix, so it outranks the in-game audio settings and
   * `refresh` leaves it alone.
   */
  setPlatformMute(on: boolean): void {
    this.platformMute = on;
    this.applyPlatformMute();
  }

  private applyPlatformMute(): void {
    if (this.sound) this.sound.mute = this.platformMute;
  }

  /** Pause: quieter and muffled. The pause menu's own sounds skip the black hole and the dream. */
  duckMusic(duck: boolean): void {
    this.music?.duck(duck);
    this.boss?.duck(duck);
    this.gallery?.duck(duck);
    this.paused = duck;
    this.applySfxTone();
    this.applyDream();
  }

  /** The music ducks under a big hit and swells back, so the hit punches through. */
  duck(depth = DUCK_DEPTH, holdMs = DUCK_HOLD_MS): void {
    const m = this.mixNodes;
    if (!m) return;
    const g = m.duck.gain;
    const now = m.ctx.currentTime;
    hold(g, now);
    g.setTargetAtTime(Math.min(depth, g.value), now, 0.015);
    g.setTargetAtTime(1, now + holdMs / 1000, DUCK_RELEASE_TC);
  }

  /** A hit-stop muffles the music for its `ms` and lets go quickly after. */
  dip(ms: number): void {
    if (this.musicKey !== 'music') return;
    this.music?.dip(HIT_STOP_HZ, ms / 1000, HIT_STOP_RELEASE_TC);
    this.boss?.dip(HIT_STOP_HZ, ms / 1000, HIT_STOP_RELEASE_TC);
    this.gallery?.dip(HIT_STOP_HZ, ms / 1000, HIT_STOP_RELEASE_TC);
  }

  /** While a black hole is open the sound effects drop in pitch and lose their top end. */
  setGravity(on: boolean): void {
    if (on === this.gravity) return;
    this.gravity = on;
    this.applySfxTone();
  }

  /**
   * Bullet time: the music slows into a muffled dream, the sound effects sink with it, and both
   * bloom into a long reverb.
   */
  setDream(on: boolean): void {
    if (on === this.dreaming) return;
    this.dreaming = on;
    if (!on || this.musicKey === 'music') {
      this.music?.dream(on);
      this.boss?.dream(on);
      this.gallery?.dream(on);
    }
    this.mix();
    this.applySfxTone();
    this.applyDream();
  }

  /** Back to an open mix, for leaving a level. */
  resetMix(): void {
    this.gravity = false;
    this.paused = false;
    this.dreaming = false;
    // Restart and quit leave from the pause menu, and an engine keeps its duck across a stop.
    for (const engine of [this.music, this.boss, this.gallery]) {
      engine?.dream(false);
      engine?.duck(false);
    }
    this.applySfxTone();
    this.applyDream();
    const m = this.mixNodes;
    if (!m) return;
    const g = m.duck.gain;
    hold(g, m.ctx.currentTime);
    g.setTargetAtTime(1, m.ctx.currentTime, 0.03);
  }

  /** The black hole's drag, unless the pause menu is up. */
  private get dragged(): boolean {
    return this.gravity && !this.paused;
  }

  /** Bullet time's hold on the sound effects, unless the pause menu is up. */
  private get dreamy(): boolean {
    return this.dreaming && !this.paused;
  }

  private applySfxTone(): void {
    const m = this.mixNodes;
    if (!m) return;
    const f = m.sfxFilter.frequency;
    const now = m.ctx.currentTime;
    const hz = this.dragged ? GRAVITY_HZ : this.dreamy ? DREAM_SFX_HZ : OPEN_HZ;
    hold(f, now);
    f.setTargetAtTime(hz, now, hz < OPEN_HZ ? 0.08 : 0.15);
  }

  /** Opens or closes the reverb sends. The music keeps dreaming under the pause menu. */
  private applyDream(): void {
    const m = this.mixNodes;
    if (!m) return;
    const now = m.ctx.currentTime;
    const sends: [GainNode, number][] = [
      [m.musicVerb, this.dreaming ? DREAM_MUSIC_WET : 0],
      [m.sfxVerb, this.dreamy ? DREAM_SFX_WET : 0],
    ];
    for (const [send, wet] of sends) {
      hold(send.gain, now);
      // A linear ramp lands on exactly zero, where a closing time constant never would.
      send.gain.linearRampToValueAtTime(wet, now + (wet > 0 ? DREAM_SEND_IN_S : DREAM_SEND_OUT_S));
    }
  }

  /** Musical hit sound for paddle and unbroken-brick bounces, panned toward `x`. */
  hit(x?: number): void {
    this.hitCount = (this.hitCount + 1) % 32;
    const chord =
      this.hitCount < 16 ? 'g' : this.hitCount < 24 ? 'c' : this.hitCount < 28 ? 'd' : 'g';
    this.sfx(`${chord}${this.note}`, 0.15, 0, { x });
    this.note = (this.note + 1) % 4;
  }

  resetArpeggio(): void {
    this.hitCount = 0;
    this.note = 0;
  }

  breakSound(pitchUp = 0, x?: number): void {
    const now = performance.now();
    while (this.breakTimes.length && now - this.breakTimes[0]! > BREAK_WINDOW_MS) {
      this.breakTimes.shift();
    }
    if (this.breakTimes.length >= BREAK_VOICES) return;
    this.breakTimes.push(now);
    this.sfx(`break${Math.floor(Math.random() * 6)}`, 0.5, pitchUp, { x });
  }
}

/** Sends a Phaser sound into `bus` instead of straight to the master. */
function route(s: Phaser.Sound.WebAudioSound, bus: AudioNode): void {
  const tail = s.pannerNode ?? s.spatialNode ?? s.volumeNode;
  tail.disconnect();
  tail.connect(bus);
}

export const audio = new AudioSystem();
