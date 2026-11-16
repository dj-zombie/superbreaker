# Phase 2: sprite body and HUD

Read [README.md](README.md) and [design.md](design.md) first. Phase 1 must show PASS in
[STATUS.md](STATUS.md).

## Goal

The Warden is an animated sprite. Its parts become invisible hit zones under it, it sways, it
flinches when hit, its parts can move between poses, and a health bar shows on the phone HUD and
on the TV wing plate. Dev tools make a fight inspectable.

When this phase is done, `?map=bosslab.tmj` shows an animated creature that drifts side to side,
flinches on every hit and is lit by the level's lights; a bar under the HUD strip drains as it is
hit and shows which phase it is in; the second phase puts the boss in a different pose;
`?map=bosslab.tmj&debug` shows the hit zones over the sprite and a line of boss state.

## Read first

- `scripts/process-art.py` and the "Generated art" section of the root `README.md`: how art
  sheets are kept and cut. `scripts/build-foreground.py`: how a self-contained art script is laid
  out.
- `src/scenes/Preload.ts`: the coin sprite sheet and `coin-spin` animation.
  `src/systems/ParallaxBackdrop.ts`: `preload`, the model for loading art on demand from
  `Play.preload()`.
- `src/systems/LightingSystem.ts`: `attach`, `tintForeground`, `cornerTints`, and how tinting is
  skipped when lighting is off. `src/systems/ReliefLighting.ts`.
- `src/scenes/Hud.ts`: `create`, `update`, `makeFever`, `layoutFever`, `drawEffects`, the label.
  `src/ui/WingPlates.ts`: `buildLeft`, `update`. `src/ui/widgets.ts`: `Meter`.
- `src/platform/debugOverlay.ts`. `src/systems/LaserSystem.ts`: `FORCED_LASER_MODE`, the model
  for a dev URL parameter.
- `src/systems/BossBody.ts`, `src/systems/BossDirector.ts`, `src/bosses/warden.ts` as Phase 1
  left them.

## Build

### 1. The Warden's sprite sheet

One image, cut into nine frames. This step makes art, so it is judged by eye; follow the spec and
record what you made.

- **Generate** one image with an image generation tool, 4:3, and save the original as
  `art-src/bosses/warden.png` (or `.jpg`). Description to use, adjusting only if a result fails
  the checks below:

  > A sprite sheet for a 2D arcade game boss: a 3 by 3 grid of nine equal cells on a flat pure
  > white background, no grid lines, no text, no drop shadows. Every cell shows the same
  > creature at the same size and position, front view, centred, whole body inside the cell with
  > a clear white margin: a floating armoured sentinel, a wide heavy machine-guardian of cold
  > teal steel with violet trim, broad shoulder plates and one large glowing amber eye in a
  > chest cavity, bold dark outline, saturated colours, clean cel shading. Row 1: three idle
  > frames, hovering, the eye glow slightly dimmer, normal, slightly brighter. Row 2: two attack
  > wind-up frames, the eye narrowing and charging, then blazing with the shoulder plates
  > flared; then one frame with the chest plates pulled wide open and the eye fully exposed.
  > Row 3: one hurt frame, recoiling with the eye shut and sparks; then two destruction frames,
  > cracked with the eye flickering, then broken apart with the eye dark.

- **Check the image** before using it: nine cells; the creature is recognisably the same in each;
  nothing crosses a cell edge; the background is plain white up to the border; the creature is
  not white or near-white at its outline. Up to three attempts. If none passes, stop and hand off
  with the attempts kept under `art-src/bosses/`: the phase is blocked on art, not failed. If you
  have no image tool at all, do the same.
- **`scripts/build-bosses.py`** (Pillow, self-contained like the other art scripts): for each
  boss, open the source sheet, remove the white background by flood fill from the border as
  `process-art.py` does, cut the grid, find the one bounding box that contains the content of
  every cell, crop every cell with that same box, scale them all by the same factor to fit the
  frame size, centre them, and write one sheet to `public/assets/images/bosses/<id>.png`. Frames
  must not be trimmed one by one: that makes the animation jitter. A table at the top of the
  script lists each boss's source, grid and frame size. For the Warden: 3 by 3, frames 320 by
  240, so the sheet is 960 by 720.
- Run it, open the output, and check: transparent background, no white fringe, the creature
  holds its position from frame to frame.

### 2. `src/core/Boss.ts`

Add the members tagged P2: `BOSS_ANIMS`, `BossAnim`, `SpriteDef`, `Motion`, `sway`, and the
constants `BODY_MAX_SPEED`, `BODY_SCENE_SPEED`, `SPRITE_DEPTH`, `HURT_MS`, `HURT_GAP_MS`.

`sway(amplitude, periodMs)` is horizontal: `x = amplitude * sin(2π * clockMs / periodMs)`, `y = 0`.

### 3. The body: sprite, poses, motion

Types tagged P2: `Pose`, `BossDef.sprite`, `BossDef.poses`, `PhaseDef.pose`, `PhaseDef.motion`,
`PhaseDef.setup`, `BossStage` (P2 members), `BossHud`, `BossHost.setHud`.

- **Loading.** `BossBody.preload(scene, def)` queues `def.sprite` as a sprite sheet if its texture
  does not exist yet. `Play.preload()` calls it when the level being started has a boss.
- **Sprite or bricks.** If `def.sprite` is set and its texture exists, the body creates one
  `Phaser.GameObjects.Sprite` at `SPRITE_DEPTH`, sized `width` by `height`, and hides the parts
  (`setVisible(false)`). Otherwise the parts stay visible as in Phase 1. Everything else behaves
  the same in both views.
- **Animations.** Create one animation per `BossAnim` if it does not exist, keyed
  `<boss id>-<anim>`. `idle`, `tell` and `open` loop; `hurt` and `death` play once. This phase
  uses `idle` and `hurt`: `hurt` for `HURT_MS` after a counted hit, at most once per
  `HURT_GAP_MS`, timed on the fight clock, then back to `idle`. Add a small scale punch with the
  flinch unless reduced motion is on.
- **Position.** The body has an anchor: the centre of the bounding box of all parts at rest. Each
  frame, anchor offset = `motion(clock)` of the current phase, or zero. Each part's target is its
  rest position plus the anchor offset plus its offset in the current pose. Each part moves
  toward its target at no more than `BODY_MAX_SPEED` (use `BODY_SCENE_SPEED` when no ball is in
  play). Set the brick's position and call `syncOverlay()`. The sprite sits at the anchor plus the
  anchor offset plus `sprite.dx`, `sprite.dy`, and does not follow poses.
- **Poses.** `pose(id | null)` sets the target pose; `null` is the phase's own `pose`, or rest.
- **Phases.** When a phase begins (the first at construction, later ones on the `phase` event,
  from `update`), run its `setup(stage)` and apply its pose. With `opts.startPhase`, run the
  `setup` of every earlier phase first, in order.
- **Stage.** Build the P2 `BossStage`. `retire` removes parts through `BrickSystem.retire` and
  forgets them. `spawn` appends ordinary bricks (no owner) with ids from `BOSS_ID_BASE` and calls
  `host.bricksAdded(bricks, false)`. `calm` is the reduced-motion setting, read the way
  `Play.ts` reads it.
- **Defeat.** On `finale`, as well as Phase 1's handling, fade the sprite out over 300 ms and
  destroy it. (Phase 3 replaces this with the death animation.)
- **Lighting.** Add `LightingSystem.addLit(image)` and `removeLit(image)`: images in that list get
  corner tints in `tintForeground` exactly as bricks do. Register the sprite; remove it on
  destroy. Do not call `setLighting` on the sprite.

### 4. The Warden

- `sprite`: key `boss_warden`, the sheet from step 1, frames 320 by 240, about 300 by 225 on the
  field. Animations: `idle` frames `[0, 1, 2, 1]` at 5 fps, `tell` `[3, 4]` at 8, `open` `[5]`,
  `hurt` `[6]`, `death` `[7, 8]` at 3.
- Move and size the three parts so they sit inside the picture: `body` over the torso, `core`
  over the eye, `guard` under the eye. Check with `?debug`.
- A pose `open` that moves `guard` up behind the core, so the core can be hit from below.
- Phase 1 "Guard up": no pose, `motion: sway(50, 5200)`. Phase 2 "Core exposed": `pose: 'open'`,
  `motion: sway(90, 3600)`, and a `setup` that spawns a row of six bricks under the boss.

### 5. HUD

- `HudState.boss: BossHud | null`. The director calls `host.setHud` every frame while active
  (`shown: true` throughout this phase) and `null` when the fight ends.
- Board HUD (`Hud.ts`): a thin bar across the field in the empty rows under the HUD strip, in
  `palette.danger`, with one small pip per phase: lit for the current and later phases. Hidden
  when `boss` is null or not `shown`. It must not overlap the Fever bar, the effect rings with
  five effects active, or brick row 2.
- Wide stage (`WingPlates.ts`): when `play.hud.boss` is not null at build time, the left plate
  gets a `Boss` label and a `Meter` under Fever, built the way the `Time` rows are. Same pips.
- The bar eases toward its value rather than jumping.

### 6. Dev tools

All behind `import.meta.env.DEV`.

- `?debug`: one more line in the overlay from `BossDirector.current`: boss id, step, phase `n/m`,
  pool `x/y`, and `embedded N`. Also show the parts at 35% alpha over the sprite.
- `embedded` counts frames in which a free ball's centre was inside a live part's rectangle,
  shrunk by 2 px on each side. It should stay 0.
- `&phase=N` (1-based) starts the fight in that phase.
- The `]` key empties the current pool.

### 7. Tests

`tests/boss.test.ts`: `sway` is 0 at time 0, never exceeds its amplitude, and repeats after one
period.

`tests/bosses.test.ts`, for every boss: every pose names only existing parts; every `phase.pose`
exists; every part in every pose still sits in rows 2 and below and inside the level area; a
`sprite` has all five animations, each with at least one frame, whole non-negative frame numbers
and `fps > 0`.

## Do not

- Do not build steps, cutscenes, music, hazards, `tell`/`open` animation switching or lock-on.
- Do not tint the sprite yourself, give it a shadow, or add normal maps.
- Do not change `process-art.py` or regenerate any existing art.
- Do not change how bricks without an owner look or behave.

## Checks

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

Manual, at `?map=bosslab.tmj`. Record what you saw.

1. The sprite shows, animates in idle and drifts. No bricks are visible where the parts are.
2. Hits make it flinch. Rapid hits (lasers) do not make it flicker faster than `HURT_GAP_MS`.
3. `&debug`: the zones line up with the picture, the overlay line updates, and `embedded` is 0
   after two minutes with three balls in play in each phase
   (`game.scene.getScene('Play').spawnExtraBalls(2)`). If it is not 0, stop: the body's movement
   needs a design decision.
4. Phase 2 (`]` or `&phase=2`): `guard` moves, the core can now be hit from below, a row of
   bricks appears, and those bricks break, score and drop like any others.
5. The bar drains with the pool, refills on the phase change, and the pips change. Check on a
   narrow window (phone shape), a desktop window, and a 16:9 window wide enough for the wing
   plates. With five effects active the rings do not touch the bar.
6. `?lighting=low` and `?lighting=high`: the sprite is lit and nothing errors in the console.
   With lighting unavailable (a canvas renderer, if you can force one), the sprite still shows.
7. Rename the sheet file temporarily: the fight still works with visible brick parts. Restore it.
8. Reduced motion on: no scale punch; the boss still sways (it is gameplay).
9. `?level=1` and `?arcade=waves` look and play as before, with no boss bar.

## For the user to confirm

- Whether the Warden's sheet is good enough to test against.
- The bar's look and position on phone and TV.

## Record in STATUS.md

The generation attempts and which image was kept; the sheet's size in bytes; the parts' final
cells; each manual check; anything left open.
