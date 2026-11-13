#!/usr/bin/env python3
"""Synthesizes the level-clear fanfare.

The paddle walks a G–C–D–G sine arpeggio and the level music sits in G
(G, D, E). The old win jingle was a noisy sting in F, so the clear never
sounded like the rest of the game. This fanfare says that same walk once,
quickly, then opens into a G major add6 — the major third the bounces never
play, plus the sixth the soundtrack already lives on.

Dry and close, like the bounce tones: a few percent of octave harmonic, no
reverb. The chord lands just before the results card (700ms) and is fading
when the stars start ticking (about 1.2s).

Writes public/assets/audio/ui/fanfare.mp3. Usage: python3 scripts/build-fanfare.py
"""

from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "ui" / "fanfare.mp3"
SR = 44100

# A440. Kept in tune with itself; the bounce samples sit within a few cents of this.
G3 = 195.9977
D4 = 293.6648
G4 = 391.9954
B4 = 493.8833
C5 = 523.2511
D5 = 587.3295
E5 = 659.2551
G5 = 783.9909
B5 = 987.7666


def note(
    buf: np.ndarray,
    freq: float,
    start: float,
    amp: float,
    tau: float,
    attack: float = 0.016,
    harm2: float = 0.045,
    harm4: float = 0.0,
) -> None:
    """A sine blip with the bounce tones' fast attack and exponential tail."""
    i0 = int(start * SR)
    # Tail until the envelope is about -60 dB, so notes don't get chopped.
    n = int((attack + tau * math.log(1000)) * SR) + 8
    n = min(n, len(buf) - i0)
    if n <= 0 or amp <= 0:
        return
    t = np.arange(n) / SR
    env = np.ones(n)
    a = max(1, int(attack * SR))
    env[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    env *= np.exp(-np.maximum(0, t - attack) / tau)
    wave = np.sin(2 * math.pi * freq * t)
    if harm2:
        wave = wave + harm2 * np.sin(2 * math.pi * freq * 2 * t)
    if harm4:
        wave = wave + harm4 * np.sin(2 * math.pi * freq * 4 * t)
    buf[i0 : i0 + n] += amp * env * wave


def render() -> np.ndarray:
    dur = 2.05
    buf = np.zeros(int(dur * SR), dtype=np.float64)

    # The paddle's walk, compressed into one phrase. Short tails so the rhythm reads.
    note(buf, G4, 0.00, 0.36, tau=0.11)
    note(buf, C5, 0.13, 0.44, tau=0.11)
    note(buf, D5, 0.26, 0.52, tau=0.12)
    # Octave shout. The two-octave partial is the glint the low D bounce sample has.
    note(buf, G4, 0.40, 0.30, tau=0.20, attack=0.010)
    note(buf, G5, 0.40, 0.66, tau=0.26, attack=0.010, harm2=0.06, harm4=0.03)

    # Gadd6, as the results card appears. The third resolves the suspended walk;
    # the sixth is a note the level music already leans on. Bass stays under them.
    chord = 0.68
    note(buf, G3, chord, 0.30, tau=0.52, attack=0.030, harm2=0.02)
    note(buf, D4, chord, 0.26, tau=0.46, attack=0.024, harm2=0.03)
    note(buf, G4, chord, 0.14, tau=0.40, attack=0.022)
    note(buf, B4, chord, 0.40, tau=0.44, attack=0.020, harm2=0.05)
    note(buf, D5, chord, 0.30, tau=0.40, attack=0.018)
    note(buf, E5, chord, 0.24, tau=0.36, attack=0.016, harm2=0.06)
    note(buf, G5, chord, 0.16, tau=0.34, attack=0.014, harm2=0.05)
    note(buf, B5, chord + 0.02, 0.09, tau=0.18, attack=0.010, harm2=0.08)

    # One quiet copy of the chord's upper notes, a few cents sharp and a little
    # late, so the bloom has width and still sums cleanly on a phone speaker.
    shimmer = 2 ** (5 / 1200)
    delay = 0.018
    for freq, amp, tau in (
        (B4, 0.30, 0.44),
        (E5, 0.13, 0.34),
        (G5, 0.14, 0.36),
        (B5, 0.07, 0.18),
    ):
        note(buf, freq * shimmer, chord + delay, amp * 0.16, tau=tau, attack=0.02, harm2=0.04)

    peak = np.max(np.abs(buf))
    if peak > 0:
        buf *= 0.92 / peak
    # 12ms fade so the encoder doesn't click on a cut tail.
    fade = int(0.012 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    return buf.astype(np.float32)


def main() -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required")
    samples = render()
    wav = OUT.with_suffix(".wav")
    wav.parent.mkdir(parents=True, exist_ok=True)
    # Write wav via ffmpeg from raw float32 so we don't need the wave module's int16 step twice.
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "f32le",
            "-ar",
            str(SR),
            "-ac",
            "1",
            "-i",
            "pipe:0",
            "-c:a",
            "pcm_s16le",
            str(wav),
        ],
        input=samples.tobytes(),
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(wav),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(OUT),
        ],
        check=True,
    )
    wav.unlink()
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes, {len(samples) / SR:.2f}s)")


if __name__ == "__main__":
    main()
