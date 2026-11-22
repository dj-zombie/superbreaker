#!/usr/bin/env python3
"""Synthesizes the placeholder boss-fight sound effects.

Stand-ins until the real sounds exist. Every sound is built from oscillators and noise with
numpy, so each one only has to be recognisable, clean and the right length. All noise comes from
seeded generators, so a second run writes the same audio.

The effects go to public/assets/audio/boss/<name>.mp3, each faded at both ends and
peak-normalised. Every file is decoded again after it is encoded, to print its real length and to
keep its peaks off full scale. The boss music is not made here: scripts/build-boss-music.py cuts
it from a recording.

Usage: python3 scripts/build-boss-audio.py   (requires numpy and ffmpeg)
"""
from __future__ import annotations

import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SFX_OUT = ROOT / "public" / "assets" / "audio" / "boss"
FFMPEG = "/usr/local/bin/ffmpeg"

SR = 44100
TAU = 2 * np.pi
SEED = 1987  # every noise generator is seeded from this, so the output never changes
SFX_BITRATE = "128k"
SFX_PEAK_DB = -3.0  # peak of every effect (dBFS)
ENCODED_CEILING_DB = -1.0  # no file may play back over this, whatever the encoder adds (dBFS)
TRIM_PASSES = 4  # tries at turning a sound down until its mp3 stays under that
FADE_IN = 0.005  # s; every sound opens with this fade, so it never starts on a click
ONSET = 0.006  # s; where an effect's first hit lands, just clear of the fade-in
STRIKE_RISE = 0.0005  # s a hit takes to reach its full level
WIDTH = 0.35  # how much of a noise differs between the channels; the rest is common to both
SIDE_DELAY = 0.011  # s; an effect's own late copy, out of phase between the sides, widens it
SIDE_LEVEL = 0.3  # how much of that copy each side gets
SIDE_FLOOR = 250  # Hz; below this an effect stays in the centre
FILTER_PAD = 4096  # samples mirrored onto each end of a sound before it is filtered
SWEEP_BANK = 12  # fixed filters a moving low-pass crossfades through

BEAT = 0.5  # s; the ending theme is written at 120 BPM
# Kettle-drum partials: ratio to the note, level, decay (s).
TIMPANI = ((1.0, 1.0, 0.5), (1.5, 0.6, 0.35), (1.99, 0.35, 0.25), (2.44, 0.2, 0.18))


# ---------------------------------------------------------------- building blocks
#
# A mono sound is an array of samples; a stereo one is two rows of them, so a mono sound or an
# envelope multiplies and adds straight into a stereo one.


def samples(seconds: float) -> int:
    return int(round(seconds * SR))


def clock(seconds: float) -> np.ndarray:
    """The time (s) of every sample of a sound this long."""
    return np.arange(samples(seconds)) / SR


def gain(level_db: float) -> float:
    return 10 ** (level_db / 20)


def hz(note: float) -> float:
    """Frequency of a MIDI note."""
    return 440 * 2 ** ((note - 69) / 12)


def cycles(freq, t: np.ndarray, start: float = 0.0) -> np.ndarray:
    """Phase, in cycles, of an oscillator whose frequency may move."""
    freq = np.broadcast_to(freq, t.shape)
    return start + (np.cumsum(freq) - freq) / SR


def sine(freq, t: np.ndarray, start: float = 0.0) -> np.ndarray:
    return np.sin(TAU * cycles(freq, t, start))


def saw(freq, t: np.ndarray, start: float = 0.5) -> np.ndarray:
    """Sawtooth with its edge rounded over two samples (PolyBLEP), so it does not alias. From
    the default phase it starts at zero."""
    step = np.broadcast_to(freq, t.shape) / SR
    p = cycles(freq, t, start) % 1.0
    out = 2 * p - 1
    after, before = p < step, p > 1 - step
    a = p[after] / step[after]
    out[after] -= 2 * a - a * a - 1
    b = (p[before] - 1) / step[before]
    out[before] -= b * b + 2 * b + 1
    return out


def pulse(freq, t: np.ndarray, width: float = 0.5) -> np.ndarray:
    """Pulse wave, a square at width 0.5: one saw less a later one."""
    return saw(freq, t, 0.0) - saw(freq, t, width)


def stack(freq, t: np.ndarray, voices: int = 3, detune: float = 0.006) -> np.ndarray:
    """Saws spread a few cents either side of `freq`, each from its own phase: one thick voice."""
    spread_by = np.linspace(-detune, detune, voices)
    return sum(saw(freq * (1 + d), t, (0.5 + 0.37 * i) % 1) for i, d in enumerate(spread_by)) / voices


def decay(t: np.ndarray, tau: float) -> np.ndarray:
    return np.exp(-t / tau)


def swell(t: np.ndarray, rise: float) -> np.ndarray:
    """0 to 1 over `rise` seconds, eased at both ends."""
    x = np.clip(t / rise, 0, 1)
    return x * x * (3 - 2 * x)


def hold(t: np.ndarray, attack: float, release: float) -> np.ndarray:
    """Envelope of a held note: up over `attack`, down over the last `release` seconds."""
    return swell(t, attack) * swell(t[-1] - t, release)


def strike(t: np.ndarray, tau: float, at: float = ONSET) -> np.ndarray:
    """Envelope of a hit at `at`: silent before it, up in STRIKE_RISE, then dying away."""
    since = t - at
    return np.clip(since / STRIKE_RISE, 0, 1) * np.exp(-np.maximum(since, 0) / tau)


def glide(a: float, b: float, t: np.ndarray) -> np.ndarray:
    """Frequency moving from a to b, evenly in pitch, across the whole sound."""
    return a * (b / a) ** (t / t[-1])


def settle(a: float, b: float, t: np.ndarray, tau: float) -> np.ndarray:
    """Frequency that starts at a and settles on b."""
    return b + (a - b) * np.exp(-t / tau)


def wander(rng: np.random.Generator, t: np.ndarray, rate: float) -> np.ndarray:
    """A smooth random curve in -1..1 that turns about `rate` times a second."""
    knots = rng.uniform(-1, 1, int(t[-1] * rate) + 3)
    i, f = np.divmod(t * rate, 1)
    i = i.astype(int)
    f = f * f * (3 - 2 * f)
    return knots[i] * (1 - f) + knots[i + 1] * f


def noise(rng: np.random.Generator, t: np.ndarray) -> np.ndarray:
    """White noise for both channels: a shared part, plus WIDTH of a part that differs."""
    mid, side = rng.standard_normal((2, len(t)))
    return np.stack([mid + WIDTH * side, mid - WIDTH * side])


def spread(x: np.ndarray, pan) -> np.ndarray:
    """A mono sound leant left (pan < 0) or right. The two sides still sum to the same mono."""
    return np.stack([(1 - pan) * x, (1 + pan) * x])


def shape(x: np.ndarray, response) -> np.ndarray:
    """Zero-phase filter: scales each frequency of `x` by response(Hz). Works on the last axis."""
    n = x.shape[-1]
    padded = np.pad(x, [(0, 0)] * (x.ndim - 1) + [(FILTER_PAD, FILTER_PAD)], mode="reflect")
    size = 1 << (padded.shape[-1] - 1).bit_length()
    spectrum = np.fft.rfft(padded, size) * response(np.fft.rfftfreq(size, 1 / SR))
    return np.fft.irfft(spectrum, size)[..., FILTER_PAD : FILTER_PAD + n]


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    return shape(x, lambda f: 1 / np.sqrt(1 + (f / cutoff) ** (2 * order)))


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    return shape(x, lambda f: 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass(x: np.ndarray, low: float, high: float, order: int = 2) -> np.ndarray:
    def response(f: np.ndarray) -> np.ndarray:
        under = 1 + (low / np.maximum(f, 1e-3)) ** (2 * order)
        return 1 / np.sqrt(under * (1 + (f / high) ** (2 * order)))

    return shape(x, response)


def formants(x: np.ndarray, peaks) -> np.ndarray:
    """Lifts resonances, the way a throat or a horn does. Each peak is (centre Hz, width in
    octaves, lift): a bell that adds `lift` times the level at its centre."""

    def response(f: np.ndarray) -> np.ndarray:
        octave = np.log2(np.maximum(f, 1.0))
        return 1 + sum(lift * np.exp(-0.5 * ((octave - np.log2(c)) / w) ** 2) for c, w, lift in peaks)

    return shape(x, response)


def sweep_lowpass(x: np.ndarray, cutoff: np.ndarray, order: int = 2) -> np.ndarray:
    """Low-pass whose cutoff (Hz, one per sample) moves: a crossfade through a bank of fixed
    ones. They are zero-phase, so the blend between two neighbours is itself a clean low-pass."""
    edges = np.geomspace(cutoff.min(), cutoff.max(), SWEEP_BANK)
    at = np.interp(np.log(cutoff), np.log(edges), np.arange(SWEEP_BANK))
    return sum(lowpass(x, f, order) * np.clip(1 - np.abs(at - i), 0, 1) for i, f in enumerate(edges))


def hiss(rng: np.random.Generator, t: np.ndarray, low: float, high: float) -> np.ndarray:
    """Noise between two frequencies at unit loudness, a little different in each channel."""
    x = bandpass(noise(rng, t), low, high)
    return x / np.sqrt(np.mean(x * x))


def full(x: np.ndarray) -> np.ndarray:
    """`x` scaled so its peak is 1."""
    return x / np.abs(x).max()


def drive(x: np.ndarray, amount: float) -> np.ndarray:
    """Soft saturation: the more `amount`, the squarer and buzzier."""
    return np.tanh(amount * x) / np.tanh(amount)


def chime(rng: np.random.Generator, t: np.ndarray, partials) -> np.ndarray:
    """Decaying sine partials (Hz, decay s, level), each leant to one side: gongs and glass."""
    return sum(
        spread(level * sine(f, t, rng.random()) * decay(t, tau), rng.uniform(-WIDTH, WIDTH))
        for f, tau, level in partials
    )


def crackle(rng: np.random.Generator, t: np.ndarray, rate: np.ndarray) -> np.ndarray:
    """Sparse bright clicks, `rate` of them a second, scattered left and right: debris, shards."""
    size = (rng.random(len(t)) < rate / SR) * rng.uniform(0.3, 1.0, len(t))
    clicks = spread(size, rng.uniform(-2 * WIDTH, 2 * WIDTH, len(t)))
    ring = decay(clock(0.01), 0.0015)
    env = np.stack([np.convolve(side, ring)[: len(t)] for side in clicks])
    return hiss(rng, t, 1500, 14000) * env


def put(out: np.ndarray, at: float, sound: np.ndarray, level: float = 1.0, wrap: bool = False) -> None:
    """Mixes `sound` into the stereo `out` from `at` seconds. What runs past the end is cut, or
    wrapped onto the start."""
    start, n, size = samples(at), sound.shape[-1], out.shape[-1]
    if wrap:
        out[:, (start + np.arange(n)) % size] += level * sound
    else:
        n = max(0, min(n, size - start))
        out[:, start : start + n] += level * sound[..., :n]


def widen(x: np.ndarray) -> np.ndarray:
    """Gives a sound a little width that cancels in mono: its middle, late and without its
    lows, is added on the left and taken off on the right."""
    delay = samples(SIDE_DELAY)
    late = np.roll(highpass(np.broadcast_to(x, (2, x.shape[-1])).mean(axis=0), SIDE_FLOOR), delay)
    late[:delay] = 0
    return x + SIDE_LEVEL * np.stack([late, -late])


def ramp(seconds: float) -> np.ndarray:
    """Half a cosine from 0 up to 1."""
    n = samples(seconds)
    return 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / n)


def fade(x: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    """`x` as stereo with both ends eased to silence, so it starts and stops without a click."""
    x = np.array(np.broadcast_to(x, (2, x.shape[-1])))
    opening, closing = ramp(fade_in), ramp(fade_out)[::-1]
    x[:, : len(opening)] *= opening
    x[:, -len(closing) :] *= closing
    return x


# ---------------------------------------------------------------- voices shared by several sounds


def bellow(rng: np.random.Generator, t: np.ndarray, pitch: np.ndarray) -> np.ndarray:
    """A roaring voice at a moving pitch: harsh saws and breath through the same throat, all of
    it fluttering."""
    flutter = 0.65 + 0.35 * sine(27 + 5 * wander(rng, t, 2), t)
    cords = drive(stack(pitch, t, 3, 0.012) * flutter, 4)
    breath = 0.3 * hiss(rng, t, 150, 8000) * flutter
    throat = ((500, 0.45, 2.0), (1150, 0.35, 1.5), (2600, 0.3, 1.0))
    return full(formants(bandpass(cords + breath, 80, 5500), throat))


def brass(freq: float, t: np.ndarray) -> np.ndarray:
    """A brass-like note as long as `t`: saws through a low-pass that opens with the attack and
    eases back, with a little vibrato once the note is held."""
    vibrato = 1 + 0.004 * swell(t - 0.25, 0.4) * sine(5.5, t)
    cutoff = freq * (2 + 7 * swell(t, 0.05) * (0.6 + 0.4 * decay(t, 0.3)))
    return sweep_lowpass(stack(freq * vibrato, t, 2, 0.003), cutoff) * hold(t, 0.03, 0.06)


def timpani(rng: np.random.Generator, freq: float, t: np.ndarray) -> np.ndarray:
    """A kettle drum on `freq`: the skin's partials dying away under a soft thump."""
    bend = 1 + 0.03 * decay(t, 0.03)
    skin = sum(level * sine(freq * ratio * bend, t) * decay(t, tau) for ratio, level, tau in TIMPANI)
    thump = hiss(rng, t, 30, 220) * decay(t, 0.03)
    return (skin + 0.4 * thump) * hold(t, 0.002, 0.05)


def bell(note: float, seconds: float) -> np.ndarray:
    """An FM bell: a sine whose phase a faster sine shakes, the shake dying before the ring."""
    t = clock(seconds)
    shake = 1.5 * decay(t, 0.15) * sine(3.5 * hz(note), t)
    return np.sin(TAU * cycles(hz(note), t) + shake) * decay(t, 0.28) * swell(t[-1] - t, 0.1)


# ---------------------------------------------------------------- sound effects
#
# Each takes the clock of the finished sound and its own noise generator, and returns the sound
# before its fades and its normalising.


def stomp(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """One heavy footfall: a sub thump, a dull burst of noise on the attack, a short rumble."""
    thump = sine(settle(55, 30, t, 0.1), t) * decay(t, 0.17)
    knock = sine(settle(170, 70, t, 0.03), t) * decay(t, 0.05)  # the part a small speaker plays
    burst = hiss(rng, t, 40, 900) * decay(t, 0.05)
    rumble = hiss(rng, t, 25, 110) * swell(t, 0.06) * decay(t, 0.3)
    return drive(thump + 0.8 * knock + 0.35 * burst, 3) + 0.25 * rumble


def growl(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A low creature growl: a wobbling saw near 55 Hz through a throat, fluttering, with breath."""
    pitch = 55 * 2 ** (2 * wander(rng, t, 3) / 12)
    flutter = 0.7 + 0.3 * sine(21.5 + 3.5 * wander(rng, t, 1.5), t)  # 18 to 25 Hz
    throat = formants(bandpass(stack(pitch, t, 2, 0.004), 70, 1200), ((380, 0.4, 2.0), (950, 0.3, 1.0)))
    voice = full(lowpass(drive(full(throat) * flutter, 2.5), 1600))
    breath = hiss(rng, t, 700, 3500) * flutter
    return (voice + 0.06 * breath) * swell(t, 0.15)


def roar(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A big monster roar: a sharp attack, the pitch sliding 180 to 90 Hz, a long decay."""
    pitch = glide(180, 90, t) * 2 ** (0.8 * wander(rng, t, 7) / 12)
    body = swell(t, 0.012) * np.minimum(1, decay(t - 0.5, 0.75))
    return drive(bellow(rng, t, pitch) * body, 4)


def title(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A cinematic title-card hit: a deep braam on D1, D2 and A2, a sub boom, a gong shimmer."""
    saws = sum(level * stack(hz(note), t, 3, 0.007) for note, level in ((26, 0.7), (38, 1.0), (45, 1.0)))
    braam = full(sweep_lowpass(saws, 300 + 3500 * swell(t, 0.06) * decay(t, 1.0)))
    braam = drive(braam * swell(t, 0.06) * decay(t, 1.2), 4)
    boom = sine(settle(80, hz(26), t, 0.07), t) * decay(t, 0.6)
    tones = np.geomspace(196, 5200, 28) * rng.uniform(0.97, 1.03, 28)
    gong = full(chime(rng, t, [(f, 1.8 * (200 / f) ** 0.5, (200 / f) ** 0.3) for f in tones]))
    return braam + 0.5 * boom + 0.3 * gong * swell(t, 0.25)


def phase_break(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Armour cracking: a sharp transient, a few shattering bursts, a metallic ring sliding down."""
    crack = hiss(rng, t, 1500, 12000) * strike(t, 0.006)
    thock = sine(settle(260, 110, t, 0.02), t) * strike(t, 0.03)
    out = 0.3 * crack + 0.7 * thock
    for at in ONSET + np.sort(rng.uniform(0.04, 0.55, 6)):
        centre = rng.uniform(1800, 6500)
        shard = hiss(rng, t, centre / 1.6, centre * 1.6) * strike(t, rng.uniform(0.01, 0.045), at)
        out = out + rng.uniform(0.2, 0.45) * shard
    base = glide(1700, 900, t)
    bar = ((1.0, 0.5, 1.0), (2.76, 0.3, 0.5), (5.4, 0.15, 0.25))  # ratio, decay (s), level
    ring = sum(level * sine(base * ratio, t) * strike(t, tau) for ratio, tau, level in bar)
    return drive(out + 0.5 * ring, 1.5)


def death(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A dying roar: the pitch falls 160 to 40 Hz while a gate chops the voice into fewer and
    shorter pieces, over a low rumble that rises."""
    fall = t / t[-1]
    pitch = glide(160, 40, t) * 2 ** (wander(rng, t, 6) / 12)
    rate = glide(15, 5, t) * (1 + 0.25 * wander(rng, t, 2))  # gate openings a second
    turn = cycles(rate, t) % 1
    edge = 0.005 * rate  # the gate takes 5 ms to open or shut
    gate = np.clip(turn / edge, 0, 1) * np.clip((1 - 0.7 * fall - turn) / edge, 0, 1)
    voice = drive(bellow(rng, t, pitch) * swell(t, 0.02), 2.5) * (0.1 + 0.9 * gate) * (1 - 0.5 * fall)
    rumble = (0.25 * hiss(rng, t, 20, 90) + 0.5 * sine(38, t)) * fall**1.5
    return voice + 0.9 * rumble


def explode(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A big explosion: a noise burst under a low-pass that closes, a sub boom, crackling debris."""
    cutoff = 110 + 9000 * decay(t, 0.2)
    blast = sweep_lowpass(noise(rng, t), cutoff) * (cutoff / cutoff[0]) ** -0.45 * strike(t, 0.55)
    boom = sine(settle(80, 32, t, 0.1), t) * strike(t, 0.4)
    debris = crackle(rng, t, 160 * swell(t - 0.06, 0.12) * decay(t, 0.6))
    return drive(0.6 * blast + 0.7 * boom, 2) + 0.12 * debris


def victory(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A fanfare in D major at 120 BPM: brass climbs D, F#, A, D on the beats, then holds the
    chord over two kettle-drum hits and a cymbal swell."""
    out = np.zeros((2, len(t)))
    for i, note in enumerate((62, 66, 69, 74)):
        short = clock(0.42)
        put(out, i * BEAT, brass(hz(note), short) + 0.5 * brass(hz(note - 12), short), 0.5)
    chord_at, crash_at = 4 * BEAT, 8 * BEAT
    held = clock(t[-1] - chord_at)
    put(out, chord_at, sum(brass(hz(note), held) for note in (50, 57, 62, 66, 69, 74)), 0.2)
    for at in (chord_at, crash_at):
        put(out, at, timpani(rng, hz(38), clock(1.6)), 0.28)
    rising = np.clip((t - chord_at - 0.2) / (crash_at - chord_at - 0.2), 0, 1) ** 3
    cymbal = hiss(rng, t, 3500, 14000) * np.where(t < crash_at, rising, decay(t - crash_at, 1.1))
    return drive(full(out + 0.07 * cymbal), 1.5)


def award(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A reward chime: bells run up D, F#, A, D, F#, then a tail of high sparkles."""
    out = np.zeros((2, len(t)))
    for i, note in enumerate((74, 78, 81, 86, 90)):
        put(out, ONSET + 0.08 * i, bell(note, 1.25), 0.5 + 0.1 * i)
    ping = clock(0.15)
    for at in rng.uniform(0.35, 1.42, 18):
        note = rng.choice((98, 100, 102, 105, 107, 110))  # D major, two octaves over the bells
        spark = sine(hz(note), ping) * decay(ping, 0.03) * swell(ping[-1] - ping, 0.03)
        put(out, at, spread(spark, rng.uniform(-2 * WIDTH, 2 * WIDTH)), 0.25 * (1.6 - at))
    return out


def paddle_hit(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The player being hit: a harsh zap of two jittering squares a tritone apart, falling in
    pitch, over a low thud."""
    pitch = settle(650, 95, t, 0.08) * (1 + 0.3 * wander(rng, t, 400))
    zap = pulse(pitch, t) + 0.7 * pulse(1.414 * pitch, t)
    grit = hiss(rng, t, 1200, 9000)
    thud = sine(settle(140, 48, t, 0.04), t) * strike(t, 0.07)
    return 0.7 * drive((0.6 * zap + 0.2 * grit) * strike(t, 0.12), 3) + thud


def skull_pop(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A hazard destroyed: a hollow pop, then a glassy chirp upward through falling shards."""
    pop = sine(settle(330, 480, t, 0.02), t) * strike(t, 0.028)
    puff = hiss(rng, t, 300, 1200) * strike(t, 0.012)
    chirp_at = 0.05
    pitch = 1300 * 3 ** np.clip((t - chirp_at) / 0.22, 0, 1)
    chirp = (sine(pitch, t) + 0.4 * sine(2.32 * pitch, t)) * strike(t, 0.1, chirp_at)
    shards = crackle(rng, t, 90 * strike(t, 0.12, chirp_at + 0.02))
    return pop + 0.25 * puff + 0.5 * chirp + 0.15 * shards


def shot(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A projectile launch: a chirp down from 900 to 250 Hz with a noisy onset."""
    pitch = glide(900, 250, t)
    body = (sine(pitch, t) + 0.3 * pulse(pitch, t)) * strike(t, 0.11)
    return body + 0.3 * hiss(rng, t, 1500, 9000) * strike(t, 0.018)


def beam(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """An energy beam firing: a held buzzing saw near 110 Hz under sizzle that crackles in step."""
    pitch = 110 * (1 + 0.004 * sine(6, t))
    buzz = stack(pitch, t, 3, 0.006) + 0.4 * pulse(2 * pitch, t)
    buzz = full(formants(lowpass(buzz, 5000), ((1400, 0.4, 1.5),)))
    sizzle = hiss(rng, t, 5000, 14000) * (0.6 + 0.4 * saw(110, t))
    return (buzz + 0.12 * sizzle) * swell(t, 0.008)


# ---------------------------------------------------------------- slag, for any boss that lobs it


def sizzle(rng: np.random.Generator, t: np.ndarray, rate) -> np.ndarray:
    """Molten metal on something cold: bright hiss that crackles, `rate` pops a second."""
    return 0.5 * hiss(rng, t, 3000, 12000) * (0.6 + 0.4 * wander(rng, t, 40)) + crackle(rng, t, rate)


def slag_toss(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A glob of slag thrown up: a wet, heavy bloop rising, with a hiss trailing it."""
    bloop = sine(settle(90, 210, t, 0.06), t) * strike(t, 0.09)
    whoosh = hiss(rng, t, 300, 2500) * swell(t, 0.05) * decay(t, 0.15)
    return drive(bloop + 0.3 * whoosh, 2) + 0.2 * sizzle(rng, t, 60) * decay(t, 0.25)


def slag_catch(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Slag caught on the paddle: a hot tink on metal and a bright sizzle."""
    tink = sum(level * sine(f, t) * strike(t, tau) for f, tau, level in ((1850, 0.09, 1.0), (4390, 0.05, 0.5)))
    thud = sine(settle(220, 110, t, 0.02), t) * strike(t, 0.04)
    return 0.5 * tink + 0.6 * thud + 0.5 * sizzle(rng, t, 120) * strike(t, 0.12)


def slag_return(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Caught slag flung back up: a fiery whoosh climbing in pitch."""
    cutoff = glide(500, 5000, t)
    rush = sweep_lowpass(noise(rng, t), cutoff) * swell(t, 0.04) * decay(t, 0.3)
    tone = sine(glide(240, 700, t), t) * swell(t, 0.02) * decay(t, 0.25)
    return full(rush) + 0.25 * tone


def slag_splash(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Slag missed: it splats on the floor and hisses out."""
    splat = lowpass(noise(rng, t), 1400) * strike(t, 0.05)
    thump = sine(settle(120, 60, t, 0.03), t) * strike(t, 0.07)
    return drive(full(splat) + thump, 2) + 0.35 * sizzle(rng, t, 90) * swell(t, 0.03) * decay(t, 0.3)


# ---------------------------------------------------------------- the Crucible
#
# A furnace with a heart in it: everything is iron, steam and fire, and under it all something wet
# and alive.


def clang(rng: np.random.Generator, t: np.ndarray, base: float, tau: float) -> np.ndarray:
    """A struck slab of iron: inharmonic partials, the high ones dying first."""
    ratios = (1.0, 1.59, 2.14, 2.83, 3.61, 4.93, 6.1)
    return chime(rng, t, [(base * r, tau / r**0.6, 1 / r**0.7) for r in ratios])


def heartbeat(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """One beat of the heart in the furnace: a deep wet lub and a softer dub, each with a dull
    knock of iron, and a breath of steam after."""
    out = np.zeros((2, len(t)))
    for at, level in ((ONSET, 1.0), (0.2, 0.6)):
        since = t - at
        lub = sine(settle(78, 38, np.maximum(since, 0), 0.05), t) * strike(t, 0.12, at)
        wet = lowpass(hiss(rng, t, 40, 600), 400) * strike(t, 0.04, at)
        knock = sine(settle(190, 120, np.maximum(since, 0), 0.02), t) * strike(t, 0.035, at)
        out += level * (drive(lub + 0.35 * wet, 2.5) + 0.3 * knock)
    breath = hiss(rng, t, 2500, 9000) * swell(t - 0.3, 0.1) * decay(np.maximum(t - 0.3, 0), 0.15)
    return out + 0.03 * breath


def rib_crack(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A rib of the cage cracking under a hit: a dry snap, a hot ring and a few sparks."""
    snap = hiss(rng, t, 2000, 12000) * strike(t, 0.005)
    thock = sine(settle(320, 150, t, 0.015), t) * strike(t, 0.04)
    ring = clang(rng, t, 640, 0.25)
    return drive(0.5 * snap + 0.6 * thock, 1.5) + 0.35 * ring + 0.15 * crackle(rng, t, 140 * decay(t, 0.12))


def rib_break(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A rib torn off the cage: a bar of iron snapping, ringing down as it falls, a heavy thud."""
    snap = hiss(rng, t, 1200, 14000) * strike(t, 0.01)
    boom = sine(settle(140, 45, t, 0.05), t) * strike(t, 0.25)
    base = glide(420, 300, t)
    ring = sum(level * sine(base * r, t, rng.random()) * strike(t, tau) for r, tau, level in
               ((1.0, 0.7, 1.0), (2.76, 0.4, 0.5), (5.4, 0.2, 0.3)))
    debris = crackle(rng, t, 120 * swell(t - 0.05, 0.05) * decay(t, 0.4))
    return drive(0.5 * snap + boom, 2) + 0.4 * ring + 0.2 * debris


def stoke(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The furnace stoked: its door clanks and the fire swells up with a whoomph."""
    latch = clang(rng, t, 380, 0.18) * swell(t, 0.002)
    cutoff = 200 + 2600 * swell(t, 0.25) * decay(t, 0.5)
    fire = sweep_lowpass(noise(rng, t), cutoff) * swell(t, 0.15) * decay(t, 0.45)
    whoomph = sine(settle(50, 80, t, 0.2), t) * swell(t, 0.12) * decay(t, 0.35)
    return 0.4 * latch + full(fire) + 0.6 * whoomph


def vent(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Steam building in a vent: hiss climbing, a valve whistle rising to a shriek, then it blows."""
    rise = np.clip(t / (t[-1] * 0.8), 0, 1)
    centre = 700 * 6 ** rise
    steam = bandpass(noise(rng, t), 600, 9000)
    steam = sweep_lowpass(steam, 800 + 9000 * rise) * (0.3 + 0.7 * rise)
    whistle = sine(centre * (1 + 0.006 * sine(7, t)), t) * swell(t, 0.3) * rise**1.5
    blow = hiss(rng, t, 300, 12000) * strike(t, 0.18, t[-1] * 0.8)
    return full(steam) * 0.6 + 0.12 * whistle + 0.8 * blow


def doors(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The furnace doors grinding open: iron dragging on iron in jerks, a low rumble, a last clunk."""
    jerk = 0.5 + 0.5 * np.sin(TAU * cycles(9 + 6 * wander(rng, t, 2), t))
    grind = bandpass(stack(48 * (1 + 0.04 * wander(rng, t, 8)), t, 3, 0.02), 60, 2400)
    grind = formants(drive(full(grind) * jerk, 3), ((310, 0.4, 2.0), (870, 0.3, 1.5)))
    scrape = hiss(rng, t, 1500, 6000) * jerk**3
    rumble = hiss(rng, t, 20, 120)
    stop = t[-1] - 0.45
    clunk = sine(settle(110, 50, np.maximum(t - stop, 0), 0.04), t) * strike(t, 0.2, stop)
    body = swell(t, 0.2) * np.clip((stop - t) / 0.08 + 1, 0, 1)
    return (full(grind) + 0.15 * scrape) * body * 0.6 + 0.35 * rumble * body + clunk + 0.3 * clang(rng, t, 160, 0.5) * strike(t, 1, stop)


def groan(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Iron under strain: a slow, deep groan of the hull whose pitch sags, and creaks above it."""
    pitch = 62 * 2 ** (3 * wander(rng, t, 0.8) / 12) * glide(1, 0.85, t)
    body = stack(pitch, t, 3, 0.01)
    # Two hollows of the hull, each swelling and fading on its own, so the groan seems to shift.
    low = formants(bandpass(body, 50, 2200), ((260, 0.35, 2.5),))
    high = formants(bandpass(body, 50, 2200), ((720, 0.3, 1.8),))
    hull = low * (0.6 + 0.4 * wander(rng, t, 0.7)) + high * (0.5 + 0.5 * wander(rng, t, 0.5))
    creak_rate = 6 * (0.5 + 0.5 * wander(rng, t, 1))
    creaks = bandpass(crackle(rng, t, creak_rate * 10), 600, 3000)
    return drive(full(hull) * hold(t, 0.4, 0.6), 2) + 0.4 * creaks


def clank(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The descent stops dead: a sub boom, the whole room ringing like a struck bell, chains rattling."""
    boom = sine(settle(70, 28, t, 0.1), t) * strike(t, 0.5)
    hit = lowpass(noise(rng, t), 2500) * strike(t, 0.03)
    ring = clang(rng, t, 110, 1.4)
    rattle = crackle(rng, t, 220 * swell(t - 0.08, 0.05) * decay(t, 0.35))
    return drive(boom + 0.5 * hit, 2.5) + 0.6 * ring + 0.25 * rattle


def snap(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A cable snapping: a whip-crack and a twang that drops and wobbles as the end flies loose."""
    crack = hiss(rng, t, 2500, 15000) * strike(t, 0.004)
    pitch = settle(520, 140, t, 0.12) * (1 + 0.03 * sine(28, t) * decay(t, 0.2))
    twang = (saw(pitch, t) * 0.4 + sine(pitch, t)) * strike(t, 0.18)
    return 0.7 * crack + 0.6 * lowpass(twang, 3500)


def floor_crack(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The floor gives way: a deep rumble swelling, stone and iron cracking and falling away below."""
    rumble = lowpass(noise(rng, t), 140) * swell(t, 0.6) * decay(np.maximum(t - 1.2, 0), 0.6)
    sub = sine(32 + 6 * wander(rng, t, 2), t) * swell(t, 0.4)
    debris = crackle(rng, t, 300 * swell(t, 0.3) * decay(np.maximum(t - 0.6, 0), 0.8))
    out = full(rumble) + 0.6 * sub + 0.35 * debris
    for at in ONSET + np.sort(rng.uniform(0.0, 1.4, 5)):
        out = out + 0.5 * sine(settle(150, 50, np.maximum(t - at, 0), 0.04), t) * strike(t, 0.12, at)
    return drive(out, 1.8)


def furnace_roar(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The heart roars: a monster's voice sliding down, with the furnace's fire roaring under it."""
    pitch = glide(150, 72, t) * 2 ** (0.8 * wander(rng, t, 6) / 12)
    body = swell(t, 0.03) * np.minimum(1, decay(t - 0.6, 0.8))
    voice = drive(bellow(rng, t, pitch) * body, 4)
    fire = lowpass(noise(rng, t), 900) * body
    return voice + 0.5 * full(fire)


def scream(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The bare heart screams: a high, torn voice and a screech of metal over it."""
    pitch = glide(620, 380, t) * 2 ** (1.2 * wander(rng, t, 9) / 12)
    body = swell(t, 0.02) * np.minimum(1, decay(t - 0.5, 0.5))
    voice = drive(bellow(rng, t, pitch) * body, 3)
    screech = formants(hiss(rng, t, 2000, 9000), ((3200, 0.12, 6.0),)) * body
    return voice + 0.12 * full(screech)


def meltdown(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """It goes white-hot: a scream climbing over a pressure tone rising, the fire hissing louder."""
    rise = t / t[-1]
    pitch = glide(160, 520, t) * 2 ** (wander(rng, t, 8) / 12)
    voice = drive(bellow(rng, t, pitch) * swell(t, 0.1), 3) * (0.5 + 0.5 * rise)
    tone = stack(glide(55, 220, t), t, 3, 0.01) * rise
    fizz = hiss(rng, t, 2500, 13000) * rise**2
    return voice + 0.4 * lowpass(tone, 2000) + 0.35 * fizz


def cool(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """What is left cools: a long burst of steam dying away, crackling, and the lump settling."""
    steam = sweep_lowpass(bandpass(noise(rng, t), 400, 12000), 9000 * decay(t, 1.2) + 600)
    steam = steam * swell(t, 0.03) * decay(t, 0.9)
    tick = crackle(rng, t, 80 * decay(t, 1.0))
    settle_at = 0.5
    thunk = sine(settle(90, 45, np.maximum(t - settle_at, 0), 0.05), t) * strike(t, 0.2, settle_at)
    return full(steam) + 0.3 * tick + 0.6 * thunk


# ---------------------------------------------------------------- the Lantern Angler
#
# Something huge under black water. Its lights are of two kinds and must sound it: warm ones, a
# major chord in soft sines, help; cold ones, glass partials that clash, lie. Everything else is
# water, wet flesh and drowned voices.

# Warm light: D major, sung by soft sines. Cold light: glass partials a semitone apart.
WARM = (587.3, 740.0, 880.0)
COLD = (1870.0, 1981.0, 2960.0, 4410.0)


def bubbles(rng: np.random.Generator, t: np.ndarray, count: int, low: float, high: float,
            start: float = 0.0, end: float | None = None) -> np.ndarray:
    """Bubbles rising through water: short sine chirps sliding up, scattered across the stereo."""
    out = np.zeros((2, len(t)))
    end = t[-1] if end is None else end
    for at in np.sort(rng.uniform(start, end, count)):
        size = rng.uniform(0.02, 0.07)
        pop = clock(size * 2.5)
        f = rng.uniform(low, high) * (1 + 1.8 * pop / pop[-1])
        put(out, at, spread(sine(f, pop) * decay(pop, size) * swell(pop, 0.002), rng.uniform(-0.6, 0.6)),
            rng.uniform(0.3, 1.0))
    return out


def drop(t: np.ndarray, at: float, pitch: float) -> np.ndarray:
    """One drop into still water: a plink that rises, then a hollow blip under it."""
    since = np.maximum(t - at, 0)
    plink = sine(pitch * (1 + 1.2 * (1 - np.exp(-since / 0.02))), t) * strike(t, 0.05, at)
    blip = sine(settle(pitch * 0.5, pitch * 0.32, since, 0.03), t) * strike(t, 0.09, at + 0.012)
    return plink + 0.5 * blip


def drip(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Water dripping in a vast dark: a drop, its echo off far stone, a fainter drop after."""
    out = drop(t, ONSET, 1450) + 0.5 * drop(t, 0.62, 1180)
    echo = lowpass(np.roll(out, samples(0.21)) * 0.35 + np.roll(out, samples(0.43)) * 0.18, 2400)
    air = hiss(rng, t, 80, 500) * 0.04
    return out + echo + air


def hum(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The lantern burning: a warm chord hummed low and slow, the flame fluttering through it."""
    tremolo = 0.75 + 0.25 * sine(3.2, t)
    chord = sum(sine(f / 4 * (1 + 0.002 * wander(rng, t, 2)), t) * level for f, level in zip(WARM, (1.0, 0.6, 0.5)))
    flame = lowpass(hiss(rng, t, 200, 2500), 1200) * (0.5 + 0.5 * wander(rng, t, 9))
    return (chord * tremolo + 0.08 * flame) * hold(t, 0.6, 0.7)


def glint(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """An eye opening in the dark: a wet click of a lid, and a thin cold shimmer."""
    lid = lowpass(hiss(rng, t, 800, 5000), 3000) * strike(t, 0.012)
    tick = sine(settle(900, 520, t, 0.01), t) * strike(t, 0.02)
    shimmer = chime(rng, t, [(f * 1.25, 0.35, 0.5) for f in COLD]) * swell(t, 0.05)
    return 0.6 * lid + 0.4 * tick + 0.35 * shimmer


def wisp(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A warm wisp let go of the lantern: a soft breath rising, and the warm chord blooming."""
    breath = sweep_lowpass(hiss(rng, t, 200, 6000), glide(600, 3600, t)) * swell(t, 0.25) * decay(t, 0.5)
    bloom = sum(sine(f, t, rng.random()) * strike(t, 0.55, ONSET + 0.03 * i) * swell(t, 0.08)
                for i, f in enumerate(WARM))
    sparks = crackle(rng, t, 30 * decay(t, 0.4)) * 0.3
    return 0.35 * full(breath) + 0.5 * bloom + sparks


def catch(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A wisp caught and flung home: the warm chord sweeping up an octave, bright and quick."""
    rise = 1 + np.clip(t / 0.25, 0, 1)
    chord = sum(sine(f * rise, t) * level for f, level in zip(WARM, (1.0, 0.7, 0.6))) * strike(t, 0.3)
    whoosh = sweep_lowpass(noise(rng, t), glide(800, 7000, t)) * swell(t, 0.04) * decay(t, 0.2)
    return 0.6 * chord + 0.4 * full(whoosh)


def decoy(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A false light let go: cold glass struck, its partials clashing a semitone apart and beating."""
    glass = chime(rng, t, [(f, 0.6 / (1 + i * 0.4), 1 / (1 + i * 0.3)) for i, f in enumerate(COLD)])
    ping = sine(COLD[0] * 2, t) * strike(t, 0.08)
    return glass + 0.3 * ping


def blink(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The lantern snuffed: a soft gulp of flame, the warm chord sinking away, a low thrum."""
    gulp = lowpass(hiss(rng, t, 100, 3000), 1500) * strike(t, 0.06)
    sink = glide(1, 0.25, t)
    chord = sum(sine(f * sink, t) for f in WARM[:2]) * strike(t, 0.35) * 0.5
    thrum = sine(55, t) * swell(t, 0.1) * decay(t, 0.4)
    return 0.6 * gulp + chord + 0.5 * thrum


def lunge(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """It draws back to lunge: black water heaving up, and a long wet intake of breath."""
    heave = sweep_lowpass(noise(rng, t), 220 + 500 * swell(t, 1.0)) * swell(t, 1.1)
    intake = formants(hiss(rng, t, 200, 4000), ((450, 0.4, 2.0), (1300, 0.3, 1.5))) * swell(t, 1.2)
    sub = sine(glide(36, 60, t), t) * swell(t, 1.0)
    return (0.8 * full(heave) + 0.35 * full(intake) + 0.6 * sub) * swell(t[-1] - t, 0.1)


def bite(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The jaws slam shut: a deep wet thud, the crunch of teeth on teeth, water thrown up."""
    thud = sine(settle(110, 36, t, 0.06), t) * strike(t, 0.3)
    crunch = bandpass(noise(rng, t), 400, 5000) * strike(t, 0.05) * (0.6 + 0.4 * wander(rng, t, 200))
    splash = lowpass(hiss(rng, t, 300, 9000), 5000) * swell(t - 0.03, 0.04) * decay(np.maximum(t - 0.05, 0), 0.25)
    return drive(thud + 0.6 * crunch, 2.5) + 0.4 * splash + 0.4 * bubbles(rng, t, 10, 300, 700, 0.1, 0.6)


def snuff(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Every light goes out: a great breath drawn in, the air darkening to a sub drop, and ink pouring."""
    cutoff = 6000 * decay(t, 0.4) + 150
    breath = sweep_lowpass(noise(rng, t), cutoff) * swell(t, 0.1) * decay(t, 0.6)
    drop_ = sine(glide(90, 28, t), t) * swell(t, 0.2) * decay(np.maximum(t - 0.5, 0), 0.5)
    ink = lowpass(hiss(rng, t, 60, 900), 500) * swell(t - 0.4, 0.4) * decay(np.maximum(t - 0.8, 0), 0.4)
    return full(breath) * 0.6 + drop_ + 0.4 * ink


def surge(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """The lake heaves: a deep slosh of black water rolling one way and back, with a groan in it."""
    roll = 0.5 + 0.5 * np.sin(TAU * cycles(0.9, t) - np.pi / 2)
    water = sweep_lowpass(noise(rng, t), 150 + 900 * roll) * (0.3 + 0.7 * roll)
    sub = sine(32 + 8 * roll, t) * hold(t, 0.3, 0.6)
    groan_ = formants(bandpass(stack(48 * glide(1, 0.8, t), t, 3, 0.01), 40, 1200), ((300, 0.4, 2.0),))
    return full(water) + 0.6 * sub + 0.25 * full(groan_) * hold(t, 0.6, 0.6) + 0.3 * bubbles(rng, t, 18, 150, 450)


def shriek(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """It shrieks through water: a torn voice gurgling, its pitch wrenching up then sagging."""
    pitch = (glide(240, 520, t) * np.minimum(1, 0.4 + t / 0.3)) * 2 ** (1.5 * wander(rng, t, 10) / 12)
    gurgle = 0.6 + 0.4 * sine(31 + 6 * wander(rng, t, 3), t)
    body = swell(t, 0.04) * np.minimum(1, decay(t - 0.6, 0.5))
    voice = drive(bellow(rng, t, pitch) * gurgle * body, 3.5)
    drowned = lowpass(voice, 2600)
    return drowned + 0.3 * bubbles(rng, t, 24, 200, 900, 0.0, 1.2)


def pod_crack(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A pod's glass cracks: a sharp tick, a creak through the glass, and the liquid stirring inside."""
    tick = hiss(rng, t, 3000, 14000) * strike(t, 0.004)
    creak = chime(rng, t, [(f * 0.8, 0.25, 0.6) for f in COLD]) * strike(t, 0.3)
    slosh = lowpass(hiss(rng, t, 80, 800), 600) * swell(t - 0.05, 0.1) * decay(t, 0.25)
    return 0.7 * tick + 0.6 * creak + 0.4 * slosh


def pod_burst(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A pod bursts: glass shattering, the liquid gushing out, and the soul inside singing free, warm."""
    smash = hiss(rng, t, 1500, 14000) * strike(t, 0.03) + crackle(rng, t, 260 * decay(t, 0.25))
    gush = lowpass(noise(rng, t), 1200) * swell(t, 0.02) * decay(t, 0.35)
    free_at = 0.25
    song = sum(sine(f * 2, t, rng.random()) * strike(t, 0.7, free_at + 0.06 * i) * swell(t - free_at, 0.15)
               for i, f in enumerate(WARM))
    return 0.6 * smash + 0.5 * full(gush) + 0.45 * song


def angler_death(t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """It dies: the lantern's glass shatters, the voice sags and drowns, the water closes over it."""
    smash = hiss(rng, t, 1200, 14000) * strike(t, 0.06) + crackle(rng, t, 300 * decay(t, 0.4))
    glass = chime(rng, t, [(f, 1.0, 0.5) for f in COLD]) * strike(t, 0.8)
    pitch = glide(200, 45, t) * 2 ** (wander(rng, t, 5) / 12)
    voice = lowpass(drive(bellow(rng, t, pitch) * swell(t - 0.2, 0.2), 2.5), 1400)
    voice = voice * np.minimum(1, decay(np.maximum(t - 1.2, 0), 0.8))
    sink = bubbles(rng, t, 40, 120, 500, 0.8, t[-1] - 0.3) * glide(1, 0.3, t)
    return 0.5 * smash + 0.4 * glass + 0.7 * voice + 0.5 * sink


# File name, length (s), fade-out (s), synth. The fade-out is also the release of a held sound.
EFFECTS = (
    ("stomp", 0.9, 0.1, stomp),
    ("growl", 2.0, 0.4, growl),
    ("roar", 2.4, 0.35, roar),
    ("title", 2.8, 0.5, title),
    ("phase-break", 1.4, 0.15, phase_break),
    ("death", 3.2, 0.35, death),
    ("explode", 2.0, 0.3, explode),
    ("victory", 8.0, 2.0, victory),
    ("award", 1.6, 0.3, award),
    ("paddle-hit", 0.45, 0.06, paddle_hit),
    ("skull-pop", 0.5, 0.08, skull_pop),
    ("shot", 0.35, 0.05, shot),
    ("beam", 0.9, 0.2, beam),
    ("slag-toss", 0.5, 0.1, slag_toss),
    ("slag-catch", 0.4, 0.08, slag_catch),
    ("slag-return", 0.55, 0.1, slag_return),
    ("slag-splash", 0.7, 0.15, slag_splash),
    ("crucible/heartbeat", 0.75, 0.1, heartbeat),
    ("crucible/rib-crack", 0.6, 0.1, rib_crack),
    ("crucible/rib-break", 1.3, 0.2, rib_break),
    ("crucible/stoke", 1.1, 0.2, stoke),
    ("crucible/vent", 1.5, 0.2, vent),
    ("crucible/doors", 2.2, 0.2, doors),
    ("crucible/groan", 2.4, 0.4, groan),
    ("crucible/clank", 2.0, 0.4, clank),
    ("crucible/snap", 0.6, 0.1, snap),
    ("crucible/crack", 2.6, 0.5, floor_crack),
    ("crucible/roar", 2.6, 0.4, furnace_roar),
    ("crucible/scream", 1.5, 0.3, scream),
    ("crucible/meltdown", 2.4, 0.3, meltdown),
    ("crucible/cool", 2.8, 0.6, cool),
    ("angler/drip", 1.3, 0.3, drip),
    ("angler/hum", 2.4, 0.6, hum),
    ("angler/glint", 0.8, 0.2, glint),
    ("angler/wisp", 1.2, 0.3, wisp),
    ("angler/catch", 0.7, 0.15, catch),
    ("angler/decoy", 1.0, 0.3, decoy),
    ("angler/blink", 0.9, 0.2, blink),
    ("angler/lunge", 1.6, 0.1, lunge),
    ("angler/bite", 0.9, 0.2, bite),
    ("angler/snuff", 1.6, 0.3, snuff),
    ("angler/surge", 2.4, 0.5, surge),
    ("angler/shriek", 1.8, 0.35, shriek),
    ("angler/pod-crack", 0.6, 0.15, pod_crack),
    ("angler/pod-burst", 1.4, 0.35, pod_burst),
    ("angler/death", 3.4, 0.6, angler_death),
)


def effect(index: int) -> np.ndarray:
    """One finished effect: synthesized, faded at both ends, its peak at SFX_PEAK_DB."""
    _, seconds, fade_out, synth = EFFECTS[index]
    sound = fade(widen(synth(clock(seconds), np.random.default_rng([SEED, index]))), FADE_IN, fade_out)
    return sound * gain(SFX_PEAK_DB) / np.abs(sound).max()


# ---------------------------------------------------------------- io


def write_wav(path: Path, x: np.ndarray) -> None:
    """Stereo `x` as 16-bit PCM."""
    pcm = np.round(np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.T.tobytes())


def encode(x: np.ndarray, out: Path, bitrate: str, tmp: Path) -> None:
    """Writes `x` to `out` as a constant-bitrate stereo mp3, by way of a wav in `tmp`."""
    wav = tmp / (out.stem + ".wav")
    write_wav(wav, x)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-map_metadata", "-1",
         "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), "-ac", "2", str(out)],
        check=True,
    )


def decode(path: Path) -> np.ndarray:
    """An encoded file as the stereo samples it plays back."""
    cmd = [FFMPEG, "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "2", "-"]
    pcm = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(pcm, "<i2").reshape(-1, 2).T / 32768


def save(x: np.ndarray, out: Path, bitrate: str, tmp: Path) -> None:
    """Encodes `x` and checks what comes back. An mp3 overshoots the peaks of loud noise, so a
    file that plays back over ENCODED_CEILING_DB is turned down by the excess and encoded again."""
    trim_db = 0.0
    for _ in range(TRIM_PASSES):
        encode(x * gain(-trim_db), out, bitrate, tmp)
        over_db = 20 * np.log10(np.abs(decode(out)).max()) - ENCODED_CEILING_DB
        if over_db <= 0:
            return
        trim_db += over_db + 0.1
    raise SystemExit(f"{out.name} still plays back over {ENCODED_CEILING_DB} dBFS")


def main() -> None:
    written = []
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        for i, (name, *_) in enumerate(EFFECTS):
            path = SFX_OUT / f"{name}.mp3"
            path.parent.mkdir(parents=True, exist_ok=True)
            save(effect(i), path, SFX_BITRATE, tmp)
            written.append(path)
    for path in written:
        seconds = decode(path).shape[-1] / SR
        print(f"{path.relative_to(ROOT)}  {seconds:.3f} s  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
