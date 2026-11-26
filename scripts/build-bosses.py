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

A boss drawn as a rig (src/systems/BossRig.ts) is built from several sources instead, into
public/assets/images/bosses/<id>/: single pieces trimmed to their content, frame sheets cut as
above, loose effect sprites cut from a grid, and a cage split into the bars that break off. The
pieces of one assembly are cut on one canvas, so they line up drawn at one place. RIGS says what
each source becomes; the boss's rig in src/bosses/ names the sizes and points it relies on.

Usage: python3 scripts/build-bosses.py [boss ...]   (requires Pillow)
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src" / "bosses"
OUT = ROOT / "public" / "assets" / "images" / "bosses"

# Each boss: its source sheet, the grid (columns, rows) it is drawn on, and the size of one
# frame in the output, which is what the boss's SpriteDef in src/bosses/ names. The Warden is
# animated from Ludo takes now, by scripts/build-sprite-anims.py; art-src/bosses/warden.jpg is the pose
# those takes started from.
BOSSES = {}

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


def register(ref: Image.Image, mask: Image.Image, reach: int = REACH) -> tuple[int, int]:
    """The whole-pixel slide that lays `mask` over `ref` best: a coarse pass, then a fine one."""

    def best(offsets: list[tuple[int, int]]) -> tuple[int, int]:
        return max(offsets, key=lambda o: overlap(ref, mask, o[0], o[1]))

    step = COARSE * max(1, reach // REACH)
    coarse = range(-reach, reach + 1, step)
    cx, cy = best([(dx, dy) for dy in coarse for dx in coarse])
    fine = range(-step + 1, step)
    return best([(cx + dx, cy + dy) for dy in fine for dx in fine])


def keep_main(img: Image.Image, share: float = 0.02) -> Image.Image:
    """Drops specks a cell caught from its neighbours: every patch under `share` of the largest."""
    import numpy as np

    a = np.asarray(img).copy()
    solid = a[..., 3] > ALPHA_FLOOR
    h, w = solid.shape
    label = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(solid)):
        if label[y0, x0]:
            continue
        n = len(sizes)
        label[y0, x0] = n
        queue = deque([(y0, x0)])
        size = 0
        while queue:
            y, x = queue.popleft()
            size += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    queue.append((ny, nx))
        sizes.append(size)
    if len(sizes) <= 2:
        return img
    small = [i for i, size in enumerate(sizes) if i and size < share * max(sizes)]
    a[np.isin(label, small)] = 0
    return Image.fromarray(a, "RGBA")


def open_source(source: str | list[str]) -> Image.Image:
    """A source sheet, or several of the same width stacked top to bottom as one taller sheet."""
    if isinstance(source, str):
        return Image.open(SRC / source)
    parts = [Image.open(SRC / s).convert("RGB") for s in source]
    out = Image.new("RGB", (parts[0].width, sum(p.height for p in parts)), "white")
    y = 0
    for p in parts:
        out.paste(p, (0, y))
        y += p.height
    return out


def build(
    boss: str, source: str | list[str], grid: tuple[int, int], frame: tuple[int, int], reach: int = REACH,
    clean: bool = False, share: float = 0.02, enclosed: tuple[int, int] | None = None,
) -> None:
    print(boss)
    cols, rows = grid
    img = remove_white_background(open_source(source))
    if enclosed:
        img = remove_enclosed_white(img, *enclosed)
    cut = cells(img, cols, rows)
    if clean:
        cut = [keep_main(c, share) for c in cut]
    masks = [silhouette(c) for c in cut]
    slides = [(0, 0)] + [register(masks[0], m, reach) for m in masks[1:]]
    if any(max(abs(dx), abs(dy)) >= reach for dx, dy in slides):
        raise SystemExit(f"{boss}: a cell needs sliding by REACH or more; check the sheet's grid")
    print("  slides " + " ".join(f"{dx:+d},{dy:+d}" for dx, dy in slides))

    # Each cell on a canvas with room for its slide, so nothing is cut off by moving it.
    placed = []
    for cell, (dx, dy) in zip(cut, slides):
        canvas = Image.new("RGBA", (cell.width + 2 * reach, cell.height + 2 * reach), (0, 0, 0, 0))
        canvas.paste(cell, (reach + dx, reach + dy))
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


def remove_enclosed_white(img: Image.Image, floor: int = 244, least: int = 40) -> Image.Image:
    """Clears pure white the border fill could not reach: the inside of a cage or of a hook's
    loop. Only patches of at least `least` px, all brighter than `floor`, so a highlight stays."""
    import numpy as np

    a = np.asarray(img).copy()
    white = (a[..., :3].min(axis=2) >= floor) & (a[..., 3] > 0)
    h, w = white.shape
    seen = np.zeros_like(white)
    for y0, x0 in zip(*np.nonzero(white)):
        if seen[y0, x0]:
            continue
        patch = []
        queue = deque([(y0, x0)])
        seen[y0, x0] = True
        while queue:
            y, x = queue.popleft()
            patch.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        if len(patch) >= least:
            ys, xs = zip(*patch)
            a[ys, xs, 3] = 0
    out = Image.fromarray(a, "RGBA")
    # The same soft edge as the border fill leaves.
    alpha = out.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(ImageChops.darker(alpha, out.getchannel("A")))
    return out


def keyed(source: str) -> Image.Image:
    return remove_enclosed_white(remove_white_background(Image.open(SRC / source)))


def save(img: Image.Image, folder: Path, name: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)} {img.width}x{img.height}, {path.stat().st_size} bytes")


def scaled_to(img: Image.Image, width: int) -> Image.Image:
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def rig_piece(folder: Path, spec: dict) -> None:
    """One picture, trimmed to its content and scaled to `width`."""
    img = keyed(spec["source"])
    img = img.crop(silhouette(img).getbbox())
    save(scaled_to(img, spec["width"]), folder, spec["out"])


def rig_sheet(folder: Path, spec: dict) -> None:
    """Frames of one thing, cut as a boss sheet is: registered on the first and cropped together."""
    global OUT
    was = OUT
    OUT = folder
    try:
        build(
            spec["out"], spec["source"], spec["grid"], spec["frame"], spec.get("reach", REACH), clean=True,
            share=spec.get("share", 0.02), enclosed=spec.get("enclosed"),
        )
    finally:
        OUT = was


def rig_loose(folder: Path, spec: dict) -> None:
    """A grid of unrelated sprites: each trimmed on its own and fitted in a `size` square."""
    cols, rows = spec["grid"]
    cut = cells(keyed(spec["source"]), cols, rows)
    for cell, name in zip(cut, spec["names"]):
        if name is None:
            continue
        art = cell.crop(silhouette(cell).getbbox())
        scale = spec["size"] / max(art.size)
        save(art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS), folder, f"{name}.png")


def rig_bars(folder: Path, spec: dict) -> None:
    """A cage split into its cap and its bars, every piece on the cage's own canvas.

    Rows between the cap and the base where the bars stand apart name each bar's centre; every
    opaque pixel of the bars goes to the bar whose centre is nearest on its row, and the base to
    the bar nearest at the bottom. What lies above `cap` (a share of the height) is the cap.
    """
    import numpy as np

    img = keyed(spec["source"])
    img = scaled_to(img.crop(silhouette(img).getbbox()), spec["width"])
    a = np.asarray(img)
    h, w = a.shape[:2]
    solid = a[..., 3] > ALPHA_FLOOR
    count = spec["bars"]
    cap_end, base_start = round(spec["cap"] * h), round(spec["base"] * h)
    centres: dict[int, list[float]] = {}
    for y in range(cap_end, base_start):
        row = np.concatenate([[False], solid[y], [False]]).astype(np.int8)
        edges = np.flatnonzero(np.diff(row))
        runs = list(zip(edges[::2], edges[1::2]))
        if len(runs) == count:
            centres[y] = [(x0 + x1 - 1) / 2 for x0, x1 in runs]
    if not centres:
        raise SystemExit(f"{spec['source']}: no row shows {count} bars apart")
    known = np.array(sorted(centres))
    owner = np.full((h, w), -1, dtype=np.int8)
    xs = np.arange(w)
    for y in range(cap_end, h):
        near = known[np.abs(known - min(y, base_start - 1)).argmin()]
        c = np.array(centres[int(near)])
        owner[y] = np.abs(xs[:, None] - c[None, :]).argmin(axis=1)
    owner[:cap_end] = count
    names = [f"{spec['out']}_bar{i + 1}.png" for i in range(count)] + [f"{spec['out']}_cap.png"]
    mid = known[len(known) // 2]
    print(f"  {w}x{h}, cap to {cap_end}, base from {base_start}, bar centres at row {mid}: "
          + " ".join(f"{x:.0f}" for x in centres[int(mid)]))
    for i, name in enumerate(names):
        piece = a.copy()
        piece[owner != i] = 0
        save(Image.fromarray(piece, "RGBA"), folder, name)


RIG_PARTS = {"piece": rig_piece, "sheet": rig_sheet, "loose": rig_loose, "bars": rig_bars}

# Each rigged boss: what every source becomes. Widths are twice the size on the field.
RIGS = {
    "crucible": [
        {"kind": "piece", "source": "crucible/torso.jpg", "out": "torso.png", "width": 520},
        {"kind": "bars", "source": "crucible/cage.jpg", "out": "cage", "width": 260, "bars": 4,
         "cap": 0.25, "base": 0.86},
        # The second sheet is in-betweens: a squeeze, eyes half open, a snarl, the widest scream,
        # a cracked flinch and half-way to white-hot.
        {"kind": "sheet", "source": ["crucible/heart.jpg", "crucible/heart_b.jpg"], "out": "heart", "grid": (3, 4),
         "frame": (180, 220), "reach": 128},
        {"kind": "loose", "source": "crucible/fx.jpg", "grid": (3, 2), "size": 96,
         "names": ["slag", "splash", "dart", "chunk", "shard", "rivet"]},
    ],
    # The head is a big texture, so it is cut at 1.5 times its size on the field, not 2.
    "angler": [
        # Shut, gaping on its green throat, flinching, dead.
        # `enclosed` clears the white caught between tentacle loops (brighter than, and at least, px).
        {"kind": "sheet", "source": "angler/head.jpg", "out": "head", "grid": (2, 2), "frame": (630, 480),
         "reach": 128, "enclosed": (215, 6)},
        # Vesper on the stalk: calm, flaring, split open, recoiling, dark, shattering. `share` drops
        # the strip of the next figure a cell catches.
        {"kind": "sheet", "source": "angler/lure.jpg", "out": "lure", "grid": (3, 2), "frame": (200, 230),
         "reach": 192, "share": 0.12},
        # A cryo-pod: sealed, cracked, bursting, empty.
        {"kind": "sheet", "source": "angler/pod.jpg", "out": "pod", "grid": (4, 1), "frame": (120, 300),
         "reach": 64, "enclosed": (215, 6)},
        {"kind": "loose", "source": "angler/fx.jpg", "grid": (3, 2), "size": 96,
         "names": ["wisp", "decoy", "ink", "skull", "splash", "shard"]},
    ],
    "overseer": [
        # The ring of cameras round the empty socket: lit, glaring, broken open, dead. Cut at 1.5
        # times its size on the field, as the angler's head is.
        {"kind": "sheet", "source": "overseer/housing.jpg", "out": "housing", "grid": (2, 2), "frame": (450, 480),
         "reach": 96, "enclosed": (215, 6)},
        # The eye in the socket: calm, focusing red, cracked and glitching, dead.
        {"kind": "sheet", "source": "overseer/iris.jpg", "out": "iris", "grid": (2, 2), "frame": (300, 300),
         "reach": 96},
        # One leaf of the shutter, point down; the rig turns four of them to the diagonals.
        {"kind": "piece", "source": "overseer/shutter.jpg", "out": "shutter.png", "width": 240},
        # The Mirror: idle, frozen by a stun, glitching, dissolving into Vesper's light. The frame
        # is wide for the frost and the light spilling past the capsule.
        {"kind": "sheet", "source": "overseer/mirror.jpg", "out": "mirror", "grid": (1, 4), "frame": (340, 120),
         "reach": 64},
        {"kind": "loose", "source": "overseer/fx.jpg", "grid": (3, 2), "size": 96,
         "names": ["packet", "skull", "decoy", "slag", "splash", "shard"]},
    ],
}


def main() -> None:
    wanted = set(sys.argv[1:])
    for boss, spec in BOSSES.items():
        if not wanted or boss in wanted:
            build(boss, spec["source"], spec["grid"], spec["frame"])
    for boss, parts in RIGS.items():
        if wanted and boss not in wanted:
            continue
        print(boss)
        for spec in parts:
            RIG_PARTS[spec["kind"]](OUT / boss, spec)


if __name__ == "__main__":
    main()
