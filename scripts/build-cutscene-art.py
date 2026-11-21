#!/usr/bin/env python3
"""Cuts the generated cutscene art in art-src/cutscenes/ into what the game loads.

Three kinds of source, all named in ART below:

  portrait  one character on flat white for the dialog box: keyed, trimmed to the character and
            fitted into a square, so every portrait sits the same in its box
  sheet     an animation grid on flat white for an actor on stage: keyed and cut the way
            build-bosses.py cuts a boss sheet (each cell slid onto the first, one common crop)
  plate     a full-screen story illustration: no keying, only scaled and saved as JPEG

Everything goes to public/assets/images/cutscenes/. The keys and frame sizes are the ones the
scene's script names (src/cutscenes/).

Usage: python3 scripts/build-cutscene-art.py [name ...]   (requires Pillow and numpy)
"""
import importlib.util
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "cutscenes"
OUT = ROOT / "public" / "assets" / "images" / "cutscenes"

_spec = importlib.util.spec_from_file_location("build_bosses", ROOT / "scripts" / "build-bosses.py")
bosses = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bosses)

ART = {
    "cs_warden_face": {"kind": "portrait", "source": "warden_face.jpg", "size": 256},
    "cs_vesper_face": {"kind": "portrait", "source": "vesper_face.jpg", "size": 256},
    "cs_vesper": {"kind": "sheet", "source": "vesper_idle.jpg", "grid": (3, 2), "frame": (240, 270), "reach": 128},
    "cs_plate_lid": {"kind": "plate", "source": "plate_lid.jpg", "height": 1280},
}

PORTRAIT_MARGIN = 0.04  # of the square kept clear around the character
PLATE_QUALITY = 86


def report(path: Path, img: Image.Image) -> None:
    print(f"  {path.relative_to(ROOT)} {img.width}x{img.height}, {path.stat().st_size} bytes")


def portrait(name: str, spec: dict) -> None:
    img = bosses.keep_main(bosses.remove_white_background(Image.open(SRC / spec["source"])))
    box = bosses.silhouette(img).getbbox()
    if not box:
        raise SystemExit(f"{name}: the portrait is empty")
    art = img.crop(box)
    size = spec["size"]
    inner = round(size * (1 - 2 * PORTRAIT_MARGIN))
    k = inner / max(art.width, art.height)
    art = art.resize((max(1, round(art.width * k)), max(1, round(art.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Sat on the bottom edge, as a bust is, and centred across.
    out.paste(art, ((size - art.width) // 2, size - round(size * PORTRAIT_MARGIN) - art.height))
    path = OUT / f"{name}.png"
    out.save(path, optimize=True)
    report(path, out)


def sheet(name: str, spec: dict) -> None:
    cols, rows = spec["grid"]
    reach = spec.get("reach", bosses.REACH)
    cut = [bosses.keep_main(c) for c in bosses.cells(bosses.remove_white_background(Image.open(SRC / spec["source"])), cols, rows)]
    masks = [bosses.silhouette(c) for c in cut]
    slides = [(0, 0)] + [bosses.register(masks[0], m, reach) for m in masks[1:]]
    if any(max(abs(dx), abs(dy)) >= reach for dx, dy in slides):
        raise SystemExit(f"{name}: a cell needs sliding by its reach or more; raise it or check the grid")
    print("  slides " + " ".join(f"{dx:+d},{dy:+d}" for dx, dy in slides))
    placed = []
    for cell, (dx, dy) in zip(cut, slides):
        canvas = Image.new("RGBA", (cell.width + 2 * reach, cell.height + 2 * reach), (0, 0, 0, 0))
        canvas.paste(cell, (reach + dx, reach + dy))
        placed.append(canvas)
    union = Image.new("L", placed[0].size, 0)
    for canvas in placed:
        union = ImageChops.lighter(union, bosses.silhouette(canvas))
    box = union.getbbox()
    if not box:
        raise SystemExit(f"{name}: the sheet is empty")
    bw, bh = box[2] - box[0], box[3] - box[1]
    fw, fh = spec["frame"]
    margin = bosses.FRAME_MARGIN
    scale = min((fw - 2 * margin) / bw, (fh - 2 * margin) / bh)
    size = (round(bw * scale), round(bh * scale))
    out = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, canvas in enumerate(placed):
        art = canvas.crop(box).resize(size, Image.LANCZOS)
        out.paste(art, ((i % cols) * fw + (fw - size[0]) // 2, (i // cols) * fh + (fh - size[1]) // 2))
    path = OUT / f"{name}.png"
    out.save(path, optimize=True)
    report(path, out)


def plate(name: str, spec: dict) -> None:
    img = Image.open(SRC / spec["source"]).convert("RGB")
    h = spec["height"]
    img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    path = OUT / f"{name}.jpg"
    img.save(path, quality=PLATE_QUALITY, optimize=True, progressive=True)
    report(path, img)


KINDS = {"portrait": portrait, "sheet": sheet, "plate": plate}


def main() -> None:
    wanted = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, spec in ART.items():
        if wanted and name not in wanted:
            continue
        print(name)
        KINDS[spec["kind"]](name, spec)


if __name__ == "__main__":
    main()
