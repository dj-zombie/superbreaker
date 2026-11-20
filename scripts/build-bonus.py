#!/usr/bin/env python3
"""Cuts the generated bonus stage sheets in art-src/bonus/ into the sprites the game loads.

A sheet is a grid of separate sprites on a flat white background, cut the way process-art.py
cuts its sheets: the background flood-filled away from the border, each cell trimmed to its
sprite and fitted, aspect kept, into the size the game draws it from.

Usage: python3 scripts/build-bonus.py   (requires Pillow)
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("process_art", HERE / "process-art.py")
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)

# The shooting gallery's targets on top, the tally's medals below. Names are texture keys.
GALLERY = [
    "assets/images/bonus/target_duck.png",
    "assets/images/bonus/target_bag.png",
    "assets/images/bonus/target_cat.png",
    "assets/images/bonus/medal_bronze.png",
    "assets/images/bonus/medal_silver.png",
    "assets/images/bonus/medal_gold.png",
]


def main() -> None:
    art.SRC = HERE.parent / "art-src" / "bonus"
    art.sheet("gallery.jpg", 3, 2, GALLERY, (256, 256), keep_aspect=True)


if __name__ == "__main__":
    main()
