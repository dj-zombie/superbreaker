#!/usr/bin/env python3
"""Synthesizes the sounds of the level elements (docs/bricks/design.md).

Fuse, phantom, switch, gate, portal and virus each get a short, readable cue. The building blocks,
fades, normalising and the mp3 round trip are scripts/build-boss-audio.py's, so these sit at the
same level as the rest of the game's effects. All noise is seeded, so a second run writes the same
audio.

The effects go to public/assets/audio/bricks/<name>.mp3; src/config.ts lists them as brick_<name>.

Usage: python3 scripts/build-brick-audio.py   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "bricks"

_spec = importlib.util.spec_from_file_location("boss_audio", Path(__file__).with_name("build-boss-audio.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

SEED = 2026


def fuse(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A fuse catching: a scratchy strike, then a fizz that crackles and thins out."""
    strike = A.hiss(rng, t, 1800, 12000) * A.strike(t, 0.012)
    fizz = A.hiss(rng, t, 2500, 11000) * (0.55 + 0.45 * A.wander(rng, t, 60))
    fizz = fizz * A.swell(t, 0.02) * A.decay(t, 0.22)
    pops = A.crackle(rng, t, 140 * A.decay(t, 0.25))
    pop = A.sine(A.settle(420, 180, t, 0.02), t) * A.strike(t, 0.03)
    return 0.6 * strike + 0.5 * fizz + 0.35 * pops + 0.4 * pop


def phantom_in(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A ghost turning solid: a glassy shimmer rising into a soft knock."""
    pitch = A.glide(700, 1400, t)
    glass = (A.sine(pitch, t) + 0.4 * A.sine(2.01 * pitch, t)) * A.swell(t, 0.18) * A.decay(t, 0.25)
    air = A.hiss(rng, t, 2000, 8000) * A.swell(t, 0.15) * A.decay(t, 0.2)
    knock_at = 0.2
    knock = A.sine(A.settle(320, 200, np.maximum(t - knock_at, 0), 0.02), t) * A.strike(t, 0.05, knock_at)
    return 0.35 * glass + 0.15 * air + 0.5 * knock


def phantom_out(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A brick going ghost: a breathy shimmer falling away."""
    pitch = A.glide(1300, 600, t)
    glass = (A.sine(pitch, t) + 0.3 * A.sine(1.5 * pitch, t)) * A.swell(t, 0.02) * A.decay(t, 0.18)
    air = A.sweep_lowpass(A.noise(rng, t), A.glide(9000, 900, t)) * A.swell(t, 0.03) * A.decay(t, 0.2)
    return 0.35 * glass + 0.4 * A.full(air)


def switch(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A rune switch thrown: a hard mechanical clack and a bright two-note chime over it."""
    clack = A.hiss(rng, t, 1500, 9000) * A.strike(t, 0.008)
    thock = A.sine(A.settle(380, 180, t, 0.015), t) * A.strike(t, 0.04)
    out = np.zeros((2, len(t))) + A.drive(0.6 * clack + 0.7 * thock, 1.5)
    for at, note in ((0.03, 81), (0.11, 88)):
        A.put(out, at, A.spread(A.bell(note, 0.5), 0), 0.3)
    return out


def gate_open(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Bars sliding back: a short metal scrape rising, with a whoosh of air."""
    scrape = A.bandpass(A.stack(A.glide(90, 160, t), t, 3, 0.02), 200, 4000)
    scrape = A.full(scrape) * A.swell(t, 0.03) * A.decay(t, 0.15)
    whoosh = A.sweep_lowpass(A.noise(rng, t), A.glide(800, 6000, t)) * A.swell(t, 0.05) * A.decay(t, 0.15)
    ring = A.clang(rng, t, 900, 0.12)
    return 0.4 * scrape + 0.5 * A.full(whoosh) + 0.15 * ring


def gate_close(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Bars slamming down: a heavy clank that rings briefly."""
    thud = A.sine(A.settle(160, 70, t, 0.03), t) * A.strike(t, 0.09)
    hit = A.lowpass(A.noise(rng, t), 3000) * A.strike(t, 0.02)
    ring = A.clang(rng, t, 520, 0.2)
    return A.drive(thud + 0.4 * A.full(hit), 2) + 0.35 * ring


def portal(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A warp: a pitch that dives and springs back through a swirling filter, with a sub drop."""
    pitch = 220 * 2 ** (1.5 * np.sin(np.pi * t / t[-1]) - 0.8)
    tone = A.stack(pitch, t, 3, 0.01) + 0.6 * A.sine(2 * pitch, t)
    cutoff = 600 + 4500 * (0.5 + 0.5 * np.sin(A.TAU * 7 * t))
    swirl = A.sweep_lowpass(tone, cutoff) * A.swell(t, 0.02) * A.decay(t, 0.18)
    sub = A.sine(A.settle(120, 50, t, 0.06), t) * A.strike(t, 0.12)
    sparkle = A.hiss(rng, t, 4000, 13000) * A.strike(t, 0.06)
    return A.full(swirl) * 0.6 + 0.5 * sub + 0.2 * sparkle


def virus_spread(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Infection creeping in: wet bubbling and a sick, wobbling drone."""
    out = np.zeros((2, len(t)))
    for at in A.ONSET + np.sort(rng.uniform(0, t[-1] * 0.6, 7)):
        f0 = rng.uniform(180, 420)
        since = np.maximum(t - at, 0)
        blip = A.sine(A.settle(f0, f0 * 1.8, since, 0.03), t) * A.strike(t, 0.035, at)
        out = out + A.spread(blip, rng.uniform(-0.4, 0.4)) * rng.uniform(0.4, 0.9)
    drone = A.lowpass(A.stack(70 * 2 ** (0.4 * A.wander(rng, t, 6) / 12), t, 3, 0.02), 900)
    return out + 0.35 * A.full(drone) * A.hold(t, 0.1, 0.25)


def virus_purge(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A colony wiped out: a clean burst, a rising major arpeggio of bells, glittering after."""
    out = np.zeros((2, len(t)))
    burst = A.hiss(rng, t, 2000, 14000) * A.strike(t, 0.05)
    out = out + 0.4 * burst
    for i, note in enumerate((76, 80, 83, 88)):
        A.put(out, A.ONSET + 0.06 * i, A.spread(A.bell(note, 0.9), 0.2 * (i - 1.5)), 0.4)
    ping = A.clock(0.12)
    for at in rng.uniform(0.2, t[-1] - 0.2, 12):
        spark = A.sine(A.hz(rng.choice((100, 104, 107, 112))), ping) * A.decay(ping, 0.025)
        A.put(out, at, A.spread(spark, rng.uniform(-0.6, 0.6)), 0.15)
    return out


# File name, length (s), fade-out (s), synth.
EFFECTS = (
    ("fuse", 0.5, 0.12, fuse),
    ("phantom-in", 0.38, 0.08, phantom_in),
    ("phantom-out", 0.36, 0.1, phantom_out),
    ("switch", 0.7, 0.2, switch),
    ("gate-open", 0.4, 0.1, gate_open),
    ("gate-close", 0.4, 0.1, gate_close),
    ("portal", 0.5, 0.1, portal),
    ("virus-spread", 0.7, 0.2, virus_spread),
    ("virus-purge", 1.2, 0.35, virus_purge),
)


def effect(index: int) -> np.ndarray:
    _, seconds, fade_out, synth = EFFECTS[index]
    rng = np.random.default_rng([SEED, index])
    sound = A.fade(A.widen(synth(A.clock(seconds), rng)), A.FADE_IN, fade_out)
    return sound * A.gain(A.SFX_PEAK_DB) / np.abs(sound).max()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        for i, (name, *_) in enumerate(EFFECTS):
            path = OUT / f"{name}.mp3"
            A.save(effect(i), path, A.SFX_BITRATE, Path(d))
            seconds = A.decode(path).shape[-1] / A.SR
            print(f"{path.relative_to(ROOT)}  {seconds:.3f} s  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
