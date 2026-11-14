#!/usr/bin/env python3
"""Cuts the logo concepts in art-src/logo/ into a base layer and an emissive layer.

Each concept is dark metal lettering with glowing cracks on a flat white background:

- `<name>.webp` is the lettering with the cracks darkened and the colour removed, so one
  base works in every world.
- `<name>_glow.webp` is the cracks as white with alpha, tinted per world at runtime and drawn
  additively over the base. It is soft, so it ships at GLOW_SCALE of the base's size.

`<name>` is the source name without its `concept-N-` prefix. The game picks one at random per
launch from LOGO_VARIANTS in src/ui/fx/logoReveal.ts.

The white background (and any white enclosed by letters) is removed, the result is trimmed
and scaled to WIDTH.

Usage: python3 scripts/process-logo.py [concept ...]   (requires Pillow and numpy)
"""
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "logo"
OUT = ROOT / "public" / "assets" / "images" / "ui" / "logo"
WIDTH = 1100
# A pixel is background when its darkest channel is at least this bright.
WHITE_MIN = 214
# Enclosed white regions bigger than this are holes in letters, not highlights.
MIN_HOLE = 300
GLOW_SCALE = 0.5


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """Near-white pixels connected to the border, plus large enclosed near-white regions."""
    h, w, _ = rgb.shape
    white = rgb.min(axis=2) >= WHITE_MIN
    label = np.zeros((h, w), dtype=np.int32)
    flat_white = white.ravel()
    flat_label = label.ravel()
    bg = np.zeros(h * w, dtype=bool)
    current = 0
    for start in np.flatnonzero(flat_white):
        if flat_label[start]:
            continue
        current += 1
        flat_label[start] = current
        queue = deque([start])
        members = []
        border = False
        while queue:
            i = queue.popleft()
            members.append(i)
            y, x = divmod(i, w)
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                border = True
            for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w, i + w):
                if 0 <= j < h * w and flat_white[j] and not flat_label[j]:
                    flat_label[j] = current
                    queue.append(j)
        if border or len(members) >= MIN_HOLE:
            bg[members] = True
    return bg.reshape(h, w)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def emissive(rgb: np.ndarray) -> np.ndarray:
    """0..1 strength of the glowing cracks: warm, saturated and bright, or white-hot."""
    f = rgb.astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    v = f.max(axis=2)
    s = np.where(v > 0, (v - f.min(axis=2)) / np.maximum(v, 1e-6), 0)
    warm = (r >= g) & (g >= b * 0.7) & (r > b + 0.12)
    glow = warm * smoothstep(0.3, 0.65, s) * smoothstep(0.42, 0.85, v)
    hot = warm * smoothstep(0.86, 0.98, v) * smoothstep(0.08, 0.25, s)
    return np.maximum(glow, hot)


def process(src: Path) -> None:
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img).copy()
    bg = background_mask(rgb)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    a = np.asarray(alpha).astype(np.float32) / 255.0

    heat = emissive(rgb)
    heat_img = Image.fromarray((heat * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    heat = np.maximum(heat, np.asarray(heat_img).astype(np.float32) / 255.0 * 0.85) * a

    f = rgb.astype(np.float32) / 255.0
    lum = f[..., 0] * 0.3 + f[..., 1] * 0.59 + f[..., 2] * 0.11
    # Lift contrast a touch so the iron reads against dark backdrops, then sink the cracks.
    lum = np.clip((lum - 0.5) * 1.12 + 0.52, 0, 1)
    base_l = lum * (1 - 0.82 * heat)
    # A light fringe that is mostly glow belongs to the emissive layer, not the base.
    haze = heat * smoothstep(0.55, 0.9, lum)
    base_a = a * (1 - haze)
    base = np.dstack([base_l, base_l * 0.985, base_l * 0.97, base_a])
    glow = np.dstack([np.ones_like(heat), np.ones_like(heat), np.ones_like(heat), heat])

    base_img = Image.fromarray((base * 255).round().astype(np.uint8), "RGBA")
    glow_img = Image.fromarray((glow * 255).round().astype(np.uint8), "RGBA")
    box = Image.fromarray((np.maximum(base_a, heat) > 0.1).astype(np.uint8) * 255).getbbox()
    if box:
        pad = 6
        l, t, r, b = box
        box = (max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad))
        base_img = base_img.crop(box)
        glow_img = glow_img.crop(box)
    scale = WIDTH / base_img.width
    size = (WIDTH, round(base_img.height * scale))
    base_img = base_img.resize(size, Image.LANCZOS)
    glow_size = (round(size[0] * GLOW_SCALE), round(size[1] * GLOW_SCALE))
    glow_img = glow_img.resize(glow_size, Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    name = re.sub(r"^concept-\d+-", "", src.stem)
    base_img.save(OUT / f"{name}.webp", quality=90, alpha_quality=100, method=6)
    glow_img.save(OUT / f"{name}_glow.webp", quality=85, alpha_quality=90, method=6)
    print(f"{name}: {size[0]}x{size[1]}")


def main() -> None:
    wanted = sys.argv[1:]
    sources = sorted(SRC.glob("concept-*.jpg"))
    if wanted:
        sources = [s for s in sources if any(w in s.stem for w in wanted)]
    for src in sources:
        process(src)


if __name__ == "__main__":
    main()
