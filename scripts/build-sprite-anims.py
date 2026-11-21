#!/usr/bin/env python3
"""Builds the long, smooth animations from the Ludo AI takes in art-src/ludo/.

Every take is a grid of transparent frames, saved at half the size Ludo made it. The Ludo
commands that made them (`ludo sprite animate`, `ludo sprite animate-keyframes`; Griffin for the
Warden and Vesper, Hydra for the coin) started from the old art, upscaled 4x by
`ludo image upscale`, and used True Size (`--frame-size -9`), so a take lines up with the frame
it started from:

  warden_idle    Griffin 5s from the rest pose: "menacing idle: hovering in place, slowly breathing"
  warden_tell    Griffin keyframes charge, flare, charge: the chest core gathers fire, sparks crackle
  warden_open    Griffin 5s from the open pose: the exposed molten core throbs and flares
  warden_hurt    the old flinch frame alone, upscaled
  warden_death   Griffin keyframes cracked to crumbled: the eye flickers out, the armour falls apart
  warden_broken  Griffin 5s from the cracked pose: swaying, sparks sputtering, the eye flickering
  vesper_idle    Griffin 5s: floating, the lantern swaying, robe and wisps drifting
  coin_spin      Hydra 3s from a face-on coin made with `ludo image create`

The Warden's takes share one canvas, the 1152x864 frame they were made on widened 24 px to each
side and 48 px up for the death's debris, halved here to 600x456. src/bosses/warden.ts places it.

What the game gets:

  images/bosses/warden.json         an atlas of the fight's animations, frames numbered in the
                                    order of WARDEN, each trimmed to its content and packed onto
                                    WebP pages; Phaser puts the trim back, so frames line up
  images/cutscenes/cs_warden.json   the same for Chapter II's broken Warden
  images/cutscenes/cs_vesper.webp   a sheet of equal frames
  images/powerups/coins.png         a sheet of equal frames

A loop keeps the stretch of its take that meets itself best (`toolbox sprite loop` and a frame
diff chose them), and the frame counts and rates printed here are the ones the game's animation
tables name.

Usage: python3 scripts/build-sprite-anims.py   (requires Pillow)
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "ludo"
OUT = ROOT / "public" / "assets" / "images"

# Each take: its grid (columns, frames) and the frame rate Ludo rendered it at.
TAKES = {
    "warden_idle": (8, 64, 14.49),
    "warden_tell": (8, 64, 22.93),
    "warden_open": (8, 64, 15.36),
    "warden_hurt": (1, 1, 1),
    "warden_death": (8, 64, 20.76),
    "warden_broken": (8, 64, 14.36),
    "vesper_idle": (8, 64, 13.47),
    "coin_spin": (7, 49, 20.63),
}

# The fight, in atlas order: take and the frames kept, as a slice.
WARDEN = [
    ("idle", "warden_idle", slice(16, 53)),
    ("tell", "warden_tell", slice(0, 64)),
    ("open", "warden_open", slice(12, 52)),
    ("hurt", "warden_hurt", slice(0, 1)),
    ("death", "warden_death", slice(0, 64)),
]
WARDEN_FRAME = (400, 304)  # a third of the canvas Ludo drew on
# Chapter II's Warden, on its own atlas so the cutscene need not load the fight's: broken, then
# as much of the crumble as plays before it falls out of shot.
CS_WARDEN = [
    ("broken", "warden_broken", slice(0, 64)),
    ("crumble", "warden_death", slice(0, 48)),
]
VESPER = ("vesper_idle", slice(25, 58), (260, 348))
COIN = ("coin_spin", slice(5, 32), (48, 48))

PAGE = 2048  # every device takes a texture this big
PAD = 2  # clear px around each packed frame, so filtering never reaches a neighbour
ALPHA_FLOOR = 2  # alpha this low or under is trimmed away
WEBP_QUALITY = 90


def take(name: str, keep: slice, size: tuple[int, int]) -> list[Image.Image]:
    cols, count, _ = TAKES[name]
    sheet = Image.open(SRC / f"{name}.webp").convert("RGBA")
    rows = (count + cols - 1) // cols
    w, h = sheet.width // cols, sheet.height // rows
    frames = [sheet.crop(((i % cols) * w, (i // cols) * h, (i % cols + 1) * w, (i // cols + 1) * h)) for i in range(count)]
    return [f.resize(size, Image.LANCZOS) for f in frames[keep]]


def pack(frames: list[Image.Image]) -> list[list[tuple[int, Image.Image, tuple[int, int, int, int], tuple[int, int]]]]:
    """Trims every frame and shelf-packs them, tallest first, onto as few pages as it takes."""
    trimmed = []
    for i, f in enumerate(frames):
        box = f.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0).getbbox() or (0, 0, 1, 1)
        trimmed.append((i, f.crop(box), box))
    order = sorted(trimmed, key=lambda t: (-t[1].height, -t[1].width))
    pages: list[list] = [[]]
    x = y = shelf = 0
    for i, art, box in order:
        w, h = art.width + 2 * PAD, art.height + 2 * PAD
        if x + w > PAGE:
            x, y, shelf = 0, y + shelf, 0
        if y + h > PAGE:
            pages.append([])
            x = y = shelf = 0
        pages[-1].append((i, art, box, (x + PAD, y + PAD)))
        x += w
        shelf = max(shelf, h)
    return pages


def atlas(path: Path, frames: list[Image.Image]) -> None:
    """A Phaser multi-atlas: frames named "0", "1", ... in order, trimmed, on WebP pages."""
    fw, fh = frames[0].size
    textures = []
    for p, page in enumerate(pack(frames)):
        height = max(at[1] + art.height + PAD for _, art, _, at in page)
        canvas = Image.new("RGBA", (PAGE, height), (0, 0, 0, 0))
        entries = []
        for i, art, box, (x, y) in sorted(page, key=lambda e: e[0]):
            canvas.paste(art, (x, y))
            entries.append({
                "filename": str(i),
                "rotated": False,
                "trimmed": True,
                "sourceSize": {"w": fw, "h": fh},
                "spriteSourceSize": {"x": box[0], "y": box[1], "w": art.width, "h": art.height},
                "frame": {"x": x, "y": y, "w": art.width, "h": art.height},
            })
        image = f"{path.stem}-{p}.webp"
        canvas.save(path.parent / image, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=4)
        textures.append({"image": image, "format": "RGBA8888", "size": {"w": PAGE, "h": height}, "scale": 1,
                         "frames": entries})
        mb = PAGE * height * 4 / 2**20
        print(f"  {image} {PAGE}x{height} ({mb:.0f} MB on the GPU), {len(entries)} frames, "
              f"{(path.parent / image).stat().st_size} bytes")
    for old in path.parent.glob(f"{path.stem}-*.webp"):
        if old.name not in {t["image"] for t in textures}:
            old.unlink()
    path.write_text(json.dumps({"textures": textures, "meta": {"app": "scripts/build-sprite-anims.py"}}, separators=(",", ":")))
    print(f"  {path.relative_to(ROOT)}: {len(frames)} frames of {fw}x{fh}")


def sheet(path: Path, frames: list[Image.Image], cols: int) -> None:
    fw, fh = frames[0].size
    rows = (len(frames) + cols - 1) // cols
    out = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * fw, (i // cols) * fh))
    if path.suffix == ".webp":
        out.save(path, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=4)
    else:
        out.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)} {out.width}x{out.height}: {len(frames)} frames of {fw}x{fh}, "
          f"{path.stat().st_size} bytes")


def rate(name: str) -> str:
    return f"{TAKES[name][2]:g} fps"


def main() -> None:
    print("warden")
    frames: list[Image.Image] = []
    for anim, name, keep in WARDEN:
        part = take(name, keep, WARDEN_FRAME)
        print(f"  {anim}: frames {len(frames)}..{len(frames) + len(part) - 1} at {rate(name)}")
        frames += part
    atlas(OUT / "bosses" / "warden.json", frames)

    print("warden, cutscene")
    frames = []
    for anim, name, keep in CS_WARDEN:
        part = take(name, keep, WARDEN_FRAME)
        print(f"  {anim}: frames {len(frames)}..{len(frames) + len(part) - 1} at {rate(name)}")
        frames += part
    atlas(OUT / "cutscenes" / "cs_warden.json", frames)

    name, keep, size = VESPER
    print(f"vesper at {rate(name)}")
    sheet(OUT / "cutscenes" / "cs_vesper.webp", take(name, keep, size), 8)

    name, keep, size = COIN
    print(f"coin at {rate(name)}")
    sheet(OUT / "powerups" / "coins.png", take(name, keep, size), 9)


if __name__ == "__main__":
    main()
