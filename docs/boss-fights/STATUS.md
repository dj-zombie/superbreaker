# Boss fights: status

The log for this work. Newest entries go at the bottom. Agents append; nobody rewrites history.

## Where things stand

| Phase | State | Implemented by | Reviewed |
| --- | --- | --- | --- |
| 1. A boss you can kill | pass | Claude (Cursor agent), 2026-11-16 | Grok (Cursor agent), 2026-11-16 |
| 2. Sprite body and HUD | not started | | |
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
