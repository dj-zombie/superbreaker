#!/usr/bin/env python3
"""Synthesizes the bonus stages' placeholder bed and one-shots: the shooting gallery's, and Piñata Fiesta's.

Stand-ins until the real sounds exist. The bed is an original oom-pah in C, written to the
layout in src/art/galleryMusic.ts: a sync click, then 32 beats at 128 BPM from 0.25s. It is not
anybody else's tune. The one-shots are the ducks, the bag, the jackpot, the cat and the rail gun.
The rail gun's charge is timed to src/core/RailGun.ts: its bright plink opens the perfect reload.

Every sound is oscillators and noise from a seeded generator, so a second run writes the same
audio. Effects are mono, the bed is stereo. Requires numpy and ffmpeg.

Usage: python3 scripts/build-gallery-audio.py [--only rail_fire rail_charge ...]
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SFX_OUT = ROOT / "public" / "assets" / "audio" / "bonus"
MUSIC_OUT = ROOT / "public" / "assets" / "audio" / "music" / "gallery-placeholder.mp3"
FFMPEG = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"

SR = 44100
BPM = 128
BEAT = 60 / BPM
CLICK_AT = 0.02
LOOP_AT = 0.25
LOOP_BEATS = 32
SEED = 1947
SFX_BITRATE = "128k"
MUSIC_BITRATE = "160k"
PEAK_DB = -3.0
CEILING_DB = -1.0
TRIM_PASSES = 4


def samples(seconds: float) -> int:
    return int(round(seconds * SR))


def clock(seconds: float) -> np.ndarray:
    return np.arange(samples(seconds)) / SR


def db(level: float) -> float:
    return 10 ** (level / 20)


def hz(note: float) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def env_hit(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    attack = max(attack, 1 / SR)
    rise = np.minimum(t / attack, 1)
    return rise * np.exp(-t / decay)


def tone(note: float, seconds: float, partials: tuple[float, ...], decay: float) -> np.ndarray:
    n = samples(seconds)
    t = np.arange(n) / SR
    wave_ = np.zeros(n)
    for i, amp in enumerate(partials, start=1):
        wave_ += amp * np.sin(2 * np.pi * hz(note) * i * t)
    return wave_ * env_hit(n, 0.008, decay)


def put(buf: np.ndarray, at: float, clip: np.ndarray, level: float = 1) -> None:
    start = int(round(at * SR))
    if start >= buf.shape[-1]:
        return
    n = min(clip.shape[-1], buf.shape[-1] - start)
    buf[..., start : start + n] += level * clip[..., :n]


def noise(rng: np.random.Generator, seconds: float, decay: float) -> np.ndarray:
    n = samples(seconds)
    return rng.standard_normal(n) * env_hit(n, 0.002, decay)


def fade_ends(x: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    n = x.shape[-1]
    t = np.arange(n) / SR
    edge = np.ones(n)
    if fade_in > 0:
        edge *= np.minimum(t / fade_in, 1)
    if fade_out > 0:
        edge *= np.minimum((n / SR - t) / fade_out, 1)
    return x * edge


def write_wav(path: Path, x: np.ndarray) -> None:
    channels = 1 if x.ndim == 1 else x.shape[0]
    pcm = np.round(np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(channels)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes() if channels == 1 else pcm.T.tobytes())


def decode(path: Path, channels: int) -> np.ndarray:
    cmd = [FFMPEG, "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", str(channels), "-"]
    pcm = subprocess.run(cmd, check=True, capture_output=True).stdout
    data = np.frombuffer(pcm, "<i2").astype(np.float64) / 32768
    return data if channels == 1 else data.reshape(-1, channels).T


def save(x: np.ndarray, out: Path, bitrate: str, tmp: Path) -> None:
    channels = 1 if x.ndim == 1 else x.shape[0]
    trim = 0.0
    for _ in range(TRIM_PASSES):
        wav = tmp / (out.stem + ".wav")
        write_wav(wav, x * db(-trim))
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-map_metadata", "-1",
                "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), "-ac", str(channels), str(out),
            ],
            check=True,
        )
        over = 20 * np.log10(np.abs(decode(out, channels)).max() + 1e-12) - CEILING_DB
        if over <= 0:
            return
        trim += over + 0.1
    raise SystemExit(f"{out.name} still plays back over {CEILING_DB} dBFS")


def normalize(x: np.ndarray) -> np.ndarray:
    peak = np.abs(x).max()
    return x * db(PEAK_DB) / peak


# ---------------------------------------------------------------- one-shots


def peck(rng: np.random.Generator) -> np.ndarray:
    """A bolt finding a duck: a short wooden knock."""
    t = clock(0.09)
    body = np.sin(2 * np.pi * 540 * t) * np.exp(-t / 0.018)
    return fade_ends(body + 0.35 * noise(rng, 0.09, 0.012), 0.002, 0.012)


def quack(rng: np.random.Generator) -> np.ndarray:
    """A duck going down: two falling blurts, comic and short."""
    out = np.zeros(samples(0.28))
    for at, note in ((0.01, 74), (0.12, 70)):
        n = samples(0.14)
        t = np.arange(n) / SR
        f = hz(note) * (1.15 - 0.35 * np.minimum(t / 0.1, 1))
        wobble = 1 + 0.04 * np.sin(2 * np.pi * 28 * t)
        blurt = np.sin(2 * np.pi * np.cumsum(f * wobble) / SR) * env_hit(n, 0.012, 0.045)
        put(out, at, blurt, 1)
    return fade_ends(out + 0.08 * noise(rng, 0.28, 0.04), 0.004, 0.03)


def spill(rng: np.random.Generator) -> np.ndarray:
    """A coin shaking loose of the bag."""
    out = np.zeros(samples(0.16))
    put(out, 0.006, tone(88, 0.14, (1, 0.25, 0.08), 0.05), 1)
    put(out, 0.03, tone(95, 0.12, (1, 0.2), 0.04), 0.45)
    return fade_ends(out, 0.002, 0.02)


def jackpot(rng: np.random.Generator) -> np.ndarray:
    """The bag bursting: a C major arpeggio, bright and done quickly."""
    out = np.zeros(samples(0.4))
    for i, note in enumerate((72, 76, 79, 84)):
        put(out, 0.012 + i * 0.055, tone(note, 0.32, (1, 0.18, 0.4, 0.08), 0.12), 0.7)
    spark = noise(rng, 0.4, 0.08)
    return fade_ends(out + 0.04 * spark, 0.003, 0.06)


def meow(rng: np.random.Generator) -> np.ndarray:
    """The cat, offended: a short rising-falling vowel. Funny, not a buzzer."""
    n = samples(0.32)
    t = np.arange(n) / SR
    sweep = 520 + 280 * np.sin(np.pi * np.clip(t / 0.26, 0, 1))
    body = np.sin(2 * np.pi * np.cumsum(sweep) / SR)
    body += 0.35 * np.sin(2 * np.pi * np.cumsum(sweep * 2.02) / SR)
    air = rng.standard_normal(n) * 0.04
    return fade_ends((body + air) * env_hit(n, 0.03, 0.11), 0.008, 0.04)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    k = 1 - np.exp(-2 * np.pi * cutoff / SR)
    out = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        out[i] = acc
    return out


def sweep(f0: float, f1: float, seconds: float, glide: float) -> np.ndarray:
    """A pitch falling or rising from f0 toward f1, most of the way there by `glide` seconds."""
    t = clock(seconds)
    f = f1 + (f0 - f1) * np.exp(-t / glide)
    return 2 * np.pi * np.cumsum(f) / SR


def rail_fire(rng: np.random.Generator) -> np.ndarray:
    """The rail gun: a crack, a sub drop that lands in the chest, a falling zap and a rumble."""
    seconds = 0.9
    n = samples(seconds)
    out = np.zeros(n)
    crack = lowpass(np.diff(noise(rng, 0.06, 0.016), prepend=0), 7000) * 2.2
    put(out, 0, crack, 0.9)
    sub = np.sin(sweep(140, 34, 0.6, 0.07)) * env_hit(samples(0.6), 0.002, 0.2)
    put(out, 0, sub, 1.1)
    zap_phase = sweep(2600, 160, 0.4, 0.06)
    zap = (np.sin(zap_phase) + 0.5 * np.sin(2 * zap_phase) + 0.3 * np.sin(3 * zap_phase))
    put(out, 0.002, zap * env_hit(samples(0.4), 0.001, 0.1), 0.32)
    t = clock(0.6)
    ring = sum(a * np.sin(2 * np.pi * 330 * r * t) for r, a in ((1, 1), (2.76, 0.6), (5.4, 0.35)))
    put(out, 0.004, ring * env_hit(samples(0.6), 0.001, 0.18), 0.14)
    rumble = lowpass(rng.standard_normal(n), 260) * env_hit(n, 0.01, 0.32)
    put(out, 0.01, rumble, 1.6)
    return fade_ends(np.tanh(out * 1.6), 0.0005, 0.08)


def rail_charge(rng: np.random.Generator) -> np.ndarray:
    """
    The capacitor filling, as a wound-up music box: plinks climbing under a rising whine, then a
    bright one at 0.25s, the start of the perfect reload, and a soft tick as it is full at 0.445s.
    """
    seconds = 0.5
    out = np.zeros(samples(seconds))
    whine = np.sin(sweep(260, 980, 0.46, 0.9)) * np.minimum(clock(0.46) / 0.4, 1)
    put(out, 0, whine * env_hit(samples(0.46), 0.05, 1.0), 0.1)
    for at, note in ((0.02, 84), (0.08, 88), (0.14, 91), (0.2, 93)):
        put(out, at, tone(note, 0.12, (1, 0.08, 0.3), 0.05), 0.32)
    put(out, 0.25, tone(100, 0.2, (1, 0.12, 0.4, 0.1), 0.07), 1)
    put(out, 0.445, tone(96, 0.05, (1, 0.2), 0.012), 0.3)
    return fade_ends(out + 0.01 * noise(rng, seconds, 0.2), 0.002, 0.02)


def rail_perfect(rng: np.random.Generator) -> np.ndarray:
    """A perfect reload: the strongman's bell, rung clean, with a sparkle on top."""
    seconds = 0.6
    out = np.zeros(samples(seconds))
    t = clock(seconds)
    bell = sum(a * np.sin(2 * np.pi * 1180 * r * t) for r, a in ((1, 1), (2.32, 0.45), (4.07, 0.25)))
    put(out, 0, bell * env_hit(samples(seconds), 0.001, 0.22), 0.8)
    for i, note in enumerate((96, 100, 103)):
        put(out, 0.02 + i * 0.03, tone(note, 0.3, (1, 0.2), 0.08), 0.3)
    put(out, 0, np.diff(noise(rng, 0.3, 0.05), prepend=0), 0.25)
    return fade_ends(out, 0.001, 0.06)


def rail_jam(rng: np.random.Generator) -> np.ndarray:
    """A jam: the works sputter, and the clown's spring sags with a sad boing."""
    seconds = 0.55
    out = np.zeros(samples(seconds))
    for at in (0, 0.055, 0.1):
        put(out, at, lowpass(noise(rng, 0.04, 0.008), 1800), 1.2)
    n = samples(0.45)
    t = np.arange(n) / SR
    f = (260 - 120 * np.minimum(t / 0.4, 1)) * (1 + 0.35 * np.sin(2 * np.pi * 13 * t) * np.exp(-t / 0.2))
    boing = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_hit(n, 0.01, 0.16)
    put(out, 0.1, boing, 0.9)
    return fade_ends(out, 0.001, 0.04)


def crinkle(rng: np.random.Generator, seconds: float, decay: float) -> np.ndarray:
    """Crepe paper: bright noise in little bursts."""
    n = samples(seconds)
    grains = (rng.random(n) < 0.012).astype(float) * rng.standard_normal(n)
    hiss = np.diff(rng.standard_normal(n), prepend=0) * 0.25
    return lowpass(grains * 3 + hiss, 6000) * env_hit(n, 0.002, decay)


def whack(rng: np.random.Generator) -> np.ndarray:
    """The ball finding a piñata: a hollow papier-mache thump and a rustle of paper."""
    t = clock(0.22)
    thump = np.sin(sweep(210, 120, 0.22, 0.04)) * np.exp(-t / 0.045)
    knock = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.012)
    out = thump + 0.35 * knock
    put(out, 0.004, crinkle(rng, 0.2, 0.06), 0.9)
    return fade_ends(out, 0.002, 0.03)


def burst(rng: np.random.Generator) -> np.ndarray:
    """A piñata bursting: paper tearing open, a pop, and a quick festive run up to the top C."""
    out = np.zeros(samples(0.8))
    put(out, 0, crinkle(rng, 0.3, 0.12), 1.4)
    t = clock(0.1)
    put(out, 0.01, np.sin(sweep(160, 60, 0.1, 0.02)) * np.exp(-t / 0.03), 0.9)
    for i, note in enumerate((67, 72, 76, 79, 84)):
        put(out, 0.05 + i * 0.045, tone(note, 0.35, (1, 0.5, 0.35, 0.2, 0.1), 0.1), 0.5)
    put(out, 0.05, noise(rng, 0.6, 0.15), 0.05)
    return fade_ends(out, 0.002, 0.08)


def candy(rng: np.random.Generator) -> np.ndarray:
    """A candy caught: a crisp wrapper crunch under a bright plink."""
    out = np.zeros(samples(0.16))
    put(out, 0, crinkle(rng, 0.08, 0.02), 0.8)
    put(out, 0.004, tone(91, 0.14, (1, 0.3, 0.15), 0.04), 0.9)
    put(out, 0.03, tone(98, 0.1, (1, 0.2), 0.03), 0.35)
    return fade_ends(out, 0.002, 0.02)


def sizzle(rng: np.random.Generator) -> np.ndarray:
    """The chili caught: a hot pan hiss with crackles, and a comic falling yelp."""
    n = samples(0.55)
    hiss = np.diff(rng.standard_normal(n), prepend=0) * env_hit(n, 0.005, 0.2)
    pops = (rng.random(n) < 0.004).astype(float) * rng.standard_normal(n) * env_hit(n, 0.002, 0.25)
    out = 0.5 * hiss + 2.5 * pops
    m = samples(0.25)
    yelp = np.sin(sweep(900, 380, 0.25, 0.08)) * env_hit(m, 0.01, 0.08)
    put(out, 0.02, yelp, 0.6)
    return fade_ends(out, 0.002, 0.06)


def fiesta(rng: np.random.Generator) -> np.ndarray:
    """The fiesta: a brassy da-DA! on C major, a shaker under it and a crash to finish."""
    out = np.zeros(samples(1.1))
    brass = (1, 0.8, 0.6, 0.45, 0.3, 0.2)
    for at, length, level in ((0.0, 0.12, 0.6), (0.16, 0.8, 1.0)):
        for note in (60, 64, 67, 72):
            put(out, at, tone(note, length, brass, length * 0.8), level * 0.35)
    for i in range(8):
        put(out, i * 0.07, lowpass(np.diff(noise(rng, 0.05, 0.015), prepend=0), 9000), 0.25)
    put(out, 0.16, np.diff(noise(rng, 0.9, 0.3), prepend=0), 0.18)
    return fade_ends(np.tanh(out * 1.2), 0.002, 0.12)


EFFECTS = (
    ("peck", peck),
    ("quack", quack),
    ("spill", spill),
    ("jackpot", jackpot),
    ("meow", meow),
    ("rail_fire", rail_fire),
    ("rail_charge", rail_charge),
    ("rail_perfect", rail_perfect),
    ("rail_jam", rail_jam),
    ("whack", whack),
    ("burst", burst),
    ("candy", candy),
    ("sizzle", sizzle),
    ("fiesta", fiesta),
)


# ---------------------------------------------------------------- bed


def build_bed() -> np.ndarray:
    """32 beats of oom-pah from LOOP_AT, with the sync click alone in the opening."""
    total = LOOP_AT + LOOP_BEATS * BEAT + 0.05
    left = np.zeros(samples(total))
    right = np.zeros(samples(total))
    # The decoder finds this click and measures its delay against galleryMusic.click.
    click = np.sin(2 * np.pi * 1000 * clock(0.012)) * env_hit(samples(0.012), 0.001, 0.004)
    put(left, CLICK_AT, click, 0.9)
    put(right, CLICK_AT, click, 0.9)

    # Eight bars. The tune walks a C major scale and comes home; nothing is borrowed.
    melody = [
        (0, 72, 0.5), (0.5, 76, 0.5), (1, 79, 0.5), (1.5, 76, 0.5),
        (2, 74, 0.5), (2.5, 77, 0.5), (3, 81, 0.5), (3.5, 77, 0.5),
        (4, 76, 0.5), (4.5, 79, 0.5), (5, 84, 1),
        (6, 77, 0.5), (6.5, 76, 0.5), (7, 74, 0.5), (7.5, 72, 0.5),
        (8, 79, 0.5), (8.5, 76, 0.5), (9, 72, 0.5), (9.5, 76, 0.5),
        (10, 81, 0.5), (10.5, 77, 0.5), (11, 74, 0.5), (11.5, 77, 0.5),
        (12, 84, 0.5), (12.5, 79, 0.5), (13, 76, 0.5), (13.5, 72, 0.5),
        (14, 74, 0.5), (14.5, 76, 0.5), (15, 79, 0.5), (15.5, 84, 0.5),
    ]
    # Played twice so the loop is 32 beats, the second time an octave figure up on the last bar.
    for pass_ in range(2):
        base = pass_ * 16
        for beat, note, length in melody:
            note_ = note + (12 if pass_ == 1 and beat >= 14 else 0)
            clip = tone(note_, length * BEAT + 0.05, (1, 0.15, 0.28), 0.09)
            at = LOOP_AT + (base + beat) * BEAT
            # A little wider on the higher notes.
            pan = 0.15 if note_ >= 79 else 0
            put(left, at, clip, 0.34 * (1 - pan))
            put(right, at, clip, 0.34 * (1 + pan))
        for bar in range(8):
            for step, note, level in ((0, 48, 0.55), (1, 55, 0.28), (2, 48, 0.5), (3, 55, 0.28)):
                at = LOOP_AT + (base + bar * 4 + step) * BEAT
                bass = tone(note, BEAT * 0.9, (1, 0.2), 0.12 if step % 2 == 0 else 0.06)
                put(left, at, bass, level)
                put(right, at, bass, level)
            for step in (1, 3):
                at = LOOP_AT + (base + bar * 4 + step) * BEAT
                hat = noise(np.random.default_rng([SEED, pass_, bar, step]), 0.05, 0.012)
                put(left, at, hat, 0.06)
                put(right, at, hat, 0.06)
    bed = normalize(fade_ends(np.vstack([left, right]), 0.004, 0.02))
    # Stamp the click again after the normalise, so it stays the peak of the opening and the
    # decoder can find it (it ignores a click under 0.1).
    start = int(round(CLICK_AT * SR))
    n = click.shape[0]
    bed[:, start : start + n] = 0.55 * click
    return bed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="NAME",
        help="write just these one-shots (e.g. rail_fire), leaving the rest and the bed alone",
    )
    args = parser.parse_args()
    names = [name for name, _ in EFFECTS]
    unknown = sorted(set(args.only or []) - set(names))
    if unknown:
        raise SystemExit(f"unknown sound: {', '.join(unknown)}")
    written: list[Path] = []
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        for i, (name, synth) in enumerate(EFFECTS):
            if args.only and name not in args.only:
                continue
            rng = np.random.default_rng([SEED, i])
            path = SFX_OUT / f"{name}.mp3"
            save(normalize(synth(rng)), path, SFX_BITRATE, tmp)
            written.append(path)
        if not args.only:
            save(build_bed(), MUSIC_OUT, MUSIC_BITRATE, tmp)
            written.append(MUSIC_OUT)
    for path in written:
        channels = 2 if path == MUSIC_OUT else 1
        seconds = decode(path, channels).shape[-1] / SR
        print(f"{path.relative_to(ROOT)}  {seconds:.3f}s  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
