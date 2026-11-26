#!/usr/bin/env python3
"""Synthesizes the placeholder sounds of the story scenes.

Stand-ins until real ones are made, built from the same oscillators, noise and filters as
scripts/build-boss-audio.py (imported from it), and saved the same way: faded at both ends,
peak-normalised, encoded and decoded again to keep the peaks off full scale. The music beds are
loops instead: no fades, and their last seconds crossfaded into their first so the seam is
smooth.

Generated recordings (Ludo sound effects and music, MiniMax voice-over) are listed in SOURCED
instead: their files in art-src/cutscenes/audio/ and art-src/cutscenes/vo/ are trimmed of
leading silence, run through the entry's filters, loudness-normalised and faded out. Generated
loops (LOOPED) only get one fixed gain, so their seams stay seamless.

Everything goes to public/assets/audio/cutscenes/<name>.mp3 (voice-over to vo/<name>.mp3), the
keys the scripts in src/cutscenes/ name.

Usage: python3 scripts/build-cutscene-audio.py [name ...]   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "audio" / "cutscenes"
SRC = ROOT / "art-src" / "cutscenes"

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


def glitch(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The machine clearing its throat: a stutter of crushed tones and static, then a falling bleep."""
    gate = np.zeros_like(t)
    tones = np.zeros_like(t)
    at = 0.0
    while at < 0.55:
        span = rng.uniform(0.018, 0.06)
        on = (t >= at) & (t < at + span)
        if rng.random() < 0.7:
            gate[on] = 1.0
            tones[on] = rng.uniform(180, 2400)
        at += span
    buzz = B.saw(np.maximum(tones, 1.0), t) * 0.6 + B.hiss(rng, t, 1500, 9000) * 0.5
    crushed = np.round(buzz * 6) / 6 * gate
    fall = B.sine(B.settle(1600, 90, np.maximum(t - 0.55, 0), 0.12), t) * B.strike(t, 0.22, 0.55)
    return B.drive(crushed + 0.8 * fall, 1.4)


# The dawn bed's chords, a bar of DAWN_BAR seconds each: D, A over C sharp, B minor, G.
DAWN_CHORDS = ((50, 57, 62, 66, 69), (49, 57, 61, 64, 69), (47, 54, 62, 66, 71), (43, 55, 59, 62, 67))
DAWN_BAR = 4.0
DAWN_BLUR = 1.2  # s each chord takes to fade into the next


def dawn(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Daylight, for the first time: a warm pad breathing through four major-key chords, soft
    bells over it like light on water, and an open-air hush. The chords run round, so the bar
    after the last is the first again and the loop's seam falls on a chord change."""
    out = np.zeros((2, len(t)))
    for j in range(-1, int(t[-1] / DAWN_BAR) + 2):
        start = j * DAWN_BAR - DAWN_BLUR / 2
        env = B.swell(t - start, DAWN_BLUR) * (1 - B.swell(t - start - DAWN_BAR, DAWN_BLUR))
        if not env.any():
            continue
        chord = DAWN_CHORDS[j % len(DAWN_CHORDS)]
        for k, note in enumerate(chord):
            f = B.hz(note)
            warm = B.saw(f * 1.0023, t) + B.saw(f / 1.0023, t)
            voice = B.lowpass(warm, 700 + 140 * k) * 0.25 + B.sine(f, t) * 0.5
            out += B.spread(voice * env * (1.0 if k else 1.3), (k - 2) * 0.18)
        if j >= 0:
            bell = B.chime(rng, B.clock(3.0), [(B.hz(chord[-1] + 12), 1.4, 0.5), (B.hz(chord[-2] + 24), 0.9, 0.18)])
            B.put(out, j * DAWN_BAR + 1.5, bell * B.swell(B.clock(3.0), 0.01), 0.6)
    air = B.hiss(rng, t, 300, 5000) * (0.6 + 0.4 * B.wander(rng, t, 0.2))
    return out + air * 0.12


# File name, length (s), fade-out (s), synth, loops.
SOUNDS = (
    ("cs_heartbeat", 1.9, 0.25, heartbeat, False),
    ("cs_rumble", 2.6, 0.5, rumble, False),
    ("cs_crack", 2.2, 0.5, crack, False),
    ("cs_chime", 2.4, 0.6, lantern, False),
    ("cs_wind", 14.0, 0.0, wind, True),
    ("cs_glitch", 1.1, 0.2, glitch, False),
    ("cs_dawn", 4 * DAWN_BAR, 0.0, dawn, True),
)


# The Crucible speaks from inside a furnace: a fifth down, driven, with the iron ringing after.
FURNACE = (
    "asetrate=32000*0.74,aresample=44100,atempo=1.18,"
    "acompressor=threshold=0.08:ratio=6:attack=5:release=80,"
    "lowpass=f=4200,aecho=0.8:0.6:45|110:0.35|0.18"
)

# The narrator is something vast under the Foundry: two semitones down at the same pace, a
# ghost of itself an octave below, driven into grit, and a hall's echo after. `pace` speeds a
# line up without changing its pitch, for lines that have to fit between the score's hits.
def titan(pace: float = 1.0) -> str:
    return (
        "aresample=44100,asplit=2[dry][sub];"
        "[sub]asetrate=44100*0.5,aresample=44100,atempo=2,lowpass=f=900,volume=0.35[low];"
        "[dry][low]amix=inputs=2:weights=1 1:normalize=0,"
        f"asetrate=44100*0.89,aresample=44100,atempo={pace / 0.89:.4f},highpass=f=45,"
        "equalizer=f=110:t=q:w=1:g=5,equalizer=f=420:t=q:w=1.2:g=-3,"
        "equalizer=f=2600:t=q:w=1.5:g=1.5,volume=6dB,asoftclip=type=tanh,"
        "acompressor=threshold=0.1:ratio=5:attack=4:release=120:makeup=2,"
        "lowpass=f=6000,aecho=0.8:0.55:70|140|260:0.32|0.2|0.12"
    )

# The Mainframe talks through old wiring: a little lower, an octave-down hum under it, crushed
# to fewer bits, a slow comb sweeping through it, and a short metallic slapback off the hull.
MACHINE = (
    "aresample=44100,asplit=2[dry][sub];"
    "[sub]asetrate=44100*0.5,aresample=44100,atempo=2,lowpass=f=700,volume=0.3[low];"
    "[dry][low]amix=inputs=2:weights=1 1:normalize=0,"
    "asetrate=44100*0.94,aresample=44100,atempo=1.0638,highpass=f=70,"
    "acrusher=bits=9:mix=0.3:mode=log:aa=1,"
    "flanger=delay=3:depth=2:regen=35:speed=0.3:width=50,"
    "equalizer=f=2400:t=q:w=1.4:g=3,"
    "acompressor=threshold=0.1:ratio=4:attack=4:release=100:makeup=2,"
    "aecho=0.8:0.45:19|47:0.3|0.16"
)

# Name, source under art-src/cutscenes/, ffmpeg filters before the loudness pass, loudness
# (LUFS), fade-out (s), channels, bitrate. The score keeps its own silence at the top: the scene
# times its beats to it.
SOURCED = (
    ("cs_intro_score", "audio/score.mp3", "", -15, 2.5, 2, "128k"),
    ("cs_thunder_close", "audio/thunder_close.mp3", "", -13, 0.6, 2, "128k"),
    ("cs_braam", "audio/braam.mp3", "", -12, 0.8, 2, "128k"),
    ("cs_riser", "audio/riser.mp3", "", -15, 0.1, 2, "128k"),
    ("cs_volley", "audio/volley.mp3", "", -16, 0.4, 2, "128k"),
    ("cs_anvil", "audio/anvil.mp3", "", -12, 0.6, 2, "128k"),
    ("vo_intro_01", "vo/vo_intro_01.mp3", titan(), -14, 0.5, 1, "96k"),
    ("vo_intro_02", "vo/vo_intro_02.mp3", titan(), -14, 0.5, 1, "96k"),
    ("vo_intro_03", "vo/vo_intro_03.mp3", titan(1.1), -14, 0.5, 1, "96k"),
    ("vo_intro_04", "vo/vo_intro_04.mp3", titan(1.1), -14, 0.5, 1, "96k"),
    ("vo_intro_05", "vo/vo_intro_05.mp3", titan(1.1), -14, 0.5, 1, "96k"),
    ("vo_intro_06", "vo/vo_intro_06.mp3", titan(1.1), -14, 0.5, 1, "96k"),
    ("vo_crucible_01", "vo/vo_crucible_01.mp3", FURNACE, -15, 0.4, 1, "96k"),
    ("cs_rain", "audio/rain.wav", "", -22, 0.0, 2, "128k"),
    ("cs_wake", "audio/wake.mp3", "", -13, 0.5, 2, "128k"),
    ("cs_mainframe_bed", "audio/mainframe_bed.wav", "", -17, 0.0, 2, "128k"),
    ("vo_mainframe_01", "vo/vo_mainframe_01.mp3", MACHINE, -14, 0.4, 1, "96k"),
    ("vo_mainframe_02", "vo/vo_mainframe_02.mp3", MACHINE, -14, 0.4, 1, "96k"),
    ("vo_mainframe_03", "vo/vo_mainframe_03.mp3", MACHINE, -14, 0.4, 1, "96k"),
    ("vo_mainframe_04", "vo/vo_mainframe_04.mp3", MACHINE, -14, 0.4, 1, "96k"),
    ("vo_overseer_01", "vo/vo_overseer_01.mp3", MACHINE, -14, 0.4, 1, "96k"),
    ("vo_overseer_02", "vo/vo_overseer_02.mp3", MACHINE, -14, 0.5, 1, "96k"),
    ("cs_anthem", "audio/anthem.wav", "", -15, 0.0, 2, "128k"),
    ("cs_credits", "audio/credits.wav", "", -15, 0.0, 2, "128k"),
    ("cs_victory_sting", "audio/victory_sting.mp3", "atrim=end=6.5", -13, 2.4, 2, "128k"),
    ("vo_vesper_end_01", "vo/vo_vesper_end_01.mp3", "", -15, 0.3, 1, "96k"),
    ("vo_vesper_end_02", "vo/vo_vesper_end_02.mp3", "", -15, 0.3, 1, "96k"),
    ("vo_vesper_end_03", "vo/vo_vesper_end_03.mp3", "", -15, 0.3, 1, "96k"),
    ("vo_vesper_end_04", "vo/vo_vesper_end_04.mp3", "", -15, 0.3, 1, "96k"),
    ("vo_vesper_end_05", "vo/vo_vesper_end_05.mp3", "", -15, 0.3, 1, "96k"),
    ("vo_vesper_end_06", "vo/vo_vesper_end_06.mp3", "", -15, 0.3, 1, "96k"),
)
TRIM = "silenceremove=start_periods=1:start_threshold=-50dB"
# Generated loops (Ludo's are seamless already): no trim, no fade, and one fixed gain instead of
# loudnorm's moving one, so the seam stays where it was.
LOOPED = {"cs_rain", "cs_mainframe_bed", "cs_anthem", "cs_credits"}
LOOP_TP = -1.5  # dBTP a loop's gain may not push its peaks past


def duration(path: Path) -> float:
    out = subprocess.run(
        [B.FFMPEG.replace("ffmpeg", "ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def loudness(path: Path) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBTP) of a file, from loudnorm's measuring pass."""
    run = subprocess.run(
        [B.FFMPEG, "-hide_banner", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    )
    stats = json.loads(run.stderr[run.stderr.rindex("{") : run.stderr.rindex("}") + 1])
    return float(stats["input_i"]), float(stats["input_tp"])


def looped(entry: tuple) -> Path:
    name, source, _, lufs, _, channels, bitrate = entry
    out = OUT / f"{name}.mp3"
    level, peak = loudness(SRC / source)
    gain = min(lufs - level, LOOP_TP - peak)
    subprocess.run(
        [B.FFMPEG, "-v", "error", "-y", "-i", str(SRC / source), "-af", f"volume={gain:.2f}dB", "-ar", str(B.SR), "-ac", str(channels), "-b:a", bitrate, str(out)],
        check=True,
    )
    return out


def sourced(entry: tuple) -> Path:
    name, source, filters, lufs, fade_out, channels, bitrate = entry
    if name in LOOPED:
        return looped(entry)
    voice = source.startswith("vo/")
    out = OUT / ("vo" if voice else "") / f"{name}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    chain = [] if name == "cs_intro_score" else [TRIM]
    if filters:
        chain.append(filters)
    chain.append(f"loudnorm=I={lufs}:TP=-1.5:LRA=11")
    with tempfile.TemporaryDirectory() as d:
        mid = Path(d) / "mid.wav"
        subprocess.run(
            [B.FFMPEG, "-v", "error", "-y", "-i", str(SRC / source), "-af", ",".join(chain), "-ar", str(B.SR), "-ac", str(channels), str(mid)],
            check=True,
        )
        length = duration(mid)
        fade = f"afade=t=out:st={max(0.0, length - fade_out):.3f}:d={fade_out}"
        subprocess.run(
            [B.FFMPEG, "-v", "error", "-y", "-i", str(mid), "-af", fade, "-b:a", bitrate, str(out)],
            check=True,
        )
    return out


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
    wanted = set(sys.argv[1:])
    written = []
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        for i, (name, *_) in enumerate(SOUNDS):
            if wanted and name not in wanted:
                continue
            path = OUT / f"{name}.mp3"
            B.save(sound(i), path, B.SFX_BITRATE, tmp)
            written.append(path)
    for entry in SOURCED:
        if wanted and entry[0] not in wanted:
            continue
        written.append(sourced(entry))
    for path in written:
        print(f"{path.relative_to(ROOT)}  {duration(path):.3f} s  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
