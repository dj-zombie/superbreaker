#!/usr/bin/env python3
"""Cuts the per-world foreground renders into game sprites.

art-src/foreground/<world>/ holds rendered plates on flat white: one color brick master,
the four special bricks (steel, explosive, armored, regen), the paddle and the ball. The
background is removed with a flood fill from the border. The master's glass is gradient
mapped to each of the 16 tile hues so a red brick stays red in every world, and the frame
keeps the world's material.

Writes public/assets/images/foreground/<world>/. The original brick PNGs under
public/assets/images/bricks/ are the Tiled tileset and are never touched.

Usage: python3 scripts/build-foreground.py   (Pillow, numpy)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "foreground"
OUT = ROOT / "public" / "assets" / "images" / "foreground"
WORLDS = ("hell", "crypt", "mainframe")
SPECIALS = ("steel", "explosive", "armored", "regen")

BRICK_SIZE = (120, 64)  # 30x16 tiles at 4x
PADDLE_SIZE = (416, 96)  # 104x24 paddle at 4x
BALL_SIZE = 96

# Same hues as BRICK_TINT in src/config.ts.
BRICK_COLORS: dict[str, int] = {
    "blue": 0x3C8DFF,
    "blue2": 0x2A5FD6,
    "green": 0x4DDF6A,
    "green2": 0x2FA64A,
    "orange": 0xFF9A3C,
    "orange2": 0xE0701F,
    "pink": 0xFF6AD5,
    "purple2": 0x9B5CFF,
    "red": 0xFF4D4D,
    "red2": 0xC92F3A,
    "teal": 0x3CE7D6,
    "teal2": 0x23B3A6,
    "white": 0xF2F2F2,
    "white2": 0xC8C8D8,
    "yellow": 0xFFE14D,
    "yellow2": 0xE8B923,
}


class Glass:
    """Where the colored glass sits on a world's master, and how bright to map it."""

    def __init__(self, hue: float, hue_width: float, gamma: float) -> None:
        self.hue = hue
        self.hue_width = hue_width
        self.gamma = gamma


GLASS = {
    "hell": Glass(hue=8, hue_width=34, gamma=0.6),
    "crypt": Glass(hue=272, hue_width=30, gamma=0.8),
    "mainframe": Glass(hue=212, hue_width=26, gamma=0.95),
}


def smooth(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def reach_from_border(passable: np.ndarray) -> np.ndarray:
    """Pixels of `passable` connected to the image border (4-neighbour)."""
    reach = np.zeros_like(passable)
    reach[0], reach[-1] = passable[0], passable[-1]
    reach[:, 0], reach[:, -1] = passable[:, 0], passable[:, -1]
    while True:
        grown = reach.copy()
        grown[1:] |= reach[:-1]
        grown[:-1] |= reach[1:]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= passable
        if (grown == reach).all():
            return reach
        reach = grown


def cut(path: Path, tolerance: float = 26) -> np.ndarray:
    """Removes the flat background and trims. Returns float RGBA, 0-255."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.abs(rgb - bg).max(axis=2)
    outside = reach_from_border(dist < tolerance)
    solid = ~outside
    alpha = solid.astype(np.float32)
    edge = outside & (
        np.roll(solid, 1, 0) | np.roll(solid, -1, 0) | np.roll(solid, 1, 1) | np.roll(solid, -1, 1)
    )
    alpha[edge] = np.clip(dist[edge] / tolerance, 0, 1)
    # Un-mix the white background from the soft edge so sprites have no light fringe.
    a = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((rgb - bg * (1 - alpha[..., None])) / a, 0, 255)
    ys, xs = np.where(alpha > 0.5)
    out = np.dstack([color, alpha * 255])
    return out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def hsv(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    c = rgba[..., :3] / 255
    mx, mn = c.max(axis=2), c.min(axis=2)
    d = mx - mn
    s = d / np.maximum(mx, 1e-4)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    safe = np.maximum(d, 1e-4)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4))
    return h * 60, s, mx


def glass_mask(rgba: np.ndarray, glass: Glass) -> np.ndarray:
    h, s, v = hsv(rgba)
    dh = np.abs((h - glass.hue + 180) % 360 - 180)
    on_hue = 1 - smooth(glass.hue_width, glass.hue_width + 18, dh)
    # Saturated glass, plus the pale tinted highlights on it.
    body = smooth(0.32, 0.55, s) * smooth(0.1, 0.25, v)
    shine = smooth(0.08, 0.2, s) * smooth(0.62, 0.82, v)
    mask = on_hue * np.maximum(body, shine)
    # Specular and hot spots fully enclosed by glass belong to the glass too.
    holes = ~reach_from_border(mask < 0.5) & (mask < 0.5)
    mask = np.maximum(mask, holes.astype(np.float32))
    return mask * (rgba[..., 3] / 255)


def gradient_map(rgba: np.ndarray, mask: np.ndarray, color: int, gamma: float) -> np.ndarray:
    c = rgba[..., :3] / 255
    lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
    inside = lum[mask > 0.5]
    lo, hi = np.percentile(inside, 2), np.percentile(inside, 99.5)
    t = np.clip((lum - lo) / (hi - lo + 1e-4), 0, 1) ** gamma
    tint = np.array([(color >> 16) & 255, (color >> 8) & 255, color & 255], np.float32) / 255
    stops = (
        (0.0, tint * 0.2),
        (0.3, tint * 0.68),
        (0.55, tint),
        (0.84, tint + (1 - tint) * 0.42),
        (1.0, tint + (1 - tint) * 0.88),
    )
    mapped = np.zeros_like(c)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        f = ((t - t0) / (t1 - t0))[..., None]
        mapped = np.where(((t >= t0) & (t <= t1))[..., None], c0 + (c1 - c0) * f, mapped)
    m = mask[..., None]
    out = rgba.copy()
    out[..., :3] = (c * (1 - m) + mapped * m) * 255
    return out


def image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")


def square(img: Image.Image, size: int) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")


def build(world: str) -> None:
    print(world)
    src, out = SRC / world, OUT / world
    master = cut(src / "brick.jpg")
    mask = glass_mask(master, GLASS[world])
    for name, color in BRICK_COLORS.items():
        tile = gradient_map(master, mask, color, GLASS[world].gamma)
        save(image(tile).resize(BRICK_SIZE, Image.LANCZOS), out / f"brick_{name}.png")
    for kind in SPECIALS:
        save(image(cut(src / f"{kind}.jpg")).resize(BRICK_SIZE, Image.LANCZOS), out / f"brick_{kind}.png")
    save(image(cut(src / "paddle.jpg")).resize(PADDLE_SIZE, Image.LANCZOS), out / "paddle.png")
    save(square(image(cut(src / "ball.jpg")), BALL_SIZE), out / "ball.png")


def main() -> None:
    for world in WORLDS:
        build(world)


if __name__ == "__main__":
    main()
