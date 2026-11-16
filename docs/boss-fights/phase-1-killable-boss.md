# Phase 1: a boss you can kill

Read [README.md](README.md) and [design.md](design.md) first.

## Goal

A level can name a boss. The boss's parts stand in the arena as plain bricks, every weapon
damages it, its pools drain through its phases, and the level ends when the last pool empties.
No sprite, no HUD bar, no cutscenes, no music changes, no attacks.

When this phase is done, `http://localhost:5173/?map=bosslab.tmj` shows the Warden as a few large
bricks; hitting any of them counts toward the combo and score; the HUD label shows the boss's
name and phase; after enough hits the label changes to the second phase; after enough more the
boss disappears and the results screen shows a win. Every other level plays exactly as before.

## Read first

Open each symbol and read it before you write code that touches it.

- `src/core/Run.ts` and `tests/run.test.ts`: the model for a pure state class and its tests.
- `src/systems/RunDirector.ts`: the model for a director with a host, and how it adds bricks.
- `src/entities/Brick.ts`, `src/systems/BrickSystem.ts`: all of both.
- `src/scenes/Play.ts`: `init`, `create`, `update`, `updateFrozen`, `setupColliders`,
  `processBallBrick`, `onBallBrick`, `onBrickDestroyed`, `onBrickHit`, `updatePacing`,
  `checkWallsDown`, `win`, `runHost`, `onBricksAdded`, `shutdown`.
- `src/systems/AbilitySystem.ts`: every call to `bricks.kill` and `bricks.hit`.
- `src/systems/LaserSystem.ts`: the call to `bricks.hit`.
- `src/systems/LightingSystem.ts`: `castsStillShadow` and its two callers.
- `src/core/LevelParser.ts`: `parseLevel`, `validateLevel`. `src/core/types.ts`: `LevelSpec`,
  `BrickSpec`, `DifficultyId`.
- `tests/levels.test.ts`: how a map is read and parsed in a test.
- `public/assets/levels/level01.tmj` and `superbreaker.tiled-project` (the `LevelLighting` class).
- `src/scenes/Preload.ts`: `devMap`, `devLevel`.
- `src/main.ts`: where `window.game` is set in dev builds.

## Build

### 1. `src/core/Boss.ts` and `tests/boss.test.ts`

Only the members design.md tags P1: `BOSS_IDS`, `BossId`, `BossStep` (the full union), `BossSpec`
(only `phases[].hits`), `BossTuning`, `BOSS_TUNING`, `BossEvent` (`step` and `phase`),
`BossState` (constructor, `step`, `phase`, `pool`, `poolMax`, `progress`, `damage`), `BossHit`,
`hitsFor`, `EXPLOSION_HITS`, `ABILITY_HITS`, `LETHAL_GAP_MS`, `BOSS_ID_BASE`, `BOSS_PHASE_BONUS`,
`BOSS_DEFEAT_BONUS`.

- A phase's pool is `Math.max(1, Math.round(hits * tuning.health))`.
- `damage(hits)` does nothing outside `fight` and returns `[]`. It never carries past a phase
  boundary: emptying a pool moves to the next phase with a full pool and returns
  `{ type: 'phase', phase }`. Emptying the last pool sets `step` to `finale` and returns
  `{ type: 'step', step: 'finale' }`. Nothing in this phase leaves `finale`.
- `progress` is hits dealt over the total of all pools, 0 at the start and 1 at `finale`.
- The constructor's `intro` option is not built yet; the state starts in `fight`.

Tests, each a named `it`:
- `BOSS_TUNING` has an entry for every difficulty and Normal is all ones.
- `hitsFor`: a plain ball hit is 1 for each difficulty's `hitDamage` (read them from
  `DIFFICULTY`); double damage is 2; a fireball (`stripArmor`, `FIREBALL_DAMAGE`) is 2; a laser
  bolt of 25 damage is 0.25; a lethal explosion is `EXPLOSION_HITS`; a lethal ability is
  `ABILITY_HITS`; a zero-damage ability hit is 0.
- `BossState`: starts in `fight` at phase 0 with a full pool; damage lowers the pool; overkill
  moves to the next phase with a full pool and emits one `phase` event; the last pool emptying
  gives `finale` and one `step` event; damage in `finale` changes nothing; `progress` never
  decreases and ends at 1; Hard's pool is larger than Normal's and Easy's smaller for the same
  spec; `opts.phase` starts at that phase with `progress` already counting the skipped pools.

### 2. Brick ownership

In `src/entities/Brick.ts`: move the `DestroyCause` type here, add `BrickOwner`, add
`owner?: BrickOwner` to `Brick`. In `src/systems/BrickSystem.ts`: re-export `DestroyCause` so
`Play.ts` needs no change, then:

- `append(specs, owner?)` sets `owner` on each new brick and skips `introAnimation` for them.
- `hit`: for a brick with an owner that is alive and breakable, call `owner.strike(...)` in
  place of `takeHit`. The rest of `hit` (flash, `onHit`) is unchanged.
- `kill`: for an owned brick, call `this.hit(b, 0, cause, { lethal: true })` and return false.
- `explode`: for an owned brick in range, call `this.hit(b, 0, 'explosion', { lethal: true })`
  and do not destroy it.
- `shatterBelow`: skip owned bricks.
- `retire(bricks)`: for each brick that is not dead, kill its tweens, `markDead()`, hide it, and
  invalidate the caches. No events.

Behaviour for bricks without an owner must be identical to today.

In `src/systems/LightingSystem.ts`, `castsStillShadow` gains `&& !b.owner`.

### 3. The level hook and the lab

- `LevelSpec.boss?: BossId`. `parseLevel` reads the map property `boss`: an empty or missing value
  is no boss; a value not in `BOSS_IDS` adds the warning `Map: unknown boss "<value>"` and sets no
  boss.
- `validateLevel` skips its no-breakable-bricks rule when `boss` is set.
- Add a `boss` string member (default `""`) to the `LevelLighting` class in
  `superbreaker.tiled-project`.
- `public/assets/levels/bosslab.tmj`: copy `level01.tmj`, set `title` to `Boss Lab`, add the map
  property `{ "name": "boss", "type": "string", "value": "warden" }`, and replace the bricks with
  about a dozen ordinary bricks in the rows well below the boss (rows 20 to 24). Keep object ids
  unique and `nextobjectid` correct. Do not add it to `index.json`.

### 4. `src/systems/BossBody.ts`, `src/systems/BossDirector.ts`, `src/bosses/`

Types from design.md tagged P1 only: `PartDef`, `PhaseDef` (`id`, `title`, `hits`), `BossDef`
(`id`, `name`, `parts`, `phases`), `BossHost` (P1 members), `BossDirector` (P1 members).

`BossBody` turns `PartDef`s into `BrickSpec`s (cells are 30 by 16; `health` `BRICK_HEALTH`, no
armor, no movement, ids from `BOSS_ID_BASE`), appends them with the director as owner, calls
`host.bricksAdded(parts, false)`, looks parts up by id, and retires them.

`BossDirector`:
- Keeps the fight clock: each `update(dt)` adds `dt / host.timeScale()` unless
  `host.juice.inHitStop`.
- `strike` follows "How a hit is counted" in design.md exactly, including the lethal gap per part
  and one `host.creditHit` per whole hit.
- `update` applies pending hits with `state.damage` and handles the events: on `phase`, add
  `BOSS_PHASE_BONUS` and set the label to the boss's name and the new phase's title; on `finale`,
  retire every part, call `host.bricks.shatterBelow(-Infinity)` to clear the arena, add
  `BOSS_DEFEAT_BONUS`, become inactive and call `host.defeated()`.
- `debugHit(hits)` adds to the pending hits. `destroy()` clears `BossDirector.current`.
- Sets the label once at construction.

`src/bosses/warden.ts`: a stub with three parts and two phases. A wide `body` part, a small `core`
part under its middle with `weak: 3`, and a steel `guard` part under the core that shields it
from below. Keep every part out of rows 0 and 1 and clear of the lab's bricks. Two phases of 12
hits each. `src/bosses/index.ts` exports `BOSSES`.

### 5. `src/scenes/Play.ts`

- Extract the combo, pacing, music, Fever, skill-charge, score and combo-milestone lines of
  `onBrickDestroyed` into `private creditBreak(b, cause, chain)` and call it from the same place.
  No behaviour change.
- In `create`: after `setupColliders()`, build the director when `this.level.boss` is set, with a
  `bossHost()` built like `runHost()`. `creditHit` is `creditBreak(brick, cause, 0)`. `defeated`
  is `win()`. `bricksAdded` is `onBricksAdded`. Pass `collapse: false` to `BrickSystem` for a
  boss level. Do not create the tutorial coach on a boss level.
- In `update`: call `this.boss?.update(dt)` beside `runDirector?.update(dt)`. Before the
  `hud.remaining` win check, return while `this.boss?.active`.
- `processBallBrick`: neither the plow branch nor the pierce branch applies to a brick with an
  owner, so the ball bounces off it.
- `updatePacing`: while a boss is active, `endgameAssist` homing is off and cruise speed uses
  `boss.progress` in place of the share of bricks cleared. `checkWallsDown` returns early while a
  boss is active.
- `shutdown`: destroy the director.
- Dev builds only: set `window.boss` to the director, next to how `window.game` is set.

### 6. Tests for content and the level hook

`tests/bosses.test.ts`:
- Every `BOSSES` entry: its key equals its `id`; it has at least one phase; every phase has
  `hits > 0`; part ids are unique; every part sits in rows 2 and below and inside the 20 columns
  and `LEVEL_MAX_Y`; at least one part is not steel and not `weak: 0`.
- `bosslab.tmj` parses with no warnings, `validateLevel` is empty, its `boss` is `warden`, and
  none of its bricks overlaps a Warden part.

`tests/levels.test.ts` (add, do not change existing cases):
- A map with `boss: 'warden'` parses to `level.boss === 'warden'`; an unknown id gives the
  warning and no boss; no property gives no boss.
- A level with a boss and no breakable bricks passes `validateLevel`.
- None of the 30 shipped levels has a boss.

## Do not

- Do not build anything tagged P2 or later in design.md: no sprite, no poses, no HUD bar, no
  cutscenes, no steps other than `fight` and `finale`, no hazards.
- Do not change `AbilitySystem`, `LaserSystem`, `PowerupSystem`, the HUD or any shipped level.
- Do not make boss parts regen, explosive or moving bricks.

## Checks

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass. Record the test count before and
after.

Manual, in a browser at `?map=bosslab.tmj` unless stated. Record what you saw for each.

1. The Warden's parts and the lab's bricks appear. The label reads `WARDEN · <phase title>`.
   There is no tutorial, even on a fresh save (clear site data and reload to check).
2. A ball hit on `body` bounces, flashes the part, raises the combo and score, and does not
   remove the part. In the console, `boss.state.pool` drops by 1 per hit on Normal.
3. A hit on `guard` pings like steel and `boss.state.pool` does not change.
4. `boss.debugHit(12)` moves to phase 2: the label changes and `boss.state.phase` is 1.
   `boss.debugHit(999)` once more ends the fight: parts and bricks vanish and the results screen
   shows a win.
5. With the laser, lasers drain the pool. Start with `?map=bosslab.tmj&laser=<mode>` (see
   `FORCED_LASER_MODE` in `LaserSystem.ts` for a valid mode) and press L.
6. Give yourself a fireball and then pierce. From the console,
   `game.scene.getScene('Play').powerups.apply('fireball', 300, 500)` does what `devLaser` does
   for the laser. The ball bounces off the parts in both modes and each fireball hit takes 2 from
   the pool.
7. Fire abilities at the boss (`game.scene.getScene('Play').abilities.grant()` fills a slot, as
   the tutorial does; read `AbilitySystem` for how to get a particular one). The pool drops, no
   part disappears, no ghost brick is drawn. With a black hole over the boss, the pool drops by
   at most `ABILITY_HITS` per part per second.
8. Lose every life: game over works as on any level.
9. `?level=1`, `?level=24` and `?arcade=waves` play as before: bricks pop in, break, score, drop
   powerups, the level clears. Explosive bricks chain. The collapse still happens.

If you cannot run a browser, say so in STATUS.md and list checks 1 to 9 as open.

## Record in STATUS.md

Files added and changed; test counts; each manual check with its result; the lab's brick layout;
any API you found different from this document; anything left open.
