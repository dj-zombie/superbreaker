#!/usr/bin/env python3
"""Cuts the generated bonus stage sheets in art-src/bonus/ into the sprites the game loads.

A sheet is a grid of separate sprites on a flat white background, cut the way process-art.py
cuts its sheets: the background flood-filled away from the border, each cell trimmed to its
sprite and fitted, aspect kept, into the size the game draws it from.

The jack-in-the-box's poses are cut differently: one scale for all of them, each on the same
canvas with the bottom middle of the box at the bottom middle, then cut again into the parts the
game animates (box, lid, spring, heads, crank), each left on that canvas so they line up.

Usage: python3 scripts/build-bonus.py   (requires Pillow)
"""
import importlib.util
from pathlib import Path

from PIL import Image

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

# The gallery's gun is drawn from three poses, row by row: ready, firing, jammed. The fourth cell
# is not used. The poses are cut into parts the game animates, all on the poses' shared canvas so
# they line up drawn at the same place. Points below are pixels on that canvas.
JACK_SCALE = 0.75
# The box's feet are in this bottom share of each pose; their middle is the anchor.
JACK_FEET = 0.12
JACK_DIR = "assets/images/bonus"
# The open box's mouth: its left, front and right corners on the inside of the rim.
RIM_L, RIM_F, RIM_R = (60, 183), (142, 200), (220, 186)
# The clown's head is above this line; the spring runs from it down into the box.
NECK_Y = 131
HEAD_RIGHT = 178
SPRING_X = (113, 151)
SPRING_BOTTOM = 200
# The open lid, over the hinge from its left end to its right.
LID = [(190, 98), (282, 106), (238, 190), (150, 175)]
HINGE = ((157, 170), (230, 185))
# The crank's bend and handle hang off the box's side, below its axle.
CRANK_X = 230
CRANK_TOP = {"closed": 241, "open": 245}
# The jammed pose's head: its ruff hangs to "bottom" left of the spring and to "neck" over it;
# "shift" moves it so its neck meets the spring.
DAZED = {"bottom": 140, "spring": (100, 145), "neck": 114, "shift": (7, 13)}
# Nothing of the open box is above its back rim.
BOX_TOP = 160
PUFF = (0, 98, 50, 162)


def below(p: tuple, q: tuple, x: float, y: float) -> bool:
    """Whether (x, y) is under the line through p and q."""
    (x0, y0), (x1, y1) = p, q
    return y > y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def inside(poly: list, x: float, y: float) -> bool:
    """Whether (x, y) is inside the polygon (even-odd rule)."""
    hit = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0):
            hit = not hit
    return hit


def front_of_mouth(x: int, y: int) -> bool:
    """Whether a box pixel is in front of the open mouth: its front rim and everything under it."""
    if x < RIM_L[0]:
        return y >= RIM_L[1] - 3
    if x > RIM_R[0]:
        return y >= RIM_R[1] - 3
    return below(RIM_L, RIM_F, x, y) if x <= RIM_F[0] else below(RIM_F, RIM_R, x, y)


def keep(img: Image.Image, test) -> Image.Image:
    """A copy of img with only the pixels test(x, y) passes."""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    src, dst = img.load(), out.load()
    for y in range(img.height):
        for x in range(img.width):
            if test(x, y):
                dst[x, y] = src[x, y]
    return out


def open_box(popped: Image.Image) -> Image.Image:
    """The open box without its clown, spring, lid or crank: the hole the spring leaves patched."""
    box = keep(
        popped,
        lambda x, y: y >= BOX_TOP
        and not (inside(LID, x, y) and not below(*HINGE, x, y))
        and not (x >= CRANK_X and y >= CRANK_TOP["open"]),
    )
    px, src = box.load(), popped.load()
    x0, x1 = SPRING_X[0] - 5, SPRING_X[1] + 4
    for y in range(BOX_TOP, SPRING_BOTTOM + 1):
        for x in range(x0, x1):
            if front_of_mouth(x, y):
                continue
            if y < 167:
                px[x, y] = (0, 0, 0, 0)
            elif y < 179:
                # The back rim behind the spring: copied along the rim from beside it.
                sx, sy = (x - 40, y + 7) if x < 140 else (x + 40, y + 8)
                px[x, y] = src[sx, sy]
            else:
                # The dark inside of the box: blended across from either side of the spring.
                t = (x - x0) / (x1 - x0)
                a, b = src[x0 - 1, y], src[x1, y]
                px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return box


def jack_parts(closed: Image.Image, popped: Image.Image, jammed: Image.Image) -> None:
    part = lambda img, name: art.save(img, f"{JACK_DIR}/jack_{name}.png")
    part(keep(closed, lambda x, y: not (x >= CRANK_X and y >= CRANK_TOP["closed"])), "closed")
    part(keep(closed, lambda x, y: x >= CRANK_X and y >= CRANK_TOP["closed"]), "crank")
    part(keep(popped, lambda x, y: x >= CRANK_X and y >= CRANK_TOP["open"]), "crank_open")
    box = open_box(popped)
    part(box, "open")
    part(keep(box, front_of_mouth), "front")
    part(keep(popped, lambda x, y: inside(LID, x, y) and not below(*HINGE, x, y)), "lid")
    part(keep(popped, lambda x, y: y < NECK_Y and x < HEAD_RIGHT), "head")
    part(
        keep(popped, lambda x, y: NECK_Y - 2 <= y <= SPRING_BOTTOM and SPRING_X[0] <= x < SPRING_X[1]),
        "spring",
    )
    dx, dy = DAZED["shift"]
    l, t, r, b = PUFF
    s0, s1 = DAZED["spring"]
    head = keep(
        jammed,
        lambda x, y: (y < DAZED["bottom"] if x < s0 else y < DAZED["neck"] if x < s1 else False)
        and not (l <= x < r and t <= y < b),
    )
    dazed = Image.new("RGBA", jammed.size, (0, 0, 0, 0))
    dazed.paste(head, (dx, dy), head)
    part(dazed, "dazed")
    puff = keep(jammed, lambda x, y: l <= x < r and t <= y < b)
    moved = Image.new("RGBA", jammed.size, (0, 0, 0, 0))
    moved.paste(puff, (dx, dy), puff)
    part(moved, "puff")


def feet_x(img: Image.Image) -> float:
    """The middle of what is opaque along the bottom of a trimmed pose: the box's base."""
    alpha = img.getchannel("A")
    rows = range(int(img.height * (1 - JACK_FEET)), img.height)
    xs = [x for y in rows for x in range(img.width) if alpha.getpixel((x, y)) > 128]
    return sum(xs) / len(xs) if xs else img.width / 2


def jack() -> None:
    print("jack.jpg")
    sheet = art.remove_white_background(Image.open(art.SRC / "jack.jpg"))
    poses = []
    for cell in list(art.cells(sheet, 2, 2))[:3]:
        pose = art.trim(cell)
        pose = pose.resize((round(pose.width * JACK_SCALE), round(pose.height * JACK_SCALE)), Image.LANCZOS)
        poses.append((pose, feet_x(pose)))
    reach = max(max(fx, pose.width - fx) for pose, fx in poses)
    width = 2 * round(reach)
    height = max(pose.height for pose, _ in poses)
    canvases = []
    for pose, fx in poses:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(pose, (round(width / 2 - fx), height - pose.height), pose)
        canvases.append(canvas)
    jack_parts(*canvases)


def main() -> None:
    art.SRC = HERE.parent / "art-src" / "bonus"
    art.sheet("gallery.jpg", 3, 2, GALLERY, (256, 256), keep_aspect=True)
    jack()


if __name__ == "__main__":
    main()
