# Super Breaker

A brick breaker for browsers and phones, built with [Phaser 4](https://phaser.io), TypeScript and Vite. It ships as an installable PWA, as native iOS/Android apps through [Capacitor](https://capacitorjs.com), and as desktop apps for Windows, macOS and Linux through [Electron](https://www.electronjs.org).

## Quick start

Requires Node 20+ and pnpm 9 (`corepack enable`).

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

| Script              | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `pnpm dev`          | Vite dev server with hot reload                              |
| `pnpm build`        | Typecheck, then build the PWA into `dist/`                   |
| `pnpm preview`      | Serve the production build (service worker enabled)          |
| `pnpm web:deploy`   | Build the PWA and deploy it to Cloudflare Workers            |
| `pnpm test`         | Vitest unit tests, including validation of all levels        |
| `pnpm lint`         | ESLint (flat config, typescript-eslint)                      |
| `pnpm format`       | Prettier                                                     |
| `pnpm cap:ios`      | Build, sync and open the Xcode project                       |
| `pnpm cap:android`  | Build, sync and open the Android Studio project              |
| `pnpm desktop:dev`  | Electron window on the Vite dev server, with hot reload      |
| `pnpm desktop:dist` | Build the desktop app and package installers into `release/` |

In dev builds, `?level=24` starts that level straight away and `?map=level24.tmj` does the same by file name (a map that isn't in `index.json` yet is played as an extra level). `?arcade=waves` or `?arcade=descent` starts an Arcade run, optionally with `&goal=rounds` (or `timed`, default `endless`) and `&seed=1K9ZQ2` (base 36, as the results screen shows it). `?lighting=low`, `medium` or `high` pins the lighting tier, for comparing them side by side. `?world=hell`, `crypt` or `mainframe` skins the menus as that world, `?logo=1` to `4` pins the title logo, and `?ui=gallery` opens a sheet of every UI component in the current skin. `?laser=gun`, `helix`, `scatter`, `swarm` or `ricochet` makes every laser fire that way, and L hands out a laser during play, so `?level=24&laser=helix` tries a mode on a given layout. `?map=bosslab.tmj` plays the boss lab, a level that is one boss fight: `&phase=2` starts the fight in that phase, `&attack=volley` makes every attack that one, `&debug` draws the boss's hit zones, the `]` key empties the current phase's pool, and the running fight is `window.boss` in the console. `?stop=10` plays the campaign's boss stop after level 10 (the Warden), and `?stop=8b` the bonus stage after level 8 (the piñata). `?scene=chapter-2` plays a cutscene, and `&at=arrival` (a label or a time in ms) starts it partway; the running scene is `window.cutscene` in the console, with `seek`, `pause`, `resume`, `step`, `skip` and `labels` (see [docs/cutscenes/authoring.md](docs/cutscenes/authoring.md)). `?fx=lab` opens the FX Lab, a test bench for every particle effect (see [FX engine](#fx-engine)). The Phaser game is also available as `window.game` in the browser console:

```js
game.scene.getScene('Title').scene.start('Play', { index: 24 });
```

To check performance on a phone, run `pnpm build && pnpm preview --host`, open the printed network URL with `?debug` appended, and watch the overlay: frame rate, CPU time per frame, physics bodies, live particles, render zoom, the FX engine's tier and load (particles, running effects, sprites and ribbon trails), and the lighting tier, light count, light map size and lighting CPU time. When frames stay slow the game steps quality down by itself: first the High lighting extras, then the render resolution (2x, then 1.5x, then 1.25x), and last the light map drops to Low. Settings has a Battery saver toggle that forces the lowest steps and halves particles.

The preview serves `dist/` as it was at the last build, so run `pnpm build` again after editing levels or code. The phone picks up the new build when it next reloads the page (it may reload once by itself).

For play-testing on any build, including phones, Settings has God mode (balls bounce off the floor and no lives are lost, Descent breaches included) and Unlock all levels. Unlocking keeps stars and best scores, and there is no button to lock levels again.

Playing on a 16:9 TV from the gaming PC, with the controller already paired to that PC, is covered in [docs/tv-play.md](docs/tv-play.md): the wide stage, the wing plates, the gamepad mapping, and the couch test.

## Project layout

```
src/
  main.ts            Boots the save store, then the Phaser game
  config.ts          Layout constants, colors, powerup info, asset manifest
  core/              Pure, engine-free logic (unit tested)
    Difficulty.ts    Speeds, damage and lives per difficulty
    Economy.ts       Coin upgrade shop, powerup stats, drop table
    LevelParser.ts   Tiled map -> LevelSpec, plus validation
    Lighting.ts      Light falloff, flicker presets, sampling and the per-frame light budget
    Rng.ts           Seeded random numbers for generated levels
    Run.ts           Arcade run rules: loops, goals, tiers, clock
    Boss.ts          Boss fight rules: steps, phases, attack plans and their fairness checks
    Cues.ts          The cue scheduler behind boss cutscenes
    cutscene/        Cutscene scripts as data: step builders, the compiler, the playhead, grades and text markup
    procgen/         Arcade level generator: tier curve, patterns, mechanics, rule checks
    SaveStore.ts     Versioned save data with legacy Cordova migration
  entities/          Ball, Paddle, Brick game objects
  systems/           Bricks, powerups, input, audio, juice (shake/hit-stop/particles), lighting, Arcade runs, boss fights
  fx/                The particle engine, its texture atlas and color palettes
    library/         The effect presets, one file per group (bricks, impacts, weapons, boss, weather...)
  bosses/            One file per boss, and the list a level's `boss` property picks from
  cutscenes/         One file per story cutscene, and the list `index.json` routes from
  systems/cutscene/  The cutscene director: camera, grade, actors, plates and ambient fields
  ui/cutscene/       Letterbox, dialog box and chapter card views
  scenes/            Boot, Preload, Title, Worlds, WorldPath, Briefing, ArcadeSelect, Play, Hud, Cutscene, Pause, Results, Upgrades, Settings, Transition
  ui/                Per-world themes, baked frames, buttons, cards, controls and widgets
  ui/fx/             Scene transitions, motion helpers, UI particles, the logo reveal and behind-overlay filters
  art/procedural.ts  Canvas-drawn fallbacks for any texture that fails to load
  art/backdrops.ts   Parallax worlds: layer order, scroll speeds, tints, light and particles
  art/lighting.ts    How each world is lit: ambient, shadows, ball light, key light, mood
  art/bossMusic.ts   The boss track's sections and playlists
  platform/          Storage, haptics, app lifecycle, gamepad, the pad cursor and the desktop bridge
desktop/             Electron shell: the window, the app:// file server and the preload bridge
public/assets/       Images, audio, fonts, tileset and levels
docs/                Design notes for larger features (Arcade, TV play, boss fights, cutscenes)
art-src/             Source sheets for the generated art, and the painted backdrop layers
scripts/process-art.py  Cuts the art sheets into game sprites and app icons
scripts/build-foreground.py  Cuts the per-world brick, paddle and ball renders into atlases and normal maps
scripts/build-anims.py  Loops the Ludo paddle, ball and powerup animations into frame sheets
scripts/build-backdrops.py  Keys, loops and splits the backdrop layers, and cuts the world cards
scripts/process-logo.py  Splits the logo concepts into a base and a glow layer
scripts/build-bosses.py  Cuts the boss sprite sheets
scripts/build-fx.py  Cuts the generated particle sheets into strips for the fx atlas
scripts/build-boss-audio.py  Synthesizes the placeholder boss sound effects
scripts/build-boss-music.py  Cuts the placeholder boss track from a recording
scripts/build-cutscene-art.py  Cuts the cutscene portraits, sprite sheets and plates
scripts/build-cutscene-audio.py  Synthesizes the placeholder cutscene sounds and the wind bed, and levels the generated score, sounds and voice-over
archive/             Retired levels and the old static backgrounds
tests/               Vitest suites
ios/, android/       Capacitor native projects
```

The playfield is 600 logical units wide and at least 800 tall; on taller screens it grows to fill the display. `src/core/Layout.ts` splits it into the HUD strip, an arena capped at 840 units (so the ball's trip to the bricks stays short) and, on touch devices, a control deck under the paddle that holds the ability and powerup buttons and a drag strip. Dragging anywhere on screen still moves the paddle. The canvas renders at up to 2x device pixel ratio, drops resolution automatically if frames run long, and respects safe-area insets. Portrait is enforced on native and a rotate prompt is shown on landscape phones.

On a landscape desktop window the stage widens around the board, up to 16:9, once each side wing is at least 200 units (`computeStage` in `src/core/Layout.ts`). The board keeps its size and geometry, the backdrop spans the whole stage, and the HUD moves onto two glass plates in the wings (`src/ui/WingPlates.ts`). A narrower window keeps the board HUD.

## Menus

The title screen plays the logo reveal once per session, then opens the hub: Continue (the next level, with its stars and the world's progress), Campaign, Arcade and the Armory, with coins, stars and Settings along the top.

A new player skips all of that: with no progress and no tutorial seen, the game opens straight into Level 1 with no clicks, and browser audio starts on their first input. A tutorial plays over the real level, with a line of English over pictures of whichever controls are in use: a demo paddle sweeps with a hand on the deck on touch, a swaying mouse and the arrow and A/D keys on desktop, or the stick and D-pad on a controller. The serve waits until the paddle has moved 200 units, then until the player launches it (a ring pulsing on the ball, with a tap, a click, Space or A). After that the tutorial stops play five times, dims the field and waits for the player. When the ball first falls toward the paddle, it marks the line under the paddle and draws the ball's path down to a ghost paddle where it will land ("Keep at least one ball above the line"). Then it does the same for the first useful powerup to fall, or moves on if none falls within 20 seconds. Next, it lights an ability slot and waits for the player to fire it, rolling them an ability first if both slots are empty. Last come the two cooldown skills, each charged on the spot: it lights the gun while the ball is up the field ("Your gun recharges as you play") and waits for a click, F, a tap or A, then lights bullet time as a ball comes down at the paddle, traces its path, and waits for S, Shift, the hourglass or B. Each stop lasts at least 1.2 seconds so the words can be read, and lets go once the paddle is under the ball or powerup. **Skip tutorial** at the top right, or Select on a pad, ends it at any time, and it is saved as seen either way. Settings has **Replay tutorial**, which brings it back on the next level, and Pause lists every control in a Controls card beside its buttons, each with a few words on how, and on touch with small copies of the paddle, ball, slots and buttons. The steps are in `src/core/Onboarding.ts` and the visuals in `src/systems/OnboardingCoach.ts`.

- **Campaign** is a carousel of the three worlds. Swipe, use the arrow keys or tap the arrows; locked worlds say which level unlocks them. Entering a world opens its path, ten nodes down the screen with stars on each cleared level.
- Tapping a level opens the **Briefing** sheet: what the level features (steel, TNT, lights out, storms…), the difficulty, your loadout, and Play.
- **Arcade** picks the mode (Waves or Descent), the goal, the difficulty and the seed, which can be rerolled.
- The **Armory** sells permanent upgrades (Powerups and Abilities tabs) and one-use stock for the next run. It opens from the hub, the briefing, pause and results.

Every screen is skinned by the world it belongs to: forged iron and embers for Hell, carved stone, silver and violet glass for the Crypt, holographic cyan glass for the Mainframe. The menus follow the world you last played. `src/ui/theme.ts` holds each skin's palette, fonts, frame style and ambient particles; `src/ui/frames.ts` bakes the panels and buttons into canvas textures once, so menus cost no geometry per frame. Pause blurs the level behind it, and a game over drains its colour.

Reduced motion keeps the layout and cuts the idle loops, particles and big entrances. Battery saver also drops the filters (blur, glow and desaturation). Escape, the Android back button and a controller's east button (B on Xbox, Circle on PlayStation) go back one screen everywhere. Escape is only ever a shortcut, never the sole way out, because in a browser it also leaves fullscreen: P and the on-screen buttons cover everything it does.

### Keyboard

Keys are bound by position (`KeyboardEvent.code`), so they sit in the same place on any layout, and every on-screen label names the key the way the player's keyboard prints it. On AZERTY the movement letters show as Q and D and the ability keys as A and E. The labels come from the browser's keyboard layout map where it is allowed (not in cross-origin iframes such as CrazyGames), from each letter the player presses, and until then from a guess based on the browser language (`src/core/KeyLayout.ts`, `src/platform/keyboard.ts`). Pause follows the P character instead, so it is P on every layout.

| Key               | In play                  |
| ----------------- | ------------------------ |
| Arrow keys, A / D | Move the paddle          |
| Space, Up, W      | Launch                   |
| Q, E              | Fire ability slot 1 or 2 |
| 1–4               | Use stocked powerup 1–4  |
| P                 | Pause, and resume        |

Presses with Ctrl, Cmd or Alt held are left to the browser, so a shortcut like Ctrl/Cmd+W is never taken as game input. The desktop app ignores Ctrl/Cmd+W while it is fullscreen, so the window can't close by accident.

### Controller

Any pad that reports the standard mapping works (Xbox, DualSense, Switch Pro). The browser only sees a pad after one of its buttons is pressed while the game has focus. Button names below are Xbox's.

| Input             | In play                  | In menus               |
| ----------------- | ------------------------ | ---------------------- |
| Left stick, d-pad | Move the paddle          | Move the cursor        |
| A                 | Launch                   | Click under the cursor |
| B                 |                          | Back                   |
| X, Y              | Fire ability slot 1 or 2 |                        |
| LB, RB, LT, RT    | Use stocked powerup 1–4  |                        |
| Start             | Pause                    | Resume from Pause      |

The menu cursor is a DOM element that sends ordinary mouse events to the canvas (`src/platform/padCursor.ts`), so every menu works with the pad without its own wiring. It hides during play, and the mouse pointer hides while the pad is in use. Vibration in Settings also rumbles the pad.

The title logo is one of four designs, picked at random each launch. The source concepts are in `art-src/logo/`; `scripts/process-logo.py` (Pillow, numpy) splits each into a base and a glow layer that is tinted per world. The original hand-made logo is kept in `archive/ui/logo-original.png`.

```sh
python3 scripts/process-logo.py              # all concepts
python3 scripts/process-logo.py concept-2-shattered
```

## Gameplay

- **Difficulties:** easy, normal and hard change ball speed, brick damage, spin and paddle size. In the campaign the ball speed also follows a gentle sawtooth (`campaignSpeedScale` in `src/core/Difficulty.ts`): it rises through each world's ten levels, and each world opens a little easier than the last one ended.
- **Serving:** a held ball launches by itself after a 3-2-1 countdown, unless the player taps first. In the tutorial the first serve waits for the player to launch it; skipping the tutorial with the ball still held gives them 5 seconds. Magnet catches let go after 2.5 seconds.
- **Level clear:** a banner with stars, score and coins counts down to the next level, which starts by itself after 3.5 seconds; a tap goes on early. Pausing during the banner still reaches Upgrades and the level list. The last level, Game Over and Arcade runs end on the Results screen.
- **Ball speed:** each break speeds the ball up, and it eases back toward a cruise speed afterwards. The cruise speed climbs as the level empties.
- **Stars and coins:** levels award 1–3 stars based on lives left. Coins dropped by bricks are spent in the Upgrades shop. The **Powerups** tab upgrades magnet, fireball (duration and how many bricks it plows through before bouncing) and laser (longer bursts with more total damage) over 5 tiers; each tier costs base × tier, so the first ones only cost 8–12 coins. The **Abilities** tab unlocks Mega Bomb, Laser Sweep and Black Hole (Meteor, Lightning and Frenzy are owned from the start) and raises each ability through 3 tiers. Only owned abilities appear in the slot roulette.
- **Brick kinds:** normal, steel (unbreakable), explosive (chain-reacts in a radius), armored (needs extra hits, shows cracks; laser bolts chip off one armor point per 30 damage), regen (clusters grow back unless cleared together), and moving (any brick can slide horizontally).
- **Powerups:** magnet, fireball (smashes through several bricks before bouncing), laser (each pickup rolls a firing mode, never the same one twice in a row: Machine Gun, Helix, Scatter, homing Swarm missiles or Ricochet), multiball, bigger/smaller paddle, coin, shield, hyperspeed (faster physics and double damage), extra life, pierce and the mystery box. Multiball and Ball Frenzy stop at 10 balls; going over pays out score and a little Fever instead.
- **Drop director:** `DropDirector` in `src/core/Economy.ts` scales powerup drops by how much is going on (balls in flight, running powerups, Fever). A calm field drops about 27% powerups, a multiball peak about 6%, multiball fades out toward the ball cap, and coins keep their share either way. The first powerup of a level is guaranteed by the third break, and after that one comes within 8 dry breaks while the field is calm.
- **Ability slots:** rainbow mystery boxes fill two slots through a Mario Kart style roulette. Tap a slot (or press Q/E, or X/Y on a controller) to fire Meteor Shower, Chain Lightning, Mega Bomb, Laser Sweep, Black Hole or Ball Frenzy. Players who are struggling, and levels with lots left, roll bigger area abilities (`src/core/Abilities.ts`).
- **Fever:** fast consecutive breaks fill the bar under the HUD. When it's full you get 8 seconds of fireball balls, double score and rainbow trails. Each break fills less with more balls in flight (divided by the square root of the ball count), so a full field can't chain Fevers back to back.
- **Pacing director:** `src/core/Pacing.ts` scores boredom from dry spells, a low break rate, the ball looping off the paddle, and the last bricks dragging on. It escalates from a homing nudge to a gift mystery box to a power surge that charges Fever. With 3 or fewer bricks left the ball homes in gently.
- When few breakable bricks are left (about 15%, between 6 and 18 bricks) and the level goes quiet (no Fever, at most 2 balls in flight and nothing broken for 2 seconds), the rest collapse and fall so levels never drag on. During a multiball or Fever peak the player smashes the last bricks themselves.

## Arcade mode

Arcade plays generated levels instead of the campaign. Pick a loop and a goal on the Arcade screen:

- **Waves:** clear a generated board and a harder one drops in. **Descent:** rows keep pushing down from the top, and a brick crossing the danger line costs a life. A row comes every 4.2 s at tier 1, 0.2 s sooner each tier down to 1.8 s, and faster still while the field is thin (down to 30% of that when it is nearly empty). Clearing the field pays a bonus once and rushes 4 rows back in.
- **Bosses:** every fifth wave or tier (5, 10, 15, …) is a boss fight in a dark, empty arena. In Descent the formation is cleared for it and rushes back in after. The run clock stops during the fight. The bosses take turns in a fixed order (only the Warden exists so far).
- **Lights out:** from round 3 on, about one round in four (never a boss round) goes dark after showing its layout for 1.5 s. Which rounds go dark depends only on the seed.
- **Endless** (until out of lives), **Rounds** (10) or **Timed** (3 minutes; in Waves each clear adds 15 seconds).

Boards come from a seeded generator (`src/core/procgen/`) that unlocks mechanics in the same order as the campaign and checks every board against the campaign's rules: reachable bricks, bounded explosion chains, small regen clusters and safe movers. The same seed always gives the same run, and the results screen can replay it. The design, tuning values and roadmap are in [docs/procedural-mode.md](docs/procedural-mode.md).

## Editing levels with Tiled

Levels are [Tiled](https://www.mapeditor.org) maps in `public/assets/levels/*.tmj`, listed in order in `public/assets/levels/index.json`. They share the external tileset `public/assets/tilesets/bricks.tsj`. The index's `bosses` list puts a stop on the world map after a level (`{"after": 5, "map": "boss05.tmj"}`); the map names its boss, and the next level opens once that boss is beaten. A stop's `bonus` map is a bonus stage played after its boss, or on its own when the stop has no `map` (`{"after": 8, "bonus": "pinata.tmj"}`), in which case it comes up after its level until it has been played once.

1. Open `superbreaker.tiled-project` in Tiled. It defines the custom property types used below.
2. Duplicate an existing level (for example `level24.tmj`), place bricks as tile objects on an object layer, and add the file to `index.json`.
3. Run `pnpm test` to validate it.

The playfield is 600 px wide; bricks are 30x16 and their bottom edge must be at y = 480 or above (`LEVEL_MAX_Y`) so the paddle has room even in the shortest arena. Formations should span the arena rather than hug the ceiling: the campaign levels run 16-25 rows tall, with a near band for quick breaks, a mid structure and a prize band at the top reached through 2-column lanes. `scripts/build-campaign.py` regenerates every campaign level except Demolition (level 24) and checks these rules. Each tile in the tileset has a default `kind` (tiles 0–15 are colors, 16–19 are steel, explosive, armored and regen). Per-object properties override the tile:

| Property     | Type             | Default | Meaning                                                                                                                                   |
| ------------ | ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `BrickKind` enum | tile's  | `normal`, `steel`, `explosive`, `armored`, `regen`                                                                                        |
| `powerup`    | `Powerup` enum   | random  | Guaranteed drop: `magnet`, `fireball`, `laser`, `balls`, `bigger`, `smaller`, `coin`, `shield`, `hyper`, `extraLife`, `pierce`, `mystery` |
| `health`     | int              | 100     | Hit points before breaking                                                                                                                |
| `armor`      | int              | 2       | Extra hits needed (armored bricks)                                                                                                        |
| `moveX`      | int (px)         | 0       | Slide distance to the right of the placed position                                                                                        |
| `moveSpeed`  | int (px/s)       | 60      | Slide speed                                                                                                                               |
| `regenDelay` | float (s)        | 4       | Time before a regen cluster grows back                                                                                                    |

Older levels using `breakable: false` or `healthPts` still load. The test suite rejects levels with no breakable bricks, bricks out of bounds (including their slide range), overlapping static bricks, or unknown kinds and powerups. In dev the game also logs parser warnings to the console.

The project defines a **Play in dev server** command (Ctrl+R, under Edit → Commands) that saves the map and opens it in the running `pnpm dev` server. It uses macOS `open`; on Windows change the executable to `cmd` with arguments `/c start "" "http://localhost:5173/?map=%mapfile"`, and on Linux use `xdg-open`.

### Lighting

Each world has its own lighting look (`src/art/lighting.ts`): an ambient color that grades the backdrop, soft brick shadows, a large key light (lava glow, moonlight, server glow), a light that travels with every ball, and a mood. Hell breathes like a forge and has rising embers, the Crypt has lightning, stained-glass god rays and wandering wisps, and the Mainframe pulses with the music's bass, sweeps scanner beams and sends data pulses along L-shaped traces. Hits, breaks, explosions, lasers, pickups and abilities all cast light too, always dimmer than the ball, which stays the brightest light on screen. Levels add their own lights on an object layer named **`Lights`**. Bricks are read from every other object layer, so a brick tile placed on `Lights` is ignored with a warning.

Give objects on `Lights` the `Light` class. The object's shape decides the kind of light:

| Shape                      | Light                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Point                      | Radial light at the point, sized by `radius`                                                                    |
| Ellipse                    | Radial light filling the ellipse; its size sets the radius                                                      |
| Rectangle (can be rotated) | Area light. Use `cookie` for a god-ray `shaft`, a `stained` glass window or a `grille`                          |
| Polyline / polygon         | A light that travels along the path at `speed` × 60 units/s: back and forth on a polyline, looping on a polygon |

| `Light` member | Type           | Default   | Meaning                                                                                        |
| -------------- | -------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `color`        | color          | `#ffc070` | Light color (the alpha byte is ignored)                                                        |
| `intensity`    | float          | 0.6       | Brightness. The ball is 1; keep level lights below it                                          |
| `radius`       | float          | 96        | Reach of point and path lights, in playfield units                                             |
| `flicker`      | `Flicker` enum | `steady`  | `steady`, `candle`, `torch`, `pulse`, `breathe`, `strobe`, `glitch`                            |
| `speed`        | float          | 1         | Flicker or pulse rate; path speed                                                              |
| `phase`        | float (s)      | from id   | Offsets the flicker clock. Left unset, each light gets its own so a row never flickers in step |
| `affects`      | `LightAffects` | `both`    | `backdrop` only lights the painted background; `bricks` only lights bricks and the paddle      |
| `cookie`       | `Cookie` enum  | `none`    | Pattern for area lights                                                                        |
| `pingpong`     | bool           | true      | Path lights bounce at the end of a polyline                                                    |
| `relief`       | bool           | false     | High tier: also brings out brick and paddle bevels per pixel. Use on a few hero lights         |

Steady lights that never move are drawn once into a static light map, so dozens of them cost nothing per frame. Lights flicker gently with reduced motion on, and strobes and glitches stay under three flashes a second.

`public/assets/templates/` has ready-made lights (Insert Template, or drag from the Templates panel): `warm-light`, `cold-light`, a `glow-pool` ellipse, a `stained-window` and a `god-ray` area light, and a `data-pulse` path. New templates must be added to `templates/index.json` so the game loads them.

Bricks can glow too: set the `Brick` members `light` (a color), `lightRadius` (default 80) and `lightIntensity` (default 0.6). An emissive brick lights its neighbours until it breaks, then flares. Explosive bricks always smoulder.

Give the map the `LevelLighting` class to override the world look. `-1` and an empty color mean "use the default":

| Member              | Type        | Meaning                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ambient`           | color       | Backdrop brightness where no light reaches; `#ffffff` leaves the art as painted                                                                                                                                                                                                                                                              |
| `backdropStrength`  | float       | How strongly lights brighten the backdrop                                                                                                                                                                                                                                                                                                    |
| `brickFloor`        | float (0–1) | Brick and paddle brightness where no light reaches                                                                                                                                                                                                                                                                                           |
| `vignette`          | float (0–1) | Darkening toward the corners                                                                                                                                                                                                                                                                                                                 |
| `mood`              | `Mood` enum | `world`, `none`, `forge`, `storm` or `beat`                                                                                                                                                                                                                                                                                                  |
| `lightsOut`         | bool        | The lights are out from the start: the ball becomes a lantern, and only it, glowing bricks and the level's lights reveal the bricks. TNT doesn't smoulder, and combos, Fever and lost lives don't lift the room. The last 3 bricks glow faintly, and the lights come back on when the level is cleared. `previewTime` shows the layout first |
| `darkness`          | float (0–1) | Lights out: 0 leaves the bricks dimly visible, 1 shows only what lights reach. Default 0.75, which keeps about 9% of the room so the bricks still read as shapes                                                                                                                                                                             |
| `lanternRadius`     | float       | Lights out: how far the ball's light reaches, in playfield units. By default it shrinks as `darkness` rises, to about 120 at 0.75                                                                                                                                                                                                            |
| `previewTime`       | float (s)   | Lights out: how long the layout shows before the lights go out. Default 0, so the level starts dark                                                                                                                                                                                                                                          |
| `lightning`         | bool        | Lightning and thunder. On a lights-out level each strike shows the whole layout for a moment. With reduced motion a strike is a slow swell instead of a flash. Crypt levels that aren't lights-out have lightning anyway, and `build-campaign.py` turns it on for every lights-out level                                                     |
| `lightningInterval` | float (s)   | Average time between strikes, at least 3. Default 6                                                                                                                                                                                                                                                                                          |
| `sputter`           | bool        | Lights out: about every 11 s the dead room lights sputter back on with an electrical buzz, blink a few times and die again, each blink showing the layout for a moment. Blinks and lightning share the limit of two flashes a second. With reduced motion a sputter is one faint, slow swell. Default on                                     |

## Art pipeline

Generated art lives in `art-src/` as sheets on a white background. `scripts/process-art.py` (requires Pillow) removes the background, slices each sheet on its grid, trims, resizes and writes the sprites and app icons into `public/`:

```sh
pip install pillow
python3 scripts/process-art.py
```

### Foreground skins

Bricks, the paddle and the ball have a skin for each world: molten glass in forged iron for Hell, stained glass in carved stone for the Crypt, and lit acrylic in a gunmetal bezel for the Mainframe. The renders live in `art-src/foreground/<world>/` on flat white: one color brick master, the steel, explosive, armored and regen bricks, the paddle, and the ball.

```sh
python3 scripts/build-foreground.py              # cut the renders, then pack
python3 scripts/build-foreground.py --pack-only  # re-pack sprites edited by hand
```

The script removes the white, gradient-maps the master's glass to each of the 16 tile hues so a red brick stays red in every world, and writes the sprites to `art-src/foreground/<world>/sprites/`. It then packs each world into one atlas, `public/assets/images/foreground/<world>.webp` with `<world>.json`, which is what the game loads. The atlas also holds the animated paddle and ball as `paddle_00`, `paddle_01` and so on, with each animation's frame rate under `meta.anims`. Level files still name textures `brick_red` and so on; the world picks the atlas when the sprite is drawn. The original bricks in `public/assets/images/bricks/` stay as the Tiled tileset.

The pack step also writes `<world>_n.png`, a normal map with the same layout: a bevel around each sprite's outline plus the painted detail as fine relief. Paddle frames get only the bevel and ball frames stay flat, so the animation doesn't bloat the map. On the High lighting tier (desktop by default) the game loads it and lights bricks and the paddle per pixel, so bevels catch the ball as it passes. Phones skip it, and the service worker doesn't precache it.

The title logo (`public/assets/images/ui/logo.png`), the stars, coin, lock and heart are the original artwork and are shared by every world.

### Animations

The paddle and ball loops and the powerup badges were made with [Ludo](https://ludo.ai). The badges were drawn with `ludo image generate-with-style` from the shield icon so the set matches. Each still was then animated with `ludo sprite animate --loop`: Hydra for the paddles, which keeps their outline locked, and Ignis for the balls and badges. The raw Ludo sheets are large, so they stay untracked in `ludo-output/anim/`.

```sh
python3 scripts/build-anims.py             # every animation
python3 scripts/build-anims.py hell_ball   # just the named ones
```

The script closes each loop. It crossfades the last frames into the first, or plays forward and back for a heartbeat. It can also drop frames around a jump. Paddle and ball frames go to `art-src/foreground/<world>/anim/`, for `build-foreground.py --pack-only` to pack. Powerup loops go to `public/assets/images/powerups/<id>_loop.webp`, listed in `loops.json` with their frame rates, and each badge's still goes to `<id>.png` for the HUD and menus. A pickup whose loop fails to load falls back to its still.

### Parallax backdrops

Each world covers ten levels: Hell Foundry (1–10), The Crypt (11–20) and The Mainframe (21–30). The menus show the world the player has reached. Like a vertical shooter, a static sky sits behind painted layers that scroll upward at different speeds, so the view sinks through the world. Back to front: far, fog, mid, fog, near, with a light glow and drifting particles in between. Fever speeds the scroll up, explosions flare the light, and nearer layers slide against the paddle. Reduced motion freezes the scroll; battery saver drops the fog layers.

The source art is in `art-src/backdrops/<world>/`:

- `sky.jpg` is the static plate.
- `far.jpg`, `mid.jpg` and `near.jpg` are painted on a flat chroma key: green, or magenta for the Mainframe, whose art uses cyan.
- Optional `<layer>_b.jpg` sections continue a layer below the first, which doubles its loop length.
- `key.jpg` is the style reference the layers were painted from.

Paint the layers 720 wide (9:16), with detail toward the edges and the middle kept empty, and avoid the key hue in the artwork. Horizontal shapes like ledges, bridges and beams sell the vertical motion better than columns and chains.

`scripts/build-backdrops.py` (numpy, Pillow) does the processing:

- keys out the background and grades each layer for depth (far layers hazier, near layers darker)
- joins the sections and the loop's ends along the least visible cut
- splits layers with an empty middle into left and right strips
- generates the fog from looping noise

It writes WebP into `public/assets/images/backdrops/` and the manifest `src/art/backdrops.json`. Scroll speeds, tints, light and particles are tuned in `src/art/backdrops.ts`. A world is loaded when a scene needs it and the others are released, since each takes about 18 MB of GPU memory.

```sh
python3 scripts/build-backdrops.py                     # all worlds
python3 scripts/build-backdrops.py hell --stills /tmp/hell.jpg --video /tmp/hell.mp4
```

`--stills` and `--video` composite the world with sample bricks to check readability and the loop. Each run also writes the world carousel cards (`public/assets/images/ui/world_<id>.webp`, cropped from `key.jpg`); `--thumbs-only` writes just those.

Any texture missing at runtime is replaced by a procedural canvas drawing (`src/art/procedural.ts`), so new brick kinds or powerups can be prototyped before their art exists.

### FX engine

Every particle effect in the game goes through one engine, `src/fx/FxEngine.ts`, which plays named presets from `src/fx/library/`. There are 100 of them in ten groups:

- bricks: shatter, chain explosions, armor chips, regrowth and moving-brick dust
- impacts: wall, paddle and brick hits, and the ball trails
- elements: fire, smoke, steam, electricity, plasma, frost and acid
- weapons: muzzle flashes, tracers, missile exhaust and the rail gun's sparks
- abilities, powerups and boss: the moments each of those needs
- fanfare: combos, fever and the level-clear celebration
- weather: rain, mist, embers, ash, confetti and digital rain, picked by the level's lighting mood
- screen: lens flares, flashes and speed lines

```ts
fx.play('brick.shatter', x, y, { tint, w, h }); // one shot
const trail = fx.attach('ball.fire', ball, { tint }); // follows a target until stopped
fx.weather('weather.rain', bounds); // fills an area
trail.set({ intensity: 0.5 });
trail.stop();
```

A preset is plain data (`FxDef` in `src/fx/types.ts`). It is built from:

- particle layers, with counts or rates, forces such as turbulence, heat, wind or a vortex, and color over life;
- pooled sprites such as rings, flares and decals;
- a ribbon trail;
- a light, shake, hit-stop or backdrop flash;
- follow-up effects on a timeline.

Colors can name the world's palette (`@hot`, `@spark`, `@tint`...), so one preset reads as forge fire in Hell, spectral flame in the Crypt and plasma in the Mainframe. The caller's tint fills `@tint`. Pass `bare: true` when the caller already lights and shakes the moment itself.

The engine follows the lighting tier. Low halves the particle counts and skips the layers marked `minTier`. High adds the shockwave and heat-haze distortion. A per-frame budget shares what is left between the layers of a burst, and layers marked `essential` keep at least one particle. Reduced motion cuts particles to about a third, and battery saver halves them.

`?fx=lab` in a dev build opens the FX Lab. It has a field of bricks, a button for every preset, the world and tier switches, Showcase and Loop. Clicking a brick or the field plays the selected effect there. In the console, `fxLab.fire(id, x, y)`, `fxLab.tier(i)`, `fxLab.world(id)` and `fxLab.ids()` drive it from scripts.

Most frames are painted in code into the `fx` atlas when the game loads (`src/fx/atlas.ts`): glows, sparks, shards, rings and decals. The flipbooks are generated sheets on black in `art-src/fx/`: fire, smoke, explosions, electric arcs and wisps. `scripts/build-fx.py` (numpy, Pillow) turns brightness into alpha and cuts each sheet into a strip in `public/assets/images/fx/`, which the atlas packs at load:

```sh
python3 scripts/build-fx.py          # every sheet
python3 scripts/build-fx.py smoke    # just one
```

`tests/fx.test.ts` validates every preset against the atlas's frames, the palettes and each other. It also fails on any preset id that the game code names but the library lacks.

### Boss sprites

A boss is drawn from one sheet of animation frames on a flat white background, `art-src/bosses/<id>.jpg`. `scripts/build-bosses.py` (requires Pillow) keys out the white, cuts the grid named in its `BOSSES` table and writes `public/assets/images/bosses/<id>.png` with the frames in reading order:

```sh
python3 scripts/build-bosses.py
```

The boss sound effects (`public/assets/audio/boss/`) and the boss track (`public/assets/audio/music/boss-placeholder.mp3`) are placeholders. `scripts/build-boss-audio.py` synthesizes the effects (numpy, ffmpeg) and `scripts/build-boss-music.py --fetch` downloads a recording with yt-dlp and cuts the track from it. [docs/boss-fights/authoring.md](docs/boss-fights/authoring.md) is the guide to adding a boss.

### Cutscenes

Story scenes play between campaign steps, as listed under `scenes` in `public/assets/levels/index.json`, once per save. Each is a script in `src/cutscenes/` written with the builders in `src/core/cutscene/`. The source art is in `art-src/cutscenes/`; `scripts/build-cutscene-art.py` (Pillow, numpy) cuts the portraits, sheets and plates into `public/assets/images/cutscenes/`, and `scripts/build-cutscene-audio.py` (numpy, ffmpeg) synthesizes the placeholder sounds:

```sh
python3 scripts/build-cutscene-art.py
python3 scripts/build-cutscene-audio.py
```

Chapter I (`chapter-1`) is the game's opening: a new player's first launch goes from Preload to a "Touch to ignite" tap, which unlocks the audio, then through the scene into Level 1. Its score, sounds and voice-over were generated (Ludo, MiniMax) into `art-src/cutscenes/audio/` and `art-src/cutscenes/vo/`, and `build-cutscene-audio.py` levels and trims them into place.

[docs/cutscenes/authoring.md](docs/cutscenes/authoring.md) is the guide to writing one, and [docs/cutscenes/design.md](docs/cutscenes/design.md) explains how the director works.

## Mobile builds

The native projects in `ios/` and `android/` are committed. After changing web code:

```sh
pnpm cap:ios        # requires Xcode
pnpm cap:android    # requires Android Studio
```

App id is `com.zombieheadstudios.superbreaker` (see `capacitor.config.ts`). On native, saves go through Capacitor Preferences, haptics use the Haptics plugin, the status bar is hidden, and the game auto-pauses when the app goes to the background. App icons come from `public/icons/icon-1024.png`.

## CrazyGames

`pnpm crazy:pack` builds the game for [CrazyGames](https://crazygames.com) and zips the upload into
`release/`, after checking it against their size and file-count limits. The bundle drops the
service worker and the game's own fullscreen and rotate prompts, because their page frame owns
those, and it saves through their account-synced data module instead of localStorage.
`src/platform/crazygames.ts` is the whole bridge, and it is inert in every other build.
See [docs/crazygames.md](docs/crazygames.md) for the build, the SDK wiring and the submission steps.

## Desktop builds

The desktop app wraps the same game in Electron (`desktop/`). `vite build --mode desktop` leaves out the service worker and builds into `dist-desktop/`, apart from the web build in `dist/` that Wrangler deploys. The app serves `dist-desktop/` from a privileged `app://` scheme, which gives the game a fixed origin so its localStorage save survives restarts. The page runs sandboxed with context isolation, and `desktop/preload.cts` exposes only fullscreen and quit (`src/platform/desktop.ts` on the game side). Quitting mutes the page at once and forces the exit if the window hasn't closed within two seconds, and every build suspends its audio while the page is hidden.

```sh
pnpm desktop:dev                  # Electron on the Vite dev server
pnpm desktop:dist                 # installers for this OS, into release/
pnpm desktop:dist --win --mac --linux   # all three, from a Mac
```

| OS      | Output                                         | First launch                                        |
| ------- | ---------------------------------------------- | --------------------------------------------------- |
| Windows | `Super-Breaker-Setup-<v>.exe` and `-Portable-` | SmartScreen: "More info", then "Run anyway"         |
| macOS   | `Super-Breaker-<v>.dmg` (universal)            | Right-click the app, then Open                      |
| Linux   | `Super-Breaker-<v>.AppImage` (x64)             | `chmod +x`, then run it; also works on a Steam Deck |

The builds are unsigned (macOS is ad-hoc signed so Apple Silicon will run it). The window opens fullscreen; F11 or Alt+Enter toggles it, and Settings has a Fullscreen switch that is remembered. The title screen has a Quit button so a controller-only player can leave. Packaging is configured in `electron-builder.yml`, with the same app id and icon as the mobile apps. `.github/workflows/desktop.yml` builds all three on GitHub's runners when started by hand.

## Save data

Saves are stored under `superbreaker.save` (localStorage on web and desktop, Preferences on native, the CrazyGames data module on their site) as versioned JSON. On first launch, progress from the old Cordova version (its localStorage keys) is migrated automatically.

## Classic screenshots

The original 2015 Cordova version:

![screen-0](screens/screen-0.jpg)
![screen-1](screens/screen-1.jpg)
