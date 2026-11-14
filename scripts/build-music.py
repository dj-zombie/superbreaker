#!/usr/bin/env python3
"""Cuts the reactive music out of Justice's "Pusher" (feat. Gesaffelstein).

The game never plays the song front to back. It loops one section at a time, picked by how
intense the moment is, and cuts between sections on the beat. This script cuts those sections
out of the source, levels them to sit under the sound effects, and packs them into one mp3 with
a cue sheet (src/art/music.json) that the game reads. The cue sheet also lifts the quieter
sections, so the menus and the calm moods don't fall away under the drops.

The song runs at 113.36 BPM on a fixed grid and its first kick lands 15 ms in. From the
breakdown on, the arrangement starts its phrases half a bar later, so those bars sit two beats
further along the grid (`late` below). Bar numbers are the song's own, counted from 0.

  bars   0-11   intro: a pad, then bass and synth over rising hats, no kick
        12-19   the kick comes in
        20-35   first drop, full sub
        36-43   the sub drops out
        44-59   first drop again
        60-67   half-time pre-drop, then a one-bar gap
        69-84   second drop, brighter hats
        85-100  beatless breakdown
       101-116  kickless sub drone, darker as it goes (late)
       127-134  the kick comes back (late)
       137-152  final drop, the heaviest kick (late)
       153-192  more of the final drop, a busier stretch, then the climax (late)

Each section is cut 8 ms ahead of its first kick so a cut never clips the attack. The file opens
with a click at a known sample: the game finds it in the decoded audio to cancel whatever delay
the browser's mp3 decoder adds, so the cut points stay on the beat.

Usage:
    python3 scripts/build-music.py                         # cut, level, encode, write the cue sheet
    python3 scripts/build-music.py --fetch                 # download the source first if it's missing
    python3 scripts/build-music.py --list                  # sections and moods
    python3 scripts/build-music.py --demo /tmp/music.wav   # also renders a session through every mood
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = "https://youtu.be/Ip_Kc3EQiOI"
SOURCE = ROOT / "art-src" / "music" / "source.wav"
OUT = ROOT / "public" / "assets" / "audio" / "music" / "pusher.mp3"
MANIFEST = ROOT / "src" / "art" / "music.json"
SR = 44100

# ---------------------------------------------------------------- grid

BEAT = 0.5292864
BAR = 4 * BEAT
FIRST_KICK = 0.01535
LATE = 2
PREROLL = 0.008
# The decoder-delay finder in the game looks for this click.
CLICK_AT = 1024
HEAD = 0.25
# Audio kept past each section's end, so a cut can fade out into the real continuation.
TAIL = 0.25
TARGET_LUFS = -13.5
LEVEL_SECTION = "drop1"
# No section plays more than this far under the level section (dB). The game lifts the quieter
# ones, so the sparse intro on the title and the dark drone don't fall away.
SPREAD = 2.0


def beat_time(beat: float) -> float:
    """Song time of a grid beat's cut point, just ahead of its kick."""
    return FIRST_KICK - PREROLL + beat * BEAT


@dataclass(frozen=True)
class Section:
    name: str
    bar: int
    bars: int
    late: bool
    note: str

    @property
    def first_beat(self) -> int:
        return 4 * self.bar + (LATE if self.late else 0)

    @property
    def beats(self) -> int:
        return 4 * self.bars

    @property
    def start(self) -> float:
        return beat_time(self.first_beat)

    @property
    def end(self) -> float:
        return beat_time(self.first_beat + self.beats)


SECTIONS = [
    Section("intro", 4, 8, False, "Bass and synth over rising hats, no kick. The title opens on it."),
    Section("kick", 12, 8, False, "The kick comes in. Menus, the serve and quiet stretches."),
    Section("drop1", 20, 16, False, "First drop, full sub. Normal play."),
    Section("nosub", 36, 8, False, "The sub drops out for a breath. Follows the first drop."),
    Section("predrop", 60, 8, False, "Half-time pre-drop. The Fever meter is nearly full."),
    Section("drop2", 69, 16, False, "Second drop, brighter hats. Multiball and long combos."),
    Section("dark", 101, 8, True, "Kickless sub drone. The last ball and the Descent danger line."),
    Section("peak", 137, 8, True, "The final drop, the heaviest kick. Fever."),
]

# Mood -> sections in play order. `loop` is the index the list wraps back to.
MOODS: dict[str, dict] = {
    "menu": {"play": ["intro", "kick"], "loop": 1},
    "calm": {"play": ["kick"], "loop": 0},
    "groove": {"play": ["drop1", "nosub"], "loop": 0},
    "build": {"play": ["predrop"], "loop": 0},
    "drive": {"play": ["drop2"], "loop": 0},
    "fever": {"play": ["peak"], "loop": 0},
    "danger": {"play": ["dark"], "loop": 0},
}

# A scripted session for --demo: mood, seconds until the next change, and whether it cuts on
# the beat instead of the bar.
DEMO = [
    ("menu", 24.0, False),
    ("calm", 6.0, False),
    ("groove", 40.0, False),
    ("build", 9.0, False),
    ("fever", 8.5, True),
    ("drive", 16.0, False),
    ("groove", 8.0, False),
    ("danger", 20.0, False),
    ("drive", 12.0, False),
]

# ---------------------------------------------------------------- io


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stderr


def fetch() -> None:
    if SOURCE.exists():
        return
    if not shutil.which("yt-dlp"):
        raise SystemExit("yt-dlp is needed to download the source")
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio", "-x", "--audio-format", "wav",
         "-o", str(SOURCE.with_suffix(".%(ext)s")), SOURCE_URL],
        check=True,
    )


def load(tmp: Path) -> np.ndarray:
    """The source as float stereo at 44.1 kHz."""
    path = tmp / "source44k.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(SOURCE), "-ac", "2",
         "-af", f"aresample={SR}:filter_size=64:phase_shift=10:cutoff=0.97", "-c:a", "pcm_f32le", str(path)])
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    assert sr == SR
    return x


def lufs(x: np.ndarray, tmp: Path) -> float:
    path = tmp / "measure.wav"
    sf.write(path, x, SR, subtype="FLOAT")
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"]))
    return float(found[-1])


def samples(t: float) -> int:
    return int(round(t * SR))


# ---------------------------------------------------------------- grid check


def check_grid(x: np.ndarray) -> None:
    """Folds the kick clicks of each section onto one beat. They should land on the grid."""
    mono = x.mean(axis=1)
    print("grid check (kick click vs. grid, ms):")
    for s in SECTIONS:
        if s.name in ("intro", "dark"):
            continue
        a, b = samples(s.start), samples(s.end)
        spec = np.fft.rfft(mono[a:b])
        spec[np.fft.rfftfreq(b - a, 1 / SR) < 1500] = 0
        hi = np.abs(np.fft.irfft(spec, n=b - a))
        k = int(SR * 0.0005)
        env = np.convolve(hi, np.ones(k) / k, mode="same")
        w = int(0.04 * SR)
        acc = np.zeros(2 * w)
        for n in range(1, s.beats - 1):
            c = samples(beat_time(s.first_beat + n) + PREROLL) - a
            acc += env[c - w : c + w]
        off = (np.argmax(acc) - w) / SR * 1000
        flag = "" if abs(off) < 3 else "   <- off the grid"
        print(f"  {s.name:8s} {off:+5.1f}{flag}")


# ---------------------------------------------------------------- build


def regions() -> list[tuple[float, float, list[Section]]]:
    """Sections that touch in the song share one stretch of audio in the file."""
    out: list[tuple[float, float, list[Section]]] = []
    for s in sorted(SECTIONS, key=lambda s: s.start):
        if out and s.start <= out[-1][1] + 1e-6:
            a, _, members = out[-1]
            out[-1] = (a, s.end, members + [s])
        else:
            out.append((s.start, s.end, [s]))
    return out


def build(x: np.ndarray, gain: float) -> tuple[np.ndarray, dict[str, float]]:
    parts = [np.zeros((samples(HEAD), 2), np.float32)]
    parts[0][CLICK_AT] = 0.5
    at: dict[str, float] = {}
    pos = samples(HEAD)
    fade = np.linspace(1, 0, samples(0.02), dtype=np.float32)[:, None]
    for a, b, members in regions():
        chunk = x[samples(a) : samples(b + TAIL)] * gain
        chunk[-len(fade):] *= fade
        for s in members:
            at[s.name] = (pos + samples(s.start) - samples(a)) / SR
        parts.append(chunk)
        pos += len(chunk)
    return np.concatenate(parts), at


def encode(sprite: np.ndarray, tmp: Path) -> None:
    wav = tmp / "sprite.wav"
    sf.write(wav, sprite, SR, subtype="FLOAT")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libmp3lame",
         "-b:a", "160k", "-ar", str(SR), str(OUT)])


def lifts(x: np.ndarray, tmp: Path) -> dict[str, float]:
    """Gain (linear) the game plays each section at, so none sits more than SPREAD under the
    level section."""
    loud = {s.name: lufs(x[samples(s.start) : samples(s.end)], tmp) for s in SECTIONS}
    floor = loud[LEVEL_SECTION] - SPREAD
    out = {}
    print("section loudness (LUFS, relative to the level section) and lift:")
    for name, value in loud.items():
        lift = max(0.0, floor - value)
        print(f"  {name:8s} {value - loud[LEVEL_SECTION]:+5.1f}  {lift:+4.1f} dB")
        out[name] = round(10 ** (lift / 20), 3)
    return out


def write_manifest(at: dict[str, float], gains: dict[str, float]) -> None:
    manifest = {
        "path": str(OUT.relative_to(ROOT / "public" / "assets")),
        "bpm": round(60 / BEAT, 4),
        "beat": BEAT,
        "click": round(CLICK_AT / SR, 6),
        "segments": {
            s.name: {"at": round(at[s.name], 6), "beats": s.beats, "gain": gains[s.name]}
            for s in SECTIONS
        },
        "moods": MOODS,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- demo


def render_demo(sprite: np.ndarray, at: dict[str, float], gains: dict[str, float], path: Path) -> None:
    """Plays DEMO through the same rules as the game: cut on the next bar (or beat), start the
    new mood's first section, and loop each mood's list."""
    by_name = {s.name: s for s in SECTIONS}
    total = sum(d for _, d, _ in DEMO)
    out = np.zeros((samples(total + 40), 2), np.float32)
    fin, fout = samples(0.004), samples(0.006)

    def mix(name: str, t0: float, t1: float) -> None:
        n = samples(t1 - t0)
        a = samples(at[name])
        chunk = sprite[a : a + n + fout] * gains[name]
        chunk[:fin] *= np.linspace(0, 1, fin)[:, None]
        chunk[n:] *= np.linspace(1, 0, len(chunk) - n)[:, None]
        o = samples(t0)
        out[o : o + len(chunk)] += chunk

    def follow(mood: str, name: str) -> str:
        play, loop = MOODS[mood]["play"], MOODS[mood]["loop"]
        i = play.index(name) if name in play else -1
        return play[i + 1] if 0 <= i < len(play) - 1 else play[loop]

    requests = []
    t = 0.0
    for mood, dur, urgent in DEMO[1:]:
        t += DEMO[len(requests)][1]
        requests.append((t, mood, urgent))
    mood = DEMO[0][0]
    name, t0 = MOODS[mood]["play"][0], 0.0
    while t0 < total:
        end = t0 + by_name[name].beats * BEAT
        if requests and requests[0][0] < end:
            when, want, urgent = requests.pop(0)
            if name in MOODS[want]["play"]:
                mood = want
                continue
            q = BEAT if urgent else BAR
            cut = min(end, t0 + math.ceil((max(when, t0) + 0.06 - t0) / q) * q)
            mix(name, t0, cut)
            print(f"  {cut:6.1f}s  {mood} -> {want}")
            mood, name, t0 = want, MOODS[want]["play"][0], cut
            continue
        mix(name, t0, end)
        name, t0 = follow(mood, name), end
    sf.write(path, out[: samples(t0 + 0.5)], SR, subtype="PCM_16")
    print(f"demo: {path} ({t0:.0f}s)")


# ---------------------------------------------------------------- main


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--fetch", action="store_true", help="download the source with yt-dlp if missing")
    p.add_argument("--list", action="store_true", help="print the sections and moods")
    p.add_argument("--demo", type=Path, help="also write a scripted session through every mood")
    args = p.parse_args()

    if args.list:
        for s in SECTIONS:
            print(f"{s.name:8s} bars {s.bar:3d}-{s.bar + s.bars - 1:3d}{' late' if s.late else '     '} "
                  f"{s.start:7.2f}s +{s.end - s.start:5.2f}s  {s.note}")
        for mood, m in MOODS.items():
            print(f"{mood:7s} {' -> '.join(m['play'])}" + (f"  (loops from {m['play'][m['loop']]})" if len(m["play"]) > 1 else ""))
        return
    if args.fetch:
        fetch()
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE.relative_to(ROOT)}; run with --fetch")

    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        x = load(tmp)
        check_grid(x)
        level = next(s for s in SECTIONS if s.name == LEVEL_SECTION)
        measured = lufs(x[samples(level.start) : samples(level.end)], tmp)
        gain = 10 ** ((TARGET_LUFS - measured) / 20)
        print(f"{LEVEL_SECTION} measures {measured:.1f} LUFS; gain {20 * math.log10(gain):+.1f} dB")
        gains = lifts(x, tmp)
        sprite, at = build(x, gain)
        peak = np.abs(sprite[samples(HEAD):]).max()
        lifted = max(
            np.abs(x[samples(s.start) : samples(s.end)]).max() * gain * gains[s.name] for s in SECTIONS
        )
        print(f"peak {20 * math.log10(peak):.1f} dBFS, {20 * math.log10(lifted):.1f} lifted, "
              f"{len(sprite) / SR:.1f}s")
        encode(sprite, tmp)
        write_manifest(at, gains)
        print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB) and {MANIFEST.relative_to(ROOT)}")
        if args.demo:
            render_demo(sprite, at, gains, args.demo)


if __name__ == "__main__":
    main()
