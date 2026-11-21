#!/usr/bin/env python3
"""Synthesizes the placeholder sounds of the story scenes.

Stand-ins until real ones are made, built from the same oscillators, noise and filters as
scripts/build-boss-audio.py (imported from it), and saved the same way: faded at both ends,
peak-normalised, encoded and decoded again to keep the peaks off full scale. The music beds are
loops instead: no fades, and their last seconds crossfaded into their first so the seam is
smooth.

Everything goes to public/assets/audio/cutscenes/<name>.mp3, the keys the scripts in
src/cutscenes/ name.

Usage: python3 scripts/build-cutscene-audio.py   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "cutscenes"

_spec = importlib.util.spec_from_file_location("boss_audio", ROOT / "scripts" / "build-boss-audio.py")
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)

SEED = 2026
BED_PEAK_DB = -6.0  # beds sit under the lines, so they peak lower than the effects
LOOP_BLEND = 2.0  # s of a bed's end crossfaded over its start


def heartbeat(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Two slow heartbeats, deep and far: dread settling in."""
    out = np.zeros((2, len(t)))
    one = B.heartbeat(B.clock(0.75), rng)
    for at, level in ((0.0, 1.0), (1.05, 0.8)):
        B.put(out, at, B.lowpass(one, 900), level)
    return out


def rumble(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The ground starting to go: a long swelling growl of stone with grit falling through it."""
    body = B.lowpass(B.noise(rng, t), 120) * B.swell(t, 0.9)
    sub = B.sine(28 + 5 * B.wander(rng, t, 1.5), t) * B.swell(t, 0.7)
    grit = B.crackle(rng, t, 220 * B.swell(t, 0.8))
    groan = B.lowpass(B.saw(B.settle(70, 46, t, 1.2), t), 300) * B.swell(t, 1.0) * 0.3
    return B.drive(B.full(body) + 0.7 * sub + 0.25 * grit + groan, 1.6)


def crack(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The floor breaking away: a huge snap, a boom, and the room falling apart below."""
    snap = B.hiss(rng, t, 900, 14000) * B.strike(t, 0.012)
    boom = B.sine(B.settle(110, 32, t, 0.08), t) * B.strike(t, 0.6)
    slabs = B.clang(rng, t, 180, 0.6) * 0.3
    debris = B.crackle(rng, t, 260 * B.swell(t - 0.04, 0.05) * B.decay(t, 0.9))
    return B.drive(0.6 * snap + boom, 2.2) + slabs + 0.3 * debris


def lantern(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A lantern's glass ringing in the dark: a soft bell, a shimmer of high partials over it."""
    bell = B.chime(rng, t, [(660, 1.6, 1.0), (990, 1.1, 0.45), (1320, 0.8, 0.3), (1985, 0.5, 0.2)])
    shimmer = B.chime(rng, t, [(2640 * (1 + 0.004 * i), 0.9, 0.06) for i in range(5)])
    air = B.hiss(rng, t, 4000, 11000) * B.swell(t, 0.3) * B.decay(t, 0.8) * 0.02
    return (bell + shimmer) * B.swell(t, 0.004) + air


def wind(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A deep shaft's wind: low and wide, gusting slowly, a hollow whistle coming and going."""
    gust = 0.55 + 0.45 * B.wander(rng, t, 0.25)
    low = B.lowpass(B.noise(rng, t), 260) * gust
    cutoff = 500 + 380 * (0.5 + 0.5 * B.wander(rng, t, 0.18))
    mid = B.sweep_lowpass(B.hiss(rng, t, 200, 2400), cutoff) * gust * 0.5
    whistle = B.bandpass(B.noise(rng, t), 700, 820, 4) * (0.5 + 0.5 * B.wander(rng, t, 0.12)) ** 3
    return B.full(low) + B.full(mid) * 0.6 + B.full(whistle) * 0.12


# File name, length (s), fade-out (s), synth, loops.
SOUNDS = (
    ("cs_heartbeat", 1.9, 0.25, heartbeat, False),
    ("cs_rumble", 2.6, 0.5, rumble, False),
    ("cs_crack", 2.2, 0.5, crack, False),
    ("cs_chime", 2.4, 0.6, lantern, False),
    ("cs_wind", 14.0, 0.0, wind, True),
)


def loop(x: np.ndarray) -> np.ndarray:
    """`x` minus its last LOOP_BLEND seconds, which are faded in over its start."""
    n = B.samples(LOOP_BLEND)
    head, body, tail = x[:, :n], x[:, n:-n], x[:, -n:]
    k = B.ramp(LOOP_BLEND)
    return np.concatenate([head * k + tail * (1 - k), body], axis=1)


def sound(index: int) -> np.ndarray:
    _, seconds, fade_out, synth, loops = SOUNDS[index]
    rng = np.random.default_rng([SEED, index])
    if loops:
        x = loop(np.array(np.broadcast_to(synth(B.clock(seconds + LOOP_BLEND), rng), (2, B.samples(seconds + LOOP_BLEND)))))
        return x * B.gain(BED_PEAK_DB) / np.abs(x).max()
    x = B.fade(B.widen(synth(B.clock(seconds), rng)), B.FADE_IN, fade_out)
    return x * B.gain(B.SFX_PEAK_DB) / np.abs(x).max()


def main() -> None:
    written = []
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        for i, (name, *_) in enumerate(SOUNDS):
            path = OUT / f"{name}.mp3"
            B.save(sound(i), path, B.SFX_BITRATE, tmp)
            written.append(path)
    for path in written:
        seconds = B.decode(path).shape[-1] / B.SR
        print(f"{path.relative_to(ROOT)}  {seconds:.3f} s  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
