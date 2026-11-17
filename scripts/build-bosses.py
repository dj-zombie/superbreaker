#!/usr/bin/env python3
"""Cuts the generated boss sheets in art-src/bosses/ into the animation sheets the game loads.

A boss sheet is a grid of frames of one creature on a flat white background. The background is
removed with a flood fill from the image border, the way process-art.py does it. Frames are
never trimmed one by one, which would make the animation jitter: every cell is cropped with the
one box that holds the content of all of them, scaled by the same factor and centred in its
frame.

An image generator spaces the creatures evenly, but not on the cell grid, so the creature sits
a little further over in each cell. Before the common crop every cell is slid onto the first,
to the whole-pixel offset where the two silhouettes overlap the most.

The sheet goes to public/assets/images/bosses/<id>.png, frames in reading order.

Usage: python3 scripts/build-bosses.py   (requires Pillow)
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "bosses"
OUT = ROOT / "public" / "assets" / "images" / "bosses"

# Each boss: its source sheet, the grid (columns, rows) it is drawn on, and the size of one
# frame in the output, which is what the boss's SpriteDef in src/bosses/ names.
BOSSES = {
    "warden": {"source": "warden.jpg", "grid": (3, 3), "frame": (320, 240)},
}

WHITE_TOLERANCE = 38  # as process-art.py
ALPHA_FLOOR = 24  # alpha above this counts as content, as process-art.py's trim
REACH = 48  # px a cell may be slid to meet the first; generators drift up to about 30
COARSE = 4  # px between the offsets tried on the first pass
FRAME_MARGIN = 2  # clear px inside each frame's edge, so filtering never samples a neighbour


def remove_white_background(img: Image.Image) -> Image.Image:
    """Flood-fills near-white pixels connected to the border and makes them transparent."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    near_white = lambda p: all(255 - c <= WHITE_TOLERANCE for c in p[:3])
    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        queue.extend([(0, y), (w - 1, y)])
    while queue:
        x, y = queue.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near_white(px[x, y]):
            continue
        px[x, y] = (255, 255, 255, 0)
        if x > 0:
            queue.append((x - 1, y))
        if x < w - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < h - 1:
            queue.append((x, y + 1))
    # Soften the cut edge by one pixel so sprites don't get a white fringe.
    alpha = img.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(alpha)
    return img


def cells(img: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    cw, ch = img.width // cols, img.height // rows
    return [img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(rows) for c in range(cols)]


def silhouette(img: Image.Image) -> Image.Image:
    return img.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)


def overlap(ref: Image.Image, mask: Image.Image, dx: int, dy: int) -> float:
    """How much of `mask`, slid by (dx, dy), lies on `ref`."""
    moved = Image.new("L", ref.size, 0)
    moved.paste(mask, (dx, dy))
    return ImageStat.Stat(ImageChops.darker(ref, moved)).sum[0]


def register(ref: Image.Image, mask: Image.Image) -> tuple[int, int]:
    """The whole-pixel slide that lays `mask` over `ref` best: a coarse pass, then a fine one."""

    def best(offsets: list[tuple[int, int]]) -> tuple[int, int]:
        return max(offsets, key=lambda o: overlap(ref, mask, o[0], o[1]))

    coarse = range(-REACH, REACH + 1, COARSE)
    cx, cy = best([(dx, dy) for dy in coarse for dx in coarse])
    fine = range(-COARSE + 1, COARSE)
    return best([(cx + dx, cy + dy) for dy in fine for dx in fine])


def build(boss: str, source: str, grid: tuple[int, int], frame: tuple[int, int]) -> None:
    print(boss)
    cols, rows = grid
    cut = cells(remove_white_background(Image.open(SRC / source)), cols, rows)
    masks = [silhouette(c) for c in cut]
    slides = [(0, 0)] + [register(masks[0], m) for m in masks[1:]]
    if any(max(abs(dx), abs(dy)) >= REACH for dx, dy in slides):
        raise SystemExit(f"{boss}: a cell needs sliding by REACH or more; check the sheet's grid")
    print("  slides " + " ".join(f"{dx:+d},{dy:+d}" for dx, dy in slides))

    # Each cell on a canvas with room for its slide, so nothing is cut off by moving it.
    placed = []
    for cell, (dx, dy) in zip(cut, slides):
        canvas = Image.new("RGBA", (cell.width + 2 * REACH, cell.height + 2 * REACH), (0, 0, 0, 0))
        canvas.paste(cell, (REACH + dx, REACH + dy))
        placed.append(canvas)

    # The one box that holds every frame's content.
    union = Image.new("L", placed[0].size, 0)
    for canvas in placed:
        union = ImageChops.lighter(union, silhouette(canvas))
    box = union.getbbox()
    if not box:
        raise SystemExit(f"{boss}: the sheet is empty")
    bw, bh = box[2] - box[0], box[3] - box[1]
    fw, fh = frame
    scale = min((fw - 2 * FRAME_MARGIN) / bw, (fh - 2 * FRAME_MARGIN) / bh)
    size = (round(bw * scale), round(bh * scale))
    print(f"  content {bw}x{bh} scaled by {scale:.3f} to {size[0]}x{size[1]}")

    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, canvas in enumerate(placed):
        art = canvas.crop(box).resize(size, Image.LANCZOS)
        x = (i % cols) * fw + (fw - size[0]) // 2
        y = (i // cols) * fh + (fh - size[1]) // 2
        sheet.paste(art, (x, y))
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{boss}.png"
    sheet.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)} {sheet.width}x{sheet.height}, {path.stat().st_size} bytes")


def main() -> None:
    for boss, spec in BOSSES.items():
        build(boss, spec["source"], spec["grid"], spec["frame"])


if __name__ == "__main__":
    main()
