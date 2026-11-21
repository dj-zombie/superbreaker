#!/usr/bin/env python3
"""Cuts the per-world foreground renders into game sprites.

art-src/foreground/<world>/ holds rendered plates on flat white: one color brick master,
the four special bricks (steel, explosive, armored, regen), the paddle and the ball. The
background is removed with a flood fill from the border. The master's glass is gradient
mapped to each of the 16 tile hues so a red brick stays red in every world, and the frame
keeps the world's material.

The cut sprites go to art-src/foreground/<world>/sprites/. The original brick PNGs under
public/assets/images/bricks/ are the Tiled tileset and are never touched.

Each world's sprites are then packed into the one atlas the game loads,
public/assets/images/foreground/<world>.webp + <world>.json, plus a normal map atlas with the same
layout (<world>_n.png) for the High lighting tier. The looping paddle and ball frames that
scripts/build-anims.py writes to art-src/foreground/<world>/anim/ are packed in too, as
paddle_00, paddle_01, ... and ball_00, ball_01, ... Normals
come from a bevel around each sprite's alpha plus a high-pass of its brightness, so the painted
detail catches moving lights.

Usage: python3 scripts/build-foreground.py              (Pillow, numpy)
       python3 scripts/build-foreground.py --pack-only  # re-pack the existing sprites
"""
from __future__ import annotations

import json
import sys
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


# ---------------------------------------------------------------- normals and atlas

SPRITES = [f"brick_{n}" for n in BRICK_COLORS] + [f"brick_{k}" for k in SPECIALS] + ["paddle", "ball"]
GUTTER = 2  # extruded edge pixels around each frame, so filtering never samples a neighbour
ATLAS_WIDTH = 1024
BEVEL_PX = 5.0  # at 4x, about a game pixel
NORMAL_STRENGTH = 4.0
DETAIL = 1.5


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((r, r), (0, 0)), mode="edge")
    a = sum(k[i] * p[i : i + a.shape[0]] for i in range(2 * r + 1))
    p = np.pad(a, ((0, 0), (r, r)), mode="edge")
    return sum(k[i] * p[:, i : i + a.shape[1]] for i in range(2 * r + 1))


def normal_map(rgba: np.ndarray, detail_gain: float = DETAIL) -> np.ndarray:
    """Tangent-space normals, green up (OpenGL), which is what Phaser's light shader expects."""
    alpha = rgba[..., 3] / 255
    padded = np.pad(alpha, int(BEVEL_PX * 3))
    inner = blur(padded, BEVEL_PX)[int(BEVEL_PX * 3) : -int(BEVEL_PX * 3), int(BEVEL_PX * 3) : -int(BEVEL_PX * 3)]
    bevel = smooth(0.5, 1.0, inner) * alpha
    lum = (rgba[..., :3] / 255) @ np.array([0.3, 0.59, 0.11], np.float32)
    detail = (lum - blur(lum, 3.0)) * alpha
    height = bevel + detail * detail_gain
    dy, dx = np.gradient(height)
    # Rows run down the image while the shader's y runs up, hence +dy.
    n = np.dstack([-dx * NORMAL_STRENGTH, dy * NORMAL_STRENGTH, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    flat = np.array([0.0, 0.0, 1.0])
    n = np.where((alpha > 0.02)[..., None], n, flat)
    out = np.dstack([(n * 0.5 + 0.5) * 255, np.full_like(height, 255)])
    return out


def extrude(rgba: np.ndarray) -> np.ndarray:
    return np.pad(rgba, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode="edge")


def anim_frames(world: str) -> tuple[dict[str, np.ndarray], dict[str, dict[str, float]]]:
    """The looping paddle and ball frames from scripts/build-anims.py, as <name>_00, <name>_01, ...,
    and each loop's frame rate."""
    frames: dict[str, np.ndarray] = {}
    rates: dict[str, dict[str, float]] = {}
    for meta_path in sorted((SRC / world / "anim").glob("*.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        sheet = np.asarray(Image.open(meta_path.with_suffix(".png")).convert("RGBA")).astype(np.float32)
        w, h, cols = meta["width"], meta["height"], meta["cols"]
        for i in range(meta["frames"]):
            x, y = (i % cols) * w, (i // cols) * h
            frames[f"{meta_path.stem}_{i:02d}"] = sheet[y : y + h, x : x + w]
        rates[meta_path.stem] = {"fps": meta["fps"]}
    return frames, rates


def pack(world: str) -> None:
    """Shelf-packs the world's sprites, tallest first, into <world>.webp, <world>_n.png and <world>.json."""
    folder = SRC / world / "sprites"
    sprites = {name: np.asarray(Image.open(folder / f"{name}.png").convert("RGBA")).astype(np.float32) for name in SPRITES}
    frames_by_name, rates = anim_frames(world)
    sprites.update(frames_by_name)
    names = list(sprites)
    order = sorted(names, key=lambda n: (-sprites[n].shape[0], names.index(n)))
    places: dict[str, tuple[int, int]] = {}
    x = y = shelf = 0
    for name in order:
        h, w = sprites[name].shape[:2]
        fw, fh = w + GUTTER * 2, h + GUTTER * 2
        if x + fw > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf, 0
        places[name] = (x, y)
        x += fw
        shelf = max(shelf, fh)
    height = y + shelf
    height += -height % 4
    color = np.zeros((height, ATLAS_WIDTH, 4), np.float32)
    normal = np.zeros_like(color)
    normal[...] = (127.5, 127.5, 255, 255)
    frames = {}
    for name in names:
        rgba = sprites[name]
        h, w = rgba.shape[:2]
        fx, fy = places[name]
        color[fy : fy + h + GUTTER * 2, fx : fx + w + GUTTER * 2] = extrude(rgba)
        # Only bricks and the paddle are relief-lit; the ball's frames keep the flat normal. The
        # paddle's loop frames get the bevel alone: painted detail per frame would only flicker,
        # and the flat middle keeps the normal atlas small.
        if name.startswith("paddle_"):
            normal[fy : fy + h + GUTTER * 2, fx : fx + w + GUTTER * 2] = extrude(normal_map(rgba, 0))
        elif not name.startswith("ball_"):
            normal[fy : fy + h + GUTTER * 2, fx : fx + w + GUTTER * 2] = extrude(normal_map(rgba))
        frames[name] = {
            "frame": {"x": fx + GUTTER, "y": fy + GUTTER, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
    # The animation frames make the color atlas photographic, so it ships as lossy WebP.
    path = OUT / f"{world}.webp"
    image(color).save(path, quality=92, alpha_quality=100, method=6)
    print(f"  {path.relative_to(ROOT)} {ATLAS_WIDTH}x{height}")
    save(image(normal), OUT / f"{world}_n.png")
    meta = {"image": f"{world}.webp", "size": {"w": ATLAS_WIDTH, "h": height}, "scale": "1", "anims": rates}
    path = OUT / f"{world}.json"
    path.write_text(json.dumps({"frames": frames, "meta": meta}, indent=1) + "\n", encoding="utf-8")
    print(f"  {path.relative_to(ROOT)} {len(frames)} frames")


def build(world: str) -> None:
    print(world)
    src, out = SRC / world, SRC / world / "sprites"
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
    pack_only = "--pack-only" in sys.argv[1:]
    for world in WORLDS:
        if not pack_only:
            build(world)
        pack(world)


if __name__ == "__main__":
    main()
