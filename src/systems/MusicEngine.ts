import { MUSIC_TRACK, type MusicPlaylist, type MusicTrack } from '../art/music';
import type { MusicCue, MusicMood } from '../core/MusicMood';

/** How the music stops: a quick cut, a fade, or winding down like a stopped tape. */
export type MusicEnding = 'cut' | 'fade' | 'tape';

/** Fades at the ends of a section (s). The fade out finishes before the next kick, 9 ms out. */
const FADE_IN = 0.004;
const FADE_OUT = 0.006;
/** Changes are scheduled at least this far ahead of the audio clock (s). */
const SAFETY = 0.06;
/** Sections are queued this far ahead, so a throttled background timer can't leave a gap (s). */
const LOOKAHEAD = 4;
const TICK_MS = 250;
/** Low-pass corners (Hz): open, ball on the paddle, paused, and the dip when a ball is lost. */
const OPEN_HZ = 20_000;
const HELD_HZ = 1_800;
const DUCK_HZ = 900;
const DIP_HZ = 260;
/** The dip holds this long before it opens back up, with this time constant (s). */
const DIP_S = 0.3;
const DIP_RELEASE = 0.4;
/** High-pass range of the pre-drop riser (Hz). */
const RISER_FLOOR_HZ = 20;
const RISER_TOP_HZ = 600;
/** Volume while paused. */
const DUCK = 0.35;
/** The tape stop slows to a crawl over this long (s). */
const TAPE_S = 0.9;
/** A stopped play-through is silent and released after this long (s). */
const RELEASE_S = 1.2;
/** Bullet time drops the music a perfect fourth, so sound effects shifted as far stay in key. */
export const DREAM_CENTS = -500;
const DREAM_RATE = 2 ** (DREAM_CENTS / 1200);
/** The dream glides down to its rate over this long, and crossfades in over this long (s). */
const DREAM_BEND_S = 0.6;
const DREAM_FADE_S = 0.15;
/** Waking speeds the dream back up as it crossfades to the song (s). */
const DREAM_WAKE_S = 0.3;
/** The dream's share of the section's gain; the reverb makes up the rest. */
const DREAM_LEVEL = 0.7;
/** The dream's resonant low-pass (Hz), and how far its slow sweep swings either way (Hz). */
const DREAM_HZ = 1_100;
const DREAM_Q = 2.5;
const DREAM_SWEEP_HZ = 350;
/** Tape wow: a delay swinging this far either side of its rest (s), this often (Hz). */
const WOBBLE_S = 0.003;
const WOBBLE_HZ = 0.45;

interface Voice {
  name: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** Audio-clock time of the section's first downbeat. */
  t0: number;
  /** When the next voice takes over. */
  end: number;
  /** The section's gain. */
  level: number;
}

/** Bullet time's slowed copy of the section that was playing. */
interface Dream {
  src: AudioBufferSourceNode;
  gain: GainNode;
  lfo: OscillatorNode;
  /** The play-through's song, silenced while the dream plays over it. */
  awake: GainNode;
  /** Audio-clock time it took over, and how far into its section it began (s). */
  at: number;
  from: number;
}

/** Seconds of the song a dream has played `s` seconds after it took over, as it glides down. */
export function dreamSeconds(s: number): number {
  const k = Math.log(DREAM_RATE);
  if (s <= DREAM_BEND_S) return (DREAM_BEND_S * (DREAM_RATE ** (s / DREAM_BEND_S) - 1)) / k;
  return (DREAM_BEND_S * (DREAM_RATE - 1)) / k + DREAM_RATE * (s - DREAM_BEND_S);
}

/** Holds a param where it is at `t`, so a new ramp starts from there instead of jumping. */
export function hold(param: AudioParam, t: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t);
    return;
  }
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

/**
 * Plays the song a section at a time on the Web Audio clock. Each mood loops its own sections.
 * A change of mood cuts to the new one on the next bar, or the next beat when it's urgent, so the
 * groove never stumbles. Filters on the way out sit the music back while the ball waits on the
 * paddle, sweep up the pre-drop, muffle the pause menu and dip when a ball is lost. Bullet time
 * dreams: a slowed, muffled copy takes over while the song carries on silently underneath, so
 * waking finds it still on the beat.
 */
export class MusicEngine {
  /** Everything the music sends out; tapped for beat-synced lighting. */
  readonly output: GainNode;
  private readonly highpass: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  /** The current play-through. A stopped one keeps its own gain while it fades out. */
  private session?: GainNode;
  /** The play-through's song, ahead of `session`; a dream silences it. */
  private awake?: GainNode;
  private dreamer?: Dream;
  private voices: Voice[] = [];
  private mood?: MusicMood;
  /** Delay the mp3 decoder added ahead of the file's first sample (s). */
  private readonly lead: number;
  private volume = 0;
  private ducked = false;
  private held = false;
  private riser = 0;
  private dipUntil = 0;
  private dipHz = DIP_HZ;
  private dipRelease = DIP_RELEASE;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly buffer: AudioBuffer,
    private readonly track: MusicTrack = MUSIC_TRACK,
  ) {
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = RISER_FLOOR_HZ;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = OPEN_HZ;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.highpass.connect(this.lowpass).connect(this.output).connect(destination);
    this.lead = decoderLead(buffer, track.click);
  }

  get playing(): boolean {
    return this.mood !== undefined;
  }

  /**
   * Beats heard since the first downbeat of the section playing, for lights that keep time.
   * Bullet time's dream slows them with the music. Undefined when nothing is playing.
   */
  beats(): number | undefined {
    if (!this.mood) return undefined;
    const now = this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    const d = this.dreamer;
    if (d && now >= d.at) return (d.from + dreamSeconds(now - d.at)) / this.track.beat;
    const v = this.voiceAt(now);
    return v ? (now - v.t0) / this.track.beat : undefined;
  }

  /**
   * Starts the music in `mood`, or moves to `mood` if it is already playing. A new play-through
   * fades in over `fadeIn` seconds, for music that enters under a scene instead of with it.
   */
  play(mood: MusicMood, volume: number, fadeIn = 0): void {
    this.volume = volume;
    this.level();
    if (this.mood) {
      this.setMood(mood);
      return;
    }
    this.mood = mood;
    this.session = this.ctx.createGain();
    if (fadeIn > 0) {
      const now = this.ctx.currentTime;
      this.session.gain.setValueAtTime(0, now);
      this.session.gain.linearRampToValueAtTime(1, now + fadeIn);
    }
    this.session.connect(this.highpass);
    this.awake = this.ctx.createGain();
    this.awake.connect(this.session);
    this.held = false;
    this.riser = 0;
    this.tone();
    this.schedule(this.list(mood).play[0]!, this.ctx.currentTime + SAFETY);
    this.fill();
    this.timer = setInterval(() => this.fill(), TICK_MS);
  }

  /** Play's cue, every frame. Cheap when nothing changed. */
  steer(cue: MusicCue): void {
    this.setMood(cue.mood, cue.urgent);
    const riser = Math.round(cue.riser * 50) / 50;
    if (cue.held === this.held && riser === this.riser) return;
    this.held = cue.held;
    this.riser = riser;
    this.tone();
  }

  setMood(mood: MusicMood, urgent = false): void {
    if (!this.mood || mood === this.mood) return;
    this.mood = mood;
    const at = this.ctx.currentTime + SAFETY;
    const ref = this.voiceAt(at);
    if (ref && ref.end > at && this.list(mood).play.includes(ref.name)) {
      // The section playing now belongs to the new mood too (menu into a level): carry on.
      this.cut(ref.end);
    } else {
      const step = (urgent ? 1 : 4) * this.track.beat;
      const t =
        ref && ref.end > at
          ? Math.min(ref.end, ref.t0 + Math.ceil((at - ref.t0) / step) * step)
          : at;
      this.cut(t);
      this.schedule(this.list(mood).play[0]!, t);
    }
    this.fill();
  }

  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    this.level();
    this.tone();
  }

  /**
   * A quick muffle to `hz` that holds `hold` seconds, then opens back up with time constant
   * `release`. The defaults are a lost ball; a hit-stop asks for a lighter, shorter one.
   */
  dip(hz = DIP_HZ, hold = DIP_S, release = DIP_RELEASE): void {
    if (!this.mood) return;
    const now = this.ctx.currentTime;
    // A lighter dip never lifts a deeper one that is still holding.
    if (now < this.dipUntil && hz > this.dipHz) return;
    const f = this.lowpass.frequency;
    f.cancelScheduledValues(now);
    f.setTargetAtTime(hz, now, Math.min(0.03, hold / 3));
    this.dipUntil = now + hold;
    this.dipHz = hz;
    this.dipRelease = release;
    this.tone();
  }

  /** Bullet time: drifts into a slowed, muffled copy of the section, or wakes back to the song. */
  dream(on: boolean): void {
    if (on === !!this.dreamer) return;
    if (on) this.fallAsleep();
    else this.wake();
  }

  private fallAsleep(): void {
    const { ctx, awake, session } = this;
    if (!this.mood || !awake || !session) return;
    const at = ctx.currentTime + SAFETY;
    const v = this.voiceAt(at);
    if (!v) return;
    const seg = this.track.segments[v.name]!;
    const from = Math.max(0, this.lead + seg.at);
    const len = seg.beats * this.track.beat;
    // The section on a loop, so a long dream can't run on into whatever follows it in the file.
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.loopStart = from;
    src.loopEnd = from + len;
    src.playbackRate.setValueAtTime(1, at);
    src.playbackRate.exponentialRampToValueAtTime(DREAM_RATE, at + DREAM_BEND_S);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(v.level * DREAM_LEVEL, at + DREAM_FADE_S);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = DREAM_HZ;
    filter.Q.value = DREAM_Q;
    const wobble = ctx.createDelay(WOBBLE_S * 4);
    wobble.delayTime.value = WOBBLE_S * 2;
    // One slow wave sweeps the filter and wows the pitch together, so the dream breathes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = WOBBLE_HZ;
    const sweep = ctx.createGain();
    sweep.gain.value = DREAM_SWEEP_HZ;
    const wow = ctx.createGain();
    wow.gain.value = WOBBLE_S;
    lfo.connect(sweep).connect(filter.frequency);
    lfo.connect(wow).connect(wobble.delayTime);
    src.connect(gain).connect(filter).connect(wobble).connect(session);
    src.onended = () => {
      for (const n of [gain, filter, wobble, lfo, sweep, wow]) n.disconnect();
    };
    const into = (at - v.t0) % len;
    src.start(at, from + into);
    lfo.start(at);
    hold(awake.gain, at);
    awake.gain.linearRampToValueAtTime(0, at + DREAM_FADE_S);
    this.dreamer = { src, gain, lfo, awake, at, from: into };
  }

  private wake(): void {
    const d = this.dreamer;
    if (!d) return;
    this.dreamer = undefined;
    const at = this.ctx.currentTime + SAFETY;
    const end = at + DREAM_WAKE_S;
    hold(d.src.playbackRate, at);
    d.src.playbackRate.exponentialRampToValueAtTime(1, end);
    hold(d.gain.gain, at);
    d.gain.gain.linearRampToValueAtTime(0, end);
    d.src.stop(end + FADE_OUT);
    d.lfo.stop(end + FADE_OUT);
    hold(d.awake.gain, at);
    d.awake.gain.linearRampToValueAtTime(1, end);
  }

  stop(ending: MusicEnding = 'cut'): void {
    const session = this.session;
    if (!this.mood || !session) return;
    this.mood = undefined;
    this.session = undefined;
    this.awake = undefined;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    const d = this.dreamer;
    this.dreamer = undefined;
    if (d) {
      if (ending === 'tape') {
        hold(d.src.playbackRate, now);
        d.src.playbackRate.exponentialRampToValueAtTime(0.05, now + TAPE_S);
      }
      d.src.stop(now + RELEASE_S);
      d.lfo.stop(now + RELEASE_S);
    }
    for (const v of [...this.voices]) {
      if (v.t0 > now) {
        this.cancel(v);
        continue;
      }
      if (ending === 'tape') {
        v.src.playbackRate.setValueAtTime(1, now);
        v.src.playbackRate.exponentialRampToValueAtTime(0.05, now + TAPE_S);
      }
      v.src.stop(now + RELEASE_S);
    }
    this.voices = [];
    const g = session.gain;
    g.cancelScheduledValues(now);
    if (ending === 'cut') g.setTargetAtTime(0, now, 0.01);
    else if (ending === 'fade') g.setTargetAtTime(0, now, 0.25);
    else g.setTargetAtTime(0, now + TAPE_S * 0.4, 0.15);
    setTimeout(() => session.disconnect(), (RELEASE_S + 0.1) * 1000);
  }

  // ---------------------------------------------------------------- scheduling

  private list(mood: MusicMood): MusicPlaylist {
    return this.track.moods[mood];
  }

  /** The section that follows `name` in a mood's list. */
  private follow(mood: MusicMood, name: string): string {
    const { play, loop } = this.list(mood);
    const i = play.indexOf(name);
    if (i < 0) return play[0]!;
    return i < play.length - 1 ? play[i + 1]! : play[loop]!;
  }

  /** The voice that is sounding at `t`. */
  private voiceAt(t: number): Voice | undefined {
    let found: Voice | undefined;
    for (const v of this.voices) if (v.t0 <= t) found = v;
    return found;
  }

  /** Keeps sections queued ahead of the clock, and restarts the mood if the queue ran dry. */
  private fill(): void {
    const mood = this.mood;
    if (!mood) return;
    const now = this.ctx.currentTime;
    let last = this.voices[this.voices.length - 1];
    if (!last || last.end < now + SAFETY / 2) {
      last = this.schedule(
        last ? this.follow(mood, last.name) : this.list(mood).play[0]!,
        now + SAFETY,
      );
    }
    while (last.end < now + LOOKAHEAD) last = this.schedule(this.follow(mood, last.name), last.end);
  }

  private schedule(name: string, t0: number): Voice {
    const seg = this.track.segments[name]!;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(seg.gain, t0 + FADE_IN);
    src.connect(gain).connect(this.awake!);
    src.start(t0, Math.max(0, this.lead + seg.at));
    const v: Voice = {
      name,
      src,
      gain,
      t0,
      end: t0 + seg.beats * this.track.beat,
      level: seg.gain,
    };
    this.fadeOut(v, v.end);
    src.onended = () => {
      gain.disconnect();
      this.voices = this.voices.filter((x) => x !== v);
    };
    this.voices.push(v);
    return v;
  }

  /** Ends whatever plays past `t` there, and drops anything queued from `t` on. */
  private cut(t: number): void {
    for (const v of [...this.voices]) {
      if (v.t0 >= t - 1e-4) this.cancel(v);
      else if (v.end > t) this.fadeOut(v, t);
    }
  }

  private fadeOut(v: Voice, t: number): void {
    const g = v.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(v.level, t);
    g.linearRampToValueAtTime(0, t + FADE_OUT);
    v.src.stop(t + FADE_OUT);
    v.end = t;
  }

  private cancel(v: Voice): void {
    v.src.onended = null;
    v.src.stop();
    v.gain.disconnect();
    this.voices = this.voices.filter((x) => x !== v);
  }

  // ---------------------------------------------------------------- tone

  private level(): void {
    const g = this.output.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.volume * (this.ducked ? DUCK : 1), now, 0.08);
  }

  private tone(): void {
    const now = this.ctx.currentTime;
    // A dip in progress holds before it opens to the new corner.
    const from = Math.max(now, this.dipUntil);
    const lp = this.lowpass.frequency;
    lp.cancelScheduledValues(from);
    lp.setTargetAtTime(
      this.ducked ? DUCK_HZ : this.held ? HELD_HZ : OPEN_HZ,
      from,
      from > now ? this.dipRelease : 0.12,
    );
    const hp = this.highpass.frequency;
    hp.cancelScheduledValues(now);
    hp.setTargetAtTime(RISER_FLOOR_HZ * (RISER_TOP_HZ / RISER_FLOOR_HZ) ** this.riser, now, 0.15);
  }
}

/** How far from its place in the file the decoder put the sync click (s). Zero if it's missing. */
function decoderLead(buffer: AudioBuffer, click: number): number {
  const data = buffer.getChannelData(0);
  const n = Math.min(data.length, Math.round(buffer.sampleRate * 0.2));
  let peak = 0;
  let at = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(data[i]!);
    if (a > peak) {
      peak = a;
      at = i;
    }
  }
  return peak > 0.1 ? at / buffer.sampleRate - click : 0;
}
