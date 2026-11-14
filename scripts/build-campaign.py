#!/usr/bin/env python3
"""Build the 30-level campaign.

Level 24 (Demolition) is hand-authored and is never rewritten. The first run
copies the previous maps to archive/levels/.

Only the `Bricks` layer and the `title` property are generated. Everything else authored in
Tiled survives a rebuild: the `Lights` layer and any other layers, extra map properties (such
as `LevelLighting`'s `lightsOut`), the map class and extra tilesets.

  python3 scripts/build-campaign.py

Curriculum, so a new mechanic is the lesson of one level before it gets mixed:
  1-5   normal bricks only, open shapes
  6-8   steel as bumpers and one real doorway
  9-12  explosives, spaced so a blast is a moment and not the whole level
  13-16 armored bricks, always with a way through that isn't pure grinding
  17-20 moving bricks, slow first
  21-23 regen clusters small enough to finish, with a bomb as the other answer
  24    Demolition, unchanged
  25-30 the same toys combined into set pieces

Playfield rules baked into the checks:
  bricks are 30x16, the ball is 22px across, blasts reach about 2 columns and 3 rows,
  and a passage the ball must fly through needs roughly 3 rows by 2 columns of air.

Shape rules, so a level fills the capped arena instead of hugging the ceiling:
  every formation spans at least 16 rows and stays in rows 0-28 (bottom edge y <= 464),
  usually as three bands: a near layer for quick breaks, a mid structure built from the
  chapter's mechanic, and a prize band at the top reached through 2-column lanes.
"""

from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEVELS = ROOT / "public" / "assets" / "levels"
ARCHIVE = ROOT / "archive" / "levels"

COLS = 20
BW, BH = 30, 16
FIELD_W = 600
BALL_R = 11
BLAST_R2 = 52 * 52
STEP = 2
# Smallest arena (src/core/Layout.ts ARENA_MIN) minus the gap above the first row.
FLOOD_H = 640 - 12
MAX_ROW = 28
MIN_SPAN = 16
MIN_BREAKABLE, MAX_BREAKABLE = 55, 110

# Tile gids in bricks.tsj (firstgid 1). 1-16 are colors, then the mechanic tiles.
STEEL, EXP, ARM, REG = 17, 18, 19, 20
RAINBOW = [9, 5, 15, 3, 1, 8, 7, 11]
OCEAN = [1, 2, 11, 12, 3, 4]
SUNSET = [9, 10, 5, 6, 15, 16]
CANDY = [7, 8, 15, 13, 5, 1]
FOREST = [3, 4, 11, 15, 1, 2]
GOLD = [15, 16, 5, 6, 13, 9]
NEON = [11, 7, 15, 9, 8, 1]
ICE = [13, 1, 11, 2, 14, 8]
ROSE = [7, 9, 10, 8, 15, 5]
PURPLE = [8, 7, 1, 13, 11]

KIND = {
    "#": "normal",
    "S": "steel",
    "X": "explosive",
    "A": "armored",
    "R": "regen",
    "M": "normal",
    "W": "steel",
    "B": "armored",
}
POWER = {
    "o": "coin",
    "g": "bigger",
    "s": "smaller",
    "u": "balls",
    "m": "magnet",
    "f": "fireball",
    "l": "laser",
    "h": "shield",
    "y": "hyper",
    "p": "pierce",
    "e": "extraLife",
    "q": "mystery",
}
MOVER = {"M", "W", "B"}


def grid(rows: int) -> list[list[str]]:
    return [["."] * COLS for _ in range(rows)]


def fill(g: list[list[str]], r: int, c: int, h: int, w: int, ch: str) -> None:
    for y in range(r, r + h):
        for x in range(c, c + w):
            if not (0 <= y < len(g) and 0 <= x < COLS):
                raise SystemExit(f"fill {ch!r} out of bounds at {y},{x}")
            g[y][x] = ch


def art(text: str) -> list[list[str]]:
    lines = text.strip("\n").split("\n")
    g: list[list[str]] = []
    for i, line in enumerate(lines):
        if len(line) != COLS:
            raise SystemExit(f"art line {i} is {len(line)} chars: {line!r}")
        g.append(list(line))
    return g


def drop(g: list[list[str]], r: int, c: int, ch: str) -> None:
    if g[r][c] != "#":
        raise SystemExit(f"powerup {ch!r} at {r},{c} sits on {g[r][c]!r}, wanted a normal brick")
    g[r][c] = ch


class Level:
    def __init__(
        self,
        num: int,
        title: str,
        g: list[list[str]],
        palette: list[int],
        color: str = "row",
        moves: dict[tuple[int, int], tuple[float, float]] | None = None,
        bonus: dict[tuple[int, int], str] | None = None,
        regen_delay: float = 4.0,
        armor: dict[tuple[int, int], int] | None = None,
        glow: dict[tuple[int, int], tuple[str, float, float]] | None = None,
        lights_out: bool = False,
        lightning: bool = False,
    ) -> None:
        self.num = num
        self.title = title
        self.g = g
        self.palette = palette
        self.color = color
        self.moves = moves or {}
        self.bonus = bonus or {}
        self.regen_delay = regen_delay
        self.armor = armor or {}
        # Emissive bricks: (color #AARRGGBB, radius, intensity). Lights-out levels lean on them.
        self.glow = glow or {}
        self.lights_out = lights_out
        # Strikes show the layout for a moment; the interval is LevelLighting's default.
        self.lightning = lightning


def kind_of(ch: str) -> str:
    if ch in POWER:
        return "normal"
    if ch not in KIND:
        raise SystemExit(f"unknown cell {ch!r}")
    return KIND[ch]


def power_of(ch: str, bonus: str | None) -> str | None:
    if bonus:
        return bonus
    return POWER.get(ch)


# ---------------------------------------------------------------- levels


def level_first_light() -> Level:
    """A sunrise. The horizon is what you hit first; the sun is the prize once you slip through."""
    g = grid(24)
    for r, w in zip(range(2, 7), (6, 10, 12, 10, 6)):
        fill(g, r, (COLS - w) // 2, 1, w, "#")
    for c in (2, 16):
        fill(g, 10, c, 1, 2, "#")
    for c in (6, 12):
        fill(g, 13, c, 1, 2, "#")
    for c in (0, 8, 16):
        fill(g, 21, c, 2, 4, "#")
    drop(g, 4, 9, "o")
    drop(g, 22, 1, "u")
    drop(g, 22, 9, "g")
    return Level(1, "First Light", g, RAINBOW, "row")


def level_diamond() -> Level:
    g = grid(24)
    for i, w in enumerate((2, 4, 6, 8, 10, 12, 10, 8, 6, 4, 2)):
        fill(g, 1 + i, (COLS - w) // 2, 1, w, "#")
    fill(g, 16, 2, 1, 4, "#")
    fill(g, 16, 14, 1, 4, "#")
    for c, w in ((0, 2), (4, 4), (12, 4), (18, 2)):
        fill(g, 22, c, 1, w, "#")
    drop(g, 1, 9, "m")  # tip, cols 9-10
    drop(g, 6, 6, "o")  # widest row, cols 4-15
    drop(g, 6, 13, "g")
    return Level(2, "Diamond", g, GOLD, "diag")


def level_pillars() -> Level:
    """Five pillars of different heights, with caps over the lanes so a ball that slips up one rattles."""
    g = grid(24)
    for p, top in enumerate((15, 13, 11, 13, 15)):
        fill(g, top, p * 4, 22 - top, 2, "#")
        fill(g, 3, p * 4 + 2, 1, 2, "#")
    drop(g, 21, 0, "u")
    drop(g, 21, 8, "o")
    drop(g, 21, 16, "g")
    return Level(3, "Pillars", g, NEON, "pillar")


def level_halo() -> Level:
    """A tall arch, open at the bottom, with a prize block inside. No door yet."""
    g = grid(24)
    fill(g, 2, 3, 2, 14, "#")
    fill(g, 4, 3, 9, 2, "#")
    fill(g, 4, 15, 9, 2, "#")
    fill(g, 7, 7, 3, 6, "#")
    fill(g, 20, 2, 2, 4, "#")
    fill(g, 20, 14, 2, 4, "#")
    drop(g, 8, 9, "m")
    drop(g, 21, 3, "o")
    drop(g, 21, 15, "u")
    return Level(4, "Halo", g, OCEAN, "row")


def level_smile() -> Level:
    g = art(
        """
....................
....................
....####....####....
....#l##....####....
....####....####....
....................
....................
.........##.........
.........##.........
....................
....................
.##..............##.
..##............##..
...######g#######...
....############....
.....####o#####.....
....................
....................
....................
....................
....................
##....##....##....##
##....##....##....##
"""
    )
    return Level(5, "Smile", g, CANDY, "row")


def level_frame() -> Level:
    """First steel. A thick frame with a door the ball can actually fly through, and a welcome mat outside."""
    g = grid(24)
    fill(g, 1, 3, 14, 14, "S")
    fill(g, 3, 5, 10, 10, ".")
    fill(g, 13, 8, 2, 4, ".")  # 4 x 2 door through the bottom of the frame
    fill(g, 4, 6, 2, 8, "#")
    fill(g, 7, 7, 2, 6, "#")
    fill(g, 10, 8, 1, 4, "#")
    fill(g, 18, 3, 2, 6, "#")
    fill(g, 18, 11, 2, 6, "#")
    fill(g, 22, 6, 1, 8, "#")
    drop(g, 19, 4, "f")
    drop(g, 19, 8, "o")
    drop(g, 19, 13, "h")
    return Level(6, "Picture Frame", g, SUNSET, "row")


def level_two_cities() -> Level:
    """A steel spine to bank off. Both cities are open from below, so the wall is a toy, not a lock."""
    g = grid(24)
    fill(g, 1, 6, 1, 8, "#")
    fill(g, 4, 9, 13, 2, "S")
    fill(g, 5, 1, 8, 4, "#")
    fill(g, 5, 15, 8, 4, "#")
    fill(g, 21, 4, 2, 4, "#")
    fill(g, 21, 12, 2, 4, "#")
    drop(g, 12, 1, "m")
    drop(g, 12, 4, "o")
    drop(g, 12, 15, "h")
    drop(g, 12, 18, "u")
    return Level(7, "Two Cities", g, [1, 2, 11, 9, 5, 15], "col")


def level_lattice() -> Level:
    g = grid(24)
    for i, r in enumerate((1, 6, 11, 16, 21)):
        c = 0 if i % 2 == 0 else 2
        while c <= 18:
            fill(g, r, c, 2, 2, "#")
            c += 4
    # Steel hubs in the offset tiers give the ball something to ricochet off mid-climb.
    fill(g, 6, 10, 2, 2, "S")
    fill(g, 16, 10, 2, 2, "S")
    drop(g, 22, 0, "l")
    drop(g, 22, 8, "o")
    drop(g, 22, 16, "m")
    return Level(8, "Lattice", g, NEON, "checker")


def level_fireworks() -> Level:
    """Three islands, each with one bomb, staggered so they pop one at a time. The foundation stays."""
    g = grid(24)
    for r, c in ((2, 0), (8, 8), (2, 15)):
        fill(g, r, c, 4, 5, "#")
        g[r + 1][c + 2] = "X"
    fill(g, 21, 3, 2, 14, "#")
    drop(g, 22, 5, "f")
    drop(g, 22, 9, "o")
    drop(g, 22, 14, "u")
    return Level(9, "Fireworks", g, SUNSET, "row")


def level_fuses() -> Level:
    """Each stripe is a chain. Empty air between them keeps one fuse from eating the next."""
    g = grid(26)
    for r in (1, 7, 13, 19):
        for i in range(8):
            c = 2 + i * 2
            g[r][c] = "X"
            g[r][c + 1] = "#"
    fill(g, 24, 3, 1, 14, "#")
    drop(g, 24, 4, "l")
    drop(g, 24, 8, "o")
    drop(g, 24, 12, "u")
    drop(g, 24, 15, "f")
    return Level(10, "Fuses", g, [5, 6, 9, 15], "row")


def level_vault() -> Level:
    g = grid(24)
    fill(g, 1, 2, 15, 16, "S")
    fill(g, 3, 4, 11, 12, ".")
    fill(g, 14, 8, 2, 4, ".")  # door
    fill(g, 4, 5, 3, 10, "#")
    g[5][7] = "X"
    g[5][12] = "X"
    fill(g, 9, 6, 2, 8, "#")
    fill(g, 20, 1, 2, 6, "#")
    fill(g, 20, 13, 2, 6, "#")
    drop(g, 21, 2, "f")
    drop(g, 21, 17, "h")
    drop(g, 20, 5, "o")
    drop(g, 20, 14, "l")
    return Level(11, "The Vault", g, ICE, "row")


def level_heart() -> Level:
    """Two bombs take the lobes. The point of the heart is what you actually clear."""
    g = art(
        """
....................
....................
....................
.....###....###.....
....#####..#####....
...######..######...
...##X###..###X##...
...######g#######...
....############....
.....##########.....
......########......
.......######.......
........####........
.........e#.........
....................
....................
....................
....................
....................
....................
....................
#o....##....##....##
"""
    )
    return Level(12, "Heart", g, ROSE, "diag")


def level_plated() -> Level:
    """Armor intro: two armored ranks between normal bands, plus one bomb that deletes a pocket of both."""
    g = grid(24)
    fill(g, 1, 3, 2, 14, "#")
    for c in range(3, 17):
        g[6][c] = "A" if c % 2 == 1 else "#"
        g[12][c] = "A" if c % 2 == 0 else "#"
    g[9][9] = "X"
    fill(g, 20, 4, 2, 12, "#")
    drop(g, 20, 5, "f")
    drop(g, 20, 9, "o")
    drop(g, 21, 14, "u")
    return Level(13, "Plated", g, ICE, "row")


def level_switchback() -> Level:
    g = grid(26)
    for i in range(6):
        fill(g, 1 + i, 1 + i * 2, 1, 4, "#")
        fill(g, 8 + i, 15 - i * 2, 1, 4, "#")
        fill(g, 15 + i, 1 + i * 2, 1, 4, "#")
    for c in (0, 8, 16):
        fill(g, 24, c, 1, 4, "#")
    g[1][1] = "A"
    g[13][5] = "A"
    g[20][14] = "A"
    drop(g, 15, 2, "l")
    drop(g, 24, 9, "o")
    drop(g, 24, 17, "g")
    return Level(14, "Switchback", g, RAINBOW, "diag")


def level_bullseye() -> Level:
    """Steel shell, armored jacket, explosive core. Break in, then the center deletes the jacket."""
    g = grid(26)
    fill(g, 1, 3, 14, 14, "S")
    fill(g, 3, 5, 10, 10, ".")
    fill(g, 13, 8, 2, 4, ".")
    # Jacket and core sit in the upper interior, clear of the door.
    fill(g, 4, 6, 6, 8, "A")
    fill(g, 5, 7, 4, 6, "#")
    fill(g, 6, 9, 2, 2, "X")
    fill(g, 19, 2, 2, 16, "#")
    fill(g, 23, 5, 1, 10, "#")
    drop(g, 19, 4, "f")
    drop(g, 19, 10, "o")
    drop(g, 20, 15, "h")
    warm = ("#ffffb060", 90.0, 0.6)
    return Level(
        15,
        "Bullseye",
        g,
        [9, 15, 5, 8],
        "row",
        # The vault in the dark: glowing bricks on the core's corners and the ends of the lower wall.
        glow={(5, 7): warm, (5, 12): warm, (8, 7): warm, (8, 12): warm, (19, 2): warm, (20, 17): warm},
        lights_out=True,
        lightning=True,
    )


def level_skyline() -> Level:
    g = grid(26)
    heights = (6, 10, 4, 12, 8)
    for i, h in enumerate(heights):
        fill(g, 24 - h, i * 4, h, 2, "#")
    fill(g, 24 - 10, 4, 1, 2, "A")  # caps of the two tallest towers
    fill(g, 24 - 12, 12, 1, 2, "A")
    fill(g, 2, 2, 1, 4, "#")
    fill(g, 3, 13, 1, 4, "#")
    drop(g, 23, 0, "o")
    drop(g, 23, 8, "g")
    drop(g, 23, 16, "u")
    return Level(16, "Skyline", g, SUNSET, "pillar")


def level_patrol() -> Level:
    g = grid(24)
    fill(g, 1, 4, 4, 12, "#")
    g[9][2] = "M"
    g[13][11] = "M"
    g[17][4] = "M"
    fill(g, 21, 0, 2, 6, "#")
    fill(g, 21, 14, 2, 6, "#")
    drop(g, 4, 5, "m")
    drop(g, 4, 9, "o")
    drop(g, 4, 14, "u")
    return Level(
        17,
        "Patrol",
        g,
        ICE,
        "row",
        moves={(9, 2): (240, 40), (13, 11): (180, 48), (17, 4): (270, 44)},
        # Night watch: each patrolling brick glows as it moves through the dark.
        glow={(9, 2): ("#ff9cc4ff", 130.0, 0.65), (13, 11): ("#ff9cc4ff", 130.0, 0.65), (17, 4): ("#ff9cc4ff", 130.0, 0.65)},
        lights_out=True,
        lightning=True,
    )


def level_conveyor() -> Level:
    g = grid(26)
    fill(g, 1, 5, 4, 10, "#")
    for r in (22, 23):
        fill(g, r, 0, 1, 3, "#")
        fill(g, r, 7, 1, 6, "#")
        fill(g, r, 17, 1, 3, "#")
    lanes = (8, 11, 14, 17)
    speeds = (52, 70, 58, 64)
    moves: dict[tuple[int, int], tuple[float, float]] = {}
    for r, speed in zip(lanes, speeds):
        g[r][0] = "M"
        g[r][13] = "M"
        # Sweeps meet at x=210 and do not overlap.
        moves[(r, 0)] = (180, speed)
        moves[(r, 13)] = (-180, speed + 8)
    drop(g, 4, 6, "l")
    drop(g, 4, 9, "o")
    drop(g, 4, 12, "u")
    drop(g, 3, 14, "s")
    return Level(18, "Conveyor", g, NEON, "row", moves=moves)


def level_turnstile() -> Level:
    """A wide doorway with a steel bar sliding inside it. The bar never seals the opening."""
    g = grid(24)
    fill(g, 1, 4, 3, 12, "#")
    fill(g, 6, 2, 2, 4, "#")
    fill(g, 6, 14, 2, 4, "#")
    fill(g, 10, 1, 3, 18, "S")
    fill(g, 10, 7, 3, 6, ".")
    g[11][8] = "W"
    fill(g, 20, 4, 2, 12, "#")
    drop(g, 21, 6, "h")
    drop(g, 21, 10, "o")
    drop(g, 21, 13, "g")
    return Level(19, "Turnstile", g, PURPLE, "row", moves={(11, 8): (90, 46)})


def level_crossfire() -> Level:
    g = grid(26)
    fill(g, 1, 3, 3, 14, "#")
    g[2][5] = "X"
    g[2][12] = "X"
    fill(g, 6, 7, 2, 6, "#")
    g[10][1] = "M"
    g[13][12] = "B"
    g[16][2] = "M"
    g[19][10] = "M"
    fill(g, 23, 0, 1, 2, "#")
    fill(g, 23, 6, 1, 8, "#")
    fill(g, 23, 18, 1, 2, "#")
    drop(g, 3, 4, "h")
    drop(g, 3, 8, "o")
    drop(g, 3, 15, "y")
    drop(g, 1, 10, "u")
    return Level(
        20,
        "Crossfire",
        g,
        SUNSET,
        "row",
        moves={(10, 1): (210, 74), (13, 12): (150, 56), (16, 2): (180, 82), (19, 10): (-150, 60)},
    )


def level_garden() -> Level:
    """Three small regen patches and plenty of time. Finish one before you wander off."""
    g = grid(24)
    fill(g, 1, 3, 2, 14, "#")
    fill(g, 7, 3, 2, 2, "R")
    fill(g, 7, 15, 2, 2, "R")
    fill(g, 10, 4, 1, 4, "#")
    fill(g, 10, 12, 1, 4, "#")
    fill(g, 13, 9, 2, 2, "R")
    fill(g, 20, 4, 2, 12, "#")
    drop(g, 21, 6, "u")
    drop(g, 21, 10, "o")
    drop(g, 21, 13, "g")
    return Level(21, "Garden", g, FOREST, "row", regen_delay=6)


def level_weeds() -> Level:
    """Three patches. Two have a bomb on the fence; the third you clear by hand."""
    g = grid(24)
    for c in (2, 8, 14):
        fill(g, 3, c, 2, 2, "R")
    g[3][4] = "X"  # beside the first patch (cols 2-3)
    g[4][10] = "X"  # beside the second (cols 8-9)
    fill(g, 2, 0, 7, 1, "S")
    fill(g, 2, 19, 7, 1, "S")
    fill(g, 10, 2, 2, 6, "#")
    fill(g, 10, 12, 2, 6, "#")
    for r in (18, 19):
        fill(g, r, 0, 1, 3, "#")
        fill(g, r, 7, 1, 6, "#")
        fill(g, r, 17, 1, 3, "#")
    drop(g, 11, 4, "f")
    drop(g, 18, 9, "o")
    drop(g, 11, 14, "u")
    return Level(22, "Weeds", g, FOREST, "col", regen_delay=4.5)


def level_pendulum() -> Level:
    g = grid(24)
    fill(g, 1, 3, 2, 14, "#")
    fill(g, 6, 9, 3, 2, "R")
    g[7][7] = "X"
    fill(g, 6, 2, 2, 2, "A")
    fill(g, 6, 16, 2, 2, "A")
    g[12][2] = "M"
    g[12][13] = "M"
    g[16][4] = "M"
    fill(g, 21, 4, 2, 12, "#")
    drop(g, 2, 4, "l")
    drop(g, 2, 9, "o")
    drop(g, 2, 15, "h")
    drop(g, 22, 8, "e")
    return Level(
        23,
        "Pendulum",
        g,
        PURPLE,
        "row",
        moves={(12, 2): (150, 62), (12, 13): (-150, 62), (16, 4): (240, 50)},
        regen_delay=4.5,
    )


def level_gauntlet() -> Level:
    """Four open bands. No airlocks: you can always fly between them."""
    g = grid(24)
    for r in (1, 7, 13, 20):
        fill(g, r, 4, 2, 12, "#")
    fill(g, 1, 8, 2, 2, "R")
    g[2][11] = "X"
    for c in range(5, 16, 3):
        g[7][c] = "A"
    g[8][10] = "X"
    fill(g, 13, 4, 2, 2, "R")
    g[13][15] = "A"
    drop(g, 21, 5, "h")
    drop(g, 21, 8, "u")
    drop(g, 21, 12, "o")
    drop(g, 20, 14, "q")
    drop(g, 20, 6, "p")
    return Level(25, "Gauntlet", g, [8, 5, 15, 3, 1], "row", regen_delay=4.5)


def level_cascade() -> Level:
    """Four diagonal fuses. Each one clears its own bolt and nothing else."""
    g = grid(26)
    # Three-step bolts with three clear rows between them, so one bolt's blast stops short
    # of the next. The last bolt nicks the corner of the reward bar.
    for r0, c0 in ((0, 1), (6, 11), (12, 1), (18, 11)):
        for i in range(3):
            c = c0 + i * 2
            g[r0 + i][c] = "X"
            g[r0 + i][c + 1] = "#"
            if c + 2 < COLS:
                g[r0 + i][c + 2] = "#"
    fill(g, 23, 3, 2, 14, "#")
    drop(g, 24, 4, "f")
    drop(g, 24, 8, "o")
    drop(g, 24, 11, "g")
    drop(g, 24, 15, "s")
    return Level(26, "Cascade", g, RAINBOW, "diag")


def level_fortress() -> Level:
    g = grid(26)
    fill(g, 1, 2, 15, 16, "S")
    fill(g, 3, 4, 11, 12, ".")
    fill(g, 13, 7, 3, 6, ".")  # front gate
    fill(g, 6, 2, 3, 2, ".")  # left window
    fill(g, 6, 16, 3, 2, ".")  # right window
    for c in (5, 10, 14):
        fill(g, 4, c, 2, 1, "A")
    g[4][7] = "X"
    g[4][13] = "X"
    fill(g, 4, 8, 2, 2, "#")
    fill(g, 8, 6, 2, 3, "#")
    fill(g, 8, 11, 2, 3, "#")
    fill(g, 10, 9, 2, 2, "R")
    fill(g, 20, 3, 2, 14, "#")
    for c in (0, 6, 12, 18):
        fill(g, 24, c, 1, 2, "#")
    drop(g, 21, 5, "p")
    drop(g, 21, 8, "f")
    drop(g, 21, 11, "o")
    drop(g, 21, 14, "h")
    return Level(27, "Fortress", g, [5, 6, 13, 9, 15], "row", regen_delay=4)


def level_highway() -> Level:
    g = grid(26)
    fill(g, 1, 4, 4, 12, "#")
    moves: dict[tuple[int, int], tuple[float, float]] = {}
    lanes = ((8, 50, "M"), (11, 66, "B"), (14, 54, "M"), (17, 76, "M"), (20, 60, "B"))
    for r, speed, ch in lanes:
        g[r][1] = ch
        g[r][12] = "M"
        moves[(r, 1)] = (210, speed)
        moves[(r, 12)] = (180, speed + 6)
    fill(g, 24, 0, 1, 3, "#")
    fill(g, 24, 17, 1, 3, "#")
    drop(g, 3, 6, "g")
    drop(g, 3, 9, "o")
    drop(g, 3, 12, "u")
    drop(g, 4, 8, "y")
    # Night traffic: cyan cars start on the left, magenta ones mid-road.
    glow = {(r, c): ("#ff22d3ff" if c == 1 else "#ffff3ad0", 110.0, 0.6) for r, c in moves}
    return Level(
        28, "Highway", g, [1, 2, 15, 5, 11], "row", moves=moves, glow=glow, lights_out=True, lightning=True
    )


def level_crown() -> Level:
    g = art(
        """
....................
A..#..A..#..A..#..A.
#..#..#..#..#..#..#.
###X#######X########
####################
S..S..S..S..S..S..S.
....................
....................
........RR..........
........RR..........
....................
....................
..##............##..
..##............##..
....................
....................
....................
....................
....................
....................
...g##o##l####q#....
...############.....
"""
    )
    return Level(29, "Crown", g, GOLD, "row", regen_delay=5)


def level_supernova() -> Level:
    """Four engines around an open core. Each bomb guts its own engine. The core has its own detonator."""
    g = grid(24)
    top = 3  # rows of air above the formation
    quads = ((2, 0, 2, 0), (2, 15, 2, 19), (10, 0, 10, 0), (10, 15, 10, 19))
    for r, c, xr, xc in quads:
        r, xr = r + top, xr + top
        fill(g, r, c, 3, 5, "#")
        g[xr][xc] = "X"
        # Two armored bricks sit on the far side of the blast so they stay standing.
        far = c + 4 if c == 0 else c
        g[r][far] = "A"
        g[r + 1][far if c == 0 else far + 1] = "A"
        near = c + 1 if c == 0 else c + 3
        g[r + 1][near] = "A"
    fill(g, 6 + top, 9, 3, 2, "R")
    g[7 + top][8] = "X"  # detonator, adjacent to the core
    fill(g, 1 + top, 8, 1, 4, "S")
    fill(g, 13 + top, 8, 1, 4, "S")
    fill(g, 21, 4, 2, 12, "#")
    for c, ch in ((5, "p"), (7, "f"), (9, "h"), (11, "e"), (13, "q"), (15, "o")):
        drop(g, 22, c, ch)
    return Level(
        30,
        "Supernova",
        g,
        RAINBOW,
        "diag",
        regen_delay=5,
        armor={(2 + top, 4): 3, (2 + top, 15): 3},
    )


BUILDERS = [
    level_first_light,
    level_diamond,
    level_pillars,
    level_halo,
    level_smile,
    level_frame,
    level_two_cities,
    level_lattice,
    level_fireworks,
    level_fuses,
    level_vault,
    level_heart,
    level_plated,
    level_switchback,
    level_bullseye,
    level_skyline,
    level_patrol,
    level_conveyor,
    level_turnstile,
    level_crossfire,
    level_garden,
    level_weeds,
    level_pendulum,
    level_gauntlet,
    level_cascade,
    level_fortress,
    level_highway,
    level_crown,
    level_supernova,
]


# ---------------------------------------------------------------- checks


def cells(level: Level) -> list[tuple[int, int, str]]:
    out = []
    for r, row in enumerate(level.g):
        for c, ch in enumerate(row):
            if ch != ".":
                kind_of(ch)  # validate
                out.append((r, c, ch))
    return out


def center(row: int, col: int) -> tuple[float, float]:
    return col * BW + BW / 2, row * BH + BH / 2


def in_blast(a: tuple[int, int], b: tuple[int, int]) -> bool:
    ax, ay = center(*a)
    bx, by = center(*b)
    dx = max(abs(ax - bx) - BW / 2, 0)
    dy = max(abs(ay - by) - BH / 2, 0)
    return dx * dx + dy * dy <= BLAST_R2


def chain_size(level: Level, start: tuple[int, int]) -> int:
    bombs = {(r, c) for r, c, ch in cells(level) if kind_of(ch) == "explosive"}
    breakable = {(r, c) for r, c, ch in cells(level) if kind_of(ch) != "steel"}
    exploded = set()
    wave = {start}
    while wave:
        exploded |= wave
        nxt = set()
        for src in wave:
            for pos in breakable:
                if pos not in exploded and pos not in nxt and in_blast(src, pos):
                    if pos in bombs:
                        nxt.add(pos)
                    else:
                        exploded.add(pos)
        wave = nxt
    return len(exploded)


def regen_clusters(level: Level) -> list[int]:
    regen = [(r, c) for r, c, ch in cells(level) if kind_of(ch) == "regen"]
    parent = list(range(len(regen)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, (r1, c1) in enumerate(regen):
        for j in range(i + 1, len(regen)):
            r2, c2 = regen[j]
            dx = abs(c1 - c2) * BW
            dy = abs(r1 - r2) * BH
            if dx <= BW + 2 and dy <= BH + 2:
                parent[find(i)] = find(j)
    counts: dict[int, int] = {}
    for i in range(len(regen)):
        counts[find(i)] = counts.get(find(i), 0) + 1
    return sorted(counts.values(), reverse=True)


def flood_reachable(level: Level) -> set[tuple[int, int]]:
    """Ball-sized flood from below the playfield. Breakable bricks are removed once the ball can touch them."""
    blockers: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    targets: list[tuple[int, int]] = []
    for r, c, ch in cells(level):
        rect = (c * BW, r * BH, BW, BH)
        if ch in MOVER:
            if ch != "W":
                targets.append((r, c))
            continue
        if kind_of(ch) != "steel":
            targets.append((r, c))
            blockers[(r, c)] = rect
        else:
            blockers[(r, c)] = rect

    gw, gh = FIELD_W // STEP, FLOOD_H // STEP

    def blocked_grid(active: dict[tuple[int, int], tuple[int, int, int, int]]) -> bytearray:
        grid_b = bytearray(gw * gh)
        for ix in range(gw):
            px = ix * STEP + STEP / 2
            if px < BALL_R or px > FIELD_W - BALL_R:
                for iy in range(gh):
                    grid_b[iy * gw + ix] = 1
        r2 = BALL_R * BALL_R
        for x, y, w, h in active.values():
            x0 = max(0, int((x - BALL_R) / STEP) - 1)
            x1 = min(gw - 1, int((x + w + BALL_R) / STEP) + 1)
            y0 = max(0, int((y - BALL_R) / STEP) - 1)
            y1 = min(gh - 1, int((y + h + BALL_R) / STEP) + 1)
            for iy in range(y0, y1 + 1):
                py = iy * STEP + STEP / 2
                for ix in range(x0, x1 + 1):
                    px = ix * STEP + STEP / 2
                    dx = max(x - px, 0, px - (x + w))
                    dy = max(y - py, 0, py - (y + h))
                    if dx * dx + dy * dy <= r2:
                        grid_b[iy * gw + ix] = 1
        return grid_b

    def reachable_mask(grid_b: bytearray) -> bytearray:
        seen = bytearray(gw * gh)
        q: deque[tuple[int, int]] = deque()
        for ix in range(gw):
            iy = gh - 1
            i = iy * gw + ix
            if not grid_b[i]:
                seen[i] = 1
                q.append((ix, iy))
        while q:
            ix, iy = q.popleft()
            for nx, ny in ((ix - 1, iy), (ix + 1, iy), (ix, iy - 1), (ix, iy + 1)):
                if nx < 0 or ny < 0 or nx >= gw or ny >= gh:
                    continue
                i = ny * gw + nx
                if seen[i] or grid_b[i]:
                    continue
                seen[i] = 1
                q.append((nx, ny))
        return seen

    reach = BALL_R + STEP
    reach2 = reach * reach
    hit: set[tuple[int, int]] = set()
    remaining = set(targets)
    active = dict(blockers)
    while True:
        seen = reachable_mask(blocked_grid(active))
        newly: list[tuple[int, int]] = []
        for r, c in remaining:
            x, y, w, h = c * BW, r * BH, BW, BH
            x0 = max(0, int((x - reach) / STEP) - 1)
            x1 = min(gw - 1, int((x + w + reach) / STEP) + 1)
            y0 = max(0, int((y - reach) / STEP) - 1)
            y1 = min(gh - 1, int((y + h + reach) / STEP) + 1)
            found = False
            for iy in range(y0, y1 + 1):
                py = iy * STEP + STEP / 2
                for ix in range(x0, x1 + 1):
                    if not seen[iy * gw + ix]:
                        continue
                    px = ix * STEP + STEP / 2
                    dx = max(x - px, 0, px - (x + w))
                    dy = max(y - py, 0, py - (y + h))
                    if dx * dx + dy * dy <= reach2:
                        found = True
                        break
                if found:
                    break
            if found:
                newly.append((r, c))
        if not newly:
            break
        for pos in newly:
            hit.add(pos)
            remaining.discard(pos)
            active.pop(pos, None)
    return hit


def check_moves(level: Level, problems: list[str]) -> None:
    sweeps: dict[int, list[tuple[float, float]]] = {}
    for (r, c), (move_x, speed) in level.moves.items():
        if not (0 <= r < len(level.g) and 0 <= c < COLS) or level.g[r][c] not in MOVER:
            problems.append(f"{level.num}: move on a non-mover at {r},{c}")
            continue
        if not 60 <= abs(move_x) <= 270 or not 36 <= speed <= 90:
            problems.append(f"{level.num}: mover at {r},{c} has travel {move_x} speed {speed}")
        x = c * BW
        lo = min(x, x + move_x)
        hi = max(x, x + move_x) + BW
        if lo < 0 or hi > FIELD_W:
            problems.append(f"{level.num}: mover at {r},{c} leaves the field ({lo:.0f}-{hi:.0f})")
        sweeps.setdefault(r, []).append((lo, hi))
        for rr, cc, ch in cells(level):
            if rr != r or (rr, cc) == (r, c):
                continue
            ox, ow = cc * BW, BW
            if ox < hi - 0.1 and ox + ow > lo + 0.1:
                problems.append(f"{level.num}: mover at {r},{c} sweeps through {ch} at {rr},{cc}")
    for (r, c, ch) in cells(level):
        if ch in MOVER and (r, c) not in level.moves:
            problems.append(f"{level.num}: mover at {r},{c} has no travel")
    for r, spans in sweeps.items():
        spans.sort()
        for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
            if b0 < a1 - 0.1:
                problems.append(f"{level.num}: two movers share row {r}")


def check_level(level: Level) -> list[str]:
    problems: list[str] = []
    found = cells(level)
    breakables = [(r, c, ch) for r, c, ch in found if kind_of(ch) != "steel"]
    kinds = {kind_of(ch) for _, _, ch in found}
    n = level.num
    if n <= 5 and kinds - {"normal"}:
        problems.append(f"{n}: early level uses {kinds}")
    if n <= 8 and (kinds - {"normal", "steel"}):
        problems.append(f"{n}: steel chapter uses {kinds}")
    if n in (6, 7) and "steel" not in kinds:
        problems.append(f"{n}: steel chapter has no steel")
    if n <= 12 and (kinds - {"normal", "steel", "explosive"}):
        problems.append(f"{n}: pre-armor level uses {kinds}")
    if 9 <= n <= 12 and "explosive" not in kinds:
        problems.append(f"{n}: bomb chapter has no bomb")
    if n <= 16 and "regen" in kinds:
        problems.append(f"{n}: regen shows up before its lesson")
    if n <= 16 and any(ch in MOVER for _, _, ch in found):
        problems.append(f"{n}: a mover shows up before its lesson")
    if 13 <= n <= 16 and "armored" not in kinds:
        problems.append(f"{n}: armor chapter has no armor")
    if 17 <= n <= 20 and not any(ch in MOVER for _, _, ch in found):
        problems.append(f"{n}: mover chapter has no mover")
    # Cascade and Highway are breathers built on one idea. The other late levels use regen.
    if n in (21, 22, 23, 25, 27, 29, 30) and "regen" not in kinds:
        problems.append(f"{n}: late level is missing a regen cluster")

    if not MIN_BREAKABLE <= len(breakables) <= MAX_BREAKABLE:
        problems.append(
            f"{n}: {len(breakables)} breakable bricks (want {MIN_BREAKABLE}-{MAX_BREAKABLE})"
        )
    rows = [r for r, _, _ in found]
    if rows and max(rows) - min(rows) + 1 < MIN_SPAN:
        problems.append(f"{n}: spans {max(rows) - min(rows) + 1} rows (want {MIN_SPAN}+)")

    powers = []
    for r, c, ch in found:
        bonus = level.bonus.get((r, c))
        p = power_of(ch, bonus)
        if p:
            powers.append(p)
        if (r, c) in level.armor and kind_of(ch) != "armored":
            problems.append(f"{n}: armor override on non-armor at {r},{c}")
    if powers.count("coin") != 1:
        problems.append(f"{n}: expected one coin drop, found {powers.count('coin')}")
    if len(powers) < 3 or len(powers) > 6:
        problems.append(f"{n}: {len(powers)} powerups {powers}")
    if n < 16 and "smaller" in powers:
        problems.append(f"{n}: smaller is too early")
    if n < 18 and "hyper" in powers:
        problems.append(f"{n}: hyper is too early")
    if n < 25 and "pierce" in powers:
        problems.append(f"{n}: pierce is too early")
    if n < 12 and "extraLife" in powers:
        problems.append(f"{n}: extra life is too early")

    bombs = [(r, c) for r, c, ch in found if kind_of(ch) == "explosive"]
    if bombs:
        worst = max(chain_size(level, b) for b in bombs)
        frac = worst / len(breakables)
        if frac > 0.42:
            problems.append(f"{n}: one blast chain clears {worst}/{len(breakables)} ({frac:.0%})")

    clusters = regen_clusters(level)
    if clusters and clusters[0] > 6:
        problems.append(f"{n}: regen cluster of {clusters[0]} (max 6)")

    hit = flood_reachable(level)
    missed = [(r, c) for r, c, ch in breakables if (r, c) not in hit]
    if missed:
        problems.append(f"{n}: {len(missed)} unreachable bricks, first {missed[:8]}")

    check_moves(level, problems)

    # Matches LEVEL_MAX_Y in src/core/types.ts, which keeps the paddle's reaction room.
    if any(r > MAX_ROW for r, _, _ in found):
        problems.append(f"{n}: a brick is below row {MAX_ROW}")
    return problems


def gid_for(level: Level, ch: str, row: int, col: int) -> int:
    kind = kind_of(ch)
    if kind == "steel":
        return STEEL
    if kind == "explosive":
        return EXP
    if kind == "armored":
        return ARM
    if kind == "regen":
        return REG
    if level.color == "col":
        i = col
    elif level.color == "diag":
        i = row + col
    elif level.color == "pillar":
        i = col // 4
    elif level.color == "checker":
        i = (row // 2 + col // 2)
    else:
        i = row
    return level.palette[i % len(level.palette)]


def emit(level: Level, previous: dict | None = None) -> dict:
    """The map for `level`, keeping whatever `previous` (the map on disk) has besides bricks."""
    prev_layers = [l for l in (previous or {}).get("layers", []) if l.get("name") != "Bricks"]

    def object_ids(layers: list[dict]) -> set[int]:
        out: set[int] = set()
        for l in layers:
            out |= {o["id"] for o in l.get("objects", [])}
            out |= object_ids(l.get("layers", []))
        return out

    taken = object_ids(prev_layers)
    objects = []
    n = 1
    for r, c, ch in cells(level):
        props = []
        bonus = level.bonus.get((r, c))
        power = power_of(ch, bonus)
        if power:
            props.append({"name": "powerup", "type": "string", "propertytype": "Powerup", "value": power})
        move = level.moves.get((r, c))
        if move:
            props.append({"name": "moveX", "type": "float", "value": move[0]})
            props.append({"name": "moveSpeed", "type": "float", "value": move[1]})
        if kind_of(ch) == "regen":
            props.append({"name": "regenDelay", "type": "float", "value": level.regen_delay})
        if (r, c) in level.armor:
            props.append({"name": "armor", "type": "int", "value": level.armor[(r, c)]})
        if (r, c) in level.glow:
            color, radius, intensity = level.glow[(r, c)]
            props.append({"name": "light", "type": "color", "value": color})
            props.append({"name": "lightRadius", "type": "float", "value": radius})
            props.append({"name": "lightIntensity", "type": "float", "value": intensity})
        while n in taken:
            n += 1
        obj = {
            "id": n,
            "gid": gid_for(level, ch, r, c),
            "x": c * BW,
            "y": (r + 1) * BH,
            "width": BW,
            "height": BH,
            "rotation": 0,
            "visible": True,
            "name": "",
            "type": "",
        }
        if props:
            obj["properties"] = props
        objects.append(obj)
        n += 1

    next_id = max([n - 1, *taken]) + 1
    bricks_layer = {
        "type": "objectgroup",
        "id": 1,
        "name": "Bricks",
        "draworder": "topdown",
        "opacity": 1,
        "visible": True,
        "x": 0,
        "y": 0,
        "objects": objects,
    }
    layers = [bricks_layer, *prev_layers]
    layer_ids = [l["id"] for l in layers if "id" in l]

    tilesets = [{"firstgid": 1, "source": "../tilesets/bricks.tsj"}]
    for ts in (previous or {}).get("tilesets", []):
        if ts.get("source") != tilesets[0]["source"]:
            tilesets.append(ts)
    properties = [{"name": "title", "type": "string", "value": level.title}]
    if level.lights_out:
        properties.append({"name": "lightsOut", "type": "bool", "value": True})
    if level.lightning:
        properties.append({"name": "lightning", "type": "bool", "value": True})
    generated = {p["name"] for p in properties}
    properties += [p for p in (previous or {}).get("properties", []) if p.get("name") not in generated]

    out = {
        "type": "map",
        "version": "1.10",
        "tiledversion": "1.11.2",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "width": COLS,
        "height": 50,
        "tilewidth": BW,
        "tileheight": BH,
        "infinite": False,
        "compressionlevel": -1,
        "nextlayerid": max(layer_ids) + 1,
        "nextobjectid": next_id,
        "properties": properties,
        "tilesets": tilesets,
        "layers": layers,
    }
    if level.lights_out or level.lightning:
        out["class"] = "LevelLighting"
    elif (previous or {}).get("class"):
        out["class"] = previous["class"]
    return out


def summarize(level: Level) -> str:
    found = cells(level)
    def count(k: str) -> int:
        return sum(1 for _, _, ch in found if kind_of(ch) == k)

    breakables = [c for c in found if kind_of(c[2]) != "steel"]
    hits = 0
    for _, _, ch in breakables:
        hits += 2 + (level.armor.get((_, _)[0] if False else (0, 0), 2) if False else 0)
    hits = 0
    for r, c, ch in breakables:
        if kind_of(ch) == "armored":
            hits += 2 + level.armor.get((r, c), 2)
        else:
            hits += 2
    bombs = [(r, c) for r, c, ch in found if kind_of(ch) == "explosive"]
    frac = 0
    if bombs and breakables:
        frac = max(chain_size(level, b) for b in bombs) / len(breakables)
    clusters = regen_clusters(level)
    powers = []
    for r, c, ch in found:
        p = power_of(ch, level.bonus.get((r, c)))
        if p:
            powers.append(p)
    return (
        f"{level.num:2} {level.title:<14} brk {len(breakables):3}  "
        f"stl {count('steel'):2} exp {count('explosive'):2} arm {count('armored'):2} "
        f"reg {count('regen'):2} mov {sum(1 for _, _, ch in found if ch in MOVER):2}  "
        f"hits {hits:3} chain {frac:4.0%} cluster {clusters[:1] or '-'}  "
        f"{','.join(powers)}"
    )


def render(level: Level, bad: set[tuple[int, int]] | None = None) -> str:
    lines = [f"--- {level.num} {level.title} ---"]
    for r, row in enumerate(level.g):
        chars = []
        for c, ch in enumerate(row):
            chars.append("!" if bad and (r, c) in bad else ch)
        if any(ch != "." for ch in chars):
            lines.append(f"{r:2} {''.join(chars)}")
    return "\n".join(lines)


def backup_once() -> None:
    if ARCHIVE.exists():
        return
    ARCHIVE.mkdir(parents=True)
    for path in sorted(LEVELS.glob("*.tmj")):
        shutil.copy2(path, ARCHIVE / path.name)
    shutil.copy2(LEVELS / "index.json", ARCHIVE / "index.json")
    print(f"archived {len(list(ARCHIVE.glob('*.tmj')))} maps to {ARCHIVE}")


def main() -> None:
    levels = [builder() for builder in BUILDERS]
    nums = [lv.num for lv in levels]
    if nums != [n for n in range(1, 31) if n != 24]:
        raise SystemExit(f"unexpected level numbers {nums}")
    titles = [lv.title for lv in levels] + ["Demolition"]
    if len(titles) != len(set(titles)):
        raise SystemExit(f"duplicate titles {titles}")

    problems: list[str] = []
    previews = []
    for lv in levels:
        issues = check_level(lv)
        problems.extend(issues)
        bad: set[tuple[int, int]] = set()
        if any("unreachable" in p for p in issues):
            hit = flood_reachable(lv)
            bad = {(r, c) for r, c, ch in cells(lv) if kind_of(ch) != "steel" and (r, c) not in hit}
        previews.append(render(lv, bad))
        print(summarize(lv))

    if problems:
        preview = ROOT / "archive" / "campaign-preview.txt"
        preview.parent.mkdir(parents=True, exist_ok=True)
        preview.write_text("\n\n".join(previews) + "\n", encoding="utf-8")
        print("\n".join(problems))
        raise SystemExit(f"{len(problems)} problem(s); maps not written. See {preview}")

    backup_once()
    for lv in levels:
        path = LEVELS / f"level{lv.num:02}.tmj"
        previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        path.write_text(json.dumps(emit(lv, previous), indent=1) + "\n", encoding="utf-8")
    index = {"levels": [f"level{n:02}.tmj" for n in range(1, 31)]}
    (LEVELS / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(levels)} maps; level 24 left untouched")


if __name__ == "__main__":
    main()
