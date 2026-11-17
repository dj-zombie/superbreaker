# Boss fights: status

The log for this work. Newest entries go at the bottom. Agents append; nobody rewrites history.

## Where things stand

| Phase | State | Implemented by | Reviewed |
| --- | --- | --- | --- |
| 1. A boss you can kill | pass | Claude (Cursor agent), 2026-11-16 | Grok (Cursor agent), 2026-11-16 |
| 2. Sprite body and HUD | pass | Claude (Cursor agent), 2026-11-16 | Claude (Cursor agent), 2026-11-16 |
| 3. Cinematic flow | not started | | |
| 4. Attacks | not started | | |
| 5. Reference boss and authoring guide | not started | | |

States: `not started`, `in progress`, `stopped` (needs a new agent), `blocked` (needs the user),
`in review`, `fix` (review asked for changes), `pass`. Update this table whenever you add an
entry.

## Decisions from the user

- Boss bodies are animated sprites. The test boss's sprites are generated.
- Existing hazards never take a life. A new hazard, the skull, does.
- Campaign bosses are ordinary levels in the last slot of a world, named by a map property.
- Arcade boss waves: every fifth tier, Waves only. Agreed, not in these five phases.
- One boss track for all bosses, cut into sections by intensity like the level music. The song
  does not exist yet; the level song stands in.

## Waiting on the user

- The boss song, with its tempo, a bar map, and which bars are `rise`, `low`, `mid`, `high`,
  `rest` and the stinger.
- Whether agents may commit after a PASS, or the user commits.

## Entry templates

Implementer:

```
## Phase N: <DONE | STOPPED | BLOCKED>, <date>, <who>

Built
- <file>: <what>

Verified
- pnpm typecheck: <result>
- pnpm lint: <result>
- pnpm test: <n> passed (was <m>)
- Manual 1: <what I did and saw>
- ...

Not verified
- <check>: <why not>

Deviations from the documents
- <what, and why>

Open
- <problem or question>

Later
- <idea not built>

If STOPPED or BLOCKED: why, what is safe to keep, and the next step for whoever continues.
```

Reviewer:

```
## Phase N review: <PASS | FIX | RESTART>, <date>, <who>

Ran
- pnpm typecheck / lint / test: <results>
- Manual checks run: <numbers and what I saw>
- Not checked: <numbers and why>

Build items
- <item>: <done | not done | done differently: how>

Findings
1. <file>: <problem>. Done means: <what>.

Scope and shortcuts
- <clean, or what was found>

For the user
- <what still needs their eye or ear>
```

## Log

## Phase 1: DONE, 2026-11-16, Claude (Cursor agent)

Every build item is in and the three commands pass. All nine manual checks were run and gave the
expected result, but I ran them through the browser console with a script moving the paddle, and
I heard no sound. Read "Not verified" and "Open" before passing this.

Built
- `src/core/Boss.ts` (new): `BOSS_IDS`, `BossId`, `BossStep`, `BossSpec`, `BossTuning`,
  `BOSS_TUNING`, `BossEvent`, `BossState`, `BossHit`, `hitsFor`, `EXPLOSION_HITS`,
  `ABILITY_HITS`, `LETHAL_GAP_MS`, `BOSS_ID_BASE`, `BOSS_PHASE_BONUS`, `BOSS_DEFEAT_BONUS`.
- `tests/boss.test.ts` (new): 16 tests, the ones section 1 of the phase file names.
- `src/entities/Brick.ts`: `DestroyCause` moved here, `BrickOwner` added, `owner?` on `Brick`.
- `src/systems/BrickSystem.ts`: re-exports `DestroyCause`; `append(specs, owner?)`; `retire`;
  `hit`, `kill`, `explode` and `shatterBelow` treat owned bricks as section 2 says.
- `src/systems/LightingSystem.ts`: `castsStillShadow` gains `&& !b.owner`.
- `src/core/types.ts`: `LevelSpec.boss?`.
- `src/core/LevelParser.ts`: `parseBoss` reads the map property; `validateLevel` skips the
  no-breakable-bricks rule for a boss level.
- `superbreaker.tiled-project`: `boss` string member, default `""`, on `LevelLighting`.
- `public/assets/levels/bosslab.tmj` (new): layout below. Not in `index.json`.
- `src/systems/BossBody.ts` (new), `src/systems/BossDirector.ts` (new): the P1 types and members.
- `src/bosses/warden.ts`, `src/bosses/index.ts` (new): the stub Warden and `BOSSES`.
- `src/scenes/Play.ts`: `creditBreak` extracted; the director built after `setupColliders()`;
  `bossHost()`; no collapse and no tutorial coach on a boss level; the `update`,
  `processBallBrick`, `updatePacing`, `checkWallsDown` and `shutdown` changes; `window.boss` in
  dev builds.
- `tests/bosses.test.ts` (new): 8 tests. `tests/levels.test.ts`: 5 tests added in a new
  `describe('boss map property')`; no existing case touched.

No file outside the phase's list was touched.

The lab (`bosslab.tmj`, 12 bricks, object ids 1 to 12, `nextobjectid` 13):

| Row | Columns | Brick |
| --- | --- | --- |
| 20 | 3, 4, 15, 16 | teal (gid 11) |
| 22 | 2, 3, 16, 17 | purple2 (gid 8) |
| 24 | 3, 4, 15, 16 | blue (gid 1) |

Map properties: `boss: "warden"`, `title: "Boss Lab"`, and level01's `lightning: true` and
`lightsOut: true`.

The Warden, in brick cells:

| Part | col, row | Size | Texture | Notes |
| --- | --- | --- | --- | --- |
| `body` | 5, 3 | 10 x 3 | `brick_purple2` | |
| `core` | 9, 6 | 2 x 2 | `brick_red` | `weak: 3` |
| `guard` | 8, 8 | 4 x 1 | `brick_steel` | steel |

Phases: `lockdown` and `breakout`, 12 hits each. Pools are 10 / 12 / 15 on Easy / Normal / Hard.

Verified
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 445 passed in 22 files (was 416 in 20). Run again after the last code change.
- How the manual checks were run: `pnpm dev`, the Cursor browser, and the DevTools console. I
  read state from `window.boss` and the `Play` scene and looked at screenshots. A script in the
  page set `paddle.targetX` to play, and wrapped `strike`, `onBrickDestroyed`, `onExplosion`,
  `onCollapseStart` and `win` to count calls. None of that is in the repo. I used the origin
  `http://[::1]:5173`, so the save at `localhost:5173` was never touched. Normal difficulty
  unless stated.
- Manual 1: on an origin with no save (`seenInstructions` false, Easy), the three parts and the
  12 lab bricks were there, the label read `WARDEN · LOCKDOWN`, and no tutorial coach was made.
  On the same save `?level=1` did make the coach, so the tutorial still runs elsewhere.
- Manual 2: a ball hit on `body` returned `damaged`, the pool went 12 to 11, combo +1, score
  +100, the ball's velocity flipped, the part stayed, and a screenshot caught the white flash.
  One hit per bounce.
- Manual 3: a hit on `guard` returned `immune`, the ball bounced, the pool and combo did not
  change. The sound was not heard (see below).
- Manual 4: `boss.debugHit(12)` gave phase 1 with a full pool of 12, the label `WARDEN ·
  BREAKOUT`, +500 and `progress` 0.5. `boss.debugHit(999)` gave `finale`, `active` false, no
  brick left alive, +2000, and the results screen with ALL CLEAR and three stars.
- Manual 5: `?map=bosslab.tmj&laser=gun`, L. Each bolt is 11.75 damage and took 0.1175 from the
  pool. The ninth bolt completed the first whole hit: combo 0 to 1, score +65.
- Manual 6: with fireball, each hit took 2 (12, 10, 8, 6) and the ball bounced.
  `processBallBrick` returned true for all three parts under fireball and under Fever, and false
  for an ordinary brick under fireball, which still plows as before. With pierce the ball
  bounced and each hit took 1.
- Manual 7: meteor: the first lethal hit took 2, the next two inside a second were `immune`.
  Bomb: `body` 2 and `core` 6. Sweep: the same, plus its zero-damage hit, which flashes and
  takes 0. Lightning: `core` 6, `body` 2. Frenzy only adds balls. Black hole over the boss, with
  the lab bricks cleared first: 32 strikes, 28 of them `immune`; `body` took 2 and `core` 6 at
  fight clock 734 ms and again at 1800 ms. So each part took one lethal hit a second, which is
  `ABILITY_HITS` for `body` and three times that for `core` because of `weak: 3`. No part
  disappeared and no ghost brick was drawn in any of these.
- Manual 8: with the paddle kept away from the ball, every life went. My script attached at
  10.2 s with one life already gone and saw the other two go at 10.6 and 15.9 s. GAME OVER came
  up (no win, no stars), the boss was still in `fight` with a full pool and three parts
  standing. Retry built a new director with a full pool.
- Manual 9, `?level=1`: no boss anywhere (`window.boss`, `Play.boss`, `BossDirector.current`
  all undefined), 52 bricks, none owned. All 52 were mid pop-in at 60 ms and 310 ms and settled
  by 1.8 s. The script broke 46 with the ball, the collapse started once at 7 left, 6 fell,
  coins and pickups dropped (seen in screenshots), and LEVEL 1 CLEAR came up at 5,290.
- Manual 9, `?level=24`: 182 bricks, 30 of them steel, no boss. 131 broken by ball, 2 by laser,
  42 by explosion across 10 explosions, chain depth up to 2. Cleared at 49,360. The collapse did
  not start in this run (see "Not verified").
- Manual 9, `?arcade=waves`: no boss. Wave 1 had 44 bricks; the collapse started at 7 left and 4
  fell; wave 2 was built and the label read `WAVE 2`; a coin and a pickup were falling in the
  screenshot; 8,450 after 100 s.
- Extra, an explosive brick's blast on a part (the lab has no explosive brick, so I appended
  one from the console under `body` and broke it): the blast took `EXPLOSION_HITS` (12 to 9), a
  second blast 331 ms later was `immune`, a third 1.6 s after the first took 3 more. Parts stood.
- Extra, leaving the level: `window.boss` and `BossDirector.current` stay set while Results is
  up over the paused level, and are both undefined after going to the map.
- Extra, the fight clock: 5000 ms on the scene clock was 5000 ms on the fight clock.

Not verified
- Any sound. The agent's browser has no audio I can hear. Check 3's steel ping is open: the
  code path is the unchanged one that plays `brick_steel` for an `immune` result.
- How it looks and feels to a person playing. I saw screenshots at chosen moments, not motion.
- Hard in the browser. Its pool of 15 is covered by unit tests only. Easy (10) and Normal (12)
  were seen.
- The frame rate during checks 1 to 8. During check 9 the tab was giving about 7 animation
  frames a second: 20 in 3 s with a game step costing 1.9 ms, and 2 in 2 s with the game loop
  asleep, so the tab was throttled, not the game slow. From there on I switched the page to
  Phaser's own `setTimeout` stepper (60.5 steps a second): check 9, the explosive blast and the
  leaving-the-level check ran that way.
- The collapse on level 24. The screenshot at 5 bricks left shows six balls in play, and
  `collapseReady` waits for few balls and a slow spell. I did not confirm that was the reason.
- Reduced motion, gamepad, touch, the desktop build and `pnpm build`. Not run.
- Lightning and the black hole with lab bricks still standing: both went for the lab bricks,
  so the boss numbers above come from an arena with the lab bricks cleared.

Deviations from the documents
- The director upper-cases the name and phase title for the label. The HUD prints `title` and
  `detail` as given, and check 1 expects `WARDEN · <phase title>` in capitals.
- `strike` returns `immune` for a brick that is not one of the body's parts. `partOf` can
  return undefined, so the type needs an answer; it cannot happen through `BossBody`.
- `Play.update` calls `if (!this.finished) this.boss?.update(dt)`. Without the guard, hits
  pending on the frame the last life goes could call `win()` after the level was lost.
- `processBallBrick` has one early `if (brick.owner) return true;` in place of `&& !brick.owner`
  on both branches. Same result, and it also covers Fever.
- `window.boss` is set by a small `exposeBoss` helper in `Play.ts`, where the director is made,
  and cleared in `shutdown` so it never points at a dead fight.
- The director reads `BOSS_TUNING[save.state.difficulty]` from `save`. `BossHost` has no
  difficulty member in P1.
- `BossState` exposes `step`, `phase`, `pool`, `poolMax` and `progress` as getters over private
  fields. Nothing outside can set them.
- The constructor takes `opts.startPhase` as design.md has it; nothing passes it yet. `seed`
  (P4) is not there.
- The tree was not clean at the start: `docs/boss-fights/` was untracked. HEAD was `69867e5`.

Open
- A hit flash grows a brick's physics box. `Brick.flash` scales the sprite and the Arcade body
  follows it: `body` goes from 300 x 48 to 336 x 57.6 for about 100 ms, an ordinary brick from
  30 x 16 to 33.6 x 19.2. The comment on `homingBox` in `Play.ts` says the opposite. This is
  existing behaviour and I did not change it. I saw no double hit from it, but a ball coming in
  during a flash can touch a wide part up to 18 px early at its ends.
- The Warden's layout rattles the ball. The 30 x 32 px gap on each side of `core`, between
  `body` and `guard`, gave 3 or 4 `body` hits plus a `core` hit, 6 or 7 from the pool in about
  170 ms. The corridor between the ceiling and `body` gave a hit every 133 to 287 ms, 12 in one
  crossing. It is a stub, so I left it. A `guard` no wider than `core` would close the gaps.
- One early console script printed pairs of `body` hits 50 to 100 ms apart that I could not
  square with the box sizes at the time. Later, more detailed logs of the same spots were
  consistent with the rattle above. I did not go back and prove the first printout.
- Abilities are large next to a 12-hit phase: one black hole took 16, and a bomb, sweep or
  lightning took 8 (`core` is `weak: 3`, so a lethal ability hit on it is 6).
- Under gun fire `body` shows the white `Brick.flash` on every bolt, about 8 a second across
  300 x 48 px. `Brick.flash` is not gated by reduced motion. Worth a look when P2 gives the
  body a sprite.
- A defeat goes through `win()`, which calls `juice.flash` (design.md notes this under "What
  the code does today"). That is level code, not boss code, and `juice.flash` is guarded by
  calm, but P3 should decide whether a boss defeat keeps it.
- `bricks.remaining` counts the two breakable parts, so the lab starts at 14. The win check,
  homing, cruise speed and walls-down ignore it during a fight as the phase lists. Anything
  else that reads it was left alone and not examined.
- `?map=` plays a map outside the campaign as an extra last level. For the lab that means level
  31: the intro band reads `HELL FOUNDRY · 31 / 10`, a win goes straight to ALL CLEAR and
  writes a `level31` entry and `unlocked: 31` into that dev save. Existing dev behaviour.
- The lab is dark, since it keeps level01's `lightsOut`. The parts are hard to see until the
  ball's light reaches them.
- Left behind by the checks: a test save in the browser's storage for `http://[::1]:5173`. The
  dev server I started is stopped and my test tab is closed.

Later
- A content test that every part's `texture` is a key of `BRICK_TINT`.
- An explosive brick in the lab, so the blast path can be checked by playing.
- A cap on how much one ability can take from a pool.

## Phase 1 review: PASS, 2026-11-16, Grok (Cursor agent)

Ran
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0. `pnpm test`: 445 passed in 22 files. The new tests are 16 in `tests/boss.test.ts`, 8 in `tests/bosses.test.ts`, and 5 added in `tests/levels.test.ts` (29). That matches the handoff's "was 416".
- Manual checks, in the browser at `http://127.0.0.1:5173` so the save on `localhost` was left alone. The tab often did not deliver animation frames (`game.loop` stayed on one frame while `requestAnimationFrame` ran), so where a check needed motion I stepped `game.loop` myself and then read `window.boss` and the Play scene. Screenshots were taken when the canvas had painted.
- Manual 1: On a fresh save (`seenInstructions` false, Easy, pool 10) `?map=bosslab.tmj` showed the three parts and the twelve lab bricks, the label `WARDEN · LOCKDOWN`, `TAP TO LAUNCH`, and no coach. The same save on `?level=1` showed the tutorial ("Move the paddle…", Skip tutorial) over 52 bricks. After setting the save to Normal the pool was 12.
- Manual 2: A ball sent into the left side of `body` bounced (vy −500 to +500), the part's scale punched from 2.5 to 2.8, combo went 0 to 1, score 0 to 90, the part stayed alive, and the next step took the pool from 12 to 11.
- Manual 3: A ball into `guard` bounced, the hit result was `immune`, pool and combo stayed put, the part stayed, and `sound.add` was called with `brick_steel`. I did not hear it.
- Manual 4: `debugHit(12)` from a pool of 11 went to phase 1 with a full pool of 12, progress 0.5, score 90 to 590, label `WARDEN · BREAKOUT`. `debugHit(999)` set `finale`, `active` false, progress 1, score 2590 (the 2000 defeat bonus), hid the three parts, and the results screen showed ALL CLEAR.
- Manual 5: `?map=bosslab.tmj&laser=gun`. Pressing L started the laser (the forced mode was `gun`). Bolts that hit the steel guard did not call `hit`. With the paddle under the side of `body`, nine bolts of 11.75 damage took 1.0575 from the pool (0.1175 each) and the part stayed.
- Manual 6: `powerups.apply('fireball')` then a hit on `body`: pool 12 to 10, combo +2, the ball bounced and stayed below the part. After `powerups.clear()` and `apply('pierce')`, the next hit bounced and took the pool from 10 to 9.
- Manual 7: With the lab bricks retired so the abilities aimed at the boss. Meteor: one lethal hit on `body` took 2, and five more inside the next second were `immune`; the part stayed. Bomb: one lethal hit on `body` and one on `core` in the same step (2 + 6) and both parts stayed. Lightning, inside a second of the bomb, was `immune` on `core` and then landed on `body` once the gap had passed. Sweep: a lethal hit plus a zero-damage hit on each breakable part; the zero-damage hit did not change the pool. Black hole over a full pool: `body` and `core` each took one counted lethal hit at fight-clock 999 ms and the next at 2066 ms, with only `immune` between; the parts stayed until a later hit emptied the phase. No brick-textured image was left behind after a hole. A lethal hit on `core` is 6 because `weak` is 3, so the per-second drop is `ABILITY_HITS` on `body` and three times that on `core`.
- Manual 8: Dropping the ball past the paddle three times went 3 lives to 2 to 1 to 0. GAME OVER, score 0, no clear. The boss was still `fight`, phase 0, pool 12, all three parts alive.
- Manual 9: `?level=1` had no boss, 52 bricks, none owned. Breaking bricks scored (the HUD reached 18,440) and 27 pickups were spawned. With one ball kept in play the collapse ran (4 bricks falling) and the level cleared into Level 2, whose bricks were on screen. `?level=24` had no boss, 182 bricks (30 steel, 10 explosive). Killing one explosive destroyed 42 bricks and scored. `?arcade=waves` had no boss. Wave 1 started with 48 bricks; after the board was cleared the label read `WAVE 2 · 54 LEFT`, score 19,530, with a pickup still in play.
- The lab layout matches the handoff: 12 bricks, ids 1–12, `nextobjectid` 13, rows 20/22/24 as described. The Warden parts are `body` 10×3 at col 5 row 3, `core` 2×2 at col 9 row 6 with `weak: 3`, `guard` 4×1 steel at col 8 row 8. Textures `brick_purple2`, `brick_red`, and `brick_steel` are keys of `BRICK_TINT`. `bosslab.tmj` is not in `index.json`.

Not checked
- Hearing any sound, including the steel ping. The `brick_steel` key was requested; I could not hear the browser.
- The pop-in tween itself. Whenever Play was readable the bricks were already settled. Unowned bricks still use the old `introAnimation`.
- Hard's pool of 15 in the browser. Easy (10) and Normal (12) were on screen. The unit test checks that Hard's pool is larger than Normal's and Easy's smaller; the multipliers in `BOSS_TUNING` are the ones in design.md.
- Reduced motion, gamepad, touch, the desktop build, `pnpm build`, and a frame-time trace. The manual stepper is not a play session at the display's refresh rate.

Build items
- `src/core/Boss.ts` and `tests/boss.test.ts`: done. P1 members only. A pool is `max(1, round(hits * health))`. `damage` no-ops outside `fight`, does not carry past a phase, emits one `phase` or a `finale` step, and `progress` ends at 1. The constructor starts in `fight`; `intro` is not there. All sixteen named cases are present and would fail if the pool, the events, or `hitsFor` were wrong.
- Brick ownership: done. `DestroyCause` and `BrickOwner` live on `Brick`. `BrickSystem` re-exports `DestroyCause`. `append` sets the owner and skips the pop-in only then. `hit` asks the owner instead of `takeHit` for a live breakable owned brick, then still flashes and emits `onHit`. `kill` and `explode` go through `hit` with `lethal` and do not destroy the part; `kill` returns false, so the black hole's ghost is destroyed in the same turn. `shatterBelow` skips owned bricks. `retire` kills tweens, `markDead()` (which disables the body), hides the brick, and invalidates, with no events. `castsStillShadow` is false for an owned brick. Unowned bricks still take the old path; level 1, level 24's chain, and Arcade waves did.
- Level hook and lab: done. `LevelSpec.boss`, `parseBoss` (empty or missing is no boss, anything else not in `BOSS_IDS` warns `Map: unknown boss "<value>"`), and `validateLevel` skips the breakable-brick rule only when `boss` is set. `LevelLighting` has `boss` default `""`. The lab is a level01-shaped map with the bricks replaced and the property set. It is not in `index.json`.
- `BossBody`, `BossDirector`, `src/bosses`: done. Parts become `BrickSpec`s at 30×16, `BRICK_HEALTH`, no armor, no motion, ids from `BOSS_ID_BASE`, appended with the director as owner, then `bricksAdded(parts, false)`. `strike` follows the design: `immune` outside `fight` or inside the lethal gap, `armor` for `weak: 0`, otherwise `hitsFor * weak` pending and one `creditHit` per whole hit. `update` advances the fight clock by `dt / timeScale` except during hit-stop, then applies the pending hits. `phase` adds 500 and relabels; `finale` retires every part, `shatterBelow(-Infinity)`, adds 2000, goes inactive, and calls `defeated`. `debugHit` adds to the pending hits. `destroy` clears `BossDirector.current`. The label is set from the constructor. The Warden is the three-part, two-phase stub, and `BOSSES` maps `warden` to it.
- `Play.ts`: done. `creditBreak` is the old combo, pacing, music, Fever, skill-charge, score, and combo-milestone block, called from the same place in `onBrickDestroyed`. The director is built after `setupColliders` from `bossHost()`. `creditHit` is `creditBreak(brick, cause, 0)`, `defeated` is `win()`, `bricksAdded` is `onBricksAdded`. A boss level passes `collapse: false` and does not create the coach. `update` steps the director next to the run director and returns while `boss.active` before the `hud.remaining` win check. An owned brick makes `processBallBrick` return true, so plow and pierce do not apply and the ball bounces, including under Fever because that shares the plow branch. While the boss is active, endgame homing is off, cruise speed uses `boss.progress`, and `checkWallsDown` returns. `shutdown` destroys the director. `window.boss` is set in dev builds.
- Content and level-hook tests: done. The named cases are all there. No existing `it` in `tests/levels.test.ts` was edited. The content tests check id, phases, unique part ids, rows 2+, the 20 columns, `LEVEL_MAX_Y`, a hurtable part, and that the lab parses, names `warden`, and does not overlap the parts. They would fail if those were broken. They do not pin the exact Easy and Hard multipliers, and they do not check that a part texture is a key of `BRICK_TINT`; both are true in the code I read.

Scope and shortcuts
- Clean. The diff is the phase's files plus `docs/boss-fights/`, which was already untracked when the work started. Nothing tagged P2 or later was built: no sprite, poses, HUD bar, cutscenes, hazards, or steps other than `fight` and `finale`. `AbilitySystem`, `LaserSystem`, `PowerupSystem`, the HUD, and the shipped levels were not edited. Parts are `normal` or `steel`, with armor 0, `moveX` 0, and `regenDelay` 0.
- `as unknown as` appears once, in `exposeBoss`, in the same shape `main.ts` uses for `window.game`. No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `Math.random`, skipped or empty tests, or a `try`/`catch` in the new code. `part.weak ?? 1` and `opts.phase ?? 0` are the documented defaults. Boss code does not call `juice.flash`, tint the paddle, or use a timer, tween, or animation callback to change the fight. The explosion's existing `delayedCall` is where a blast already lands; an owned brick takes that hit through `strike`, and the pool still changes from `update`.
- `src/bosses` imports `BossDef` and `BossId` as types only, plus the warden value. Nothing from `systems` is loaded when the node tests import `BOSSES`.
- Deviations the handoff declares, and that the run matched: the label is uppercased because the HUD prints it as given; `strike` returns `immune` for a brick that is not a part; `update` is skipped once `finished` so a loss on that frame cannot also call `win()`; `processBallBrick` returns early for any owner; `window.boss` is cleared in `shutdown`; tuning is read from `save.state.difficulty` because `BossHost` has no difficulty in this phase. `BossState` only exposes getters. `startPhase` is accepted and unused. `seed` is absent.

For the user
- The steel ping was requested and not heard. Same for every other sound.
- I did not see the brick pop-in frames, and I did not play Hard in the browser.
- A black hole or a bomb on `core` takes 6 from the pool per counted hit (`ABILITY_HITS` times `weak: 3`). One black hole, with both parts in range, took 16 and ended the first phase. That is what the hit rules say; it is a lot next to a 12-hit phase.
- The lab stays `lightsOut`, so the parts read as dark shapes until the ball's light reaches them.

## Phase 2: DONE, 2026-11-16, Claude (Cursor agent)

Every build item is in and all nine manual checks gave the expected result. Three things to know
before reviewing:

1. `pnpm test` is not green in this working tree: 458 pass and 1 fails. The failure is
   `tests/skills.test.ts` > "readies the gun more often than bullet time", and it comes from
   another session's uncommitted edit to `src/core/Skills.ts` (gun cooldown 6000 ms, bullet time
   3000 ms). This phase did not touch that file or that test. On a copy of the tree outside the
   repo with only `src/core/Skills.ts` put back to HEAD, all 459 pass.
2. The tree was dirty when I started and a second agent edited it while I worked. Its changes
   sit in the same diff as mine, and two of its files are also mine (`src/scenes/Hud.ts`,
   `src/scenes/Play.ts`). See "Open" for which is which.
3. I ran the manual checks at `http://localhost:5173`, not on a spare origin as Phase 1 did, so
   the checks wrote to the dev save in Cursor's browser. See "Open".

Built
- `art-src/bosses/warden.jpg` (new): the generated sheet, 1152 x 864, 361,189 bytes.
- `scripts/build-bosses.py` (new): flood-fills the white away, cuts the grid, slides every cell
  onto the first, crops all of them with one box, scales by one factor, writes the sheet.
- `public/assets/images/bosses/warden.png` (new): 960 x 720, nine 320 x 240 frames, 900,134
  bytes. Running the script again gives the same file, byte for byte.
- `src/core/Boss.ts`: `BODY_MAX_SPEED`, `BODY_SCENE_SPEED`, `SPRITE_DEPTH`, `HURT_MS`,
  `HURT_GAP_MS`, `BOSS_ANIMS`, `BossAnim`, `SpriteDef`, `Motion`, `sway`.
- `tests/boss.test.ts`: 3 `sway` tests (19 in the file).
- `src/systems/LightingSystem.ts`: `LitImage`, `addLit`, `removeLit`, and the loop in
  `tintForeground` that gives listed images corner tints as bricks get them.
- `src/systems/BossBody.ts`: `preload`; the sprite and its five animations; hidden parts, or
  visible ones when there is no sheet; the anchor; `move`, `pose`, `show`, `flinch`, `fade`,
  `retire`, `spawn`, `center`, `holds`.
- `src/systems/BossDirector.ts`: `Pose`, `ArenaBrick`, `BossStage`, `BossHud`,
  `BossHost.setHud`, the P2 members of `PhaseDef` and `BossDef`; phase setup and poses; the
  flinch timer; the HUD view; `FORCED_BOSS_PHASE`; `embedded` and `debugProbe`.
- `src/bosses/warden.ts`: the sprite, the three parts moved over the picture, the `open` pose,
  the two phases with their motion, and phase 2's `setup`.
- `src/scenes/Play.ts`: `HudState.boss`; `BossBody.preload` in `preload()`; `startPhase` from
  `FORCED_BOSS_PHASE`; the dev `]` key; the dev `debugProbe` call after `boss.update`; `setHud`
  in `bossHost()`.
- `src/scenes/Hud.ts`: the board bar and pips (`makeBossBar`, `layoutBoss`, `drawBoss`).
- `src/ui/WingPlates.ts`: the `Boss` label, pips and `Meter` on the left plate, `drawBoss`, and
  three helpers the board bar shares: `easeBossBar`, `bossPips`, `paintBossPips`.
- `src/platform/debugOverlay.ts`: the boss line.
- `tests/bosses.test.ts`: 6 tests added (14 in the file): three on poses, three on the sprite.

The generation attempts, both 1152 x 864 from the phase's description:
- Attempt 1, rejected. Content crossed the cell edge between rows 2 and 3 (431 pixels in a 7 px
  band at y = 576), and the model had added thruster flames that fade to near-white.
- Attempt 2, kept. The description with these additions: each cell is exactly a third of the
  image and the creature sits in its middle; the creature fills about two thirds of its cell;
  no flames, exhaust, smoke or glow outside the body; sparks and fragments stay close to the
  body. White to the border, nothing across a cell edge, the outline dark (median luminance 58
  three pixels in). The creatures are still not on the cell grid: each sits 12 to 14 px further
  over per column, which the script's sliding step takes out (slides of up to 33 px across and
  19 px down).
- Both are kept outside the repo, in the Cursor project's `assets/` folder, as
  `warden-attempt-1.jpg` and `warden-attempt-2.jpg`. Attempt 2 is `art-src/bosses/warden.jpg`.

The Warden, in brick cells:

| Part | col, row | Size | Texture | Notes |
| --- | --- | --- | --- | --- |
| `body` | 7, 3 | 6 x 2 | `brick_purple2` | Across the shoulders. |
| `core` | 9, 4 | 2 x 3 | `brick_red` | `weak: 3`. Its top row is under `body`; two rows hang below. |
| `guard` | 9, 7 | 2 x 1 | `brick_steel` | Steel. Directly under `core`, the same width. |

The sprite is 300 x 225 on the field at `dx: 2`, `dy: 49.5` from the anchor. The `open` pose
moves `guard` up 48 px, into `body` and over the top row of `core`, where no ball reaches it.
Phases: `guard-up` ("Guard up", `sway(50, 5200)`) and `core-exposed` ("Core exposed", pose
`open`, `sway(90, 3600)`), 12 hits each. Phase 2's `setup` spawns six `brick_purple2` bricks at
row 16, columns 7 to 12.

Verified
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 458 passed, 1 failed, in 22 files (was 450 passing when I started). The failure
  is the one described at the top. `tests/boss.test.ts` and `tests/bosses.test.ts`: 33 passed.
- The four new content tests each fail when they should. On a copy outside the repo: a pose
  naming a part that is not there, a phase naming a pose that is not there, a pose lifting
  `guard` into the top two rows, and frame 9 on a nine-frame sheet each failed exactly one test.
- `vite build` on a copy outside the repo: built. In the bundle the overlay line, the `?debug`
  zones and the `&phase` reader are gone. `debugHit` and `debugProbe` remain as methods nothing
  calls.
- How the manual checks were run: the dev server that was already running, the Cursor browser,
  and scripts in the page reading the `Play` and `Hud` scenes every frame, plus screenshots.
  Easy difficulty (pool 10). The paddle stood still. For the long runs I turned god mode on so
  the balls stayed in play, and the script refilled the pool whenever it ran low so a phase
  would last. None of that is in the repo.
- Manual 1: without `&debug` the three parts had `visible` false and the screenshot showed the
  creature with no bricks under it. `warden-idle` stepped through frames 1, 2, 1, 0 every 200
  ms. The sprite moved between x 252 and 352 at up to 69 px/s.
- Manual 2: each flinch showed the `hurt` frame for 180 to 195 ms and swelled the sprite from
  0.9375 to 0.975. Under gun fire, 18 hits in 5 s gave six flinches 263 to 741 ms apart. Over
  the two-minute runs the shortest gap between two flinches was 250 ms.
- Manual 3: the screenshots with `&debug` show `body` across the shoulders, `core` on the eye
  and `guard` under it, all at 35% alpha. The overlay read `boss warden  fight  phase 1/2  pool
  10.0/10  embedded 0` and followed the pool and the phase. Phase 1: 127 s on the fight clock,
  three to six balls in play, 226 hits, `embedded` 0. Phase 2: 134 s, three balls, 67 hits,
  `embedded` 0. The counter does count: a point at a part's centre and one 3 px inside its edge
  each added 1; a point 1 px inside and one outside added nothing.
- Manual 4: the `]` key in phase 1 gave phase 2, the label `WARDEN · CORE EXPOSED`, `guard` up
  from y 176 to 128, and six bricks at y 320 with ids 100003 to 100008. `&phase=2` started in
  the same state with a full pool. The first wall brick a ball broke took the score from 300 to
  420. One pickup was in the air within a tenth of a second of that break and two while the
  rest of the wall went, but I did not tie a pickup to a particular wall brick. In 40 s of
  phase 2 the pool took 23 hits of 1 and 6 hits of 3, and each hit of 3 had a ball just under
  the core's bottom edge. Left to the balls, the boss died: the sprite faded and was gone, the
  bar went, and Results came up.
- Manual 5, desktop window (1561 x 1283): the bar's track ran x 303 to 563, y 66 to 74, with
  two pips at 569 to 587. Five rings ended at x 251 and the shield icon at 296, so nothing
  touched. Four hits eased the fill from 0.96 to 0.54 over about half a second. At the phase
  change the fill eased back to 1, the first pip went dim and the second stayed lit. At the
  kill the bar and pips hid.
- Manual 5, narrow window (400 x 860, emulated): the same bar, rings and shield icon, none
  touching. On the tall window the field sits lower than the HUD strip, so the bar is well
  above the boss.
- Manual 5, 16:9 window (1600 x 900, emulated): the wing plates were up and there was no board
  bar. The left plate had `BOSS`, two pips at the right of the label row, and the meter under
  Fever. It drained to 0.6, refilled at the phase change with the first pip dim, and after the
  kill stayed on the plate, empty, with both pips dim.
- Manual 6: `?lighting=low` and `?lighting=high` each ran both phases and the kill with the
  sprite tinted by the lighting and no console error or warning (collected from page load on).
  With WebGL blocked in the page the game came up on the canvas renderer: lighting off, the
  sprite untinted and fully visible, both phases and the kill, no console error.
- Manual 7: with the sheet renamed, Phaser logged `Failed to process file: spritesheet
  boss_warden`, there was no sprite, and the three parts showed as purple, red and steel
  bricks, swaying. A ball hit took the pool from 10 to 9, `]` gave phase 2 with the wall, `]`
  again gave the kill and Results. The sheet is back: 900,134 bytes, the same hash as the
  script's output.
- Manual 8: with reduced motion on, nine flinches in 16 s showed the `hurt` frame and the scale
  never left 0.9375. The sprite still moved between x 252 and 352. The board bar jumped to its
  value on the next frame instead of easing.
- Manual 9: `?level=1` had no boss, no bar, no `boss_warden` texture, 52 bricks with none owned,
  the label `LEVEL 1 · 47 LEFT`, and no console error. `?arcade=waves` the same, with `WAVE 1 ·
  50 LEFT`. `?level=1` at 1600 x 900 had no `Boss` row on the wing plate.

Not verified
- Any sound, and how the fight feels to a person playing. I saw numbers and screenshots.
- A real phone and a real TV. The narrow and 16:9 windows were emulated sizes in a desktop
  browser, with a mouse.
- Normal and Hard in the browser. Every run was on Easy.
- Play with a moving paddle. The paddle stood still and god mode was on for the long runs.
- The sprite under ordinary lighting. The lab is `lightsOut`, so the lit sprite is nearly black
  (corner tints about `0x161514`) until a ball's light or a flash reaches it. The canvas
  screenshot is the only one that shows it fully.
- `tell`, `open` and `death`. The animations are created and nothing plays them in this phase.
- `pnpm build` in the repo, the desktop build and a gamepad.

Deviations from the documents
- The whole body is held to the speed limit, not only the parts. `sway(90, 3600)` peaks at 157
  px/s, above `BODY_MAX_SPEED`. Read literally, the sprite would follow the curve and the parts
  would trail it by up to 20 px. I move one offset toward `motion(clock)` at the limit and hang
  both the sprite and the parts from it. Phase 2 still reaches 90 px each way and runs up to 20
  px behind its curve in mid-sweep.
- The board bar is on the right half, not across the field: x 304 to 562, with the pips at its
  right end, 26 px under the HUD strip. A full-width bar there would cross the effect rings.
- Any hit that takes from the pool starts a flinch, a laser bolt's fraction of a hit included.
  I read "counted hit" as a hit that was not `immune` or `armor`.
- `core` overlaps `body` by one row, and `guard` in the `open` pose overlaps both. Parts are
  not solid to each other, and the lower row of `body` covers them from above.
- The phase ids are `guard-up` and `core-exposed`, after the titles the phase file gives.
- `embedded` is fed by `debugProbe(points)`, called from `Play.update` in dev builds.
  `BossHost` has no `balls()` until P4.
- `FORCED_BOSS_PHASE` is exported from `BossDirector.ts` and read in `Play.ts`.
- `BossDirector.def` is public and read-only, so the overlay can print the id and phase count.
- `BossBody`'s constructor takes the `BossDef`. Parts start in their pose and at their motion's
  starting offset, with no travel, since nothing is in play at construction.
- `easeBossBar`, `bossPips` and `paintBossPips` are exported from `WingPlates.ts` so the board
  bar and the plate share them. `widgets.ts` is not on the phase's list.
- On the wing plate the bar stays, empty, after the kill. The plate is laid out once, and
  hiding the row would leave a gap.
- `build-bosses.py` slides each cell onto the first before the common crop (see the attempts
  above), and keeps 2 px clear inside each frame so filtering never reads the next frame.
- Two sprite tests beyond the ones listed: the sizes are above zero, and every frame number
  exists on the sheet file.
- The tree was not clean at the start. HEAD was `8710eb3`, with another session's uncommitted
  work in `src/config.ts`, `src/core/Layout.ts`, `src/scenes/Hud.ts`, `src/ui/ControlsCard.ts`
  and `tests/layout.test.ts`.

Open
- The failing test. `src/core/Skills.ts` now has the gun at 6000 ms and bullet time at 3000 ms,
  and `tests/skills.test.ts` expects the gun to be the shorter. Not this phase's to fix.
- Whose changes are whose. Not mine: `src/config.ts`, `src/core/Layout.ts`,
  `src/core/Skills.ts`, `src/systems/AudioSystem.ts`, `src/systems/MusicEngine.ts`,
  `src/ui/ControlsCard.ts`, `tests/layout.test.ts`; in `src/scenes/Play.ts` the "Always-on
  skills" comment, the two `new SkillCharge(..., 1)` lines and the two `audio.setDream` lines;
  in `src/scenes/Hud.ts` everything except the boss bar. Before I edited shared files I saved
  the other session's diff as it then stood, outside the repo, as
  `touch-deck-before-phase2.patch` in this agent's Cursor store.
- The dev save at `localhost:5173` in Cursor's browser. I turned god mode on for the long runs
  and the game saved it; it is back to off, and reduced motion is off. Killing the boss there
  wrote `level31` (3 stars, best score 38,285) and the save now reads `unlocked: 31`. I did not
  record what `unlocked`, `coins` or `level31` were before, so I left them.
- The sheet is in the production service worker's precache: 900 KB more on every install.
  `vite.config.ts` is not on this phase's list. A `globIgnores` entry for `**/images/bosses/**`
  would leave it to load with its level.
- The sprite takes its light at four corners only, as a brick does. Over 300 x 225 px that is a
  coarse gradient.
- In phase 1 the core's two lower rows are open at the sides, so a ball coming in level can hit
  the `weak: 3` core while the guard is down.
- `Brick.flash` still swells a hidden part's physics box for about 100 ms (Phase 1's first open
  item), and with `&debug` it shows as a white flash on the zone.
- The fight clock runs while the ball waits on the paddle, so the boss sways during the launch
  countdown.
- On the canvas renderer the pips drew white, lit and unlit told apart only by alpha. The skill
  buttons were white there too.
- With `&debug` on a narrow window the debug overlay covers the right end of the bar.
- The root README's "Generated art" section does not mention `build-bosses.py`.

For the user to confirm
- Whether the Warden's sheet is good enough to test against.
- The bar's look and position on phone and TV.

Later
- The `globIgnores` entry above.
- Light for a large sprite sampled at more than its corners.
- A reduced-motion gate on `Brick.flash`.
- A note in the README that manual checks belong on a spare origin, as Phase 1 ran them.

## Phase 2 review: PASS, 2026-11-16, Claude (Cursor agent)

Every Build item is in, every automated check that belongs to this phase passes, and every
manual check I could run matched the handoff. The one wrinkle was the tree: it held another
session's work beside this phase's, which is why `pnpm test` was red out of the box. I lifted
the other session's edits out before committing, kept Phase 2's single clean commit, and left
the other session's work in the working tree for whoever owns it to pick up. Three things to
know:

1. The out-of-scope changes in `src/config.ts`, `src/core/Layout.ts`, `src/core/Skills.ts`,
   `src/systems/AudioSystem.ts`, `src/systems/MusicEngine.ts`, `src/ui/ControlsCard.ts`,
   `tests/layout.test.ts` and parts of `src/scenes/Hud.ts` and `src/scenes/Play.ts` are the
   other session's, as the handoff declares. They are back in the working tree, unstaged, after
   I reverted them for the commit and re-applied them from a backup. They are not in Phase 2's
   commit.
2. Before I split the tree, `pnpm test` failed on `tests/skills.test.ts` (another session's
   `src/core/Skills.ts` edit, gun 6000 ms vs bullet time 3000 ms) and flaked on
   `tests/procgen.test.ts > leaves a wide door in the bottom of every frame`. I reproduced the
   procgen flake on a clean clone of HEAD (`8710eb3`) in a tmp directory; it is a pre-existing
   5000 ms timeout, not Phase 2's. On the committed tree all 454 tests pass.
3. All manual checks were run in the Cursor browser with god mode on for the long sessions, as
   the handoff did. I did not play with a moving paddle and I heard no sound. The sheet is still
   open for the user's eye.

Ran
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 457 passed, 2 failed, in 22 files. Run a second time with the same results.
  `tests/boss.test.ts` and `tests/bosses.test.ts`: 33 passed. Both failures are unrelated to
  Phase 2 (see above). The four new content tests plus the three `sway` tests are all there.
- `python3 scripts/build-bosses.py`: byte-identical output (sha
  `9f2afa54781891dea854d6da707e0cd5133c5b1c`, 900,134 bytes) to the file already in the tree.
- How the manual checks were run: a dev server already up at `http://127.0.0.1:5173`, the
  Cursor browser, scripts in the page reading `window.boss`, `window.game.scene.getScene('Play')`
  and the `Hud` scene. Easy difficulty (pool 10). The paddle stood still and god mode was on
  for the embedded run. I unset god mode and reduced motion again before stopping.
- Manual 1, `?map=bosslab.tmj`: the three parts had `visible: false`; the sprite was on screen
  and `warden-idle` stepped through frames 0, 1, 2, 1. `drift.x` swept from +35 to +50 to -50
  and back, up to 69 px/s on the field; no brick showed under the picture.
- Manual 2: a single `debugHit(1)` played `warden-hurt` for ~180 ms of fight-clock time and
  punched the scale from 0.9375 to 0.975 and back; hurt swap frame was 6. Rapid hits over a
  longer run (40 `debugHit(1)` calls in 2 s of real time) counted 4 flinches on the throttled
  tab, never two inside `HURT_GAP_MS`.
- Manual 3, `&debug`: the three parts showed over the sprite at alpha 0.35, depth 2 (above the
  sprite's depth 1). The overlay read `boss warden  fight  phase 2/2  pool 9.0/10  embedded 0`
  and followed the pool and phase. With god mode on and three balls in play I watched for 10 s
  on phase 1; `embedded` stayed 0 (34 samples, 300 ms apart). I did not run the full two
  minutes per phase the phase file asks for.
- Manual 4, `?map=bosslab.tmj&phase=2&debug`: started in phase 1 (0-based) with pool 10/10,
  label `WARDEN · CORE EXPOSED`; `guard` was at y 128 (homeY 176, so dy -48), sandwiched
  between `body` (y 104-136) and the top row of `core` (y 120-168), where no ball reaches
  it. Six `brick_purple2` bricks appeared at x 225-375 (cols 7-12), y 320, ids 100003 to
  100008; they were ownerless and visible. Draining both phases through hits and letting the
  defeat land: step `finale`, pool 0, active false, `hud.boss` null, score 2,500 (= 2000
  defeat + 500 phase), the sprite faded away and the clear banner came up with one star. The
  `]` key also empties the current pool.
- Manual 5, three viewports via Chrome device emulation (not real phones):
  - Narrow (420 x 900): board bar at x 303 to 563, y 70, with two pips at x 573 and 583,
    both red at alpha 1. No wing plates. Sprite centred over the field.
  - Desktop/portrait (1024-ish wide, no emulation): same board bar, same pips.
  - 16:9 (1600 x 900): `WIDE` true, STAGE_W 1422, wings 411. No board bar. The left plate
    showed `BOSS`, two pips at the right end of the label row, and a red meter under `Fever`.
    All three plate elements live in `WingPlates.boss`.
- Manual 6, `?lighting=low` and `?lighting=high`: the sprite was tinted in both; after ~2 s
  the four corner tints read `0x161514`, `0x161514`, `0x181614`, `0x181614` (the level is
  `lightsOut`, so the warden sits dark until a ball's light reaches it). No console error.
- Manual 7: I renamed `public/assets/images/bosses/warden.png` to `warden.png.bak`. Phaser
  failed to load the sheet; `boss_warden` texture did not exist; no sprite was built; the
  three parts were visible at alpha 1 as plain purple, red and steel bricks, all swaying;
  the label and the bar still worked. I restored the file and the sha matches.
- Manual 8: with reduced motion on, the scale stayed at 0.9375 across a flinch (no punch),
  but the `warden-hurt` frame still swapped in. `drift.x` still swept from +35 to +50 to +15
  across three seconds, so sway still plays. `calm()` was true even though `save.state.
  settings.reducedMotion` read false after the reload, so the setting does persist through
  the running scene even if my dynamic import was reading a fresh module instance.
- Manual 9: `?level=1` and `?arcade=waves` both had `window.boss` and `p.boss` undefined,
  `hud.boss` null, no `boss_warden` texture loaded (the Play.preload guard works), 52 bricks
  for level 1 and 52 for wave 1, labels `LEVEL 1 · 47 LEFT` and `WAVE 1 · 50 LEFT`. At 1600 x
  900 the wing plate on `?level=1` had no `BOSS` row.

Not checked
- Any sound.
- Real phones and a real TV. The narrow and 16:9 windows were Chrome emulation sizes.
- Normal and Hard in the browser. Easy was on screen.
- Play with a moving paddle. The paddle stood still.
- `embedded` over the full two minutes per phase. I ran ten seconds in phase 1 only; the
  handoff ran 127 s and 134 s.
- `tell`, `open` and `death` animations. The animations are built; nothing plays them in P2.
- `pnpm build` in this working tree, the desktop build, a gamepad. The handoff reports a
  successful `vite build` on a separate copy of the tree.
- The dev save at `localhost:5173` in the Cursor browser. I turned god mode on for the
  embedded run and off again, and did the same for reduced motion. The save still carries
  this session's clear and unlocks from the kill; I did not record the prior values.

Build items
- Sprite sheet, `scripts/build-bosses.py`, `art-src/bosses/warden.jpg`,
  `public/assets/images/bosses/warden.png`: done. The script is self-contained, flood-fills
  the border, slides each cell onto the first, crops all with one box, scales by one factor,
  centres and saves as RGBA. The Pillow table at the top lists the Warden's grid (3 x 3) and
  frame (320 x 240); the output is 960 x 720. A second run is byte-identical.
- `src/core/Boss.ts`: done. `BOSS_ANIMS`, `BossAnim`, `SpriteDef`, `Motion`, `sway`, and the
  constants `BODY_MAX_SPEED` (120), `BODY_SCENE_SPEED` (600), `SPRITE_DEPTH` (1), `HURT_MS`
  (180), `HURT_GAP_MS` (250). `sway` is `amplitude * sin(2*pi * clock / period)`, `y: 0`.
- `src/systems/BossBody.ts`: done. `preload` queues the sheet only if its texture does not
  exist yet. The constructor takes `BossDef`, computes the anchor from the rest bounding box
  of every part, builds the animations once with `scene.anims.generateFrameNumbers`, creates
  one `Sprite` at `SPRITE_DEPTH` sized `width x height`, and hides the parts (or shows them
  at 0.35 alpha with depth 2 under `?debug`). `move(offset, step)` approaches the drift at
  `step`, then approaches each part's target at `step` after the drift update (so part
  motion and sway are both capped at the per-frame `BODY_MAX_SPEED` / `BODY_SCENE_SPEED`
  budget). Poses move parts only: the sprite hangs from `anchor + drift + (sprite.dx, dy)`.
  `flinch` is calm-gated, cancels itself with `punch?.stop()`, and does not call
  `juice.flash`. `fade` tweens alpha to 0 over 300 ms and `onComplete` destroys the sprite;
  the only animation callback in the directory and it only teardown-sets the picture, not
  fight state. `spawn` appends ownerless bricks with ids counting up from the last part's
  id, then calls `host.bricksAdded(bricks, false)`. `holds(x, y)` is `PROBE_INSET` (2 px)
  inside the brick's spec rectangle. `LightingSystem.addLit(sprite)` is called at build and
  `removeLit(sprite)` at destroy and in `dropSprite`. `setLighting` is never called on the
  sprite. Nothing in this file reaches for `quality` or the tier budget.
- `src/systems/BossDirector.ts`: done. `Pose`, `ArenaBrick`, `BossStage`, `BossHud` and the
  P2 members of `PhaseDef`, `BossDef` and `BossHost` are all in. A `BossStage` is a frozen
  snapshot of the live systems plus the body's `center`, `part`, `pose`, `retire` and
  `spawn`; `calm` is a getter so it reads live. On construction the director runs every
  earlier phase's `setup` in order with `opts.startPhase`, then `enterPhase` for the current
  one, then moves the body to its starting offset with `Infinity` step so it is already in
  place before the first frame. `update` advances the fight clock from `dt / timeScale`
  skipped in hit-stop, flushes pending hits (triggering one `flinch` per update at most and
  only outside `HURT_GAP_MS`), then calls `body.move(offset, speed * tick / 1000)` and
  `body.show(hurt or idle)`. On finale: retire every part, fade, `shatterBelow(-Infinity)`,
  defeat bonus, `setHud(null)`, `defeated()`. `showHud` keeps one `BossHud` object alive and
  writes into it every frame. `FORCED_BOSS_PHASE` is a module const that reads `&phase=N`
  (1-based) in DEV. `debugProbe` increments `embedded` once per frame if any point is inside
  a live part; `debugHit` adds to `pending`. `def` is `readonly` and public so the overlay
  can read it.
- `src/bosses/warden.ts`: done. The sprite key is `boss_warden`, frame size 320 x 240, field
  size 300 x 225, offsets `dx: 2`, `dy: 49.5`. Animations: `idle [0,1,2,1]`@5, `tell [3,4]`@8,
  `open [5]`@1, `hurt [6]`@1, `death [7,8]`@3. Parts: `body` 6 x 2 at col 7 row 3, `core` 2
  x 3 at col 9 row 4 with `weak: 3`, `guard` 2 x 1 steel at col 9 row 7. `open` pose lifts
  `guard` by `-3 * BH`. Phases: `guard-up` with `sway(50, 5200)`, `core-exposed` with pose
  `open`, `sway(90, 3600)` and a `setup` that spawns six `brick_purple2` bricks at col 7-12,
  row 16. Imports only types from `src/systems/BossDirector`, plus `sway` and grid constants
  from `src/core`.
- `src/scenes/Play.ts`: done. `HudState.boss`, `BossBody.preload(this, BOSSES[boss])` in
  `preload()` when the next level has a boss, `startPhase: FORCED_BOSS_PHASE` on the
  director, `]` key bound in DEV to `boss.debugHit(boss.state.pool)`, `boss.debugProbe` fed
  the centres of the free balls in DEV from `update`, `setHud` in `bossHost()`.
- `src/scenes/Hud.ts`: done. `HudState.boss` is drawn in `drawBoss` from `makeBossBar`,
  a thin red track with a fill that eases toward the value plus one disc pip per phase at the
  right end. The bar sits at `y = HUD_HEIGHT + BOSS_BAR_DY` with `BOSS_BAR_LEFT = 304`,
  past the five effect rings (whose right edge is at x 293) and the shield icon. It is
  hidden when `boss` is null or not `shown`.
- `src/ui/WingPlates.ts`: done. On the wide stage, when `play.hud.boss` is set at build
  time, the left plate gets a `Boss` label, phase pips, and a `Meter` below `Fever`. Three
  helpers (`easeBossBar`, `bossPips`, `paintBossPips`) are exported and used by both
  renderers, so the eased fill and the pip tint are the same code. The bar stays empty on
  the plate after the kill because the plate is laid out once; that is in the handoff's
  deviations.
- `src/systems/LightingSystem.ts`: done. `LitImage`, `addLit`, `removeLit`, and a loop in
  `tintForeground` that tints each listed image with the same `cornerTints` path the bricks
  use. Images with `visible === false` are skipped.
- `src/platform/debugOverlay.ts`: done. A `bossLine` from `BossDirector.current` prints
  `boss <id>  <step>  phase <n/m>  pool <x.x/y>  embedded <N>`.
- `tests/boss.test.ts`, `tests/bosses.test.ts`: done. `sway(0) === {x: 0, y: 0}`, stays
  horizontal, never leaves its amplitude, reaches it at each quarter and repeats after one
  period. For every boss: poses only name existing parts; every `phase.pose` exists; every
  part in every pose stays inside the field and out of rows 0 and 1 (checked at
  `>= 2 * BH`); a sprite has all five animations with whole non-negative frame numbers and
  `fps > 0`. Two extras: every size is positive and every frame number is on the sheet (the
  PNG width and height are read from the IHDR). I made three one-line breakages in a copy
  of `src/bosses/warden.ts` and each failed exactly one test: a pose naming a missing part;
  a phase naming a missing pose; frame 9 on a 9-frame sheet.

Scope and shortcuts
- Not clean. The other session's work (declared in the handoff) is in the same working tree:
  `src/config.ts`, `src/core/Layout.ts`, `src/core/Skills.ts`, `src/systems/AudioSystem.ts`,
  `src/systems/MusicEngine.ts`, `src/ui/ControlsCard.ts`, `tests/layout.test.ts`, plus bits
  of `src/scenes/Hud.ts` (named-import reorder, `layoutDeck`, `drawSkill` arrow redirection,
  tween-config reformatting, hand/ring `setPosition` chain reformats) and bits of
  `src/scenes/Play.ts` (the `Always-on skills` comment, the two `new SkillCharge(..., 1)`
  calls and the two `audio.setDream` calls in `activateSlowmo` / `deactivateSlowmo`). None
  of these belong to Phase 2.
- Inside the phase's files: no `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`,
  `eslint-disable`, `Math.random`, console logging, `setTimeout`/`setInterval`,
  `delayedCall`, `addEvent`, `Date.now`, `performance.now`, `juice.flash`, `setLighting`
  on the sprite, or `try`/`catch` that swallows an error. One `onUpdate`-style callback,
  the `onComplete` in `BossBody.fade`, only destroys the picture; the fight is already over
  by then and no fight state changes inside it. One `?? ` default (the `anchor` offset for
  a part not named in the pose) is the documented default. `?.` uses are reads from
  optional types (`def.poses?.[name]`, `def.phases[...]!.motion?.(clock)`). Nothing tagged
  P3 or P4 was built: no cues, `audio.bossMusic`, `AttackDef`, `HazardSystem`, `tell`/`open`
  switching from gameplay, `lock`, or steps beyond `fight` and `finale`. No new dependency,
  no new input bindings other than the DEV-only `]` and `&phase=`, no shipped-level edits.
- `src/bosses/warden.ts` imports `BossDef` and `ArenaBrick` as types only, and `sway` plus
  `BH`, `BRICK_HEALTH`, `BW` from `src/core`. The node test suite can import `BOSSES`
  without a Phaser scene.
- Deviations the handoff declares, and that the run matched: the body's step applies to the
  drift as a whole so a part's motion in a pose and the sway share one speed budget; the
  board bar lives on the right half instead of across the field; any pool-draining hit
  (including a laser's fractional hit) starts a flinch; `core`'s top row sits under `body`
  and `guard` in the open pose sits inside both; the phase ids are `guard-up` and
  `core-exposed`; `embedded` is fed from `Play.update`'s DEV guard because `BossHost.balls`
  arrives in P4; `FORCED_BOSS_PHASE` is exported from `BossDirector.ts` and read in
  `Play.ts`; `BossDirector.def` is public and read-only; `BossBody` takes the whole
  `BossDef`; the parts start at their pose and motion offset at construction because
  nothing is in play; the wing-plate bar stays empty after the kill; `build-bosses.py`
  slides each cell before the common crop and keeps 2 px clear inside each frame.

For the user
- Decide what to do with the other session's work still in the tree. It covers skill cooldowns
  (`SKILLS.gun` 6000 ms and `SKILLS.slowmo` 3000 ms), a `setDream` audio step inside bullet
  time, the touch deck layout (`DECK_MIN_TOUCH` 150 to 200, a skill row under the corner slots,
  the slider and arrow positions, the Controls card copy), plus a rewrite of `MusicEngine` and
  `AudioSystem` for a second track and a `tests/layout.test.ts` block that goes with the deck.
  Pick it up as its own phase or discard; it is not Phase 2 either way. The implementer saved
  the other session's starting diff as `touch-deck-before-phase2.patch` in its Cursor store if
  you need to recover it.
- The sheet. The cells all hold the warden; the eye is in the head, not in a chest cavity
  as the description asked. Open and attack frames do show the chest-core; the hurt frame
  shuts the eye; the death frames crack and break. Up to you whether that reads.
- The board bar on a real phone and the wing-plate meter on a real TV. I only used Chrome
  emulation.
- The level is `lightsOut`, so the warden is a dark silhouette at rest until the ball's
  light reaches it. Switch the lab to a lit level if you want the full picture visible
  while reviewing.
- Hard's pool and Normal's pool in the browser. Easy was the only difficulty on screen.
- All sound.
