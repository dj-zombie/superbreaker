#!/usr/bin/env python3
"""Turns the generated art sheets in art-src/ into game-ready sprites under public/.

Sheets are drawn on a flat white background: the background is removed with a flood fill
from the image border, each grid cell is trimmed to its content and resized to game size.

Usage: python3 scripts/process-art.py   (requires Pillow)
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
OUT = ROOT / "public"
WHITE_TOLERANCE = 38


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


def trim(img: Image.Image, pad: int = 2) -> Image.Image:
    box = img.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def cells(img: Image.Image, cols: int, rows: int):
    cw, ch = img.width // cols, img.height // rows
    for r in range(rows):
        for c in range(cols):
            yield img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))


def fit(img: Image.Image, size: tuple[int, int], keep_aspect: bool) -> Image.Image:
    if not keep_aspect:
        return img.resize(size, Image.LANCZOS)
    img = img.copy()
    img.thumbnail(size, Image.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2), img)
    return canvas


def save(img: Image.Image, rel: str) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {rel} {img.size[0]}x{img.size[1]}")


def sheet(name: str, cols: int, rows: int, targets, size, keep_aspect: bool) -> None:
    print(name)
    img = remove_white_background(Image.open(SRC / name))
    for cell, target in zip(cells(img, cols, rows), targets):
        save(fit(trim(cell), size, keep_aspect), target)


def main() -> None:
    sheet(
        "sheet_bricks.jpg",
        2,
        2,
        [f"assets/images/bricks/brick_{k}.png" for k in ("steel", "explosive", "armored", "regen")],
        (120, 64),
        keep_aspect=False,
    )
    sheet(
        "sheet_powerups.jpg",
        2,
        2,
        [f"assets/images/powerups/{k}.png" for k in ("shield", "slow", "extraLife", "pierce")],
        (128, 128),
        keep_aspect=True,
    )

    print("sheet_paddle_ball.jpg")
    pb = remove_white_background(Image.open(SRC / "sheet_paddle_ball.jpg"))
    top = pb.crop((0, 0, pb.width, int(pb.height * 0.46)))
    bottom = pb.crop((0, int(pb.height * 0.46), pb.width, pb.height))
    save(fit(trim(top), (440, 96), keep_aspect=False), "assets/images/paddle.png")
    save(fit(trim(bottom), (96, 96), keep_aspect=True), "assets/images/ball.png")

    print("icons")
    icon = Image.open(SRC / "app_icon.jpg").convert("RGB")
    for size in (192, 512, 1024):
        save(icon.resize((size, size), Image.LANCZOS), f"icons/icon-{size}.png")
    save(icon.resize((64, 64), Image.LANCZOS), "favicon.png")
    # Maskable icons need the artwork inside the central 80% safe zone.
    maskable = Image.new("RGB", (512, 512), (36, 14, 92))
    inner = icon.resize((410, 410), Image.LANCZOS)
    maskable.paste(inner, (51, 51))
    save(maskable, "icons/icon-maskable-512.png")


if __name__ == "__main__":
    main()
