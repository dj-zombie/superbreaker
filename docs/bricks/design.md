# Level elements: design

New things to put in a level besides plain, steel, explosive, armored, regen and moving bricks.
This document is the design for all twelve, the campaign order that teaches them, and the art
each one needs. Wave 1 (Fuse Line, Phantom, Rune Switch and Gates, Portals and Virus) is built;
wave 2 is specified here and still to come.

## Principles

- **One sentence each.** Every element can be explained in one line, and its silhouette, color
  and motion say that line before the ball ever touches it. If an element needs a paragraph, it
  is two elements.
- **Teach in four steps.** An element first appears where it is safe and obvious (introduce),
  then where it matters (develop), then combined with something the player already knows
  (twist), then in a finale (conclude). The only text is a one-line card the first time it
  appears.
- **Rules, not scripts.** Every element says how it reacts to the fireball, laser, pierce,
  explosions, abilities, multiball, the collapse and Descent. Combinations come out of those
  rules: an explosion flips a switch, a fuse that reaches TNT sets it off, a laser passes a
  ghost. Nothing is special-cased per level.
- **Aim matters.** Breakout gives the player one input, the angle off the paddle. The new
  elements reward using it: a bank shot through a portal, lighting a fuse at the end that runs
  the longest, timing a shot for the moment a phantom fades.
- **A target worth choosing.** A virus core, and later a turret, makes one brick more urgent
  than the rest, which breaks the sweep-the-wall rhythm with a decision.
- **Mastery is optional.** Purge bonuses, and later rescues and jackpots, reward skill but never
  stand between the player and the next level.
- **Never unfair.** Nothing may trap the ball or leave a level unclearable. Every element has
  checks in `validateLevel`, `scripts/build-campaign.py` and the Arcade board checks, and a
  runtime guard: nothing turns solid on top of a ball, the same way a regen brick waits.

## Wave 1

### Fuse Line

> Hit a fuse and the flame runs along the cord, popping every fuse brick it touches.

| | |
|---|---|
| Kind | `fuse` (tile 20) |
| Signal | A dark cord with a glowing ember core. Lit bricks flare before they pop. |
| Hit | Any hit lights it, whatever the damage: the brick pops and the flame moves on. |
| Spread | One step every 80 ms to every live fuse brick touching the last, diagonals included, so a cord can be drawn at any angle. |
| Ends | A flame that reaches TNT sets it off; an explosion that reaches a fuse lights it. |
| Credit | Each pop is a break with a growing chain, like an explosion chain. |
| Skins | Hell: a molten fuse in an iron channel. Crypt: a candle wick in carved stone. Mainframe: a circuit trace in a bezel. |

Why it's fun: designers can draw whole pictures that unzip, and the player chooses where to
light them. A cord that runs through the formation into TNT is a deliberate trick shot.

Interactions: fireballs plow through and light it; laser bolts light it; Descent allows it.

### Phantom

> A phantom fades in and out, and is only solid while you can see it.

| | |
|---|---|
| Kind | `phantom` (tile 21) |
| Properties | `period` (s, 1.5-8, default 3.2), `phase` (0-1 of the period, default 0) |
| Cycle | Solid for 60% of the period, fades out over 12%, is a ghost for 16%, fades in over 12%. |
| Signal | Ghosts are faint and shimmer. For the last 300 ms before it turns solid, it flickers. |
| Guard | It never turns solid on a ball: it waits until the ball is clear. |
| Collapse | Every phantom turns solid for good, then falls with the rest. |

Why it's fun: timing becomes part of aiming. Giving a row phases 0, 0.1, 0.2... makes it fade
in sequence like a wave, which looks great and opens and closes paths in rhythm.

Interactions: balls, fireballs and laser bolts pass a ghost; explosions and abilities hit it
either way. Descent allows it.

### Rune Switch and Gates

> Hit a switch to flip every gate of its color between solid and open.

| | |
|---|---|
| Kinds | `switch` (tiles 22-24), `gate` (tiles 25-27), one tile per channel |
| Properties | `channel` (1-3, default 1); on a gate, `open` (default false) |
| Switch | Unbreakable. A hit flips its channel, at most once per 450 ms. The ball bounces off it. |
| Gate | Unbreakable while closed. Open, it is a faint outline every ball and bolt passes through. |
| Triggers | The ball, a laser bolt or an explosion in range flips a switch. |
| Guard | A gate never closes on a ball; it waits until the ball is clear. |
| Collapse | Every gate opens for good. The "walls down" helper breaks gates along with steel. |

Gates of one channel that start in opposite states swap places on every flip, like Mario's
on/off blocks. That one rule builds vaults, airlocks and alternating mazes.

Channel colors: 1 amber, 2 cyan, 3 magenta. A switch and its gates share the color.

Interactions: fireballs bounce off switches and closed gates (and flip the switch).
Campaign only: generated switch puzzles are rarely good, so Arcade leaves them out.

### Portals

> Whatever goes into one portal comes out of its twin, at the same speed and angle.

| | |
|---|---|
| Kind | `portal` (tiles 28-30), one tile per link color |
| Size | 30x32, two rows tall |
| Properties | `link` (1-3, default 1); exactly two portals per link |
| Teleport | The ball leaves the twin's center along its own heading, just clear of the twin's edge. |
| Cooldown | 300 ms per ball, so a ball can't bounce between the pair. |
| Signal | A ring of the world's frame around a turning swirl in the link color. |
| Collapse | Portals close (fade out) when the collapse starts. |

Why it's fun: routing. A portal next to the paddle into the prize band is a shortcut the player
has to aim for; portals at the sides of a vault let the ball in behind the steel.

Interactions: laser bolts and explosions pass portals untouched; they are not walls to homing.
Arcade only places them as mirrored pairs from tier 13. Descent leaves them out.

### Virus

> While the core lives, the infection spreads into the bricks around it. Kill the core first.

| | |
|---|---|
| Kind | `virus` (tile 31 core, tile 32 infected) |
| Properties | `source` (true on a core), `spreadMs` (default 4500) |
| Core | 150 health, three normal hits. |
| Spread | Every `spreadMs` while a ball is in flight, one plain brick touching the colony (no diagonals) starts to turn. It shows creeping veins for one second, then becomes infected. |
| Infected | One armor point: two hits instead of one. |
| Cap | A core infects at most 10 bricks. Its colony stops growing when the core dies. |
| Purge | Clearing the core and everything it infected pays PURGED: 1200, less 100 per infection, at least 200. |
| Skins | Mainframe: a corrupted glitch block. Crypt: rot and mould. Hell: blight. |

Why it's fun: a priority target with a clock. Clearing the core quickly is clean and pays the
most. Letting it spread costs time and hits but is never a loss, so a struggling player can
still win.

Only plain, static, unowned bricks can be infected. The spread pauses while the ball waits on
the paddle, the same as Descent's clock, so aiming never costs bricks. Descent allows it.

### Interaction summary

| | Fireball | Laser | Explosion | Ability | Collapse | Descent |
|---|---|---|---|---|---|---|
| Fuse | plows, lights | lights | lights | breaks, lights | falls | yes |
| Phantom | passes a ghost | passes a ghost | breaks | breaks | solid, falls | yes |
| Switch | bounces, flips | flips | flips | immune | falls | no |
| Gate | bounces if closed | stopped if closed | immune | immune | opens, falls | no |
| Portal | teleports | passes | immune | immune | closes | no |
| Virus | plows, strips armor | chips armor | breaks | breaks | stops spreading | yes |

## Wave 2

Specified now so the campaign can be laid out for it; built after wave 1 has been play-tested.

- **Anvil** (Hell). *A heavy block that falls when nothing holds it up, crushing what's under
  it.* Drops a cell at a time (200 ms per row) once the cell below is empty, breaks breakable
  bricks it lands on, stops on steel, shatters harmlessly at the danger line. A dig puzzle.
- **Soul Cage** (Crypt). *Break the cage and catch the soul before it falls.* The soul drifts
  down on a slow sine; catching it pays coins, and rescuing every soul in a level pays a bonus.
  Missing one costs nothing.
- **Sentry Turret** (Mainframe). *A turret's eye glows, then it fires at the paddle.* Two hits.
  Telegraphs for 800 ms, fires a slow bolt through `HazardSystem`, at most one bolt per turret
  in the air. A hit stuns or shrinks the paddle for a second; it never costs a life.
- **Chroma Prism** (Mainframe). *The ball takes the color of the prism it passes; chroma bricks
  only break for their own color.* Each ball has its own color, shown by its trail. A mismatch
  clinks and bounces. Laser damage is colorless so there is always a way out, and every color's
  prism must be reachable.
- **Titan** (any world). *A giant brick with a face and a health bar.* 2x2 to 4x3 cells on the
  `BrickOwner` system boss parts use; sheds plates at half health, reacts to hits, pays big.
  A mini-boss inside a normal level.
- **Treasure Vault** (any world). *Every hit pays a coin; break it for the jackpot.* Re-armors
  if left alone for 3 seconds, so it rewards focus. Coins are capped per level to protect the
  shop.
- **Gravity Well** (any world). *Balls bend toward the well as they pass it.* A zone that
  doesn't collide, reusing the steering the bonus stages use for their pull. Slingshot shots.

## Campaign order

Each world has a theme for what it teaches. Hell is heat and weight, the Crypt is "what you see
isn't what's there", the Mainframe is routing and contagion. Older mechanics move earlier to
make room. Level 24 (Demolition) stays hand-made.

| Level | Lesson | Wave 1 stand-in |
|---|---|---|
| 1-3 | Plain bricks | |
| 4-5 | Steel (the Crucible after 5) | |
| 6-7 | Explosive | |
| 8 | Fuse Line, twist: a fuse into TNT (piñata after 8) | |
| 9 | Armored | |
| 10 | Anvil finale (the Warden after 10) | fuse, armor and TNT |
| 11 | Movers and armor | |
| 12-13 | Phantom | |
| 14-15 | Rune Switch and Gates | |
| 16 | Soul Cage | phantoms and switches |
| 17-18 | Regen ("the bones reassemble"), then with phantoms | |
| 19 | Switches, regen and cages | switches and regen |
| 20 | Titan "Gravekeeper" finale | everything in the Crypt |
| 21-22 | Portals | |
| 23 | Virus | |
| 24 | Demolition (hand-made) | |
| 25 | Virus with portals | |
| 26 | Sentry Turret | virus and regen |
| 27-28 | Chroma Prism | portals, phantoms and regen |
| 29 | Gravity Well with portals | portals, virus and regen |
| 30 | "Kernel" finale, Titan and everything | everything so far |

Treasure Vault set pieces go into levels 8, 15 and 25 in wave 2.

Wave 1 as built (`scripts/build-campaign.py`). The wave-2 slots hold stand-ins made from wave-1
elements until their element exists:

| # | Level | # | Level | # | Level |
|---|---|---|---|---|---|
| 1 | First Light | 11 | Patrol | 21 | Wormhole |
| 2 | Diamond | 12 | Wisps | 22 | Relay |
| 3 | Pillars | 13 | Seance | 23 | Outbreak |
| 4 | Picture Frame | 14 | Rune Lock | 24 | Demolition |
| 5 | Two Cities | 15 | Airlock | 25 | Firewall |
| 6 | Fireworks | 16 | Haunted Locks (for Soul Cage) | 26 | Gauntlet (for Sentry Turret) |
| 7 | The Vault | 17 | Garden | 27 | Fortress (for Chroma Prism) |
| 8 | Slow Burn | 18 | Weeds | 28 | Crown (for Chroma Prism) |
| 9 | Plated | 19 | Ossuary | 29 | Botnet (for Gravity Well) |
| 10 | Powder Keg (for Anvil) | 20 | Gravekeeper (for Titan) | 30 | Supernova (for Kernel) |

The build checks the order: a level may only use what an earlier level, or its own lesson, has
introduced, and each lesson level must feature its element.

Arcade unlocks follow the same order: steel 3, explosive 5, fuse 6, armored 7, mover 9,
phantom 10, regen 11, portal 13, virus 15.

## Art

Each element has a master per world in `art-src/foreground/<world>/`, a render on flat white
in that world's materials, the same as the existing bricks. `scripts/build-foreground.py` cuts
them. The switch, gate and portal masters glow cyan in every world, and that glow is
gradient-mapped to each channel's or link's color, like the 16 brick hues, so a color costs nothing
to add. The Hell sprites double as the Tiled tileset images in `public/assets/images/bricks/`.

| Master | Size | Brief |
|---|---|---|
| `fuse.jpg` | 30x16 | The world's frame around a dark cord with a hot ember core. |
| `phantom.jpg` | 30x16 | A spectral, half-transparent version of the world's brick, cold blue-white. |
| `switch.jpg` | 30x16 | The frame around a round rune button glowing cyan. |
| `gate.jpg` | 30x16 | Bars across the frame with cyan energy between them. |
| `portal.jpg` | 30x32 | A round doorway in the world's frame around a cyan vortex. |
| `virus_core.jpg` | 30x16 | A pulsing infected core: glitch block, rotting heart, blighted ember. |
| `virus.jpg` | 30x16 | A plain brick overgrown with the infection's veins. |

The phantom's shimmer, the fuse's ember, the virus's veins and the portal's swirl are animated
in code, with tweens, the FX engine (`src/fx/library/level.ts`) and emissive brick lights. The
portal's swirl is a tinted overlay turning over the painted vortex (`src/systems/ElementFx.ts`),
so no per-frame art is needed.

## Sound

`scripts/build-brick-audio.py` synthesizes the new effects into `public/assets/audio/bricks/`:
`fuse`, `phantom-in` and `phantom-out`, `switch`, `gate-open` and `gate-close`, `portal`,
`virus-spread` and `virus-purge`, loaded as `brick_fuse`, `brick_phantom_in` and so on. A fuse's
pop is the usual break sound. Sounds that fire for many bricks at once (a row of phantoms, a
channel of gates) are rate-limited so they play as one cue.
