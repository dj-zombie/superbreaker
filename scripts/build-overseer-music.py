#!/usr/bin/env python3
"""Synthesizes the Overseer's boss track: the machine's own music, fast and cold.

The fight is timed to the beat (its BossDef is beatLock), so the track is written note by note at
exactly 120 BPM instead of cut from a recording: every section starts on a sample the game knows.
It is in E minor, over Em, C, Am, B. The machine's theme is a sixteenth-note arpeggio that
learns: each section it plays more of itself, and in the last it is an octave up and screaming.

  head   0.00 -   0.25 s            silence, with the sync click MusicEngine measures the decoder by
  rise   0.25 -  16.25 s    8 bars   mains hum, a heartbeat of data, the arpeggio starting up
  low   16.25 -  48.25 s   16 bars   Recognition: the arpeggio and a pulse bass, the kick on the beat
  mid   48.25 -  80.25 s   16 bars   Prediction: the gated snare, the bass in octaves, the theme
  high  80.25 - 112.25 s   16 bars   Kernel: the alarm in the pad, braams, the theme an octave up
  tail 112.25 - 112.50 s            silence, clear of the encoder's last frames

src/bosses/overseerMusic.ts names these sections and where each starts. Change one and change the
other. Each section is mixed in a circle, its tails and its reverb wrapped onto its own start, so
it loops on itself without a seam. All noise is seeded, so a second run writes the same audio.

Usage: python3 scripts/build-overseer-music.py   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import importlib.util
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "music" / "boss-overseer.mp3"

# The synth building blocks are the boss sound effects' own.
_spec = importlib.util.spec_from_file_location("boss_audio", ROOT / "scripts" / "build-boss-audio.py")
sx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sx)

SR = sx.SR
BPM = 120
BEAT = 60 / BPM  # s
BAR = 4 * BEAT
HEAD = 0.25  # s of silence ahead of the first section, as build-music.py's lead-in
CLICK_AT = 1024  # sample of the sync click in the head, as build-music.py
CLICK_LEVEL = 0.5
TAIL = 0.25
BITRATE = "160k"
TARGET_LUFS = -15.0  # the level song's loudness, so a fight is no louder than the level before it
CEILING_DB = -1.0
SEED = 3030

SECTIONS = (("rise", 8), ("low", 16), ("mid", 16), ("high", 16))

# One chord a bar: Em, C, Am, B (MIDI notes for the pad), and the bass root under each.
CHORDS = ((52, 59, 64, 67), (48, 55, 60, 64), (45, 52, 57, 60), (47, 54, 59, 63))
ROOTS = (40, 36, 33, 35)
# The arpeggio over each chord, in sixteenths: steps up the chord's notes, an octave over the pad.
ARP = (0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2)
# The machine's theme, four bars: (beat, MIDI note, beats held).
THEME = (
    (0, 76, 1.5), (1.5, 79, 0.5), (2, 78, 1), (3, 76, 1),
    (4, 72, 1.5), (5.5, 74, 0.5), (6, 76, 2),
    (8, 69, 1), (9, 72, 1), (10, 76, 1), (11, 74, 1),
    (12, 75, 2), (14, 71, 2),
)
# The bass under Prediction and Kernel, in sixteenths: 0 the root, 12 its octave.
BASS_RIFF = (0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 7, 12)


def clock(seconds: float) -> np.ndarray:
    return sx.clock(seconds)


def at(beat: float) -> float:
    return beat * BEAT


# ---------------------------------------------------------------- instruments


def arp_note(note: float, seconds: float, bright: float) -> np.ndarray:
    """A plucked square, its filter snapping open: the machine counting."""
    t = clock(seconds)
    tone = sx.pulse(sx.hz(note), t, 0.3) + 0.4 * sx.pulse(sx.hz(note) * 2.003, t, 0.5)
    cutoff = 500 + (1500 + 4500 * bright) * sx.decay(t, 0.06)
    return sx.sweep_lowpass(tone, cutoff) * sx.hold(t, 0.002, 0.03) * 0.5


def lead(note: float, seconds: float, rng: np.random.Generator) -> np.ndarray:
    """The theme: two detuned saws, a little vibrato once held, crushed like old wiring."""
    t = clock(seconds)
    f = sx.hz(note) * (1 + 0.006 * sx.sine(5.5, t) * sx.swell(t - 0.2, 0.3))
    tone = sx.stack(f, t, 2, 0.006)
    tone = sx.crush(sx.lowpass(sx.drive(tone * 0.6, 2.0), 4200), 7, 2)
    return tone * sx.hold(t, 0.01, 0.1)


def pad(notes, seconds: float, rng: np.random.Generator, bright: float) -> np.ndarray:
    """Cold strings of saws, slow to swell."""
    t = clock(seconds)
    voices = sum(sx.stack(sx.hz(n) * (1 + 0.002 * sx.wander(rng, t, 0.4)), t, 3, 0.007) for n in notes)
    return sx.full(sx.lowpass(voices, 600 + 2400 * bright)) * sx.hold(t, 0.4, 0.4)


def hum_bed(seconds: float, rng: np.random.Generator) -> np.ndarray:
    """The server room: mains hum on E, and fans."""
    t = clock(seconds)
    hum = sx.mains(t, sx.hz(28)) * (0.85 + 0.15 * sx.wander(rng, t, 0.3))
    fans = sx.lowpass(sx.hiss(rng, t, 100, 3000), 1200)
    return 0.5 * hum + 0.08 * fans


def kick(rng: np.random.Generator, level: float = 1.0) -> np.ndarray:
    """A tight synth kick: a fast pitch drop and a click."""
    t = clock(0.4)
    body = sx.sine(sx.settle(170, 46, t, 0.03), t) * sx.strike(t, 0.18)
    click = sx.hiss(rng, t, 2000, 9000) * sx.strike(t, 0.004)
    return level * (sx.drive(body, 2.4) + 0.1 * click)


def snare(rng: np.random.Generator, level: float = 1.0) -> np.ndarray:
    """An eighties snare: a tone and a burst of noise cut short, as through a gate."""
    t = clock(0.35)
    tone = sx.sine(sx.settle(260, 180, t, 0.02), t) * sx.strike(t, 0.06)
    burst = sx.hiss(rng, t, 900, 9000) * sx.strike(t, 0.12)
    gate = np.where(t < 0.22, 1.0, np.exp(-(t - 0.22) / 0.01))
    return level * (0.5 * tone + 0.6 * burst) * gate


def hat(rng: np.random.Generator, level: float = 1.0, open_: bool = False) -> np.ndarray:
    t = clock(0.25 if open_ else 0.06)
    return level * sx.hiss(rng, t, 7000, 15000) * sx.strike(t, 0.07 if open_ else 0.014)


def bass_note(note: float, seconds: float) -> np.ndarray:
    """A pulse bass, its filter plucked open on every note."""
    t = clock(seconds)
    tone = sx.pulse(sx.hz(note), t, 0.4) + 0.5 * sx.sine(sx.hz(note), t)
    cutoff = 200 + 1600 * sx.decay(t, 0.05)
    return sx.drive(sx.sweep_lowpass(tone, cutoff) * sx.hold(t, 0.002, 0.02), 1.8) * 0.6


def braam(notes, seconds: float, rng: np.random.Generator) -> np.ndarray:
    """A wall of low saws whose filter blasts open and settles."""
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
    """A hall of steel racks: stereo noise dying away, brighter and shorter than a cave."""
    t = clock(seconds)
    tail = sx.noise(rng, t) * sx.decay(t, seconds / 6)
    bright = sx.lowpass(tail, 5000)
    return bright / np.sqrt(np.sum(bright**2, axis=-1, keepdims=True))


def wet(x: np.ndarray, ir: np.ndarray, amount: float) -> np.ndarray:
    """`x` in the hall: convolved in a circle, so the tail wraps onto the section's start."""
    n = x.shape[-1]
    spectrum = np.fft.rfft(x, n) * np.fft.rfft(ir, n)
    return x + amount * np.fft.irfft(spectrum, n)


# ---------------------------------------------------------------- the sections


def put(out: np.ndarray, beat: float, sound: np.ndarray, level: float = 1.0, pan: float = 0.0) -> None:
    """Mixes a sound in at a beat of the section, its tail wrapped onto the start."""
    stereo = sound if sound.ndim == 2 else sx.spread(sound, pan)
    sx.put(out, at(beat), stereo, level, wrap=True)


def arpeggio(out, bars: int, level: float, bright: float, every: int = 1, from_bar: int = 0) -> None:
    """The arpeggio over every bar's chord, one note each `every` sixteenths."""
    for bar in range(from_bar, bars):
        chord = CHORDS[bar % 4]
        for i, step in enumerate(ARP):
            if i % every:
                continue
            pan = 0.35 * np.sin(i * np.pi / 8)
            put(out, bar * 4 + i / 4, arp_note(chord[step] + 12, BEAT / 4 + 0.05, bright), level, pan)


def theme(out, rng, start_bar: int, level: float, octave: int = 0, pan: float = 0.0) -> None:
    for beat, note, held in THEME:
        put(out, start_bar * 4 + beat, lead(note + 12 * octave, at(held) + 0.1, rng), level, pan)


def chords(out, rng, bars: int, level: float, bright: float) -> None:
    for bar in range(bars):
        put(out, bar * 4, pad(CHORDS[bar % 4], BAR + 0.4, rng, bright), level)


def four_on_floor(out, rng, bars: int, kick_level: float, snare_level: float, hats: int) -> None:
    for bar in range(bars):
        for beat in range(4):
            put(out, bar * 4 + beat, kick(rng), kick_level)
            if snare_level and beat % 2 == 1:
                put(out, bar * 4 + beat, snare(rng), snare_level)
        for i in range(hats):
            put(out, bar * 4 + i * 4 / hats + (2 / hats if hats == 4 else 0), hat(rng), 0.1, pan=0.3)


def rise(rng: np.random.Generator) -> np.ndarray:
    bars = 8
    out = np.zeros((2, sx.samples(bars * BAR)))
    t = clock(bars * BAR)
    k = t / t[-1]
    out += hum_bed(bars * BAR, rng) * (0.4 + 0.6 * k)
    chords(out, rng, bars, 0.12, 0.1)
    arpeggio(out, bars, 0.18, 0.2, every=4, from_bar=2)
    arpeggio(out, bars, 0.16, 0.3, every=2, from_bar=6)
    for bar in range(4, bars):
        for beat in (0, 2):
            put(out, bar * 4 + beat, kick(rng), 0.45)
    put(out, (bars - 2) * 4, riser(2 * BAR, rng), 0.25)
    for i in range(4):
        put(out, (bars - 1) * 4 + 2 + i / 2, snare(rng), 0.25 + 0.1 * i)
    return out


def low(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.7 * hum_bed(bars * BAR, rng)
    chords(out, rng, bars, 0.18, 0.2)
    arpeggio(out, bars, 0.2, 0.4)
    for bar in range(bars):
        root = ROOTS[bar % 4]
        for i in range(8):
            put(out, bar * 4 + i / 2, bass_note(root, BEAT / 2), 0.4)
    four_on_floor(out, rng, bars, 0.6, 0.0, 4)
    return out


def mid(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.6 * hum_bed(bars * BAR, rng)
    chords(out, rng, bars, 0.2, 0.4)
    arpeggio(out, bars, 0.18, 0.6)
    for bar in range(bars):
        root = ROOTS[bar % 4]
        for i, step in enumerate(BASS_RIFF):
            put(out, bar * 4 + i / 4, bass_note(root + step, BEAT / 4 + 0.02), 0.38)
    four_on_floor(out, rng, bars, 0.65, 0.5, 8)
    for start in (0, 8):
        theme(out, rng, start + 4, 0.2, 0, pan=-0.1)
    return out


def high(rng: np.random.Generator) -> np.ndarray:
    bars = 16
    out = np.zeros((2, sx.samples(bars * BAR)))
    out += 0.5 * hum_bed(bars * BAR, rng)
    chords(out, rng, bars, 0.22, 0.8)
    arpeggio(out, bars, 0.18, 0.9)
    for bar in range(bars):
        root = ROOTS[bar % 4]
        for i, step in enumerate(BASS_RIFF):
            put(out, bar * 4 + i / 4, bass_note(root + step, BEAT / 4 + 0.02), 0.4)
        if bar % 2 == 0:
            put(out, bar * 4, braam([n - 12 for n in CHORDS[bar % 4][:3]], 2 * BAR, rng), 0.28)
        # The alarm, low in the mix, on the off-bars.
        if bar % 4 == 3:
            put(out, bar * 4, sx.siren(clock(BAR), BEAT / 2) * sx.hold(clock(BAR), 0.05, 0.2), 0.06, pan=0.4)
    four_on_floor(out, rng, bars, 0.7, 0.55, 16)
    for start in (0, 4, 8, 12):
        theme(out, rng, start, 0.2, 1, pan=0.1)
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
    ir = reverb_ir(2.2, np.random.default_rng([SEED, 99]))
    parts = []
    starts = {}
    cursor = HEAD
    for i, (name, bars) in enumerate(SECTIONS):
        rng = np.random.default_rng([SEED, i])
        section = RENDER[name](rng)
        assert section.shape[-1] == sx.samples(bars * BAR), name
        section = wet(section, ir, 0.25)
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
