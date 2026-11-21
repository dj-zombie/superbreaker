#!/usr/bin/env python3
"""Turns the painted parallax layers in art-src/backdrops/<world>/ into game textures.

Each painted layer except the sky is drawn on a flat chroma-green background. The script keys
the green out (unmixing the soft edges), grades the layer for atmospheric depth, cuts it so the
top and bottom join seamlessly when it scrolls vertically, and splits layers with an empty
center into a left and a right strip so the GPU doesn't fill the transparent middle. Fog layers
are generated from periodic noise, so they loop by construction.

Each world's key art also becomes a portrait card for the campaign's world carousel
(public/assets/images/ui/world_<world>.webp).

Usage:
  python3 scripts/build-backdrops.py [world ...]
  python3 scripts/build-backdrops.py --thumbs-only
  python3 scripts/build-backdrops.py hell --stills /tmp/hell.jpg --video /tmp/hell.mp4
  python3 scripts/build-backdrops.py --hd --src /tmp/backdrop-hd

The phone sheets stay 720 wide. --hd writes a 4x set (2880 wide) for the 16:9 stage, from
sources that have already been upscaled. Those files live in <src>/<world>/*.png and keep
the master filenames (near.png, near_b.png, sky.png, ...). The game loads them only on the
wide stage, so phones keep the small set.

Requires numpy, Pillow and (for --video) ffmpeg.
"""
import argparse
import json
import random
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "backdrops"
OUT = ROOT / "public" / "assets" / "images" / "backdrops"
MANIFEST = ROOT / "src" / "art" / "backdrops.json"
REL_ROOT = "images/backdrops"
BRICKS = ROOT / "public" / "assets" / "images" / "bricks"
BONUS = ROOT / "public" / "assets" / "images" / "bonus"
THUMBS = ROOT / "public" / "assets" / "images" / "ui"
THUMB_SIZE = (540, 960)
SRC_WIDTH = 720
# Seam feather and fog tiles are authored in 720-wide pixels, then scaled with the sheet.
PX = 1.0
FOG_SIZE = (180, 320)

# Back to front. Painted layers: haze pulls the layer toward the atmosphere color (or the
# layer's own haze_rgb), gain scales brightness. Fog layers: alpha is the peak opacity, scale
# the size of the wisps.
# speed is in playfield units per second and only drives the preview; the game reads its own.
# key is the chroma color the layers were painted on. despill (lower is stronger) caps the key
# channel against the others, which also cleans thin glowing shapes like molten streams.
WORLDS = {
    "hell": {
        "key": "green",
        "haze": (150, 34, 20),
        "despill": 0.7,
        "layers": [
            {"name": "far", "haze": 0.55, "gain": 0.9, "speed": 6},
            {"name": "fog1", "fog": (190, 60, 30), "alpha": 0.32, "scale": 1.0, "seed": 1, "speed": 11},
            {"name": "mid", "haze": 0.12, "gain": 0.8, "speed": 17},
            {"name": "fog2", "fog": (120, 30, 18), "alpha": 0.4, "scale": 0.6, "seed": 2, "speed": 26},
            {"name": "near", "haze": 0.0, "gain": 0.75, "speed": 36},
        ],
    },
    "crypt": {
        "key": "green",
        "haze": (64, 62, 112),
        "despill": 0.9,
        "layers": [
            {"name": "far", "haze": 0.5, "gain": 0.95, "speed": 6},
            {"name": "fog1", "fog": (120, 118, 180), "alpha": 0.26, "scale": 1.0, "seed": 3, "speed": 9},
            {"name": "mid", "haze": 0.1, "gain": 0.85, "speed": 17},
            {"name": "fog2", "fog": (60, 58, 100), "alpha": 0.36, "scale": 0.6, "seed": 4, "speed": 24},
            {"name": "near", "haze": 0.0, "gain": 0.8, "speed": 36},
        ],
    },
    "mainframe": {
        "key": "magenta",
        "haze": (18, 46, 72),
        "despill": 0.9,
        "layers": [
            {"name": "far", "haze": 0.4, "haze_rgb": (44, 96, 132), "gain": 1.25, "speed": 6},
            {"name": "fog1", "fog": (40, 110, 140), "alpha": 0.2, "scale": 1.0, "seed": 5, "speed": 12},
            {"name": "mid", "haze": 0.08, "gain": 0.85, "speed": 18},
            {"name": "fog2", "fog": (16, 44, 64), "alpha": 0.32, "scale": 0.6, "seed": 6, "speed": 28},
            {"name": "near", "haze": 0.0, "gain": 0.85, "speed": 38},
        ],
    },
    # The Shooting Gallery's own scenery, not a campaign world: it has no carousel card, and the
    # stage scrolls it at `pace`.
    "carnival": {
        "key": "green",
        "haze": (70, 30, 90),
        "despill": 0.8,
        "card": False,
        "pace": 0.6,
        "layers": [
            # Pushed well back, so the targets and rails in front of it carry the screen.
            {"name": "far", "haze": 0.55, "haze_rgb": (44, 22, 58), "gain": 0.6, "speed": 6},
            {"name": "fog1", "fog": (120, 70, 150), "alpha": 0.26, "scale": 1.0, "seed": 7, "speed": 11},
            {"name": "mid", "haze": 0.35, "haze_rgb": (40, 20, 52), "gain": 0.6, "speed": 17},
            {"name": "fog2", "fog": (60, 28, 80), "alpha": 0.34, "scale": 0.6, "seed": 8, "speed": 26},
            {"name": "near", "haze": 0.1, "haze_rgb": (20, 10, 26), "gain": 0.55, "speed": 36},
        ],
    },
    # The Crucible's arena: the forge's shaft a level below Hell, iron instead of rock. It scrolls
    # while the fight arrives and stops in the boss's chamber, a still plate behind the boss.
    "crucible": {
        "key": "green",
        "haze": (120, 34, 14),
        "despill": 0.7,
        "card": False,
        "layers": [
            {"name": "far", "haze": 0.5, "haze_rgb": (70, 20, 10), "gain": 0.75, "speed": 6},
            {"name": "fog1", "fog": (170, 60, 24), "alpha": 0.3, "scale": 1.0, "seed": 9, "speed": 11},
            {"name": "mid", "haze": 0.18, "haze_rgb": (60, 16, 8), "gain": 0.72, "speed": 17},
            {"name": "fog2", "fog": (110, 32, 14), "alpha": 0.38, "scale": 0.6, "seed": 10, "speed": 26},
            {"name": "near", "haze": 0.0, "gain": 0.7, "speed": 36},
        ],
        # Not scrolled: keyed, graded and cut to the rows it covers.
        "stills": [
            {"name": "chamber", "haze": 0.1, "haze_rgb": (60, 16, 8), "gain": 0.8, "feather": 110},
        ],
    },
}


def keyness(rgb: np.ndarray, key: str) -> np.ndarray:
    """How strongly each pixel leans toward the chroma key color."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return g - np.maximum(r, b) if key == "green" else np.minimum(r, b) - g


def key_out(rgb: np.ndarray, key: str, despill: float) -> np.ndarray:
    """Returns premultiplied RGBA (0-255) with the chroma background removed. Each image is keyed
    against its own background color, since generated keys drift (magenta ranges into pink)."""
    k = keyness(rgb, key)
    bg_mask = k > 90
    bg = np.median(rgb[bg_mask], axis=0)
    full = keyness(bg, key)
    alpha = np.clip((full - k) / (full - 24), 0, 1)
    # JPEG noise in the flat key leaves faint specks; anything this faint is background.
    alpha[alpha < 0.08] = 0
    # Unmix: observed = a * fg + (1 - a) * bg, so a * fg = observed - (1 - a) * bg.
    premul = np.clip(rgb - (1 - alpha[..., None]) * bg, 0, None)
    premul = np.minimum(premul, alpha[..., None] * 255)
    # Despill: the art never uses the key hue, so pull any leftover cast out of the edges.
    r, g, b = premul[..., 0], premul[..., 1], premul[..., 2]
    if key == "green":
        premul[..., 1] = np.minimum(g, despill * np.maximum(r, b))
    else:
        excess = np.maximum(0, np.minimum(r, b) - g / despill)
        premul[..., 0] -= excess
        premul[..., 2] -= excess
    return np.dstack([premul, alpha * 255])


def grade(premul: np.ndarray, haze_rgb, haze: float, gain: float) -> np.ndarray:
    out = premul.copy()
    a = out[..., 3:4] / 255
    out[..., :3] = out[..., :3] * gain * (1 - haze) + np.array(haze_rgb) * a * haze
    return out


def join(upper: np.ndarray, lower: np.ndarray) -> np.ndarray:
    """Blends two equally tall bands: upper content above the horizontal path where they differ
    least, lower content below it, with a short feather across the cut."""
    band, w, _ = upper.shape
    cost = np.abs(lower - upper).sum(axis=2)
    margin = max(1, round(10 * PX))
    cost[:margin] = 1e9
    cost[-margin:] = 1e9
    # Dynamic programming over columns: the seam row may move one step per column.
    acc = cost.copy()
    back = np.zeros((band, w), dtype=np.int64)
    rows = np.arange(band)
    for x in range(1, w):
        prev = acc[:, x - 1]
        choices = np.stack([np.roll(prev, 1), prev, np.roll(prev, -1)])
        choices[0, 0] = 1e18
        choices[2, -1] = 1e18
        pick = choices.argmin(axis=0)
        acc[:, x] += choices[pick, rows]
        back[:, x] = rows + pick - 1
    seam = np.zeros(w, dtype=np.int64)
    seam[-1] = int(acc[:, -1].argmin())
    for x in range(w - 1, 0, -1):
        seam[x - 1] = back[seam[x], x]
    feather = max(1, round(8 * PX))
    y = np.arange(band)[:, None]
    t = np.clip((y - seam[None, :] + feather) / (2 * feather), 0, 1)
    t = t * t * (3 - 2 * t)
    return upper * (1 - t[..., None]) + lower * t[..., None]


def seamless_loop(images: list[np.ndarray], band_frac: float = 0.22) -> np.ndarray:
    """Stacks the sections into one vertical loop. Each section overlaps the next (and the
    last overlaps the first) by a band, joined along the least visible cut."""
    band = int(min(i.shape[0] for i in images) * band_frac)
    out = []
    for k, img in enumerate(images):
        nxt = images[(k + 1) % len(images)]
        out.append(img[band : img.shape[0] - band])
        out.append(join(img[-band:], nxt[:band]))
    return np.concatenate(out)


def split_strips(img: np.ndarray, pad: int | None = None):
    """Returns (left, right) strips when the middle columns are empty, else None."""
    if pad is None:
        pad = max(1, round(6 * PX))
    w = img.shape[1]
    empty = img[..., 3].max(axis=0) <= 24
    best = (0, 0)
    start = None
    for x in range(w + 1):
        if x < w and empty[x]:
            start = x if start is None else start
        elif start is not None:
            if x - start > best[1] - best[0]:
                best = (start, x)
            start = None
    if best[1] - best[0] < w * 0.1:
        return None
    return img[:, : min(w, best[0] + pad)], img[:, max(0, best[1] - pad) :]


def fog(color, alpha: float, scale: float, seed: int) -> np.ndarray:
    """Soft rising smoke from low-passed noise. FFT noise is periodic, so the tile loops."""
    w, h = FOG_SIZE
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    # Stretched vertically: wisps are taller than wide.
    f = np.sqrt((fx * 1.0) ** 2 + (fy * 2.2) ** 2) * scale
    spectrum = np.fft.fft2(rng.standard_normal((h, w))) / np.maximum(f, 1 / 64) ** 1.6
    spectrum[0, 0] = 0
    n = np.real(np.fft.ifft2(spectrum))
    n = (n - n.mean()) / n.std()
    density = np.clip((n + 0.2) / 1.8, 0, 1) ** 1.5
    # Thin out the middle so the smoke favors the walls.
    x = np.linspace(-1, 1, w)[None, :]
    density *= 0.45 + 0.55 * np.abs(x) ** 1.2
    a = density * alpha * 255
    return np.dstack([np.array(color)[None, None, :] * (a[..., None] / 255), a])


def save_rgba(premul: np.ndarray, path: Path) -> None:
    a = premul[..., 3:4]
    rgb = np.where(a > 0, premul[..., :3] * 255 / np.maximum(a, 1e-6), 0)
    out = np.dstack([np.clip(rgb, 0, 255), a]).round().astype(np.uint8)
    # The wide sheets are several times taller than a phone texture; method 6 is the slow encoder.
    large = premul.shape[1] > 1000
    Image.fromarray(out, "RGBA").save(
        path, "WEBP", quality=84 if large else 88, method=4 if large else 6
    )


def find_image(folder: Path, name: str) -> Path:
    """Painted masters are JPEG. The 4x set is PNG so the chroma stays lossless."""
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        path = folder / f"{name}{ext}"
        if path.exists():
            return path
    raise FileNotFoundError(folder / f"{name}.jpg")


def section_paths(folder: Path, name: str) -> list[Path]:
    paths = [find_image(folder, name)]
    for letter in "bcdefghijklmnopqrstuvwxyz":
        try:
            paths.append(find_image(folder, f"{name}_{letter}"))
        except FileNotFoundError:
            break
    return paths


def load(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    if img.width != SRC_WIDTH:
        img = img.resize((SRC_WIDTH, round(img.height * SRC_WIDTH / img.width)), Image.LANCZOS)
    return np.asarray(img, dtype=np.float64)


def build(world: str, keep: bool = False) -> tuple[dict, dict]:
    """Writes the world's textures and returns (layer pixels, manifest entry)."""
    spec = WORLDS[world]
    src = SRC / world
    out = OUT / world
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*"):
        f.unlink()
    rel = lambda name: f"{REL_ROOT}/{world}/{name}"
    layers: dict = {}
    sky = Image.open(find_image(src, "sky")).convert("RGB")
    if sky.width != SRC_WIDTH:
        sky = sky.resize((SRC_WIDTH, round(sky.height * SRC_WIDTH / sky.width)), Image.LANCZOS)
    sky.save(out / "sky.jpg", quality=86)
    if keep:
        layers["sky"] = np.asarray(sky, dtype=np.float64)
    entry = {"sky": rel("sky.jpg"), "layers": {}}
    for opts in spec["layers"]:
        name = opts["name"]
        if "fog" in opts:
            tile = fog(opts["fog"], opts["alpha"], opts["scale"], opts["seed"])
            save_rgba(tile, out / f"{name}.webp")
            if keep:
                layers[name] = tile
            entry["layers"][name] = {
                "width": tile.shape[1], "height": tile.shape[0],
                "parts": [{"path": rel(f"{name}.webp"), "x": 0, "width": tile.shape[1]}],
            }
            print(f"{world}/{name}: fog {tile.shape[1]}x{tile.shape[0]}")
            continue
        sections = section_paths(src, name)
        graded = [
            grade(
                key_out(load(path), spec["key"], spec["despill"]),
                opts.get("haze_rgb", spec["haze"]), opts["haze"], opts["gain"],
            )
            for path in sections
        ]
        tile = seamless_loop(graded)
        del graded
        if keep:
            layers[name] = tile
        strips = split_strips(tile)
        if strips:
            left, right = strips
            save_rgba(left, out / f"{name}_l.webp")
            save_rgba(right, out / f"{name}_r.webp")
            parts = [
                {"path": rel(f"{name}_l.webp"), "x": 0, "width": left.shape[1]},
                {"path": rel(f"{name}_r.webp"), "x": SRC_WIDTH - right.shape[1], "width": right.shape[1]},
            ]
            print(f"{world}/{name}: {SRC_WIDTH}x{tile.shape[0]} split {left.shape[1]} + {right.shape[1]}")
        else:
            save_rgba(tile, out / f"{name}.webp")
            parts = [{"path": rel(f"{name}.webp"), "x": 0, "width": SRC_WIDTH}]
            print(f"{world}/{name}: {SRC_WIDTH}x{tile.shape[0]}")
        entry["layers"][name] = {"width": SRC_WIDTH, "height": tile.shape[0], "parts": parts}
    for opts in spec.get("stills", []):
        name = opts["name"]
        plate = grade(
            key_out(load(find_image(src, name)), spec["key"], spec["despill"]),
            opts.get("haze_rgb", spec["haze"]), opts["haze"], opts["gain"],
        )
        # The plate's top edge fades out, so a tall view shows the shaft above it, not a cut.
        feather = opts.get("feather", 0)
        if feather:
            ramp = np.clip(np.arange(plate.shape[0]) / feather, 0, 1) ** 1.5
            plate = plate * ramp[:, None, None]
        rows = np.flatnonzero(plate[..., 3].max(axis=1) > 8)
        top, bottom = int(rows[0]), int(rows[-1]) + 1
        plate = plate[top:bottom]
        if keep:
            layers[name] = plate
        save_rgba(plate, out / f"{name}.webp")
        entry["layers"][name] = {
            "width": SRC_WIDTH, "height": plate.shape[0], "y": top,
            "parts": [{"path": rel(f"{name}.webp"), "x": 0, "width": SRC_WIDTH}],
        }
        print(f"{world}/{name}: still {SRC_WIDTH}x{plate.shape[0]} from row {top}")
    try:
        key_path = find_image(src, "key")
    except FileNotFoundError:
        key_path = None
    if key_path is not None and REL_ROOT.endswith("-hd"):
        key = Image.open(key_path).convert("RGB")
        if key.width != SRC_WIDTH:
            key = key.resize((SRC_WIDTH, round(key.height * SRC_WIDTH / key.width)), Image.LANCZOS)
        key.save(out / "key.jpg", quality=86)
    return layers, entry


# --- Preview: composites the layers the way the game does, at half resolution. ---

PREVIEW_W, PREVIEW_H = 300, 550  # half of a 600 x 1100 playfield


def resize_premul(img: np.ndarray, w: int) -> np.ndarray:
    h = max(1, round(img.shape[0] * w / img.shape[1]))
    chans = [Image.fromarray(img[..., c].astype(np.float32), "F").resize((w, h), Image.BILINEAR) for c in range(4)]
    return np.dstack([np.asarray(c, dtype=np.float32) for c in chans])


def mock_bricks() -> np.ndarray:
    """A level-like grid of real brick sprites, to judge readability against the backdrop."""
    canvas = Image.new("RGBA", (PREVIEW_W, PREVIEW_H), (0, 0, 0, 0))
    names = ["blue", "pink", "yellow", "teal", "purple2", "red", "orange", "green", "steel"]
    rnd = random.Random(3)
    bw, bh = 29, 14
    for row in range(7):
        for col in range(8):
            if rnd.random() < 0.2:
                continue
            spr = Image.open(BRICKS / f"brick_{rnd.choice(names)}.png").convert("RGBA").resize((bw, bh), Image.LANCZOS)
            canvas.alpha_composite(spr, (14 + col * 35, 95 + row * 22))
    ball = Image.open(ROOT / "public/assets/images/ball.png").convert("RGBA").resize((10, 10))
    paddle = Image.open(ROOT / "public/assets/images/paddle.png").convert("RGBA").resize((60, 13))
    canvas.alpha_composite(ball, (170, 360))
    canvas.alpha_composite(paddle, (120, PREVIEW_H - 50))
    return premultiplied(canvas)


def mock_gallery() -> np.ndarray:
    """The Shooting Gallery as src/bonus/gallery.ts lays it out: two rails of ducks, the pop-up row
    behind its counter, a money bag in the sky lane, the ball and the paddle."""
    canvas = Image.new("RGBA", (PREVIEW_W, PREVIEW_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    s = PREVIEW_W / 600
    top = 120 * s  # the field's top on a 600 x 1100 phone
    sprite = lambda name, size: Image.open(BONUS / f"target_{name}.png").convert("RGBA").resize(
        (round(size * s), round(size * s)), Image.LANCZOS
    )
    duck, cat, bag = sprite("duck", 62), sprite("cat", 62), sprite("bag", 84)
    at = lambda img, x, y: canvas.alpha_composite(img, (round(x * s - img.width / 2), round(top + y * s - img.height / 2)))
    for y in (170, 255):
        ry = top + (y + 31) * s
        draw.rectangle([0, ry, PREVIEW_W, ry + 4 * s], fill=(42, 22, 8, 230))
        draw.rectangle([0, ry - 1 * s, PREVIEW_W, ry], fill=(200, 135, 58, 230))
    at(bag, 420, 84)
    for x in (90, 230, 370):
        at(duck, x, 170)
    for x in (160, 330):
        at(duck.transpose(Image.FLIP_LEFT_RIGHT), x, 255)
    for x, img in ((60, duck), (300, cat), (420, duck)):
        at(img, x, 350)
    cy = top + (350 + 31 + 11 - 4) * s
    draw.rectangle([0, cy - 11 * s, PREVIEW_W, cy + 11 * s], fill=(58, 30, 12, 245))
    draw.rectangle([0, cy - 11 * s, PREVIEW_W, cy - 8 * s], fill=(224, 160, 80, 255))
    ball = Image.open(ROOT / "public/assets/images/ball.png").convert("RGBA").resize((10, 10))
    paddle = Image.open(ROOT / "public/assets/images/paddle.png").convert("RGBA").resize((60, 13))
    canvas.alpha_composite(ball, (200, 420))
    canvas.alpha_composite(paddle, (120, PREVIEW_H - 50))
    return premultiplied(canvas)


def premultiplied(canvas: Image.Image) -> np.ndarray:
    a = np.asarray(canvas, dtype=np.float32)
    a[..., :3] *= a[..., 3:4] / 255
    return a


def render(layers: dict, specs: list, t: float, bricks: np.ndarray, dim: float, pace: float = 1.0) -> np.ndarray:
    sky = Image.fromarray(layers["sky"].astype(np.uint8))
    s = max(PREVIEW_W / sky.width, PREVIEW_H / sky.height)
    sky = sky.resize((round(sky.width * s), round(sky.height * s)), Image.LANCZOS)
    oy, ox = (sky.height - PREVIEW_H) // 2, (sky.width - PREVIEW_W) // 2
    frame = np.asarray(sky, dtype=np.float32)[oy : oy + PREVIEW_H, ox : ox + PREVIEW_W] * 0.65
    scale = PREVIEW_W / 600
    for spec in specs:
        layer = layers[spec["name"]]
        tile_h = layer.shape[0]
        rows = (np.arange(PREVIEW_H) + int(spec["speed"] * pace * t * scale)) % tile_h
        src = layer[rows]
        frame = frame * (1 - src[..., 3:4] / 255) + src[..., :3]
    frame *= 1 - dim
    frame = frame * (1 - bricks[..., 3:4] / 255) + bricks[..., :3]
    return np.clip(frame, 0, 255).astype(np.uint8)


def preview(
    world: str, layers: dict, stills: str | None, video: str | None, mock: str = "bricks", dim: float = 0.2
) -> None:
    specs = WORLDS[world]["layers"]
    pace = WORLDS[world].get("pace", 1.0)
    scaled = {"sky": layers["sky"]}
    for spec in specs:
        name = spec["name"]
        w = PREVIEW_W if "fog" not in spec else PREVIEW_W
        scaled[name] = resize_premul(layers[name], w).astype(np.float32)
    bricks = mock_gallery() if mock == "gallery" else mock_bricks()
    if stills:
        frames = [render(scaled, specs, t, bricks, dim, pace) for t in (0, 6, 12, 18)]
        sheet = np.concatenate([np.pad(f, ((0, 0), (0, 8), (0, 0))) for f in frames], axis=1)
        Image.fromarray(sheet).save(stills, quality=92)
        print("stills:", stills)
    if video:
        fps = 30
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(fps * 16):
                Image.fromarray(render(scaled, specs, i / fps, bricks, dim, pace)).save(f"{tmp}/{i:05d}.png")
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", f"{tmp}/%05d.png",
                 "-pix_fmt", "yuv420p", "-vf", "scale=600:-2", video],
                check=True,
            )
        print("video:", video)


def thumbnail(world: str) -> None:
    """Centre-crops the key art to the carousel card's portrait shape."""
    img = Image.open(SRC / world / "key.jpg").convert("RGB")
    tw, th = THUMB_SIZE
    scale = max(tw / img.width, th / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (img.width - tw) // 2
    top = (img.height - th) // 2
    THUMBS.mkdir(parents=True, exist_ok=True)
    img.crop((left, top, left + tw, top + th)).save(THUMBS / f"world_{world}.webp", "WEBP", quality=84, method=6)


def main() -> None:
    global SRC, OUT, MANIFEST, REL_ROOT, SRC_WIDTH, PX, FOG_SIZE
    parser = argparse.ArgumentParser()
    parser.add_argument("worlds", nargs="*", default=list(WORLDS))
    parser.add_argument("--stills", help="write a sheet of preview frames (one world)")
    parser.add_argument("--video", help="write a 16 s preview video (one world)")
    parser.add_argument(
        "--mock", choices=["bricks", "gallery"], default="bricks",
        help="what the preview draws over the backdrop: sample bricks, or the Shooting Gallery",
    )
    parser.add_argument("--thumbs-only", action="store_true", help="only write the carousel cards")
    parser.add_argument("--hd", action="store_true", help="write the 2880-wide set for the 16:9 stage")
    parser.add_argument("--src", type=Path, help="parent of the <world>/ source folders (with --hd)")
    args = parser.parse_args()
    if args.hd:
        SRC = args.src or Path("/tmp/backdrop-hd")
        OUT = ROOT / "public" / "assets" / "images" / "backdrops-hd"
        MANIFEST = ROOT / "src" / "art" / "backdrops-hd.json"
        REL_ROOT = "images/backdrops-hd"
        SRC_WIDTH = 2880
        PX = SRC_WIDTH / 720
        FOG_SIZE = (round(180 * PX), round(320 * PX))
        missing = [w for w in args.worlds if not (SRC / w).is_dir()]
        if missing:
            raise SystemExit(
                f"missing upscaled sources for {', '.join(missing)} in {SRC}. "
                "Upscale art-src/backdrops with Real-ESRGAN x4plus first."
            )
    else:
        for world in args.worlds:
            if WORLDS[world].get("card", True):
                thumbnail(world)
    if args.thumbs_only:
        return
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    keep = bool(args.stills or args.video)
    for world in args.worlds:
        layers, manifest[world] = build(world, keep=keep)
        if keep:
            preview(world, layers, args.stills, args.video, args.mock)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
