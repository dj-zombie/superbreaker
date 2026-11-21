#!/usr/bin/env python3
"""Turns the generated particle sheets in art-src/fx/ into strips for the fx atlas.

The sheets are drawn on pure black, so brightness becomes alpha and nothing needs keying.
Each sheet is a grid; every cell becomes one square frame in a horizontal strip written to
public/assets/images/fx/<name>.png. The game reads the frame count as width / height and
packs the frames into the `fx` atlas at load (src/fx/atlas.ts) as `<name>_0`, `<name>_1`, ...

Modes:
  gray   white frames, alpha from brightness: tinted and colored over life in the game
  smoke  like gray, but alpha is softened and the shading kept in the gray level, for normal blend
  color  keeps the painted colors (unpremultiplied), for additive blend only

Alignment:
  each      every frame is trimmed and centered on its own: random variants
  shared    every frame is cut around its cell center at one common size: flipbooks, so
            frames do not jitter or change scale between steps

Usage: python3 scripts/build-fx.py [name ...]   (requires Pillow and numpy)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "fx"
OUT = ROOT / "public" / "assets" / "images" / "fx"

# name: (source, cols, rows, mode, align, cell px in the strip)
SHEETS = {
    "fire": ("fire", 4, 2, "gray", "each", 96),
    "smoke": ("smoke", 4, 2, "smoke", "each", 128),
    "boom": ("boom", 4, 3, "color", "shared", 128),
    # The same blast in white, for worlds whose fire is not orange: colored over life in the game.
    "boomg": ("boom", 4, 3, "gray", "shared", 128),
    "arc": ("arc", 2, 2, "gray", "each", 128),
    "wisp": ("wisp", 2, 2, "gray", "each", 96),
}

# JPEG noise in the black.
FLOOR = 0.035
CONTENT = 0.06
MARGIN = 0.06


def alpha_and_color(rgb: np.ndarray, mode: str) -> np.ndarray:
    """RGBA float array (0..1) from an RGB float array on black."""
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    peak = rgb.max(axis=2)
    if mode == "color":
        a = np.clip((peak - FLOOR) / (1 - FLOOR), 0, 1)
        col = np.clip(rgb / np.maximum(a, 1e-4)[..., None], 0, 1)
    elif mode == "smoke":
        a = np.clip((lum - FLOOR) / 0.72, 0, 1) ** 1.15
        shade = 0.55 + 0.45 * np.clip(lum / 0.85, 0, 1)
        col = np.repeat(shade[..., None], 3, axis=2)
    else:
        a = np.clip((lum - FLOOR) / (1 - FLOOR), 0, 1) ** 0.95
        col = np.ones_like(rgb)
    return np.dstack([col, a])


def content_box(a: np.ndarray):
    ys, xs = np.nonzero(a > CONTENT)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def square_crop(rgba: np.ndarray, cx: float, cy: float, half: float) -> np.ndarray:
    """A square of side 2*half around (cx, cy); outside the cell is transparent."""
    side = int(np.ceil(half * 2))
    out = np.zeros((side, side, 4), dtype=rgba.dtype)
    x0 = int(round(cx - half))
    y0 = int(round(cy - half))
    h, w = rgba.shape[:2]
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(w, x0 + side), min(h, y0 + side)
    if sx1 > sx0 and sy1 > sy0:
        out[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = rgba[sy0:sy1, sx0:sx1]
    return out


def fit(rgba: np.ndarray, size: int) -> Image.Image:
    """Resizes premultiplied, so the edges get no dark or bright fringe."""
    return to_image(rgba).convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA")


def build(name: str) -> None:
    source, cols, rows, mode, align, size = SHEETS[name]
    src = next((p for p in (SRC / f"{source}.png", SRC / f"{source}.jpg") if p.exists()), None)
    if not src:
        print(f"  skip {name}: no source in {SRC}")
        return
    rgb = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32) / 255
    h, w = rgb.shape[:2]
    cw, ch = w / cols, h / rows
    cells = []
    for r in range(rows):
        for c in range(cols):
            x0, y0 = int(round(c * cw)), int(round(r * ch))
            x1, y1 = int(round((c + 1) * cw)), int(round((r + 1) * ch))
            cells.append(alpha_and_color(rgb[y0:y1, x0:x1], mode))

    frames = []
    if align == "shared":
        # One half-size for all frames: the farthest content from any cell center.
        half = 1.0
        for cell in cells:
            box = content_box(cell[..., 3])
            if not box:
                continue
            cy, cx = cell.shape[0] / 2, cell.shape[1] / 2
            half = max(half, cx - box[0], box[2] - cx, cy - box[1], box[3] - cy)
        half *= 1 + MARGIN
        for cell in cells:
            frames.append(fit(square_crop(cell, cell.shape[1] / 2, cell.shape[0] / 2, half), size))
    else:
        for cell in cells:
            box = content_box(cell[..., 3])
            if not box:
                continue
            l, t, rr, b = box
            half = max(rr - l, b - t) / 2 * (1 + MARGIN)
            frames.append(fit(square_crop(cell, (l + rr) / 2, (t + b) / 2, half), size))

    strip = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * size, 0))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.png"
    strip.save(out, optimize=True)
    print(f"  {name}: {len(frames)} frames of {size}px -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


def main() -> None:
    names = sys.argv[1:] or list(SHEETS)
    for name in names:
        if name not in SHEETS:
            sys.exit(f"unknown sheet {name}; known: {', '.join(SHEETS)}")
        build(name)


if __name__ == "__main__":
    main()
