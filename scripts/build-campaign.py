#!/usr/bin/env python3
"""Build the 30-level campaign.

Level 24 (Demolition) is hand-authored and is never rewritten. The first run
copies the previous maps to archive/levels/.

Only the `Bricks` layer and the `title`, `lightsOut` and `lightning` properties are generated.
Everything else authored in Tiled survives a rebuild: the `Lights` layer and any other layers,
other map properties, the map class and extra tilesets.

  python3 scripts/build-campaign.py

Curriculum (docs/bricks/design.md), so a new mechanic is the lesson of a level before it gets
mixed. Hell is heat and weight, the Crypt is "what you see isn't what's there", the Mainframe is
routing and contagion:
  1-3   plain bricks, open shapes
  4-5   steel as bumpers and one real doorway
  6-7   explosives, spaced so a blast is a moment and not the whole level
  8     fuse cords, burning into TNT
  9     armored bricks
  10    Hell finale: fuses, armor and TNT
  11    movers and armor
  12-13 phantoms, safe first, then guarding the prize
  14-15 switches and gates, then two channels
  16    phantoms and switches
  17-18 regen, then with phantoms
  19-20 switches and regen, then the Crypt finale
  21-22 portals, a shortcut first, then the only way in
  23    virus
  24    Demolition, unchanged
  25-30 virus, portals, phantoms and regen combined into set pieces
Wave-2 slots (10, 16, 19, 20, 26-30) hold stand-ins built from what's been taught so far.

Map glyphs besides the colors: S steel, X explosive, A armored, R regen, M/W/B moving normal,
steel and armored, F fuse, G phantom, 1-3 switches, 4-6 closed gates and 7-9 open gates of
channels 1-3, P/Q/Z portals of links 1-3 with "|" in the cell under each, V a virus core.

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

# Tile gids in bricks.tsj (firstgid 1). 1-16 are colors, then the mechanic tiles, then the
# level elements: one switch, gate and portal tile per channel or link.
STEEL, EXP, ARM, REG = 17, 18, 19, 20
FUSE, PHANTOM, SWITCH0, GATE0, PORTAL0, VIRUS_CORE = 21, 22, 22, 25, 28, 32
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
    "F": "fuse",
    "G": "phantom",
    "1": "switch",
    "2": "switch",
    "3": "switch",
    "4": "gate",
    "5": "gate",
    "6": "gate",
    "7": "gate",
    "8": "gate",
    "9": "gate",
    "P": "portal",
    "Q": "portal",
    "Z": "portal",
    "V": "virus",
}
# Switches 1-3 and gates 4-6 (closed) or 7-9 (open) share a channel by digit; portals P, Q and
# Z are links 1-3 and are two rows tall, with "|" in the cell under each.
PORTAL_LINK = {"P": 1, "Q": 2, "Z": 3}
PORTAL_TAIL = "|"
UNBREAKABLE = {"steel", "switch", "gate", "portal"}
PHANTOM_PERIOD = 3.2
SPREAD_MS = 4500
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


def channel_of(ch: str) -> int:
    """Channel 1-3 of a switch or gate glyph."""
    return (int(ch) - 1) % 3 + 1


def gate_open(ch: str) -> bool:
    return ch in "789"


def breakable(ch: str) -> bool:
    return kind_of(ch) not in UNBREAKABLE


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
        lightning: bool | None = None,
        phases: dict[tuple[int, int], float] | None = None,
        period: float = PHANTOM_PERIOD,
        spread_ms: float = SPREAD_MS,
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
        # Lights-out levels storm unless told otherwise.
        self.lightning = lights_out if lightning is None else lightning
        # Phantoms: where each one starts in the shared `period`, 0-1.
        self.phases = phases or {}
        self.period = period
        self.spread_ms = spread_ms


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
    return Level(1, "First Light", g, RAINBOW, "row", lights_out=True)


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
    return Level(4, "Picture Frame", g, SUNSET, "row")


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
    return Level(5, "Two Cities", g, [1, 2, 11, 9, 5, 15], "col")


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
    return Level(6, "Fireworks", g, SUNSET, "row")


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
    return Level(7, "The Vault", g, ICE, "row", lights_out=True)


def level_slow_burn() -> Level:
    """Fuse lesson. Two cords hang toward the paddle; light the tip and the flame climbs into the
    TNT under each nest. The cord is the shot to look for, not the bricks."""
    g = grid(26)
    fill(g, 1, 3, 1, 14, "#")
    fill(g, 2, 5, 1, 10, "#")
    for c0 in (2, 12):
        fill(g, 5, c0, 3, 6, "#")
    g[7][4] = "X"
    g[7][15] = "X"
    cord = ((8, 4), (9, 4), (10, 3), (11, 3), (12, 2), (13, 2), (14, 2), (15, 3), (16, 3))
    for r, c in cord:
        g[r][c] = "F"
        g[r][COLS - 1 - c] = "F"
    fill(g, 10, 8, 3, 4, "#")
    fill(g, 21, 0, 1, 3, "#")
    fill(g, 21, 8, 1, 4, "#")
    fill(g, 21, 17, 1, 3, "#")
    drop(g, 1, 9, "o")
    drop(g, 21, 1, "u")
    drop(g, 21, 9, "f")
    drop(g, 21, 18, "g")
    return Level(8, "Slow Burn", g, SUNSET, "row")


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
    return Level(9, "Plated", g, ICE, "row")


def level_powder_keg() -> Level:
    """Hell's finale. Two armored kegs with TNT in their floors and a cord from each down to the
    middle. Grinding the plate works; finding the cord is quicker."""
    g = grid(26)
    for c in range(4, 16):
        g[1][c] = "A" if c % 3 == 1 else "#"
    fill(g, 2, 6, 1, 8, "#")
    for c0 in (1, 13):
        fill(g, 6, c0, 4, 6, "A")
        fill(g, 7, c0 + 1, 2, 4, "#")
    g[9][3] = "X"
    g[9][16] = "X"
    cord = ((10, 3), (11, 4), (12, 4), (13, 5), (14, 5), (15, 6), (16, 6), (17, 7))
    for r, c in cord:
        g[r][c] = "F"
        g[r][COLS - 1 - c] = "F"
    fill(g, 4, 9, 6, 2, "S")
    fill(g, 21, 0, 1, 4, "#")
    fill(g, 21, 16, 1, 4, "#")
    fill(g, 22, 7, 1, 6, "#")
    drop(g, 2, 9, "o")
    drop(g, 21, 1, "f")
    drop(g, 21, 18, "l")
    drop(g, 22, 9, "h")
    ember = ("#ffff8a3a", 110.0, 0.7)
    return Level(
        10,
        "Powder Keg",
        g,
        [9, 10, 5, 15],
        "row",
        # Embers in the dark: the cord tips and the charges they lead to.
        glow={(17, 7): ember, (17, 12): ember, (9, 3): ember, (9, 16): ember},
        lights_out=True,
    )


def level_patrol() -> Level:
    """Night watch: three patrols cross the dark under a band with an armored crest."""
    g = grid(24)
    fill(g, 1, 4, 4, 12, "#")
    for c in range(5, 16, 2):
        g[1][c] = "A"
    g[9][2] = "M"
    g[13][11] = "M"
    g[17][4] = "M"
    fill(g, 21, 0, 2, 6, "#")
    fill(g, 21, 14, 2, 6, "#")
    drop(g, 4, 5, "m")
    drop(g, 4, 9, "o")
    drop(g, 4, 14, "u")
    return Level(
        11,
        "Patrol",
        g,
        ICE,
        "row",
        moves={(9, 2): (240, 40), (13, 11): (180, 48), (17, 4): (270, 44)},
        # Night watch: each patrolling brick glows as it moves through the dark.
        glow={(9, 2): ("#ff9cc4ff", 130.0, 0.65), (13, 11): ("#ff9cc4ff", 130.0, 0.65), (17, 4): ("#ff9cc4ff", 130.0, 0.65)},
        lights_out=True,
    )


def level_wisps() -> Level:
    """Phantom lesson. Two rows of wisps fade in a wave across the field; nothing hides behind
    them, so the only thing to learn is that a ghost lets the ball through."""
    g = grid(24)
    fill(g, 1, 3, 2, 14, "#")
    phases: dict[tuple[int, int], float] = {}
    for i, c in enumerate(range(2, 18)):
        g[6][c] = "G"
        g[10][c] = "G"
        phases[(6, c)] = (i * 0.06) % 1
        phases[(10, c)] = ((15 - i) * 0.06) % 1
    for c in (1, 8, 15):
        fill(g, 14, c, 1, 4, "#")
    fill(g, 21, 4, 1, 12, "#")
    fill(g, 22, 0, 1, 2, "#")
    fill(g, 22, 18, 1, 2, "#")
    drop(g, 1, 9, "o")
    drop(g, 21, 6, "u")
    drop(g, 21, 13, "g")
    return Level(12, "Wisps", g, PURPLE, "row", phases=phases)


def level_seance() -> Level:
    """A steel alcove whose mouth is a curtain of phantoms fading in turn. Wait for a gap, or
    shoot the ghosts down one by one."""
    g = grid(24)
    fill(g, 2, 5, 9, 10, "S")
    fill(g, 3, 6, 8, 8, ".")
    fill(g, 4, 7, 5, 6, "#")
    phases: dict[tuple[int, int], float] = {}
    for i, c in enumerate(range(6, 14)):
        g[10][c] = "G"
        phases[(10, c)] = i * 0.125
    for r in (4, 6, 8, 10):
        ch = "#" if r in (4, 8) else "G"
        fill(g, r, 0, 1, 4, ch)
        fill(g, r, 16, 1, 4, ch)
        if ch == "G":
            for c in (*range(0, 4), *range(16, 20)):
                phases[(r, c)] = ((r + c) * 0.09) % 1
    fill(g, 20, 3, 1, 14, "#")
    fill(g, 21, 0, 1, 3, "#")
    fill(g, 21, 17, 1, 3, "#")
    drop(g, 6, 9, "o")
    drop(g, 4, 1, "f")
    drop(g, 20, 5, "m")
    drop(g, 20, 14, "l")
    return Level(13, "Seance", g, ROSE, "row", phases=phases)


def level_rune_lock() -> Level:
    """Switch lesson. A box of amber gates and one amber switch out in the open. Hit it and the
    whole box opens; hit it again and it shuts."""
    g = grid(24)
    fill(g, 0, 2, 1, 16, "#")
    fill(g, 2, 4, 8, 12, "4")
    fill(g, 3, 5, 6, 10, ".")
    fill(g, 4, 6, 4, 8, "#")
    g[14][9] = "1"
    fill(g, 12, 0, 1, 4, "#")
    fill(g, 12, 16, 1, 4, "#")
    fill(g, 17, 3, 1, 4, "#")
    fill(g, 17, 13, 1, 4, "#")
    fill(g, 21, 6, 1, 8, "#")
    drop(g, 5, 9, "o")
    drop(g, 0, 3, "f")
    drop(g, 12, 1, "g")
    drop(g, 21, 7, "u")
    return Level(14, "Rune Lock", g, PURPLE, "row")


def level_airlock() -> Level:
    """Two locks in a row. The amber switch outside opens the outer door; a cyan switch inside
    the lower chamber opens the inner one."""
    g = grid(24)
    fill(g, 1, 4, 12, 12, "S")
    fill(g, 2, 5, 10, 10, ".")
    fill(g, 7, 5, 1, 10, "5")
    fill(g, 12, 8, 1, 4, "4")
    fill(g, 3, 6, 3, 8, "#")
    fill(g, 8, 6, 1, 2, "#")
    fill(g, 8, 12, 1, 2, "#")
    g[10][9] = "2"
    g[16][9] = "1"
    fill(g, 3, 0, 8, 2, "#")
    fill(g, 3, 18, 8, 2, "#")
    fill(g, 21, 3, 1, 14, "#")
    drop(g, 4, 9, "o")
    drop(g, 10, 0, "g")
    drop(g, 21, 5, "u")
    drop(g, 21, 14, "h")
    return Level(15, "Airlock", g, ICE, "row")


def level_haunted_locks() -> Level:
    """A gate ceiling over the prize, its switch inside a ring of phantoms, and a shelf of open
    gates that shuts whenever the ceiling opens."""
    g = grid(24)
    fill(g, 1, 2, 3, 16, "#")
    fill(g, 5, 0, 1, 20, "4")
    fill(g, 8, 3, 1, 14, "7")
    phases: dict[tuple[int, int], float] = {}
    for i, (r, c) in enumerate(((11, 8), (11, 9), (11, 10), (12, 10), (13, 10), (13, 9), (13, 8), (12, 8))):
        g[r][c] = "G"
        phases[(r, c)] = i * 0.125
    g[12][9] = "1"
    for i, c in enumerate((*range(2, 8), *range(12, 18))):
        g[16][c] = "G"
        phases[(16, c)] = (i * 0.08) % 1
    fill(g, 21, 4, 1, 12, "#")
    drop(g, 2, 9, "o")
    drop(g, 1, 3, "m")
    drop(g, 21, 6, "f")
    drop(g, 21, 13, "u")
    return Level(16, "Haunted Locks", g, ROSE, "row", phases=phases)


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
    return Level(17, "Garden", g, FOREST, "row", regen_delay=6)


def level_weeds() -> Level:
    """Three patches. Two have a bomb on the fence; the third you clear by hand. The bands below
    fade in and out, so the patches are never quite where the ball last bounced."""
    g = grid(24)
    for c in (2, 8, 14):
        fill(g, 3, c, 2, 2, "R")
    g[3][4] = "X"  # beside the first patch (cols 2-3)
    g[4][10] = "X"  # beside the second (cols 8-9)
    fill(g, 2, 0, 7, 1, "S")
    fill(g, 2, 19, 7, 1, "S")
    fill(g, 10, 2, 2, 6, "G")
    fill(g, 10, 12, 2, 6, "G")
    phases = {(r, c): ((c + r * 3) * 0.07) % 1 for r in (10, 11) for c in range(COLS) if g[r][c] == "G"}
    for r in (18, 19):
        fill(g, r, 0, 1, 3, "#")
        fill(g, r, 7, 1, 6, "#")
        fill(g, r, 17, 1, 3, "#")
    drop(g, 18, 1, "f")
    drop(g, 18, 9, "o")
    drop(g, 19, 18, "u")
    return Level(18, "Weeds", g, FOREST, "col", regen_delay=4.5, lights_out=True, phases=phases)


def level_ossuary() -> Level:
    """The bones regrow behind an amber ceiling. Opening it shuts the shelf below, so you work
    through one side at a time."""
    g = grid(24)
    fill(g, 2, 2, 2, 3, "R")
    fill(g, 2, 15, 2, 3, "R")
    fill(g, 1, 7, 4, 6, "#")
    fill(g, 5, 1, 1, 5, "#")
    fill(g, 5, 14, 1, 5, "#")
    fill(g, 7, 0, 1, 20, "4")
    fill(g, 10, 5, 1, 10, "7")
    fill(g, 11, 6, 1, 8, "#")
    g[15][9] = "1"
    fill(g, 12, 0, 5, 2, "#")
    fill(g, 12, 18, 5, 2, "#")
    fill(g, 21, 4, 1, 12, "#")
    drop(g, 2, 9, "o")
    drop(g, 11, 9, "g")
    drop(g, 21, 6, "f")
    drop(g, 21, 13, "h")
    return Level(19, "Ossuary", g, PURPLE, "row", regen_delay=5)


def level_gravekeeper() -> Level:
    """The Crypt's finale. A steel tomb behind an amber door, its switch in a ring of phantoms;
    inside, an armored jacket around bones that regrow and one charge beside them."""
    g = grid(26)
    fill(g, 1, 3, 14, 14, "S")
    fill(g, 3, 5, 10, 10, ".")
    fill(g, 13, 8, 2, 4, "4")
    fill(g, 4, 6, 6, 8, "A")
    fill(g, 5, 7, 4, 6, "#")
    fill(g, 6, 9, 2, 2, "R")
    g[8][8] = "X"
    phases: dict[tuple[int, int], float] = {}
    for i, (r, c) in enumerate(((16, 8), (16, 9), (16, 10), (17, 10), (18, 10), (18, 9), (18, 8), (17, 8))):
        g[r][c] = "G"
        phases[(r, c)] = i * 0.125
    g[17][9] = "1"
    fill(g, 19, 1, 2, 6, "#")
    fill(g, 19, 13, 2, 6, "#")
    g[22][0] = "M"
    fill(g, 24, 5, 1, 10, "#")
    drop(g, 5, 9, "o")
    drop(g, 19, 2, "f")
    drop(g, 20, 15, "h")
    drop(g, 24, 9, "e")
    warm = ("#ffffb060", 90.0, 0.6)
    return Level(
        20,
        "Gravekeeper",
        g,
        [9, 15, 5, 8],
        "row",
        moves={(22, 0): (180, 50)},
        regen_delay=5,
        phases=phases,
        glow={(5, 7): warm, (5, 12): warm, (8, 12): warm, (19, 1): warm, (20, 18): warm},
        lights_out=True,
    )


def level_wormhole() -> Level:
    """Portal lesson. A steel shelf hides the prize band; the long way is round the ends, the
    short way is a portal by each corner of the paddle."""
    g = grid(24)
    fill(g, 1, 4, 3, 12, "#")
    fill(g, 7, 2, 1, 16, "S")
    g[4][1], g[5][1] = "P", PORTAL_TAIL
    g[4][18], g[5][18] = "Q", PORTAL_TAIL
    g[19][2], g[20][2] = "P", PORTAL_TAIL
    g[19][17], g[20][17] = "Q", PORTAL_TAIL
    fill(g, 10, 4, 3, 4, "#")
    fill(g, 10, 12, 3, 4, "#")
    fill(g, 15, 7, 1, 6, "#")
    fill(g, 22, 6, 1, 8, "#")
    drop(g, 2, 9, "o")
    drop(g, 22, 7, "u")
    drop(g, 22, 12, "g")
    return Level(21, "Wormhole", g, NEON, "row")


def level_relay() -> Level:
    """A sealed steel vault. The only way in is the portal at the bottom of the field, and the
    only way out is to find its twin again from inside."""
    g = grid(24)
    fill(g, 0, 2, 2, 16, "#")
    fill(g, 3, 5, 9, 10, "S")
    fill(g, 4, 6, 7, 8, ".")
    fill(g, 4, 7, 3, 6, "#")
    g[8][9], g[9][9] = "Q", PORTAL_TAIL
    g[18][9], g[19][9] = "Q", PORTAL_TAIL
    fill(g, 6, 0, 7, 3, "#")
    fill(g, 6, 17, 7, 3, "#")
    fill(g, 22, 4, 1, 4, "#")
    fill(g, 22, 12, 1, 4, "#")
    drop(g, 5, 9, "o")
    drop(g, 12, 0, "u")
    drop(g, 22, 5, "l")
    drop(g, 22, 14, "m")
    return Level(22, "Relay", g, OCEAN, "row", lights_out=True)


def level_outbreak() -> Level:
    """Virus lesson. A wide block with the core on its front edge. Break it straight away and
    it's a clean purge; leave it and the block turns tough a brick at a time."""
    g = grid(24)
    fill(g, 3, 4, 5, 12, "#")
    g[7][9] = "V"
    fill(g, 12, 0, 3, 4, "#")
    fill(g, 12, 16, 3, 4, "#")
    fill(g, 21, 7, 1, 6, "#")
    drop(g, 3, 9, "o")
    drop(g, 12, 1, "f")
    drop(g, 14, 18, "g")
    drop(g, 21, 8, "u")
    return Level(23, "Outbreak", g, [11, 12, 1, 2], "row")


def level_firewall() -> Level:
    """The core sits behind a steel shelf. Go round the open end and the colony grows while you
    travel, or take the portal and be there now."""
    g = grid(24)
    fill(g, 1, 2, 4, 16, "#")
    g[4][9] = "V"
    fill(g, 8, 0, 1, 16, "S")
    g[5][1], g[6][1] = "P", PORTAL_TAIL
    g[18][3], g[19][3] = "P", PORTAL_TAIL
    fill(g, 11, 4, 3, 10, "#")
    fill(g, 22, 6, 1, 8, "#")
    drop(g, 1, 9, "o")
    drop(g, 12, 4, "h")
    drop(g, 22, 7, "l")
    drop(g, 22, 12, "u")
    return Level(25, "Firewall", g, NEON, "row", spread_ms=4000)


def level_gauntlet() -> Level:
    """Four open bands. No airlocks: you can always fly between them. The third band carries a
    virus core, so it gets tougher the longer it waits."""
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
    g[14][11] = "V"
    drop(g, 21, 5, "h")
    drop(g, 21, 8, "u")
    drop(g, 21, 12, "o")
    drop(g, 20, 14, "q")
    drop(g, 20, 6, "p")
    return Level(26, "Gauntlet", g, [8, 5, 15, 3, 1], "row", regen_delay=4.5, lights_out=True)


def level_fortress() -> Level:
    """A steel keep. The windows are shuttered by phantoms, and a portal by the moat comes out
    inside the wall."""
    g = grid(26)
    fill(g, 1, 2, 15, 16, "S")
    fill(g, 3, 4, 11, 12, ".")
    fill(g, 13, 7, 3, 6, ".")  # front gate
    fill(g, 6, 2, 3, 2, "G")  # left window
    fill(g, 6, 16, 3, 2, "G")  # right window
    phases = {(r, c): ((r - 6) * 0.2 + (c % 2) * 0.1) % 1 for r in range(6, 9) for c in (2, 3, 16, 17)}
    g[11][5], g[12][5] = "P", PORTAL_TAIL
    g[17][0], g[18][0] = "P", PORTAL_TAIL
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
    return Level(27, "Fortress", g, [5, 6, 13, 9, 15], "row", regen_delay=4, phases=phases)


def level_crown() -> Level:
    """The crown's band fades in a wave, and a portal in the empty middle comes out under the
    studs."""
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
    g[4] = ["G"] * COLS
    phases = {(4, c): (c * 0.05) % 1 for c in range(COLS)}
    g[6][1], g[7][1] = "Q", PORTAL_TAIL
    g[16][9], g[17][9] = "Q", PORTAL_TAIL
    return Level(28, "Crown", g, GOLD, "row", regen_delay=5, phases=phases)


def level_botnet() -> Level:
    """Two infected racks either side of a steel spine, a portal into each from the floor, and
    bones that regrow in the middle."""
    g = grid(24)
    fill(g, 2, 1, 4, 6, "#")
    fill(g, 2, 13, 4, 6, "#")
    g[5][3] = "V"
    g[5][16] = "V"
    fill(g, 1, 9, 9, 2, "S")
    g[7][7], g[8][7] = "P", PORTAL_TAIL
    g[7][12], g[8][12] = "Q", PORTAL_TAIL
    g[18][2], g[19][2] = "P", PORTAL_TAIL
    g[18][17], g[19][17] = "Q", PORTAL_TAIL
    fill(g, 11, 4, 2, 2, "R")
    fill(g, 11, 14, 2, 2, "R")
    fill(g, 14, 7, 1, 6, "#")
    fill(g, 22, 5, 1, 10, "#")
    drop(g, 2, 3, "o")
    drop(g, 14, 9, "h")
    drop(g, 22, 7, "p")
    drop(g, 22, 12, "u")
    return Level(29, "Botnet", g, [11, 7, 1, 13], "row", regen_delay=5)


def level_supernova() -> Level:
    """Four engines around an open core. Each bomb guts its own engine. The core has its own detonator.
    One engine is infected, the floor band fades, and a portal leads over the top."""
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
    g[2 + top + 2][2] = "V"
    phases = {}
    for c in range(4, 16):
        g[21][c] = "G"
        phases[(21, c)] = ((c - 4) * 0.083) % 1
    g[1][9], g[2][9] = "Z", PORTAL_TAIL
    g[18][1], g[19][1] = "Z", PORTAL_TAIL
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
        phases=phases,
        lights_out=True,
    )


BUILDERS = [
    level_first_light,
    level_diamond,
    level_pillars,
    level_frame,
    level_two_cities,
    level_fireworks,
    level_vault,
    level_slow_burn,
    level_plated,
    level_powder_keg,
    level_patrol,
    level_wisps,
    level_seance,
    level_rune_lock,
    level_airlock,
    level_haunted_locks,
    level_garden,
    level_weeds,
    level_ossuary,
    level_gravekeeper,
    level_wormhole,
    level_relay,
    level_outbreak,
    level_firewall,
    level_gauntlet,
    level_fortress,
    level_crown,
    level_botnet,
    level_supernova,
]


# ---------------------------------------------------------------- checks


def cells(level: Level) -> list[tuple[int, int, str]]:
    out = []
    for r, row in enumerate(level.g):
        for c, ch in enumerate(row):
            if ch not in (".", PORTAL_TAIL):
                kind_of(ch)  # validate
                out.append((r, c, ch))
    return out


def rect_of(r: int, c: int, ch: str) -> tuple[int, int, int, int]:
    return (c * BW, r * BH, BW, BH * 2 if kind_of(ch) == "portal" else BH)


def center(row: int, col: int) -> tuple[float, float]:
    return col * BW + BW / 2, row * BH + BH / 2


def in_blast(a: tuple[int, int], b: tuple[int, int]) -> bool:
    ax, ay = center(*a)
    bx, by = center(*b)
    dx = max(abs(ax - bx) - BW / 2, 0)
    dy = max(abs(ay - by) - BH / 2, 0)
    return dx * dx + dy * dy <= BLAST_R2


def chain(level: Level, start: tuple[int, int]) -> set[tuple[int, int]]:
    """Everything one bomb or one lit fuse takes with it: fuses burn into every fuse and bomb they
    touch, diagonals included, and a blast lights or sets off what's in range."""
    found = cells(level)
    bombs = {(r, c) for r, c, ch in found if kind_of(ch) == "explosive"}
    fuses = {(r, c) for r, c, ch in found if kind_of(ch) == "fuse"}
    breakables = {(r, c) for r, c, ch in found if breakable(ch)}
    gone = {start}
    queue = deque([start])
    while queue:
        src = queue.popleft()
        if src in fuses:
            r, c = src
            near = {(r + dr, c + dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1)}
            for pos in near & (fuses | bombs):
                if pos not in gone:
                    gone.add(pos)
                    queue.append(pos)
        elif src in bombs:
            for pos in breakables:
                if pos not in gone and in_blast(src, pos):
                    gone.add(pos)
                    if pos in bombs or pos in fuses:
                        queue.append(pos)
    return gone


def chain_size(level: Level, start: tuple[int, int]) -> int:
    return len(chain(level, start))


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


def flood_reachable(
    level: Level, closed: set[tuple[int, int]] | None = None
) -> set[tuple[int, int]]:
    """Ball-sized flood from below the playfield. Breakable bricks are removed once the ball can
    touch them, and lighting one fuse takes its whole chain.

    Switches count as reached when touched and stay. Gates block when in `closed` (by default,
    the ones that start closed). Phantoms never block, since the ball passes them as ghosts.
    Touching a portal lets the ball out anywhere around its twin.
    """
    found = cells(level)
    if closed is None:
        closed = {(r, c) for r, c, ch in found if kind_of(ch) == "gate" and not gate_open(ch)}
    blockers: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    targets: list[tuple[int, int]] = []
    fixed: set[tuple[int, int]] = set()
    ends: dict[int, list[tuple[int, int, int, int]]] = {}
    fuses = set()
    for r, c, ch in found:
        rect = rect_of(r, c, ch)
        kind = kind_of(ch)
        if ch in MOVER:
            if ch != "W":
                targets.append((r, c))
            continue
        if kind == "portal":
            ends.setdefault(PORTAL_LINK[ch], []).append(rect)
        elif kind == "gate":
            if (r, c) in closed:
                blockers[(r, c)] = rect
        elif kind == "switch":
            targets.append((r, c))
            fixed.add((r, c))
            blockers[(r, c)] = rect
        elif kind == "phantom":
            targets.append((r, c))
        elif kind != "steel":
            targets.append((r, c))
            blockers[(r, c)] = rect
            if kind == "fuse":
                fuses.add((r, c))
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

    reach = BALL_R + STEP
    reach2 = reach * reach

    def touched(seen: bytearray, rect: tuple[int, int, int, int]) -> bool:
        x, y, w, h = rect
        x0 = max(0, int((x - reach) / STEP) - 1)
        x1 = min(gw - 1, int((x + w + reach) / STEP) + 1)
        y0 = max(0, int((y - reach) / STEP) - 1)
        y1 = min(gh - 1, int((y + h + reach) / STEP) + 1)
        for iy in range(y0, y1 + 1):
            py = iy * STEP + STEP / 2
            for ix in range(x0, x1 + 1):
                if not seen[iy * gw + ix]:
                    continue
                px = ix * STEP + STEP / 2
                dx = max(x - px, 0, px - (x + w))
                dy = max(y - py, 0, py - (y + h))
                if dx * dx + dy * dy <= reach2:
                    return True
        return False

    def reachable_mask(grid_b: bytearray) -> bytearray:
        seen = bytearray(gw * gh)
        q: deque[tuple[int, int]] = deque()

        def seed(ix: int, iy: int) -> None:
            i = iy * gw + ix
            if 0 <= ix < gw and 0 <= iy < gh and not grid_b[i] and not seen[i]:
                seen[i] = 1
                q.append((ix, iy))

        for ix in range(gw):
            seed(ix, gh - 1)
        exits: set[tuple[int, int, int, int]] = set()
        while True:
            while q:
                ix, iy = q.popleft()
                for nx, ny in ((ix - 1, iy), (ix + 1, iy), (ix, iy - 1), (ix, iy + 1)):
                    if nx < 0 or ny < 0 or nx >= gw or ny >= gh:
                        continue
                    seed(nx, ny)
            # A ball into one end comes out around the other, heading any way it likes.
            for pair in ends.values():
                for a, b in ((pair[0], pair[-1]), (pair[-1], pair[0])):
                    if b in exits or not touched(seen, a):
                        continue
                    exits.add(b)
                    x, y, w, h = b
                    pad = BALL_R + STEP * 2
                    for iy in range(int((y - pad) / STEP), int((y + h + pad) / STEP) + 1):
                        for ix in range(int((x - pad) / STEP), int((x + w + pad) / STEP) + 1):
                            seed(ix, iy)
            if not q:
                return seen
    hit: set[tuple[int, int]] = set()
    remaining = set(targets)
    active = dict(blockers)
    while True:
        seen = reachable_mask(blocked_grid(active))
        newly = {(r, c) for r, c in remaining if touched(seen, (c * BW, r * BH, BW, BH))}
        for pos in list(newly):
            if pos in fuses:
                newly |= chain(level, pos) & remaining
        if not newly:
            break
        for pos in newly:
            hit.add(pos)
            remaining.discard(pos)
            if pos not in fixed:
                active.pop(pos, None)
    return hit


def gated_reach(level: Level) -> tuple[set[tuple[int, int]], list[int]]:
    """What the ball can reach, flipping switches as it likes, and the channels it can't flip.

    A channel counts as the player's once one of its switches can be reached with every gate of
    that channel shut, so it can always be flipped back. Bricks then count as reached if either
    state of each such channel gets the ball to them.
    """
    found = cells(level)
    gates = {(r, c): (channel_of(ch), gate_open(ch)) for r, c, ch in found if kind_of(ch) == "gate"}
    switches = {(r, c): channel_of(ch) for r, c, ch in found if kind_of(ch) == "switch"}
    channels = sorted(set(switches.values()))
    if not gates:
        return flood_reachable(level), []
    owned: set[int] = set()
    changed = True
    while changed:
        changed = False
        for ch in channels:
            if ch in owned:
                continue
            shut = {p for p, (c, o) in gates.items() if c == ch or (c not in owned and not o)}
            hit = flood_reachable(level, shut)
            if any(pos in hit for pos, c in switches.items() if c == ch):
                owned.add(ch)
                changed = True
    hit: set[tuple[int, int]] = set()
    mine = sorted(owned)
    for mask in range(1 << len(mine)):
        flipped = {ch for i, ch in enumerate(mine) if mask >> i & 1}
        shut = {p for p, (c, o) in gates.items() if o == (c in flipped)}
        hit |= flood_reachable(level, shut)
    return hit, [ch for ch in channels if ch not in owned]


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
        tails = [(rr, cc, ch) for rr, row in enumerate(level.g) for cc, ch in enumerate(row) if ch == PORTAL_TAIL]
        for rr, cc, ch in cells(level) + tails:
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


# The first level each mechanic may appear in, and what each lesson level must show. The
# wave-2 slots (10, 16, 19, 20, 26-30) hold stand-ins built from what's been taught so far.
FIRST = {
    "steel": 4,
    "explosive": 6,
    "fuse": 8,
    "armored": 9,
    "mover": 11,
    "phantom": 12,
    "switch": 14,
    "gate": 14,
    "regen": 17,
    "portal": 21,
    "virus": 23,
}
LESSONS = {
    4: {"steel"},
    5: {"steel"},
    6: {"explosive"},
    7: {"explosive"},
    8: {"fuse", "explosive"},
    9: {"armored"},
    10: {"fuse", "armored", "explosive"},
    11: {"mover", "armored"},
    12: {"phantom"},
    13: {"phantom"},
    14: {"switch", "gate"},
    15: {"switch", "gate"},
    16: {"phantom", "switch"},
    17: {"regen"},
    18: {"regen", "phantom"},
    19: {"switch", "regen"},
    20: {"phantom", "switch", "regen"},
    21: {"portal"},
    22: {"portal"},
    23: {"virus"},
    25: {"virus", "portal"},
    26: {"virus", "regen"},
    27: {"portal", "phantom", "regen"},
    28: {"portal", "phantom", "regen"},
    29: {"portal", "virus", "regen"},
    30: {"portal", "virus", "phantom", "regen"},
}


def check_elements(level: Level, problems: list[str]) -> None:
    n = level.num
    found = cells(level)
    at = {(r, c): ch for r, c, ch in found}
    for r, row in enumerate(level.g):
        for c, ch in enumerate(row):
            if ch == PORTAL_TAIL and (r == 0 or kind_of(level.g[r - 1][c]) != "portal"):
                problems.append(f"{n}: a portal tail at {r},{c} has no portal over it")
    links: dict[int, int] = {}
    for r, c, ch in found:
        kind = kind_of(ch)
        if kind == "portal":
            links[PORTAL_LINK[ch]] = links.get(PORTAL_LINK[ch], 0) + 1
            if r + 1 >= len(level.g) or level.g[r + 1][c] != PORTAL_TAIL:
                problems.append(f"{n}: portal at {r},{c} needs {PORTAL_TAIL!r} under it")
            # The ball comes out along its heading just clear of the edge: leave it air to the
            # sides and below.
            for rr, cc in ((r, c - 1), (r + 1, c - 1), (r, c + 1), (r + 1, c + 1), (r + 2, c)):
                if (rr, cc) in at:
                    problems.append(f"{n}: portal at {r},{c} is boxed in at {rr},{cc}")
        if kind == "virus":
            near = [at.get(p) for p in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1))]
            if not any(x is not None and kind_of(x) == "normal" and x not in MOVER for x in near):
                problems.append(f"{n}: virus core at {r},{c} has no plain brick to infect")
        if (r, c) in level.phases and kind != "phantom":
            problems.append(f"{n}: phase on a non-phantom at {r},{c}")
    for link, count in links.items():
        if count != 2:
            problems.append(f"{n}: portal link {link} has {count} ends")
    for ch in (1, 2, 3):
        sw = any(kind_of(x) == "switch" and channel_of(x) == ch for _, _, x in found)
        gt = any(kind_of(x) == "gate" and channel_of(x) == ch for _, _, x in found)
        if sw != gt:
            problems.append(f"{n}: channel {ch} has {'a switch but no gate' if sw else 'gates but no switch'}")


def check_level(level: Level) -> list[str]:
    problems: list[str] = []
    found = cells(level)
    breakables = [(r, c, ch) for r, c, ch in found if breakable(ch)]
    kinds = {kind_of(ch) for _, _, ch in found}
    if any(ch in MOVER for _, _, ch in found):
        kinds.add("mover")
    n = level.num
    for kind, first in FIRST.items():
        if n < first and kind in kinds:
            problems.append(f"{n}: {kind} shows up before its lesson at {first}")
    for kind in sorted(LESSONS.get(n, set()) - kinds):
        problems.append(f"{n}: the lesson here needs {kind}")
    check_elements(level, problems)

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

    starts = [(r, c) for r, c, ch in found if kind_of(ch) in ("explosive", "fuse")]
    if starts:
        worst = max(chain_size(level, b) for b in starts)
        frac = worst / len(breakables)
        if frac > 0.42:
            problems.append(f"{n}: one blast chain clears {worst}/{len(breakables)} ({frac:.0%})")

    clusters = regen_clusters(level)
    if clusters and clusters[0] > 6:
        problems.append(f"{n}: regen cluster of {clusters[0]} (max 6)")

    hit, stuck = gated_reach(level)
    missed = [(r, c) for r, c, ch in breakables if (r, c) not in hit]
    if missed:
        problems.append(f"{n}: {len(missed)} unreachable bricks, first {missed[:8]}")
    for ch in stuck:
        problems.append(f"{n}: no switch on channel {ch} can be reached with its gates shut")

    check_moves(level, problems)

    # Matches LEVEL_MAX_Y in src/core/types.ts, which keeps the paddle's reaction room.
    if any(r > MAX_ROW for r, _, _ in found):
        problems.append(f"{n}: a brick is below row {MAX_ROW}")
    return problems


def gid_for(level: Level, ch: str, row: int, col: int) -> int:
    kind = kind_of(ch)
    if kind == "fuse":
        return FUSE
    if kind == "phantom":
        return PHANTOM
    if kind == "switch":
        return SWITCH0 + channel_of(ch)
    if kind == "gate":
        return GATE0 + channel_of(ch)
    if kind == "portal":
        return PORTAL0 + PORTAL_LINK[ch]
    if kind == "virus":
        return VIRUS_CORE
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
        kind = kind_of(ch)
        if kind == "phantom":
            if level.period != PHANTOM_PERIOD:
                props.append({"name": "period", "type": "float", "value": level.period})
            if level.phases.get((r, c)):
                props.append({"name": "phase", "type": "float", "value": round(level.phases[(r, c)], 3)})
        if kind == "gate" and gate_open(ch):
            props.append({"name": "open", "type": "bool", "value": True})
        if kind == "virus" and level.spread_ms != SPREAD_MS:
            props.append({"name": "spreadMs", "type": "float", "value": level.spread_ms})
        if (r, c) in level.glow:
            color, radius, intensity = level.glow[(r, c)]
            props.append({"name": "light", "type": "color", "value": color})
            props.append({"name": "lightRadius", "type": "float", "value": radius})
            props.append({"name": "lightIntensity", "type": "float", "value": intensity})
        while n in taken:
            n += 1
        _, _, w, h = rect_of(r, c, ch)
        obj = {
            "id": n,
            "gid": gid_for(level, ch, r, c),
            "x": c * BW,
            "y": r * BH + h,
            "width": w,
            "height": h,
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
    # The lighting flags belong to the level, not the slot, so a map's old ones never carry over.
    # `lighting` is not a map property; a bool of that name used to get saved by mistake.
    generated = {p["name"] for p in properties} | {"lightsOut", "lightning", "lighting"}
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
    # The class puts the map settings (boss, mood, lighting) in Tiled's Properties panel.
    out["class"] = (previous or {}).get("class") or "LevelLighting"
    return out


def summarize(level: Level) -> str:
    found = cells(level)
    def count(k: str) -> int:
        return sum(1 for _, _, ch in found if kind_of(ch) == k)

    breakables = [c for c in found if breakable(c[2])]
    hits = 0
    for r, c, ch in breakables:
        if kind_of(ch) == "armored":
            hits += 2 + level.armor.get((r, c), 2)
        else:
            hits += 2
    starts = [(r, c) for r, c, ch in found if kind_of(ch) in ("explosive", "fuse")]
    frac = 0
    if starts and breakables:
        frac = max(chain_size(level, b) for b in starts) / len(breakables)
    elements = " ".join(
        f"{k[:3]} {count(k)}" for k in ("fuse", "phantom", "switch", "gate", "portal", "virus") if count(k)
    )
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
        f"{','.join(powers)}  {elements}"
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
            hit, _ = gated_reach(lv)
            bad = {(r, c) for r, c, ch in cells(lv) if breakable(ch) and (r, c) not in hit}
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
    index_path = LEVELS / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    index["levels"] = [f"level{n:02}.tmj" for n in range(1, 31)]
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(levels)} maps; level 24 left untouched")


if __name__ == "__main__":
    main()
