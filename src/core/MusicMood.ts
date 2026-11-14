/** What the music is doing. Each mood loops its own part of the song (src/art/music.json). */
export const MUSIC_MOODS = ['menu', 'calm', 'groove', 'build', 'drive', 'fever', 'danger'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

/** What Play reports every frame. */
export interface MusicSignals {
  /** A ball is in flight, not waiting on the paddle. */
  live: boolean;
  combo: number;
  /** Balls in flight. */
  balls: number;
  /** Timed powerups running. */
  effects: number;
  fever: boolean;
  /** Fever meter charge while Fever is off, 0..1. */
  charge: number;
  /** One ball from game over. */
  lastLife: boolean;
  /** Descent: how close the formation is to the danger line, 0..1. */
  danger: number;
  /** Timed runs: time left in ms; null otherwise. */
  clockMs: number | null;
}

export interface MusicCue {
  mood: MusicMood;
  /** Cut on the next beat instead of the next bar. */
  urgent: boolean;
  /** High-pass sweep while the Fever meter closes in on full, 0..1. */
  riser: number;
  /** The ball waits on the paddle, so the music sits back. */
  held: boolean;
}

/** `[enter, leave]`: the value that steps into a mood, and the lower one that lets go of it. */
type Band = [number, number];

export interface MusicTuning {
  /** Each break adds one heat, which decays with this time constant (ms). */
  heatTauMs: number;
  /** Heat that counts as flat out: about two breaks a second, sustained. */
  heatFull: number;
  comboFull: number;
  /** Extra balls in flight that count as flat out. */
  ballsFull: number;
  /** The last seconds of a timed run push the intensity up. */
  finaleMs: number;
  /** Smoothing toward the raw intensity: quick to rise, slow to fall. */
  attackMs: number;
  releaseMs: number;
  groove: Band;
  drive: Band;
  /** Fever charge that brings in the pre-drop. */
  build: Band;
  /** Descent danger that turns the music dark. */
  danger: Band;
  /** A calmer mood has to be wanted this long before the music steps down to it. */
  settleMs: number;
}

export const DEFAULT_MUSIC: MusicTuning = {
  heatTauMs: 3_000,
  heatFull: 6,
  comboFull: 15,
  ballsFull: 3,
  finaleMs: 20_000,
  attackMs: 400,
  releaseMs: 2_500,
  groove: [0.12, 0.06],
  drive: [0.5, 0.38],
  build: [0.7, 0.5],
  danger: [0.5, 0.25],
  settleMs: 2_500,
};

/** Higher moods take over at once; lower ones wait out `settleMs`. */
const RANK: Record<MusicMood, number> = {
  menu: 0,
  calm: 0,
  groove: 1,
  danger: 2,
  build: 3,
  drive: 4,
  fever: 5,
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Turns the state of play into a music mood. Intensity comes from how fast bricks break, the
 * combo, extra balls, timed powerups and a timed run's last seconds. Fever plays the final drop.
 * A nearly full Fever meter brings in the pre-drop. The Descent danger line and the last ball
 * turn the music dark, unless the player is tearing through the bricks anyway.
 */
export class MusicIntensity {
  /** Smoothed intensity, 0..1. */
  level = 0;
  private heat = 0;
  private mood: MusicMood = 'calm';
  private settlingMs = 0;

  constructor(private readonly tuning: MusicTuning = DEFAULT_MUSIC) {}

  onBreak(): void {
    this.heat++;
  }

  /** Losing a ball drops the music straight back down. */
  onLifeLost(): void {
    this.heat = 0;
    this.level = 0;
    this.mood = 'calm';
    this.settlingMs = 0;
  }

  update(dtMs: number, s: MusicSignals): MusicCue {
    const t = this.tuning;
    this.heat *= Math.exp(-dtMs / t.heatTauMs);
    const raw = s.live ? this.raw(s) : 0;
    const tau = raw > this.level ? t.attackMs : t.releaseMs;
    this.level += (raw - this.level) * (1 - Math.exp(-dtMs / tau));

    const want = this.pick(s);
    if (want === this.mood) {
      this.settlingMs = 0;
    } else if (RANK[want] > RANK[this.mood] || this.mood === 'fever') {
      this.mood = want;
      this.settlingMs = 0;
    } else {
      this.settlingMs += dtMs;
      if (this.settlingMs >= t.settleMs) {
        this.mood = want;
        this.settlingMs = 0;
      }
    }
    const [buildAt] = t.build;
    return {
      mood: this.mood,
      urgent: this.mood === 'fever',
      riser: this.mood === 'build' ? clamp01((s.charge - buildAt) / (1 - buildAt)) : 0,
      held: !s.live,
    };
  }

  private raw(s: MusicSignals): number {
    const t = this.tuning;
    const rate = clamp01(this.heat / t.heatFull);
    const combo = clamp01(s.combo / t.comboFull);
    const balls = clamp01((s.balls - 1) / t.ballsFull);
    const effects = Math.min(s.effects, 2) * 0.05;
    const finale = s.clockMs === null ? 0 : clamp01(1 - s.clockMs / t.finaleMs);
    return clamp01(rate * 0.5 + combo * 0.2 + balls * 0.3 + effects + finale * 0.4);
  }

  private pick(s: MusicSignals): MusicMood {
    if (s.fever) return 'fever';
    const t = this.tuning;
    const over = (mood: MusicMood, [enter, leave]: Band, v: number) =>
      v >= (this.mood === mood ? leave : enter);
    if (over('danger', t.danger, s.danger)) return 'danger';
    if (over('drive', t.drive, this.level)) return 'drive';
    if (s.live && over('build', t.build, s.charge)) return 'build';
    if (s.lastLife) return 'danger';
    if (over('groove', t.groove, this.level)) return 'groove';
    return 'calm';
  }
}
