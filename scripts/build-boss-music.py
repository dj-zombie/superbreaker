#!/usr/bin/env python3
"""Cuts the placeholder boss track out of "Middle Boss Battle" (The Legend of Zelda: Ocarina of Time).

A stand-in until the game has its own boss music. It is somebody else's recording: replace
public/assets/audio/music/boss-placeholder.mp3 before the game ships.

The piece runs at 125 BPM and is 30 bars long. The recording plays it three times and fades out.
The first time through opens with a few seconds the later ones do not have, so the game needs two
of them: the first for the start of a fight, the second to loop on. From 20 s in, the second is
the first again sample for sample; the third drifts a 60th of a second and is not used.

  head    0.00 -   0.25 s            silence, with the sync click MusicEngine measures the decoder by
  open    0.25 -  57.85 s   30 bars   the first time through, with the opening
  loop   57.85 - 115.45 s   30 bars   the second time through; the game loops this
  tail  115.45 - 115.70 s            the start of the third, for the fade at the loop point to read

src/art/bossMusic.ts names these sections and where each starts. Change one and change the other.

Each section starts PREROLL ahead of its first beat, as build-music.py cuts its sections. The whole
cut is turned down to the loudness of the level song, so a fight is no louder than the level
before it.

Usage:
    python3 scripts/build-boss-music.py            # cut, level, encode, check
    python3 scripts/build-boss-music.py --fetch    # download the source first if it's missing
(requires numpy and ffmpeg; --fetch requires yt-dlp)
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = "https://youtu.be/WfzurQ0XKNc"
SOURCE = ROOT / "art-src" / "music" / "boss-source.wav"
OUT = ROOT / "public" / "assets" / "audio" / "music" / "boss-placeholder.mp3"

SR = 44100
BITRATE = "160k"
BPM = 125
BEAT = 60 / BPM  # s
PASS_BEATS = 120  # once through the piece: 30 bars of four
FIRST_BEAT = 0.02125  # s into the source of its first note
PREROLL = 0.008  # s from a section's start to its first beat, as build-music.py
HEAD = 0.25  # s of silence ahead of the first section, as build-music.py's lead-in
CLICK_AT = 1024  # sample of the sync click the head carries, as build-music.py
CLICK_LEVEL = 0.5
TAIL = 0.25  # s of the source kept after the last section, clear of the encoder's last frames
TARGET_LUFS = -15.0  # what pusher.mp3 measures end to end
SAME_DB = -60.0  # two stretches of the source this far apart or closer are the same audio
CEILING_DB = -1.0  # the encoded file may not play back over this (dBFS)


def run(cmd: list[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(cmd, check=True, capture_output=True)


def samples(seconds: float) -> int:
    return int(round(seconds * SR))


def fetch() -> None:
    if SOURCE.exists():
        return
    if not shutil.which("yt-dlp"):
        raise SystemExit("yt-dlp is needed to download the source")
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["yt-dlp", "--no-playlist", "-f", "bestaudio", "-x", "--audio-format", "wav",
         "-o", str(SOURCE.with_suffix(".%(ext)s")), SOURCE_URL],
        check=True,
    )


def decode(path: Path) -> np.ndarray:
    """A file as float stereo at 44.1 kHz, one row a sample."""
    pcm = run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "2", "-ar", str(SR),
               "-f", "f32le", "-"]).stdout
    return np.frombuffer(pcm, "<f4").reshape(-1, 2).astype(np.float64)


def write(x: np.ndarray, path: Path, codec: list[str]) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
         *codec, str(path)],
        input=x.astype("<f4").tobytes(), check=True, capture_output=True,
    )


def lufs(x: np.ndarray, tmp: Path) -> float:
    path = tmp / "measure.wav"
    write(x, path, ["-c:a", "pcm_f32le"])
    report = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128",
                  "-f", "null", "-"]).stderr.decode()
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", report)[-1])


def apart_db(a: np.ndarray, b: np.ndarray) -> float:
    """How far `b` is from `a`, against the level of `a` (dB)."""
    return 10 * np.log10((np.mean((b - a) ** 2) + 1e-15) / (np.mean(a**2) + 1e-15))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--fetch", action="store_true", help="download the source with yt-dlp if missing")
    args = p.parse_args()
    if args.fetch:
        fetch()
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE.relative_to(ROOT)}; run with --fetch")

    src = decode(SOURCE)
    start = samples(FIRST_BEAT - PREROLL)
    once = samples(PASS_BEATS * BEAT)
    tail = samples(TAIL)
    # The loop only closes if the recording really does repeat where this says it does.
    end = src[start + once - SR : start + once]
    if apart_db(end, src[start + 2 * once - SR : start + 2 * once]) > SAME_DB:
        raise SystemExit("the second time through does not end as the first does")
    if apart_db(src[start + once : start + once + tail], src[start + 2 * once : start + 2 * once + tail]) > SAME_DB:
        raise SystemExit("the third time through does not start as the second does")

    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        song = src[start : start + 2 * once + tail]
        measured = lufs(song, tmp)
        song = song * 10 ** ((TARGET_LUFS - measured) / 20)
        head = np.zeros((samples(HEAD), 2))
        head[CLICK_AT] = CLICK_LEVEL
        OUT.parent.mkdir(parents=True, exist_ok=True)
        write(np.concatenate([head, song]), OUT, ["-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", str(SR)])

    back = decode(OUT)
    click = int(np.abs(back[: samples(0.2), 0]).argmax())
    peak_db = 20 * np.log10(np.abs(back[samples(HEAD) :]).max())
    if click != CLICK_AT:
        raise SystemExit(f"the sync click came back at sample {click}, not {CLICK_AT}")
    if peak_db > CEILING_DB:
        raise SystemExit(f"the file plays back at {peak_db:.1f} dBFS, over {CEILING_DB}")
    print(f"source {measured:.1f} LUFS, turned {TARGET_LUFS - measured:+.1f} dB; peak {peak_db:.1f} dBFS")
    for name, at in (("open", HEAD), ("loop", HEAD + PASS_BEATS * BEAT)):
        print(f"  {name:5s} at {at:7.3f} s  {PASS_BEATS} beats of {BEAT} s")
    print(f"{OUT.relative_to(ROOT)}  {len(back) / SR:.3f} s  {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
