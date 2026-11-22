#!/usr/bin/env python3
"""Synthesizes the Lantern Angler's boss track: Vesper's lullaby, drowned.

The fight is timed to the beat (its BossDef is beatLock), so the track is written note by note at
exactly 96 BPM instead of cut from a recording: every section starts on a sample the game knows.
It is in D minor. Vesper's theme is a music-box lullaby over Dm, Bb, Gm, A; each section takes
it further under the water.

  head   0.00 -   0.25 s            silence, with the sync click MusicEngine measures the decoder by
  rise   0.25 -  20.25 s    8 bars   the drone and the choir swell, the theme's first notes
  low   20.25 -  60.25 s   16 bars   The Lure: the lullaby, warm, over a heartbeat and dripping water
  mid   60.25 - 100.25 s   16 bars   Feeding: a phrygian bass and the kick on every beat
  high 100.25 - 140.25 s   16 bars   Breach: double time, braams, the theme screaming an octave up
  tail 140.25 - 140.50 s            silence, clear of the encoder's last frames

src/bosses/anglerMusic.ts names these sections and where each starts. Change one and change the
other. Each section is mixed in a circle, its tails and its reverb wrapped onto its own start, so
it loops on itself without a seam. All noise is seeded, so a second run writes the same audio.

Usage: python3 scripts/build-angler-music.py   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import importlib.util
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "music" / "boss-angler.mp3"

# The synth building blocks are the boss sound effects' own.
_spec = importlib.util.spec_from_file_location("boss_audio", ROOT / "scripts" / "build-boss-audio.py")
sx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sx)

SR = sx.SR
BPM = 96
BEAT = 60 / BPM  # s
BAR = 4 * BEAT
HEAD = 0.25  # s of silence ahead of the first section, as build-music.py's lead-in
CLICK_AT = 1024  # sample of the sync click in the head, as build-music.py
CLICK_LEVEL = 0.5
TAIL = 0.25
BITRATE = "160k"
TARGET_LUFS = -15.0  # the level song's loudness, so a fight is no louder than the level before it
CEILING_DB = -1.0
SEED = 4096

SECTIONS = (("rise", 8), ("low", 16), ("mid", 16), ("high", 16))

# One chord a bar: Dm, Bb, Gm, A (MIDI notes for the pad), and the bass root under each.
CHORDS = ((50, 57, 62, 65), (46, 53, 58, 62), (43, 50, 55, 58), (45, 52, 57, 61))
ROOTS = (38, 34, 31, 33)
# Vesper's lullaby, four bars: (beat, MIDI note, beats held).
THEME = (
    (0, 69, 1), (1, 65, 1), (2, 74, 1), (3, 73, 1),
    (4, 69, 1.5), (5.5, 67, 0.5), (6, 65, 1), (7, 64, 1),
    (8, 62, 1), (9, 65, 1), (10, 69, 1), (11, 70, 1),
    (12, 69, 3),
)
# A counter-line for the second time through: thirds under, softer.
COUNTER = ((0, 65, 2), (2, 70, 2), (4, 65, 2), (6, 61, 2), (8, 58, 2), (10, 62, 2), (12, 61, 4))
# The bass under Feeding, in eighths: semitones over the root. The 1 is the phrygian flat second.
BASS_RIFF = (0, 0, 12, 0, 1, 0, 7, 0)


def clock(seconds: float) -> np.ndarray:
    return sx.clock(seconds)


def at(beat: float) -> float:
    return beat * BEAT


# ---------------------------------------------------------------- instruments


def music_box(note: float, seconds: float, rng: np.random.Generator) -> np.ndarray:
    """A music-box tine: a sine with a bright, quickly dying overtone, a little out of tune."""
    t = clock(seconds)
    f = sx.hz(note) * (1 + rng.uniform(-0.002, 0.002))
    tine = sx.sine(f, t) + 0.35 * sx.sine(2 * f, t) * sx.decay(t, 0.25) + 0.12 * sx.sine(5.4 * f, t) * sx.decay(t, 0.06)
    return tine * sx.strike(t, 0.9) * sx.swell(t[-1] - t, 0.05)


def drowned_lead(note: float, seconds: float, rng: np.random.Generator) -> np.ndarray:
    """The theme torn open: two detuned squares with a wide, sick vibrato, driven hard."""
    t = clock(seconds)
    f = sx.hz(note) * (1 + 0.012 * sx.sine(5.2, t) * sx.swell(t, 0.25))
    tone = sx.pulse(f, t, 0.3) + sx.pulse(f * 1.008, t, 0.5)
    tone = sx.lowpass(sx.drive(tone * 0.5, 2.5), 3200)
    return tone * sx.hold(t, 0.01, 0.08)


def pad(notes, seconds: float, rng: np.random.Generator, bright: float) -> np.ndarray:
    """A choir in the dark: thick saws through an 'ah' throat, slow to swell."""
    t = clock(seconds)
    voices = sum(sx.stack(sx.hz(n) * (1 + 0.003 * sx.wander(rng, t, 0.5)), t, 3, 0.008) for n in notes)
    choir = sx.formants(sx.lowpass(voices, 700 + 1800 * bright), ((520, 0.35, 2.0), (1150, 0.3, 1.2)))
    return sx.full(choir) * sx.hold(t, 0.5, 0.4)


def drone(seconds: float, rng: np.random.Generator) -> np.ndarray:
    """The deep: D an octave and two under the theme, breathing slowly."""
    t = clock(seconds)
    sub = sx.sine(sx.hz(26), t) + 0.5 * sx.sine(sx.hz(38) * (1 + 0.002 * sx.wander(rng, t, 0.3)), t)
    hum = sx.lowpass(sx.stack(sx.hz(38), t, 3, 0.004), 260)
    return (sub + 0.3 * sx.full(hum)) * (0.8 + 0.2 * sx.wander(rng, t, 0.2))


def heartbeat_kick(rng: np.random.Generator, level: float = 1.0) -> np.ndarray:
    """A soft lub-dub, felt more than heard."""
    t = clock(0.6)
    out = np.zeros(len(t))
    for when, gain in ((0.0, 1.0), (0.18, 0.55)):
        since = np.maximum(t - when, 0)
        out += gain * sx.sine(sx.settle(80, 42, since, 0.05), t) * sx.strike(t, 0.14, when + sx.ONSET)
    return level * sx.drive(out, 1.8)


def kick(rng: np.random.Generator, level: float = 1.0) -> np.ndarray:
    """A heavy kick: a sub thump with a knock on the front."""
    t = clock(0.5)
    body = sx.sine(sx.settle(150, 44, t, 0.04), t) * sx.strike(t, 0.22)
    knock = sx.hiss(rng, t, 1000, 6000) * sx.strike(t, 0.006)
    return level * (sx.drive(body, 2.2) + 0.12 * knock)


def hat(rng: np.random.Generator, level: float = 1.0, open_: bool = False) -> np.ndarray:
    t = clock(0.3 if open_ else 0.08)
    return level * sx.hiss(rng, t, 6000, 15000) * sx.strike(t, 0.09 if open_ else 0.018)


def metal(rng: np.random.Generator, level: float = 1.0) -> np.ndarray:
    """A struck pipe somewhere in the hull."""
    t = clock(0.9)
    return level * sx.clang(rng, t, 420, 0.35)


def tom(rng: np.random.Generator, pitch: float, level: float = 1.0) -> np.ndarray:
    t = clock(0.45)
    body = sx.sine(sx.settle(pitch * 1.6, pitch, t, 0.03), t) * sx.strike(t, 0.16)
    return level * (sx.drive(body, 1.6) + 0.15 * sx.hiss(rng, t, 200, 3000) * sx.strike(t, 0.02))


def bass_note(note: float, seconds: float) -> np.ndarray:
    """A plucked saw bass: its filter snaps open and closes quickly."""
    t = clock(seconds)
    f = sx.hz(note)
    cutoff = 180 + 1400 * sx.decay(t, 0.07)
    tone = sx.sweep_lowpass(sx.stack(f, t, 2, 0.004), cutoff)
    return sx.drive(sx.full(tone) * sx.hold(t, 0.003, 0.03), 2)


def braam(notes, seconds: float, rng: np.random.Generator) -> np.ndarray:
    """A brass wall: low saws whose filter blasts open and settles."""
    t = clock(seconds)
    saws = sum(sx.stack(sx.hz(n), t, 3, 0.008) for n in notes)
    tone = sx.sweep_lowpass(saws, 250 + 2800 * sx.swell(t, 0.05) * sx.decay(t, 0.9))
    return sx.drive(sx.full(tone) * sx.swell(t, 0.04) * sx.swell(t[-1] - t, 0.3), 3)


def riser(seconds: float, rng: np.random.Generator) -> np.ndarray:
    t = clock(seconds)
    k = t / t[-1]
    return sx.sweep_lowpass(sx.noise(rng, t), 300 + 9000 * k**2) * k**2


# ---------------------------------------------------------------- the room


def reverb_ir(seconds: float, rng: np.random.Generator) -> np.ndarray:
    """A big wet cave: stereo noise dying away, darker as it goes."""
    t = clock(seconds)
    tail = sx.noise(rng, t) * sx.decay(t, seconds / 5)
    dark = sx.lowpass(tail, 2600)
    return dark / np.sqrt(np.sum(dark**2, axis=-1, keepdims=True))


def wet(x: np.ndarray, ir: np.ndarray, amount: float) -> np.ndarray:
    """`x` in the cave: convolved in a circle, so the tail wraps onto the section's start."""
    n = x.shape[-1]
    spectrum = np.fft.rfft(x, n) * np.fft.rfft(ir, n)
    return x + amount * np.fft.irfft(spectrum, n)


# ---------------------------------------------------------------- the sections


def put(out: np.ndarray, beat: float, sound: np.ndarray, level: float = 1.0, pan: float = 0.0) -> None:
    """Mixes a sound in at a beat of the section, its tail wrapped onto the start."""
    stereo = sound if sound.ndim == 2 else sx.spread(sound, pan)
    sx.put(out, at(beat), stereo, level, wrap=True)


def theme(out, rng, start_bar: int, play, level: float, octave: int = 0, notes=THEME, pan: float = 0.0) -> None:
    for beat, note, held in notes:
        put(out, start_bar * 4 + beat, play(note + 12 * octave, at(held) + 0.9, rng), level, pan)


def chords(out, rng, bars: int, level: float, bright: float) -> None:
    for bar in range(bars):
        put(out, bar * 4, pad(CHORDS[bar % 4], BAR + 0.5, rng, bright), level)


def rise(rng: np.random.Generator) -> np.ndarray:
    bars = 8
    out = np.zeros((2, sx.samples(bars * BAR)))
    t = clock(bars * BAR)
    k = t / t[-1]
    out += 0.5 * drone(bars * BAR, rng) * (0.3 + 0.7 * k)
    for bar in range(bars):
        put(out, bar * 4, pad(CHORDS[bar % 4], BAR + 0.5, rng, 0.1), 0.12 + 0.18 * bar / bars)
    theme(out, rng, 4, music_box, 0.22, 0, THEME[:8], pan=0.2)
    for bar in range(0, bars, 2):
        put(out, bar * 4 + 2.5, sx.drip(clock(1.3), rng), 0.25, pan=-0.4)
    put(out, (bars - 2) * 4, riser(2 * BAR, rng), 0.25)
    for i in range(4):
        put(out, (bars - 1) * 4 + i, tom(rng, (55, 50, 45, 40)[i]), 0.35 + 0.1 * i)
    return out


def low(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.45 * drone(bars * BAR, rng)
    chords(out, rng, bars, 0.22, 0.15)
    for start, notes, level in ((0, THEME, 0.3), (4, THEME, 0.3), (8, THEME, 0.32), (12, THEME, 0.3)):
        theme(out, rng, start, music_box, level, 0, notes, pan=0.15)
    for start in (4, 12):
        theme(out, rng, start, music_box, 0.14, -1, COUNTER, pan=-0.3)
    for bar in range(bars):
        for beat in (0, 2):
            put(out, bar * 4 + beat, heartbeat_kick(rng), 0.55)
        put(out, bar * 4 + 3.5, hat(rng, 1, True), 0.05, pan=0.5)
        if bar % 2 == 1:
            put(out, bar * 4 + rng.uniform(1, 3.5), sx.drip(clock(1.3), rng), 0.18, pan=rng.uniform(-0.6, 0.6))
    return out


def mid(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.4 * drone(bars * BAR, rng)
    chords(out, rng, bars, 0.24, 0.4)
    for bar in range(bars):
        root = ROOTS[bar % 4]
        for i, step in enumerate(BASS_RIFF):
            put(out, bar * 4 + i / 2, bass_note(root + step, BEAT / 2), 0.4)
        for beat in range(4):
            put(out, bar * 4 + beat, kick(rng), 0.7)
            put(out, bar * 4 + beat + 0.5, hat(rng), 0.12, pan=0.3)
        put(out, bar * 4 + 1, metal(rng), 0.12, pan=-0.5)
        put(out, bar * 4 + 3, metal(rng), 0.1, pan=0.5)
    for start in (0, 8):
        theme(out, rng, start, music_box, 0.26, 0, THEME, pan=0.15)
    for start in (4, 12):
        theme(out, rng, start, drowned_lead, 0.12, 0, THEME, pan=-0.1)
    return out


def high(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.4 * drone(bars * BAR, rng)
    chords(out, rng, bars, 0.26, 0.75)
    for bar in range(bars):
        root = ROOTS[bar % 4]
        for i, step in enumerate(BASS_RIFF):
            put(out, bar * 4 + i / 2, bass_note(root + step, BEAT / 2), 0.42)
        for beat in range(4):
            put(out, bar * 4 + beat, kick(rng), 0.72)
            put(out, bar * 4 + beat + 0.5, hat(rng, 1, True), 0.08, pan=0.3)
        for i in range(16):
            put(out, bar * 4 + i / 4, hat(rng), 0.07 + 0.04 * (i % 2 == 0), pan=-0.3)
        put(out, bar * 4 + 2, metal(rng), 0.14, pan=-0.5)
        if bar % 2 == 0:
            put(out, bar * 4, braam([n - 12 for n in CHORDS[bar % 4][:3]], 2 * BAR, rng), 0.3)
        if bar % 4 == 3:
            for i, pitch in enumerate((70, 62, 55, 48)):
                put(out, bar * 4 + 3 + i / 4, tom(rng, pitch), 0.35)
    for start in (0, 4, 8, 12):
        theme(out, rng, start, drowned_lead, 0.2, 1, THEME, pan=0.1)
    for start in (4, 12):
        theme(out, rng, start, music_box, 0.2, 0, COUNTER, pan=-0.3)
    return out


RENDER = {"rise": rise, "low": low, "mid": mid, "high": high}


# ---------------------------------------------------------------- io


def loudness(path: Path) -> float:
    """Integrated loudness of a file (LUFS), as ffmpeg's EBU R128 meter reads it."""
    cmd = [sx.FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    summary = err[err.rindex("Summary:"):]
    return float(summary.split("I:")[1].split("LUFS")[0])


def main() -> None:
    ir = reverb_ir(3.2, np.random.default_rng([SEED, 99]))
    parts = []
    starts = {}
    cursor = HEAD
    for i, (name, bars) in enumerate(SECTIONS):
        rng = np.random.default_rng([SEED, i])
        section = RENDER[name](rng)
        assert section.shape[-1] == sx.samples(bars * BAR), name
        section = wet(section, ir, 0.35)
        parts.append(section)
        starts[name] = cursor
        cursor += bars * BAR
    music = np.concatenate(parts, axis=-1)
    music = music / np.abs(music).max() * 0.7
    head = np.zeros((2, sx.samples(HEAD)))
    head[:, CLICK_AT] = CLICK_LEVEL
    full = np.concatenate([head, music, np.zeros((2, sx.samples(TAIL)))], axis=-1)

    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        sx.encode(full, OUT, BITRATE, tmp)
        trim = TARGET_LUFS - loudness(OUT)
        level = sx.gain(trim)
        # The click is the decoder's ruler: it keeps its level whatever the music is turned to.
        full[:, sx.samples(HEAD):] *= level
        sx.encode(full, OUT, BITRATE, tmp)
        peak = 20 * np.log10(np.abs(sx.decode(OUT)).max())
        if peak > CEILING_DB:
            full[:, sx.samples(HEAD):] *= sx.gain(CEILING_DB - peak - 0.1)
            sx.encode(full, OUT, BITRATE, tmp)
    print(f"{OUT.relative_to(ROOT)}  {loudness(OUT):.1f} LUFS  {OUT.stat().st_size / 1024:.0f} KB")
    for name, start in starts.items():
        print(f"  {name:5s} at {start:.4f} s")


if __name__ == "__main__":
    main()
