import { describe, expect, it } from 'vitest';
import { MUSIC_TRACK } from '../src/art/music';
import {
  DEFAULT_MUSIC,
  MUSIC_MOODS,
  MusicIntensity,
  type MusicCue,
  type MusicSignals,
} from '../src/core/MusicMood';

const quiet: MusicSignals = {
  live: true,
  combo: 0,
  balls: 1,
  effects: 0,
  fever: false,
  charge: 0,
  lastLife: false,
  danger: 0,
  clockMs: null,
};

/** Steps the model in 100ms ticks, breaking a brick every `everyMs` (0 for none). */
function play(m: MusicIntensity, ms: number, everyMs = 0, s: Partial<MusicSignals> = {}): MusicCue {
  let cue = m.update(0, { ...quiet, ...s });
  for (let t = 0; t < ms; t += 100) {
    if (everyMs && t % everyMs === 0) m.onBreak();
    cue = m.update(100, { ...quiet, ...s });
  }
  return cue;
}

/** One break a second with a short combo: a level going normally. */
const steady = (m: MusicIntensity, ms = 20_000, s: Partial<MusicSignals> = {}) =>
  play(m, ms, 1_000, { combo: 3, ...s });

/** Three balls tearing through the bricks. */
const frantic = (m: MusicIntensity, ms = 10_000, s: Partial<MusicSignals> = {}) =>
  play(m, ms, 300, { balls: 3, combo: 8, ...s });

describe('MusicIntensity', () => {
  it('starts calm and sits back while the ball waits on the paddle', () => {
    const cue = play(new MusicIntensity(), 3_000, 0, { live: false });
    expect(cue).toMatchObject({ mood: 'calm', held: true, urgent: false, riser: 0 });
  });

  it('grooves through normal play without driving', () => {
    expect(steady(new MusicIntensity()).mood).toBe('groove');
  });

  it('drives during a fast multiball', () => {
    expect(frantic(new MusicIntensity()).mood).toBe('drive');
  });

  it('plays Fever on the beat and lets go the moment it ends', () => {
    const m = new MusicIntensity();
    steady(m);
    expect(play(m, 1_000, 0, { fever: true })).toMatchObject({ mood: 'fever', urgent: true });
    expect(play(m, 100).mood).not.toBe('fever');
  });

  it('brings in the pre-drop as the Fever meter nears full, rising with it', () => {
    const m = new MusicIntensity();
    steady(m);
    const low = steady(m, 500, { charge: 0.75 });
    const high = steady(m, 500, { charge: 0.95 });
    expect(low.mood).toBe('build');
    expect(high.riser).toBeGreaterThan(low.riser);
    expect(steady(new MusicIntensity(), 500, { charge: 0.8, live: false }).mood).toBe('calm');
  });

  it('waits before stepping down to a calmer mood', () => {
    const m = new MusicIntensity();
    frantic(m);
    let wanted = -1;
    let stepped = -1;
    for (let t = 0; t < 30_000 && stepped < 0; t += 100) {
      const cue = m.update(100, { ...quiet, live: false });
      if (wanted < 0 && m.level < DEFAULT_MUSIC.drive[1]) wanted = t;
      if (cue.mood !== 'drive') stepped = t;
    }
    expect(wanted).toBeGreaterThanOrEqual(0);
    expect(stepped - wanted).toBeGreaterThanOrEqual(DEFAULT_MUSIC.settleMs - 100);
  });

  it('goes dark near the Descent line, however fast the play', () => {
    const m = new MusicIntensity();
    steady(m);
    expect(steady(m, 500, { danger: 0.6 }).mood).toBe('danger');
    expect(frantic(m, 10_000, { danger: 0.6 }).mood).toBe('danger');
  });

  it('goes dark on the last ball until the player tears through the bricks', () => {
    const m = new MusicIntensity();
    expect(steady(m, 5_000, { lastLife: true }).mood).toBe('danger');
    expect(frantic(m, 10_000, { lastLife: true }).mood).toBe('drive');
  });

  it('drops straight back to calm when a ball is lost', () => {
    const m = new MusicIntensity();
    frantic(m);
    m.onLifeLost();
    expect(m.update(100, { ...quiet, live: false }).mood).toBe('calm');
  });

  it("drives through a timed run's last seconds", () => {
    expect(steady(new MusicIntensity(), 10_000, { clockMs: 60_000 }).mood).toBe('groove');
    expect(steady(new MusicIntensity(), 10_000, { clockMs: 2_000 }).mood).toBe('drive');
  });
});

describe('music track', () => {
  it('has sections for every mood', () => {
    for (const mood of MUSIC_MOODS) {
      const list = MUSIC_TRACK.moods[mood];
      expect(list.play.length, mood).toBeGreaterThan(0);
      expect(list.loop, mood).toBeLessThan(list.play.length);
      for (const name of list.play) expect(MUSIC_TRACK.segments[name], name).toBeDefined();
    }
  });

  it('cuts whole bars that start after the sync click', () => {
    for (const [name, seg] of Object.entries(MUSIC_TRACK.segments)) {
      expect(seg.beats % 4, name).toBe(0);
      expect(seg.at, name).toBeGreaterThan(MUSIC_TRACK.click);
    }
  });

  it('only lifts sections, and by no more than 6 dB', () => {
    for (const [name, seg] of Object.entries(MUSIC_TRACK.segments)) {
      expect(seg.gain, name).toBeGreaterThanOrEqual(1);
      expect(seg.gain, name).toBeLessThanOrEqual(2);
    }
  });
});
