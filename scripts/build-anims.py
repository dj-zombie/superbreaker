#!/usr/bin/env python3
"""Turns the Ludo AI animation sheets into the game's looping sprites.

Ludo (`ludo sprite animate`, see the README) renders each animation as a big grid of
full-resolution frames with a result JSON beside it. Those raw sheets are tens of megabytes, so
they stay out of git in ludo-output/anim/; this script keeps what the game needs:

  - picks the frames in `keep` (all by default),
  - softens the jumps listed in `soften` (a frame where the clip cuts) with a two-frame blend,
  - closes the loop: the last `fade` frames are blended into the first ones, which are dropped,
    so the last frame leads into the first without a seam; or, for motion that swells and
    settles (a heartbeat, a breath), `pingpong` keeps the clip as it is and marks it `yoyo` in
    the manifest so the game plays it forward and then back,
  - resizes every frame to the size the game draws it at.

Paddles and balls go to art-src/foreground/<world>/anim/<name>.png (+ .json), which
scripts/build-foreground.py packs into the world atlas as <name>_00, <name>_01, ... Pickups go
to public/assets/images/powerups/<id>_loop.webp as spritesheets, with a still <id>.png for the
HUD and menus.

Usage: python3 scripts/build-anims.py [name ...]   (Pillow, numpy)
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "ludo-output" / "anim"
FG = ROOT / "art-src" / "foreground"
POWERUPS = ROOT / "public" / "assets" / "images" / "powerups"

PADDLE_FRAME = (312, 72)  # 104x24 paddle at 3x: the animation is drawn at most ~2x
BALL_FRAME = 96
PICKUP_FRAME = 96
STILL_SIZE = 160
SHEET_COLS = 8


@dataclass
class Anim:
    name: str
    raw: str  # stem under ludo-output/anim/: <raw>-1.png and <raw>.json
    kind: str  # paddle | ball | pickup | coin
    world: str = ""
    fade: int = 8
    keep: tuple[int, int] | None = None  # 1-based inclusive frame range
    soften: list[int] = field(default_factory=list)  # 1-based frames the clip jumps into
    pingpong: bool = False
    still: str = ""  # pickups: the badge image the still is made from


ANIMS = [
    Anim("hell_paddle", "test/hell_paddle_hydra", "paddle", "hell"),
    Anim("hell_ball", "test/hell_ball_ignis", "ball", "hell", soften=[19]),
    Anim("crypt_paddle", "prod/crypt_paddle", "paddle", "crypt"),
    Anim("crypt_ball", "prod/crypt_ball_fixed", "ball", "crypt"),
    Anim("mainframe_paddle", "prod/mainframe_paddle", "paddle", "mainframe"),
    Anim("mainframe_ball", "prod/mainframe_ball", "ball", "mainframe", soften=[12]),
    Anim("shield", "pickups/shield", "pickup", still="src/pu_shield.png"),
    Anim("extraLife", "pickups/extraLife", "pickup", pingpong=True, still="src/pu_extraLife.png"),
    Anim("pierce", "pickups/pierce", "pickup", fade=6, still="src/pu_pierce.png"),
    Anim("smaller", "pickups/smaller", "pickup", still="badges/smaller-fixed.png"),
    Anim("balls", "pickups/balls", "pickup", pingpong=True, still="badges/balls-v1.png"),
    Anim("magnet", "pickups/magnet", "pickup", still="badges/magnet-v4.png"),
    Anim("fireball", "pickups/fireball", "pickup", still="badges/fireball-v4.png"),
    Anim("laser", "pickups/laser", "pickup", still="badges/laser-v4.png"),
    Anim("bigger", "pickups/bigger", "pickup", still="badges/bigger-v4.png"),
    Anim("hyper", "pickups/hyper", "pickup", still="badges/hyper-v2.png"),
    Anim("mystery", "pickups/mystery", "pickup", still="badges/mystery-v1.png"),
]


def frames_of(anim: Anim) -> tuple[list[np.ndarray], float]:
    """The sheet's frames as float RGBA (0..1, premultiplied) and its frame rate."""
    meta = json.loads((RAW / f"{anim.raw}.json").read_text())["result"]
    sheet = np.asarray(Image.open(RAW / f"{anim.raw}-1.png").convert("RGBA")).astype(np.float32) / 255
    w, h, cols, n = meta["frame_width"], meta["frame_height"], meta["num_cols"], meta["num_frames"]
    frames = []
    for i in range(n):
        x, y = (i % cols) * w, (i // cols) * h
        f = sheet[y : y + h, x : x + w].copy()
        f[..., :3] *= f[..., 3:]
        frames.append(f)
    return frames, n / meta["duration"]


def mix(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    return a * (1 - t) + b * t


def loop(anim: Anim, frames: list[np.ndarray]) -> list[np.ndarray]:
    for j in anim.soften:
        a, b = frames[j - 2], frames[j - 1]
        frames[j - 2], frames[j - 1] = mix(a, b, 1 / 3), mix(a, b, 2 / 3)
    if anim.keep:
        frames = frames[anim.keep[0] - 1 : anim.keep[1]]
    if anim.pingpong:
        return frames
    k, n = anim.fade, len(frames)
    if k <= 0:
        return frames
    tail = [mix(frames[n - k + j], frames[j], (j + 1) / (k + 1)) for j in range(k)]
    return frames[k : n - k] + tail


def backfill(frames: list[np.ndarray]) -> list[np.ndarray]:
    """Puts each round badge over a solid disc of its own background color, so no part of its
    face lets the playfield through (some generated badges come back with a see-through face)."""
    a = frames[0][..., 3]
    ys, xs = np.where(a > 0.5)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    radius = (ys.max() - ys.min() + xs.max() - xs.min()) / 4
    yy, xx = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
    r = np.hypot(yy - cy, xx - cx) / radius
    band = (r > 0.62) & (r < 0.78) & (a > 0.98)
    rgb = frames[0][..., :3][band] / frames[0][..., 3:][band]
    color = np.median(rgb, axis=0)
    disc = np.clip((0.9 - r) / 0.02, 0, 1)[..., None]
    under = np.dstack([np.broadcast_to(color, a.shape + (3,)), np.ones(a.shape)]) * disc
    return [f + under * (1 - f[..., 3:]) for f in frames]


def crop_square(frames: list[np.ndarray], margin: float = 0.02) -> list[np.ndarray]:
    """Cuts every frame to one square around the art of all of them, so pickups fill their size."""
    alpha = np.max([f[..., 3] for f in frames], axis=0)
    ys, xs = np.where(alpha > 0.02)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 * (1 + margin)
    y0, x0 = int(round(cy - half)), int(round(cx - half))
    side = int(round(half * 2))
    out = []
    for f in frames:
        pad = np.pad(f, ((side, side), (side, side), (0, 0)))
        out.append(pad[y0 + side : y0 + 2 * side, x0 + side : x0 + 2 * side])
    return out


def to_image(f: np.ndarray) -> Image.Image:
    a = f[..., 3:]
    rgb = np.where(a > 1e-4, f[..., :3] / np.maximum(a, 1e-4), 0)
    return Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def square(img: Image.Image, size: int) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def sized(anim: Anim, img: Image.Image) -> Image.Image:
    if anim.kind == "paddle":
        return img.resize(PADDLE_FRAME, Image.LANCZOS)
    if anim.kind == "ball":
        return square(img, BALL_FRAME)
    return square(img, PICKUP_FRAME)


def sheet(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    cols = min(SHEET_COLS, len(frames))
    rows = -(-len(frames) // cols)
    out = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * w, (i // cols) * h))
    return out


def build(anim: Anim) -> None:
    frames, fps = frames_of(anim)
    if anim.kind == "pickup":
        frames = crop_square(backfill(frames))
    looped = [sized(anim, to_image(f)) for f in loop(anim, frames)]
    w, h = looped[0].size
    info = {"frames": len(looped), "fps": round(fps, 2), "width": w, "height": h, "cols": min(SHEET_COLS, len(looped))}
    if anim.pingpong:
        info["yoyo"] = True
    if anim.kind in ("paddle", "ball"):
        out = FG / anim.world / "anim" / f"{anim.kind}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet(looped).save(out, optimize=True)
        out.with_suffix(".json").write_text(json.dumps(info, indent=1) + "\n")
    else:
        out = POWERUPS / f"{anim.name}_loop.webp"
        sheet(looped).save(out, quality=90, alpha_quality=100, method=6)
        if anim.still:
            still = np.asarray(Image.open(RAW / anim.still).convert("RGBA")).astype(np.float32) / 255
            still[..., :3] *= still[..., 3:]
            square(to_image(crop_square(backfill([still]))[0]), STILL_SIZE).save(POWERUPS / f"{anim.name}.png", optimize=True)
        manifest = POWERUPS / "loops.json"
        loops = json.loads(manifest.read_text()) if manifest.exists() else {}
        loops[anim.name] = info
        manifest.write_text(json.dumps(dict(sorted(loops.items())), indent=1) + "\n")
    print(f"  {out.relative_to(ROOT)} {len(looped)} frames {w}x{h} @ {info['fps']} fps")


def main() -> None:
    wanted = set(sys.argv[1:])
    for anim in ANIMS:
        if not wanted or anim.name in wanted:
            build(anim)


if __name__ == "__main__":
    main()
