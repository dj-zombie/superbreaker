# Boss fights: status

The log for this work. Newest entries go at the bottom. Agents append; nobody rewrites history.

## Where things stand

| Phase | State | Implemented by | Reviewed |
| --- | --- | --- | --- |
| 1. A boss you can kill | pass | Claude (Cursor agent), 2026-11-16 | Grok (Cursor agent), 2026-11-16 |
| 2. Sprite body and HUD | pass | Claude (Cursor agent), 2026-11-16 | Claude (Cursor agent), 2026-11-16 |
| 3. Cinematic flow | pass | Claude (Cursor agent), 2026-11-16 | Grok (Cursor agent), 2026-11-16 |
| 4. Attacks | pass | Claude (Cursor agent), 2026-11-16 | Grok (Cursor agent), 2026-11-16 |
| 5. Reference boss and authoring guide | in review | Claude (Cursor agent), 2026-11-17; fixes 2026-11-17 | Grok (Cursor agent), 2026-11-17; Claude (Cursor agent), 2026-11-17 (second FIX: one more fails means RESTART) |

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
- Phase 5, after playing Phase 4: the fight was confusing and not cinematic enough. The flow is
  now: fade to black with the music off; the boss heard before it is seen, with lightning for a
  glimpse; a reveal with close-ups and a threat; a title card with the name and letterbox bars;
  boss music into play; a scene on each phase's kill shot; a death scene, then a triumphant
  theme; an award (a spinning trophy for special ones) that waits for a tap or a cooldown.
- Phase 5: sounds and music are placeholders in new files, which the user will replace.
- Phase 5: the placeholder boss track is the recording at https://youtu.be/WfzurQ0XKNc
  ("Middle Boss Battle", The Legend of Zelda: Ocarina of Time), downloaded with yt-dlp.
- 2026-11-17, replacing the two campaign and Arcade lines above: the Warden is a boss stop on the
  world map between levels 5 and 6, with level numbers and saves unchanged; level 6 opens once it
  is beaten. The user plans a boss every five levels, but only the stop after level 5 is placed
  for now. Arcade has a boss every fifth wave (Waves) and every fifth tier (Descent).
- 2026-11-17: both Arcade loops get occasional lights-out rounds.
- 2026-11-17: Descent was far too easy (a full field cleared in seconds once abilities and combos
  stacked), so rows come faster.

## Waiting on the user

- The boss song, with its tempo, a bar map, and which bars are `rise`, `low`, `mid`, `high`,
  `rest` and the stinger.
- Whether agents may commit after a PASS, or the user commits.
- Phase 5: whether the player should get a shield, so that boss bullets do damage that can be
  seen. It was asked as a question and is not built. Today a hit jams or shrinks the paddle and
  says so; only the skull costs a life.
- Phase 5: replacements for the 14 placeholder audio files listed in the Phase 5 entry. The
  boss track is somebody else's recording and must not ship.
- Phase 5: whether the Warden's core should stay open for all of phases 2 and 3. While it is
  open, a ball rising into it ends some Normal fights in about 90 s; closing it between
  openings would make the fight steadier and the opening worth waiting for.

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

## Phase 3: DONE, 2026-11-16, Claude (Cursor agent)

Every build item is in and all eleven manual checks gave the expected result. Four things to
know before reviewing:

1. `pnpm test` is not green: 486 pass and 1 fails. The failure is `tests/skills.test.ts` >
   "readies the gun more often than bullet time" (`expected 6000 to be less than 3000`). It is
   in HEAD, from commit `ef30407`. This phase did not touch `src/core/Skills.ts` or that test.
2. I heard nothing. Every statement about music and sound below is what the audio system was
   asked to play (key, mood, the session's gain), read from the page. Nobody has listened yet.
3. HEAD moved while I worked. I started on `461ae10` with another session's work uncommitted
   in nine files. That work was committed as `ef30407` at 19:05, as I was starting. The diff I
   had saved of it before my first edit is line for line that commit, so the commit holds none
   of this phase. `git diff HEAD` is now this phase and nothing else, including in the three
   files both touched (`src/scenes/Play.ts`, `src/systems/AudioSystem.ts`,
   `src/systems/MusicEngine.ts`).
4. The checks found one crash in my own change, now fixed: restarting the lab while the launch
   hint was up threw in `tickCountdown`. See "Deviations".

Built
- `src/core/Cues.ts` (new): `CueSheet`.
- `tests/cues.test.ts` (new): 11 tests.
- `src/core/Boss.ts`: the `intro` option, `stepMs`, `tick`, `skip`, `BossSpec.entranceMs`,
  `deathMs`, `phases[].enterMs`, `BOSS_MOODS`, `BossMood`, `BossIntensity`,
  `BOSS_MOOD_FALLBACK`, `HUSH_MS`, `REVEAL_MS`, `AFTERMATH_MS`, `SKIP_GUARD_MS`, `BOSS_SWELL_S`,
  `BOSS_STINGER`, `HUSH_DARK`, `ENTRANCE_DROP`. `damage` enters `transition` when the new phase
  has an `enterMs`.
- `tests/boss.test.ts`: 13 tests in a new `describe('BossState flow')` (32 in the file). No
  earlier test was edited.
- `tests/music.test.ts`: 1 test, every boss mood has a playlist behind it.
- `src/systems/MusicEngine.ts`: `play(mood, volume, fadeIn = 0)`.
- `src/systems/AudioSystem.ts`: `bossMusic`, `bossStinger`.
- `src/systems/BossDirector.ts`: `Cue`, `Cutscene`, `PhaseDef.intensity` and `enter`,
  `BossDef.epithet`, `entrance` and `death`; `BossStage.audio`, `anim`, `light`, `tween`,
  `impact`; `BossHost.titleCard`, `showHint`, `impact`; `frozen`, `holdServe`, `cinematic`,
  `music`, `skip()`; the body is made at the entrance, not at construction; one handler per
  step; cutscenes with their lights and tweens.
- `src/systems/BossBody.ts`: `arrive(t)`, and the lift it sets in `move`. Not on the phase's
  list; see "Deviations".
- `src/scenes/Play.ts`: `titleBand` out of `introCard`; `bossImpact`; `updateBossMusic`; the
  boss opening in `create`; the freeze, serve, tap, launch, ability, skill, stock, music and
  `win()` changes the phase lists; three new members in `bossHost()`.
- `src/bosses/warden.ts`: `epithet: 'Keeper of the gate'` and three cutscenes.
- `tests/bosses.test.ts`: 3 tests (17 in the file).

The Warden's scenes, in ms from the start of each:

| Scene | Length | Cues |
| --- | --- | --- |
| `entrance` | 1800 | 0: `thunder` pitched down, a violet light at the centre growing 70 to 240 px over 1100 ms. 1150: `tell`, an impact of 1.2 in violet, `ab_meteor_impact`. |
| `enter` of phase 2 | 1200 | 0: `tell`, `brick_steel` pitched down, a red light at the eye growing 80 to 220 px over 600 ms. 650: an impact of 1.3 in red at the eye, `surge`. |
| `death` | 2200 | 0: a red light at the eye shrinking and fading over 1900 ms. 300, 650, 1000, 1350: impacts of 0.7 to 1, each further from the centre, each with `brick_tnt` a step higher. 1800: an impact of 1.6 at the centre, `brick_collapse`. |

Sound keys the Warden uses: `thunder`, `ab_meteor_impact`, `brick_steel`, `surge`, `brick_tnt`,
`brick_collapse`. The framework adds `fanfare_stab` (the stinger) and `ui_intro` (the title
band's own sound). All eight are in `AUDIO_ASSETS`. Each scene keeps one light of its own, at
priority 7. Each impact adds a 480 ms flash at priority 8, and no more than two of those burn
at once.

Verified
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 486 passed, 1 failed, in 23 files (was 458 passed and the same 1 failed, in 22).
  All three were run again after the last code change.
- Prettier: nothing new. `--check` flags `src/core/Boss.ts` (1 place) and `src/scenes/Play.ts`
  (9 places); HEAD has the same counts.
- How the manual checks were run: the Vite server already running on port 5173, the Cursor
  browser at `http://127.0.0.1:5173`, Easy (pool 10). A script in the page recorded every
  change of step, bar, label, hint, band, dim, physics pause, music key and mood, and logged
  the keys passed to `audio.sfx` and calls to `audio.fanfare`. To act at a chosen moment I put
  Phaser's loop to sleep, clicked, and woke it. Taps, the pause key, the pause menu's Restart
  and music switch, and Retry were real clicks and key presses. Pools were emptied with
  `boss.debugHit(boss.state.pool)`, which is what the `]` key calls. `launch()`,
  `requestPause()` and `powerups.apply('balls')` were called from the page where timing
  mattered. None of that is in the repo.
- Manual 1: the arc ran in order. The times are from one unattended run, in ms from the
  restart; what is in brackets, the score and the screenshots are from runs I stepped through,
  which went the same way. 47 `hush` (dim
  target 0.45, ball held, no hint, no band, bar unshown, label still `LEVEL 31`, no parts), 897
  `entrance` (three parts, the sprite), 2702 `reveal` (band up, label `WARDEN · GUARD UP`, bar
  shown, dim target 0), 4879 band gone, 5099 `fight` (hint up). After the first pool: 5829
  `transition` with the world paused on the same frame, label `WARDEN · CORE EXPOSED`, bar
  refilled, 500 added; 7046 `fight`, the world running again on the next frame. After the
  second: 7363 `finale`, paused on the same frame; 9581 `aftermath` (parts gone, every brick
  shattered, 2,000 added, bar gone); 11362 `done`, then Results. Screenshots of each step
  showed what the numbers say: the dark empty arena; the Warden half faded in under a violet
  glow with a ring and sparks; the band `KEEPER OF THE GATE` over `WARDEN` with the bar partly
  filled; `TAP TO LAUNCH` with the countdown; a red ring on the eye; the broken-up death frame
  with the bar empty; `+2,000` over an empty arena; ALL CLEAR.
- Manual 1, the entrance frame by frame: the sprite's alpha went 0 to 1 and its y 153.5 to
  193.5 in a straight line over the 1800 ms. The bar's fill went 0 to 1 across the reveal. The
  serve clock stayed at 3000 through the intro and counted from the fight.
- Manual 1, input: in the hush, `launch()`, `fireSlot(0)`, `fireSlot(1)`, `useSkill('gun')`,
  `useSkill('slowmo')` and `useStock(0)` changed nothing: the ball stayed held and the gun kept
  its charge. Both ability slots were empty, so the slot guard showed nothing by itself. The
  paddle followed the pointer in the hush, in the phase scene and in the death scene.
- The length of the whole intro: 5086, 5077, 5082 and 5052 ms in four runs, measured from the
  first recorded frame (32 to 47 ms after the restart) to the `fight` step. Designed: 5100.
- Manual 2: key and mood were empty through the hush and the entrance. `music` in `build` came
  10 to 14 ms into the reveal and the session's gain rose 0 to 1 over about 1.6 s. `groove` at
  the fight. `fever` 17 ms into the phase scene. On the final hit the key was empty and the
  engine stopped on that frame, and `fanfare_stab` was requested once. `menu` came with the
  aftermath, its gain at 0.32 after 505 ms and 1 by the results. `audio.fanfare` was never
  called and neither `fanfare_rise_a` nor `fanfare_tail` was requested. The results played
  `star_1` and `star_2`.
- Manual 3: a click 233 ms in did nothing (still `hush`, 233 ms). A click 545 ms in gave
  `fight` at once: three parts, sprite opaque, no band, dim target 0, label set, bar shown and
  full, hint up, ball held. The music started on the next update as `groove`, fading in (gain
  0.25 after 400 ms), and the serve clock was running.
- Manual 4: a click 767 ms into the phase scene gave `fight` at once with both setups run: 14
  bricks became 20, the six new ones at y 320. The world resumed on the next frame and the ball
  went on. In a second run, skipped from the page with `boss.skip()`, the guard was at y 176 in
  the scene and on its way up (139) 400 ms after the skip. A click 500 ms into the death scene
  did nothing; the scene ran to its end.
- Manual 5: paused and resumed in all seven steps. Each time the step and its clock, the balls
  and the serve clock stood still for the 820 ms the menu was up. After resuming in `hush`,
  `entrance`, `reveal` and `fight` the world ran. After resuming in `transition`, `finale` and
  `aftermath` the world was still paused, the ball had not moved, and the step's clock went on.
  The P key was also pressed for real in the phase scene: the menu came up and the clock held
  at 500 ms.
- Manual 6: five balls in the air. Through the phase scene none moved; 50 ms into the fight
  all five had their old velocities and all five had moved. Through the death scene and the
  aftermath none moved. `boss.embedded` stayed 0.
- Manual 7: left alone, the lives went (the pool was at 7 of 10). GAME OVER as usual, boss
  still in `fight`, no music. A real click on Retry: `hush`, `entrance` 899 ms later, `reveal`,
  `fight` 5082 ms after the hush, no stale hint. Then Restart from the pause menu and a real
  click 450 ms into the new hush: `fight` at once, hint up, bar full.
- Manual 8: in phase 2, music switched off in the pause menu: key empty, engine stopped. It
  stayed silent through a phase change. Switched on again: the level song's `calm` under the
  menu, then `fever` within 100 ms of resuming. Switched off during the hush: silent through
  the reveal and into the fight. Switched on in the fight: nothing under the menu, then
  `groove` fading in on resume (gain 0.09, then 0.65).
- Manual 9: with reduced motion on, the dim target stayed 0 for the whole fight. The sprite
  faded in at its resting height (y 193.5 at alpha 0.51). The band never moved or scaled; only
  its alpha changed, up in about 0.2 s and down by 2.1 s. Through the intro, the phase scene,
  the death scene and the win, the camera's flash and shake effects ran for 0 frames. The
  room's ambient flash peaked at 0.047.
- Manual 10, `&phase=2`: from the first frame `fight`, phase 2 of 2, both setups run (20
  bricks), bar shown and full, label `WARDEN · CORE EXPOSED`, no dim, serve clock running. The
  level's ordinary intro band and hint showed, as in Phase 2. Any `&phase=` value skips the
  intro, 1 included; that one was read, not run.
- Manual 11, `?level=1` on this save (tutorial not yet seen): intro band for 1.8 s with
  `ui_intro`, music `calm`, the tutorial's pictures in place of the hint. After a real click to
  launch, the tutorial froze play (world paused) and released it 1207 ms later; at its second
  freeze, the catch step, a real click under its target moved the paddle there and play went
  on. Then with the tutorial seen: band, `TAP TO LAUNCH`, music `calm`. With god mode on and a
  script launching and firing the gun, the level cleared: banner up, music stopped,
  `audio.fanfare` called, `fanfare_stab`, `fanfare_rise_a`, three stars, `fanfare_tail`, and
  Level 2 followed with its own band, hint and music.
- Manual 11, `?arcade=waves`, god mode still on: wave 1 ran into wave 2 with music throughout
  and no error. A new run from the pause menu opened with the band, `ui_intro`, the hint and
  `calm`.
- No page error was logged in any of these runs after the fix in point 4.

Not verified
- Any sound. See point 2.
- How it looks in motion and how the pacing feels. I saw numbers and screenshots at chosen
  moments.
- Normal and Hard. Every run was on Easy.
- A fight won by playing. Pools were emptied through `debugHit`; ball hits on the Warden were
  only seen in the unattended run of check 7.
- Space and the gamepad's launch button as the skip. They reach the same `onTap` as a click;
  only clicks were pressed.
- Touch, a gamepad, the 16:9 wing-plate layout, the desktop build and `pnpm build`.
- The Warden without its sheet in this phase's flow. With no sprite the parts would simply
  appear at the entrance; that path was not run.

Deviations from the documents
- `src/systems/BossBody.ts` is not on the phase's list. The entrance's alpha and height belong
  to the sprite, which only the body holds, so `arrive(t)` is there. The diff is 16 lines.
- `Play.create` calls `clearHint()` on a boss opening. `showHint()` used to clear the last
  run's hint as a side effect; with it skipped, a restart kept a destroyed countdown and
  `tickCountdown` threw. This is the crash in point 4. It runs only on a boss level.
- The extra `syncFreeze()` after `boss.update(dt)` in `update` runs only when the level has a
  boss. Unguarded, it would stop the world one frame sooner for a tutorial freeze raised late
  in a frame, which is a change to non-boss play.
- The body holds still while play is frozen. design.md lets it move at `BODY_SCENE_SPEED` then.
  Balls hang in place in a frozen step, and a swaying part could come to rest over one.
- During the intro the body is placed where its motion puts it and sways from the entrance on,
  since the fight clock runs.
- `debugHit` only counts in `fight`, as `strike` does. Otherwise a dev hit in a scene would
  bank damage for later.
- With reduced motion the entrance fades in without the 40 px drop, and the hush does not dim.
- `bossImpact` flares the backdrop only when `flashAmbient` allowed the flash, so a run of
  impacts cannot strobe the scenery.
- `bossMusic` sets the wanted and current key only once its guards pass, which is how the phase
  file reads. `playMusic` sets the wanted key before them. So music off during the hush leaves
  nothing wanted, and switching it on in the pause menu plays nothing until play resumes.
- The final blow's impact uses the stage's defaults: scale 1, `palette.danger`.
- The cutscene clock. A scene already playing gets the frame's clock step before the events
  are handled. A scene started by an event in this update gets what the state says has passed
  in its step. So cues keep to the state's timeline to the millisecond.
- Constants the documents do not name: `CARD_LEAD_MS` (500) and `BONUS_SIZE` (30) in the
  director, `INTRO_HOLD_MS` (1500) and `BOSS_IMPACT_RADIUS` (70) in `Play.ts`.
- Tests beyond the ones listed: four more on `CueSheet` (same-moment order, due on the tick
  that reaches the time, done after the length, a cue past the end never fires).

Open
- The failing test in point 1.
- Stopping the music during its 1.6 s swell jumps to silence instead of fading. `stop` cancels
  the scheduled ramp, and the gain falls back to the ramp's start. Read in the code, not heard.
  It needs the music switched off within 1.6 s of it starting.
- Bullet time stretches a cutscene, since scenes run on the fight clock. Read, not run.
- Timers and tweens that abilities started keep running through a frozen step, as they do in a
  tutorial freeze. A hit that lands then is `immune`. Read, not run.
- The lab's ambient lightning can strike inside a scene. In two runs `thunder` was requested
  400 ms into the aftermath and the arena flashed bright; in two others it was not. It shares
  the flash limiter with the boss's impacts, so either can drop the other.
- After Restart or Retry the scene wipe is still leaving the top of the screen 450 ms into the
  hush, so less than 900 ms of hush is seen.
- A skipped intro never plays `rise`: the music enters in the fight's mood with the swell.
- The guard takes about 0.4 s to reach its `open` pose after the phase scene, at Phase 2's
  speed cap, with the ball already live. Skipped or not, it is the same.
- The aim arrow swings on the held ball all through the intro.
- `Backdrop.update` is not called on the frozen path, so a dim set during a frozen step would
  not ease until play resumed. The director only dims and lifts in live steps.
- `win()` still calls `lighting.celebrate()` and the haptic on a boss level. The phase names
  only the music stop, the fanfare, the camera flash and `tail`.
- The dev save at `127.0.0.1:5173` in Cursor's browser. The tutorial is now marked seen, level
  1 is cleared, `level31` has new clears and an arcade run was played. I turned reduced motion
  and god mode on for checks 9 and 11 and both are off again; music and sound are on.
- My test tab is still open on the lab. The dev server was not mine and is still running.
- The other session's diff as I found it is `other-session-before-phase3.patch` in this
  agent's Cursor store. It matches commit `ef30407` and is no longer needed.

For the user to confirm
- Whether the placeholder moods (`build`, `groove`, `fever`, `menu`) and `fanfare_stab` as the
  stinger are acceptable until the boss song exists.
- The pacing of the hush, the reveal and the aftermath, and the Warden's three scenes and the
  sounds picked for them.
- The step from the aftermath into the next level's music. The lab is always the last level,
  so it cannot be heard there.
- Whether a boss level should keep the stars' sounds and `lighting.celebrate()` at the win.

Later
- Hold the level's ambient lightning while a boss scene plays.
- Fade from the current level when music stops mid-swell.
- Start the hush once the scene wipe has cleared.
- Hide the aim arrow until the hint appears.
- A check that the sound keys cues use are in `AUDIO_ASSETS`. They sit inside closures, so
  today only reading finds a wrong one.

## Phase 3 review: PASS, 2026-11-16, Grok (Cursor agent)

Every Build item is in, the checks that belong to this phase pass, and the eleven manual checks
match the phase file. Nobody has heard the mix. I read the same sequence off the live audio
graph that the handoff describes, and the phase file already leaves the placeholder moods and
the pacing for the user to judge. Three things to know:

1. `pnpm test` is 486 passed and 1 failed. The failure is `tests/skills.test.ts` > "readies the
   gun more often than bullet time" (`expected 6000 to be less than 3000`). I stashed this
   phase's diff and the same test failed on HEAD (`ef30407`); the stash came back clean. This
   phase does not touch `src/core/Skills.ts` or that test. Phase 2's review recorded the same
   failure as unrelated.
2. I heard nothing. Music claims below are the session's key, mood, gain ramps and an analyser
   on `game.sound.masterVolumeNode`. The implementer heard nothing either. Listen before
   treating the stand-in track as accepted, or accept the measured sequence.
3. `git diff HEAD` is this phase and the handoff. `src/systems/BossBody.ts` is the one file
   outside the phase's list, and the handoff explains it. No attacks, hazards, lock-on, or
   tell/open rules were added.

Ran
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 486 passed, 1 failed, in 23 files (was 458 passed and the same 1 failed, in 22).
  The 28 new tests are `tests/cues.test.ts` (11), `describe('BossState flow')` (13),
  `tests/bosses.test.ts` (3) and `tests/music.test.ts` (1). No earlier boss test was edited.
- How the manual checks were run: the dev server already on port 5173, the Cursor browser at
  `http://127.0.0.1:5173`, Easy (pool 10, lab is level 31). A script in the page slept the
  loop, stepped it, and read `window.boss` and the Play scene. Pools were emptied with
  `debugHit`. Taps were `boss.skip()`, which is what `onTap` calls. The music switch was a
  real press of the pause menu's Toggle, which closes over the live audio. None of that is in
  the repo. I put reduced motion and music back afterwards.
- Manual 1: one unattended run, times from the restart. Hush with the ball held, no hint, bar
  unshown, label still `LEVEL 31`, dim target 0.45, music empty. `launch()`, both `fireSlot`s,
  `useSkill('gun')`, `useSkill('slowmo')` and `useStock` changed nothing; the paddle moved.
  Entrance at about 909 ms: sprite alpha 0 to 1 and y 153.9 to 193.5 over 1800 ms, ball held,
  no band. Reveal at about 2711 ms: band `KEEPER OF THE GATE` over `WARDEN`, bar filling
  (0.34 at 804 ms of 2400), dim target 0, `ui_intro`, music `rise` with a 1.6 s ramp to 1.
  Fight at about 5094 ms (designed 5100): `TAP TO LAUNCH`, bar full, music `low`. Phase scene:
  world paused, label `WARDEN · CORE EXPOSED`, music `high`, arena still 12 bricks. Finale:
  music cut on that frame, one `fanfare_stab`, death frame held at the last frame. Aftermath:
  `+2,000`, bar gone, parts retired, bricks shattered, music `rest` with a 1.6 s ramp. Results:
  ALL CLEAR, three stars, score 2500. No `fanfare_rise_a`, `fanfare_rise_b` or `fanfare_tail`.
- Manual 2: the sequence in check 1, read from the graph. Silence through hush and entrance.
  Swell at the reveal. `low` in the fight, `high` in phase 2. The last hit calls `stop` with a
  0.01 s time constant and plays `fanfare_stab` once. Calm music fades in before the results.
  `audio.fanfare` was not called.
- Manual 3: a skip at about 365 ms returned true and the step stayed `hush` (the tap is eaten).
  A skip once the step was past 450 ms jumped to `fight`: bar shown and full, hint up, ball
  held. The handoff's real click at 233 ms did nothing and its click at 545 ms did the same
  jump.
- Manual 4: a skip after the 400 ms guard took the arena from 12 bricks to 18 and resumed the
  world. The guard left y 176 for the open pose at 128. A skip during the finale returned true
  and the step stayed `finale`, clock still running.
- Manual 5: pause and resume in hush, entrance, reveal and fight. The clock held and the world
  paused, then both carried on and the step was unchanged. The same in the phase scene and the
  finale, except the world was still paused after resume. I did not pause the aftermath myself;
  the implementer did, and it is the same `frozen` path.
- Manual 6: three balls in the air held their positions through 240 ms of the phase scene and
  moved again once the fight resumed, velocities kept.
- Manual 7: lives to zero opened the usual GAME OVER (also seen on the `&phase=2` run, score
  270, RETRY). The boss was still in `fight`. A scene restart came back to `hush` with no stale
  hint, and a skip after the guard reached the fight. I did not press the canvas RETRY button;
  the implementer did, and saw the same replay.
- Manual 8: during the fight, the pause menu's music switch off left the analyser at 0. On
  again, the mood came back as `low` within a moment, as a short section fade rather than a
  1.6 s swell, because `refresh` starts the engine through `playMusic` and the next
  `bossMusic` only changes mood. Off again was a 0.25 s fade. I did not repeat "off during the
  hush"; the implementer did, and the code matches it (`bossMusic` sets nothing wanted until
  its guards pass, and is not called while the mood is null).
- Manual 9: with reduced motion on, the dim target stayed 0, the sprite faded in at its rest y
  (no 40 px drop), the band faded in place instead of slamming, and the camera flash and shake
  effects ran for 0 frames. The setting is off again.
- Manual 10, `?map=bosslab.tmj&phase=2`: `fight` at phase 2 of 2, pool 10 of 10, bar shown and
  full, label `WARDEN · CORE EXPOSED`, music `high`, dark 0, 18 bricks, guard already at the
  open pose. I arrived after the level's ordinary intro had finished and the ball had launched.
  Left alone, that run reached GAME OVER, which is the ordinary life loss, not a boss intro.
- Manual 11, `?level=1`: no boss. A restart showed the band `HELL FOUNDRY · 1 / 10` over
  `FIRST LIGHT`, the hint `TAP TO LAUNCH`, and music `calm`. Play after that is the ordinary
  level: three hearts, no boss bar, countdown, ball on the paddle. I did not clear it. The
  implementer did, with god mode, and got the banner, `audio.fanfare`, `fanfare_stab`,
  `fanfare_rise_a`, `fanfare_tail` and Level 2. `?arcade=waves` was WAVE 1 with a ball in play,
  three hearts, no boss and no boss bar. The tutorial was already marked seen on this origin
  (`coach` was false on level 1), so I did not re-run its freeze; the implementer did, before
  that flag was set, and saw play stop and release.

Build items
- `src/core/Cues.ts` and `tests/cues.test.ts`: done. Stable order, a cue at 0 and a cue at the
  length both fire, a cue past the end never fires, `skip` finishes the sheet, and a bad `dt`
  does not move the clock. The four tests past the phase's list are real assertions.
- `src/core/Boss.ts`: done. The step order, the 400 ms skip guard, a transition only when the
  next phase has an `enterMs`, and the mood defaults (low, then high on the last phase) match
  the phase. `damage` outside `fight` returns nothing.
- Audio: done. `play` ramps only when a new play starts. `bossMusic` uses `playMusic`'s guards
  and then the fallback moods. `bossStinger` is `fanfare_stab`. The one music test checks that
  every boss mood has a real playlist; it does not pin the fallback map, which matches
  design.md in the code.
- The director: done. The body is made at the entrance, not at construction. Cues run on the
  handed `dt`. A scene started this update gets the state's leftover time. Setup and the pose
  wait until the fight. The death animation is held. `skip` eats the tap through every
  cinematic step and only the intro and the phase scene actually jump. Done differently, as
  declared: the body is held at speed 0 while frozen, where design.md allows
  `BODY_SCENE_SPEED`.
- `src/scenes/Play.ts`: done. Opening a boss skips the ordinary hint, card and level music and
  clears a leftover hint. Launch, slots, skills and stock do nothing while cinematic. `win()`
  on a boss level skips the music stop, the fanfare, the camera flash and `tail`. It still
  calls `lighting.celebrate()` and the haptic, which the phase does not name. The non-boss
  intro card is the extracted `titleBand` with the same 1500 ms hold and 1200 ms calm delay.
- The Warden: done. Epithet `Keeper of the gate`. Entrance 1800, phase-2 enter 1200, death
  2200, with the cues the handoff tables. One light per scene at priority 7. Impacts are 480 ms
  flashes at priority 8. No cue retires, spawns, poses or damages. The file imports types and
  `src/core` only.
- Content tests: done. The first phase has no `enter`, every cutscene length is positive, and
  every cue time is inside that length. They do not run the cue closures, which need the
  engine; the phase does not ask them to.

Findings
- None.

Scope and shortcuts
- Clean. Changed files are the phase's list, `src/systems/BossBody.ts` (`arrive`, 16 lines,
  explained), and this log. Nothing under "Do not" was built. No `any`, `as unknown as`,
  ts-ignore, eslint-disable, `Math.random`, timers, or `console` in the new fight code. The
  `onComplete` callbacks only destroy a band or drop the faded sprite. No `juice.flash` in boss
  code. The `?.` and `??` uses are the optional cast, a missing enter length, the epithet, and
  a missing weak multiplier.

For the user
- Nobody has heard it. The measured stand-ins are `build` for the rise, `groove` for low,
  `fever` for high, `menu` for the rest, and `fanfare_stab` as the one stinger. The Warden's
  scene keys are `thunder`, `ab_meteor_impact`, `brick_steel`, `surge`, `brick_tnt` and
  `brick_collapse`, plus `ui_intro` on the band.
- The intro I measured was about 5094 ms against a designed 5100. Whether the hush, the reveal,
  the aftermath and the three scenes feel right is still your call.
- The aftermath-to-next-level music ramp cannot be heard in the lab. The lab is the last level,
  so a win opens Results.
- `win()` still celebrates the lights and plays the haptic, and the results screen still plays
  the star sounds. The phase only required the music cut, no fanfare, no camera flash and no
  tail.
- Stopping the music inside the 1.6 s swell snaps to silence. That is in the handoff, read in
  the code, not heard.
- This origin's dev save now has a level 31 clear of 2500 and a game over from these runs.
  Reduced motion is off and music is on. The tutorial was already marked seen, from the
  implementer's check 11.

## Phase 4: DONE, 2026-11-16, Claude (Cursor agent)

Every build item is in and all eleven manual checks gave the expected result. Five things to
know before reviewing:

1. `pnpm test` is not green: 534 pass and 1 fails. The failure is the one Phase 3 reported,
   `tests/skills.test.ts` > "readies the gun more often than bullet time" (`expected 6000 to be
   less than 3000`). It is in HEAD (`3962b72`). This phase did not touch `src/core/Skills.ts`
   or that test.
2. I heard nothing. Every sound below is a key the code asked `audio.sfx` to play, read from
   the page.
3. Nobody has played it by hand. A script moved the paddle in every check. Whether the attacks
   read well and feel fair is not established by anything below.
4. The frame rate check cannot show a cost smaller than the display's 60 Hz cap. Both numbers
   are 60. I added the main-thread time per frame, which is not capped.
5. Check 10 ran 309 s of fight, stepped at 1/60 s per frame faster than real time, in three
   runs. It was not five minutes of someone playing.

Built
- `src/core/Boss.ts`: the attack cycle in `BossState` (`window`, `attack`, the
  `{ type: 'window' }` event, `onLifeLost`, `tick(dt, ballInPlay)`), `BossSpec.phases[].deck`
  and `gapMs`, the plan types (`HazardSpec`, `PaddleEffect`, `AttackPlan`, `BossView`,
  `AttackDef`), `safeGap`, `planProblems`, and the constants `MIN_WINDUP_MS`, `MIN_FLIGHT_MS`,
  `MIN_SKULL_FLIGHT_MS`, `MAX_SKULLS`, `MAX_JAM_MS`, `REGROUP_MS`, `MAX_HAZARDS`, `SAFE_GAP`,
  `SHOT_RADIUS`, `SKULL_RADIUS`, `LAND_MS`.
- `src/entities/Paddle.ts`: `jam(ms)`, `jammed`, the hold and the dimming in `step`.
- `src/art/procedural.ts`: `hazard_shot`, `hazard_skull`, `hazard_mark`, all in
  `ALWAYS_PROCEDURAL`.
- `src/systems/HazardSystem.ts` (new, 418 lines): `arm`, `go`, `update`, `clear`, `count`,
  `destroy`. No physics bodies. Pooled images and rectangles. At most three lights.
- `src/systems/BossDirector.ts`: `PhaseDef.deck` and `gapMs`, `BossHost.balls` and `hurt`, the
  seeded `Rng`, the wind-up (`BossView`, `plan`, `planProblems` warnings in dev, the tell
  sound), `lock`, the reticle, the `open` and `tell` animations, `onLifeLost`, `hazardCount`,
  and `&attack=<id>`.
- `src/scenes/Play.ts`: the seed, `LOCK_TURN`, the lock-on in `updatePacing`,
  `boss?.onLifeLost()` and `paddle.jam(0)` in `loseLife`, two new members in `bossHost()`.
- `src/platform/debugOverlay.ts`: the boss line gains `<window>  <attack>  hazards <n>`.
- `src/bosses/warden.ts`: three attacks and the decks.
- `tests/boss.test.ts`: 35 tests in three new blocks, `BossState attack cycle` (16), `safeGap`
  (5), `planProblems` (14). 67 in the file. No earlier test was edited.
- `tests/bosses.test.ts`: 13 tests. Six run for every boss: attack ids unique; every plan fair
  over 5 paddle positions, 3 pool levels and 20 seeds on all three difficulties; the same seed
  and view give the same plan; the Hard wind-up is at least `MIN_WINDUP_MS`; opening poses and
  locks exist; tell sounds are in `AUDIO_ASSETS`. Seven are about the Warden. 30 in the file.

The Warden's attacks. Times are the design's, before the difficulty's wind-up factor:

| Attack | Wind-up | Live | Recover | Hazards | Tell |
| --- | --- | --- | --- | --- | --- |
| `volley` | 900 | 1200 | 2200 | 3 to 5 shots from `body`, 40 px apart, centred on the paddle, 70 ms apart, 800 ms flight, each jams 600 ms. 3 at a full pool, 4 from a quarter drained, 5 from three quarters. | `laser_spinup` |
| `sweep` | 1000 | 900 | 2200 | 2 beams 190 px wide over two of the three 200 px lanes, the second 250 ms after the first, each burns 600 ms, each shrinks to 0.8. The third lane is free. | `ab_meteor_whoosh` |
| `reaper` | 1100 | 1900 | 2200 | 1 skull from `core` at the paddle, 1800 ms flight. 2 shots from `body` 130 px either side of it (both on the open side near a wall), landing at 900 and 1300 ms, each shrinks to 0.8. | `ui_deny` |

Phase 1 (`guard-up`) plays `volley`. Phase 2 (`core-exposed`) plays `sweep`, `reaper`, `volley`
with gaps of 2000 to 1200 ms. Every attack opens with pose `open` and locks on `core`. Hazard
counts do not change with lighting tier or difficulty.

Sound keys, all in `AUDIO_ASSETS`: the three tells above; `ui_locked` (jam); `sfx_smaller`
(shrink); `ab_blackhole_open` (skull leaves); `breach` (skull hits), after which `loseLife`
plays its own `death`.

Verified
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 534 passed, 1 failed, in 23 files (was 486 passed and the same 1 failed). All
  three were run again after the manual checks. No code changed during them.
- Prettier: nothing new. `--check` flags `src/core/Boss.ts` and `src/scenes/Play.ts`, as it
  does at HEAD (1 and 9 places). The other eight files pass.
- How the manual checks were run: the Vite server already running on port 5173, the Cursor
  browser at `http://127.0.0.1:5173`, Easy (pool 10, wind-up and gap both x 1.25), a 1561 x
  1283 window (field 600 x 800, paddle line y 740). A script in the page logged every change
  of step, phase, window, attack, hazard count, lives, jam, paddle width and lock, and the keys
  passed to `audio.sfx`. For numbers I put `game.loop` to sleep and stepped it 1/60 s at a
  time. For screenshots and frame rates I let it run in real time and froze it at a chosen
  moment. Tweens run on the wall clock, so stepped runs do not show tweened looks. Hazards and
  markers use no tweens. Times below are the fight clock in ms.
- Manual 1: full intro. `fight` began at 5115. The ball sat on the paddle for 180 frames
  (3000 ms). The window was `gap` with 0 hazards on every one. The serve clock launched it at
  8115 and the first wind-up began at 10849. With `&phase=1`: launch 3016, wind-up 6266, which
  is the full-pool gap of 3250 ms.
- Manual 2, `volley` (pool 10, paddle at x 300): on the wind-up's first frame there were three
  X marks on the paddle line at x 340, 300 and 260, each inside a ring 111 px wide, and
  `laser_spinup` was requested. The rings were 65 px when the window went live and 46 px
  450 ms later. I did not sample a ring on its landing frame; by the code it closes in a
  straight line to 32 px. The shots left `body`, were on the lines to their marks mid-flight
  (the first at (334, 482) on its way to x 340) and were counted as landed 783, 866 and 933 ms
  into the live window. Standing clear: armed at x 100 (marks 140, 100, 60), I moved to 548.
  All three landed. No jam, width 104, lives 3.
- Manual 2, `sweep`: two columns 190 px wide at alpha 0.07 from the HUD to a strip under the
  paddle line. The strips read 0.01 full on the first frame and 0.49 and 0.41 after 600 ms of a
  1250 ms wind-up. The first beam lit (alpha 0.42, one area light) on the first live frame.
  150 ms in, the second was still warming up, its strip 0.94 full. 433 ms in, both were lit.
  They went out 584 and 834 ms into the window. With beams at x 300 and 100 I stood at 500:
  width and lives unchanged.
- Manual 2, `reaper` (paddle at 300): on the first frame, a small skull at x 300 inside a
  124 px ring and X marks at 430 and 170, with `ui_deny`. The skull left `core` at (258, 144)
  on the first live frame with `ab_blackhole_open`. The shots landed 900 and 1284 ms in and the
  skull 1784 ms in. Standing at 540, clear of all three: lives 2 to 2, width 104, and the
  opening followed.
- Manual 2, markers: in the five plans whose markers I read in full (one volley, two sweeps,
  two reapers) every hazard had its mark and ring, or its column and strip, on the wind-up's
  first frame. For the other plans I read positions and counts only. `arm` builds a marker for
  every hazard it is given.
- Manual 3, jam: one shot on the paddle jammed it for 616 ms (clock 30283 to 30899). Alpha was
  0.45 on every jammed frame and 1 on the next. With the pointer target moved to x 100 during a
  jam the paddle stayed at 300 on every jammed frame and was at 100 afterwards. A ball dropped
  on the jammed paddle at 520 px/s left at -322 px/s and stayed in play. Three shots of one
  volley on a still paddle: `ui_locked` three times, jammed for 767 ms, which is 600 ms after
  the third.
- Manual 3, shrink: standing in a beam for its whole 600 ms took the paddle from 104 to 83 px
  once, with one `sfx_smaller`. A shrinking shot did the same.
- Manual 4: the skull in flight is a red skull 40 px across, upright, with its own red light.
  Its marker is the same picture at 28 px inside the closing ring. Screenshot looked at, with
  no pickup beside it. Pickups are 34 px icons that wobble as they fall; the skull is one
  colour, does not wobble and flies to a ringed mark. Marker at x 300, last seen at (300,
  738), paddle line 740. Paddle under it: lives 3 to 2, `breach` and `death` requested, the
  same ball still in flight, hazards cleared, window `gap`. Paddle at 540: lives 2 to 2. God
  mode on, paddle under it: lives 2 to 2, ball still in flight, hazards cleared.
- Manual 5: in the 2200 ms after the volley, `lock` was the core's centre (257, 144), the
  reticle was there (the gold ring at 60 x 44, turning), the animation was `warden-open` and
  the core's body was enabled. A ball set at (520, 640) heading straight up at 329 px/s turned
  from -90 to -99.3 degrees in 6 frames, -108.9 in 12 and -119.2 in 18, against a bearing of
  -119.6 to the core, and held it. In the next gap `lock` was null, the reticle hidden, the
  animation `warden-idle`, and the same ball kept -90.0 degrees and x 520 for 24 frames. Sweep
  and reaper also showed `lock` through their recover windows.
- Manual 6: with three shots in flight (9 hazard objects visible) I dropped the ball. On the
  frame the life went (3 to 2) there were 0 hazards, 0 visible objects and window `gap`. While
  the ball sat on the paddle (3017 ms) that did not change. Relaunch at 45016, next wind-up at
  46216: 1200 ms. With five shots in flight (15 objects) I emptied the pool with the dev hit.
  Next frame: step `transition`, phase 2, 0 hazards, 0 visible, no lock, reticle hidden, paddle
  not jammed.
- Manual 7: with the skull in flight I used bullet time (time scale 2.2). The skull went from
  5.54 to 2.51 px per frame, the ball from 5.53 to 2.51, the fight clock from 16.7 to 7.6 ms
  per frame. Paused from the game (`requestPause`) and stepped 60 frames: clock 8894 to 8894,
  skull y 572.09 to 572.09, ring 56.78 to 56.78 px. Resumed: all three moved again.
- Manual 8: Chrome emulation at 420 x 900, 2x (canvas 1200 x 2572, field 600 x 1286, paddle
  line y 1226), `?lighting=low`, five balls (seven after a power surge), real time.
  - `volley` at pool 2, so five shots each, 45 s, six volleys: 60.0 fps over the 1844 frames
    with no hazard on screen (95th percentile frame 18.6 ms, worst 25.6) and 60.1 fps over the
    858 frames with hazards (18.6, worst 27.1). The overlay's fps read 60.1 to 60.8 in both.
    Main thread per frame, measured as the overlay's `cpu` is: 0.99 ms without, 1.03 ms with.
  - `sweep`, 35 s, four sweeps: 60.0 fps and 1.06 ms with nothing on screen, 60.1 fps and
    1.14 ms with the columns marked, 60.0 fps and 1.15 ms with beams burning.
- Manual 9: reduced motion on, `reaper`. The rings stayed at 44 px (skull) and 32 px (shots) at
  alpha 1 on all 44 frames sampled. Each marker had a timing strip: 0.01 full on the first
  frame, 0.23, 0.32 and 0.27 after 700 ms. Marks did not turn or change size. In the opening
  the reticle's rotation was 0.000 on all 36 frames. Screenshot looked at.
- Manual 10: `console.warn` was hooked. The paddle followed the lowest falling ball and god
  mode kept the run alive. (a) A whole fight from phase 1 to the defeat, 39 s: five volleys and
  one sweep. (b) Phase 2 held for 180 s at pools 10, 5 and 1: 28 attacks in the order reaper,
  volley, sweep, repeating; 4 skull hits, 11 jams, 12 shrinks. (c) Phase 1 held for 90 s at
  pools 10, 5 and 1: 13 volleys of 3, 4 and 5 shots, 7766, 7150 and 6650 ms apart. In all: 47
  wind-ups, never more than 5 hazards at once, 0 warnings, 0 page errors. No warning in any
  other run of these checks either.
- Manual 11: `?level=1` (tutorial skipped with its own button), 60 s: bricks 50 to 21, score
  180 to 3310. `?arcade=waves`, 60 s: bricks 47 to 24, score 270 to 2370. `?arcade=descent`,
  60 s: score 190 to 3130, three balls. In all three `window.boss` and `p.boss` were undefined,
  `hud.boss` was null, the paddle was jammed on 0 frames (of 11864, 3961 and 3961), its alpha
  was 1 on every frame, no hazard object was in the scene, and there were no errors or
  warnings. "As before" means it launched, broke bricks and scored. I did not run the build
  from before this phase beside it.

Not verified
- Any sound: nothing is audible to me.
- Readability and fairness by feel. See point 3.
- Normal and Hard in the browser. Easy was on screen. The tests cover plans and the wind-up
  floor on all three.
- The Medium lighting tier. I ran High (the default here) and Low.
- A real phone. The phone-sized window was Chrome emulation on a desktop GPU.
- Keyboard and gamepad play, and the 16:9 layout, with attacks running.
- A magnet catch during an attack. Read: with every ball held, the attack clock and the
  hazards both stop until one flies again.
- `pnpm build` and the desktop build.

Deviations from the documents
- `core/Boss.ts` exports three things the design does not name: `windupFor(attack, tuning)`
  (the director and the state must agree on the wind-up length), `DEFAULT_GAP_MS` and
  `AttackTiming` (the four fields of an `AttackDef` the state needs, so `BossSpec` carries no
  functions).
- `onLifeLost`, "a gap of at least `REGROUP_MS`": lost mid-attack, the new gap is exactly
  `REGROUP_MS`. Lost during a gap, that gap ends at the later of its own end and `REGROUP_MS`
  from now.
- A pool emptied mid-attack sends the `window` gap event before the `phase` and `step` events.
  The gap's length follows the pool as it drains. A non-finite tick is ignored by the cycle.
- Hazards advance only while a ball is in play, as the attack clock does, not on every frame
  of `fight`.
- On the frame of `arm` and of `go` the hazards get that frame's whole tick, so they run up to
  one frame ahead of the state. Shots landed 783 ms into a window where the plan says 800.
- The seed comes from the existing `randomSeed()` in `src/core/Rng.ts`, called once in Play.
- `boss.onLifeLost()` runs on every `loseLife`, god mode included, as `pacing.onLifeLost()`
  does. So a skull that hits ends its attack with no opening, in god mode too.
- The gap handler resets the pose of the phase that is set up, not `state.phase`. Otherwise a
  pool emptied mid-attack would show the next phase's pose before its entry scene.
- The reticle is the `ring` texture at 60 x 44, so its slow turn can be seen, turned by the
  fight clock (one turn in 7 s). With reduced motion it does not turn.
- Marker pictures: `hazard_mark` (an X) for a shot, a small `hazard_skull` for the skull,
  `ring` for the closing ring, pooled rectangles for beam columns and timing strips. Reduced
  motion is read once, at `arm`.
- `Paddle.step` sets the alpha on every frame (1 when not jammed). Nothing else sets it. The
  alpha changes one frame after a jam starts and one frame after it ends.
- `&attack=<id>` is read in the director and ignored when no deck has that id.
  `BossDirector.hazardCount` exists for the debug line.
- Constants the documents do not name are in `HazardSystem.ts` (depths, sizes, alphas, light
  strengths), the director (`RETICLE_*`, `TELL_VOLUME`) and `warden.ts` (the attack numbers in
  the table above).
- No hazard trail on Medium and High. The phase makes it optional.

Open
- The failing test in point 1.
- The corner buttons cover part of the paddle line. In the portrait window a marker or strip
  right of about x 480 sits partly under the two skill buttons. In the phone-sized window the
  ability button covers the left end too. The paddle itself already passes under them.
- Shrinks stack. `paddle.resize(0.8)` multiplies, so three shrinks reach the paddle's floor of
  0.6 (62 px), and it stays there until a ball is lost. A skull hit does not reset it. In the
  180 s run the paddle was at 62 px from the second minute on.
- A full volley on a paddle that does not move holds it for 600 ms after the last shot: 767 ms
  measured for three shots, up to 880 ms for five.
- A skull that hits costs the opening as well as the life: the attack ends, a 1200 ms gap
  follows, then the next wind-up.
- An idle paddle loses lives quickly: the reaper's skull is aimed at it. A tab I left alone for
  17 s was down to one life.
- My first god mode attempt switched a second copy of the save module (a dynamic import
  without the `?t=` the game uses) and the skull took a life as normal. The result above is
  from the game's own copy.
- Two frame rate recordings were thrown away. In one the balls killed the boss in seconds (my
  script's ceiling was above the boss, which sits at y 460 to 526 in the tall field). In the
  other, waking the loop after stepping it froze the game for a few seconds.
- The first test tab closed by itself mid-check (`target closed while handling command`). I
  saw no game error before it. The checks continued in a new tab, which has its own storage.
- The dev save at `127.0.0.1:5173` in that tab: the tutorial is skipped, `level31` has a
  3-star clear of 9000, and Waves and Descent were each started. God mode and reduced motion
  were turned on for checks 4, 9 and 10 and are off again. Music and sound are on.
- My test tab is still open. The dev server was not mine and is still running.

For the user to confirm
- Whether each attack is readable and fair by feel, the skull above all, and whether the skull
  is unlike a pickup at a glance. I judged that from one screenshot with no pickup on screen.
- The jam length (600 ms), the shrink (0.8 a hit, stacking to 0.6) and the lock-on strength
  (`LOCK_TURN` 1.8 rad/s, the same as the stall nudge).
- The placeholder sounds: `laser_spinup`, `ab_meteor_whoosh` and `ui_deny` for the tells,
  `ui_locked` for the jam, `ab_blackhole_open` and `breach` for the skull.
- Whether a skull hit should still be followed by the opening.

Later
- Keep markers and strips clear of the corner buttons, or draw them above the HUD.
- Give the paddle its size back after a while, or at each opening.
- Trails behind shots and the skull on Medium and High.
- Sounds for a shot leaving and a beam firing, and real hazard sounds.
- A count of jams, shrinks and skull hits per fight in the `?debug` line, for tuning.

## Phase 4 review: PASS, 2026-11-16, Grok (Cursor agent)

Every Build item is in, the checks that belong to this phase pass, and the manual checks that decide whether an attack is fair passed on the live fight. I heard nothing. I did not repeat the phone-sized frame-rate pair; the implementer did, and the numbers below are theirs. Two things to know:

1. `pnpm test` is 534 passed and 1 failed. The failure is the one Phase 3 recorded, `tests/skills.test.ts` > "readies the gun more often than bullet time" (`expected 6000 to be less than 3000`). `src/core/Skills.ts` and that test are not in this diff. Gun cooldown is 6000 and bullet time is 3000 in the current file.
2. I heard nothing. Sound claims are keys that reached the live sound manager. The placeholder set is for the user to judge.

Ran
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm test`: 534 passed, 1 failed, in 23 files (was 486 passed and the same 1 failed). The new tests are `describe('BossState attack cycle')` (16), `describe('safeGap')` (5), `describe('planProblems')` (14) and the attack block in `tests/bosses.test.ts`. No earlier assertion was removed or weakened.
- How the manual checks were run: the dev server already on port 5173, the Cursor browser at `http://127.0.0.1:5173`, Easy (pool 10). I slept `game.loop` and stepped 1/60 s, read `window.boss` and the Play scene, and looked at screenshots of the wind-up, the opening and the skull. A script moved the paddle. None of that is in the repo. God mode and reduced motion were turned on for those checks and are off again.
- Manual 1: 150 frames with the ball held, window `gap`, 0 hazards. After launch the first wind-up was frame 196, about 3267 ms against Easy's 3250 ms gap.
- Manual 2: volley wind-up showed three X marks at x 260, 300 and 340 inside rings (111 px, closing). Sweep showed two columns 190 px wide at alpha 0.07, with timing strips. Reaper showed a 28 px skull mark at x 300 and X marks at 170 and 430. Standing at 540 through a reaper whose marks were 170, 300 and 430: no `resize` and no `jam`, and the window reached `recover`. Standing at 80 through a sweep whose columns were at 300 and 500: width stayed 104, no jam.
- Manual 3: a shot on the paddle held it at x 300 with alpha 0.45 while the target was 100, then it went to 100 and alpha returned to 1. A ball dropped on the jammed paddle at 700 px/s left upward at about 359 px/s and stayed in play. One beam took the paddle from 104 to 83 along a single resize tween and left it at 83.
- Manual 4: the skull in flight is a 40 px upright red face with its own glow, not a coin or a capsule. Under the paddle: lives 3 to 2, `breach` and `death` played, the same ball still in flight, hazards 0, window `gap`. God mode, paddle under it: lives stayed 3, ball stayed in flight, hazards 0. The attack still ends, as the handoff says.
- Manual 5: during recover, lock was the core, the reticle was the gold ring at 60 by 44, the animation was `warden-open`, and a rising ball's heading moved from about -90 toward the core (about -121 after 18 frames). The debug line read `recover volley hazards 0`.
- Manual 6: dropping the ball during a live attack with 3 hazards went to 0 hazards, window `gap`, lives 3 to 2, ball back on the paddle. The next wind-up was 72 frames later, 1200 ms. The 90 frames before that launch stayed in `gap` with no hazards.
- Manual 7: with bullet time active the world scale was 2.2 and the skull moved 30.1 px in 12 frames against 66.22 px in the previous 12 at scale 1. Pause held the skull's y for 15 frames; after resume it moved.
- Manual 8: not repeated here. The implementer measured, at `?lighting=low` in a 420 by 900 window with five balls, 60.0 fps and about 1.0 ms of main-thread time with nothing on screen, and 60.0 to 60.1 fps and about 1.0 to 1.2 ms with volley and sweep hazards up. The desktop overlay during this review read 60 to 61 fps. I did not put five balls in a phone-sized low-lighting window.
- Manual 9: reduced motion on, rings held at 32 px while the timing fills went from 0.01 to about 0.26. In the opening the reticle's rotation stayed 0. Tint was gold (`0xffc93c`).
- Manual 10: 18000 stepped frames, five minutes of phase 2 with the ball parked and the pool held at 10. 49 attacks in the order sweep, reaper, volley. Max hazards at once was 3, because the pool never drained (a full-pool volley is 3). 0 `planProblems` warnings. The fight was still in `fight` at the end.
- Manual 11: `?level=1`, 180 frames: level01, no boss, paddle jammed on 0 frames, alpha 1, no hazard sprite, bricks 52 to 51, score 90. `?arcade=waves`: WAVE 1, no boss, no jam, 52 bricks. `?arcade=descent`: TIER 1, ROW 0, no boss, no jam, 16 bricks.

Build items
- `src/core/Boss.ts`: done. The cycle is gap, windup, live, recover, and it wraps the deck. It waits while no ball is in play. A phase with no deck stays in `gap`. Gap interpolates and scales by `tuning.gap`. Wind-up is `windupFor`, floored at `MIN_WINDUP_MS`. Leaving the fight or changing phase returns to `gap` and the next phase starts at the top of its deck. `onLifeLost` during an attack starts a gap of `REGROUP_MS` and does not replay that attack. `safeGap` and `planProblems` match the occupancy rules and the named cases. The tests for those cases fail if the numbers move.
- `Paddle.jam`: done. `jam(ms)` holds, `jam(0)` releases, `step` counts real frame time, keeps `x`, zeroes `vx`, still clamps `targetX`, and sets alpha to 0.45 while jammed and 1 after. Tint is untouched.
- `src/systems/HazardSystem.ts`: done. No physics bodies. Markers on the paddle line, shots and the skull fly from the part to `(x, paddle.y)`, beams are faint then bright and apply once, skull calls `hurt`. Pools recycle. At most three lights, priority 7, none on shots. Depths sit between 4 and 5. `clear` removes markers. Trails were left out; the phase allows that.
- The director: done. One `Rng` from `opts.seed`. `Play` passes `randomSeed()` once. Wind-up builds a `BossView`, warns in dev, drops past `MAX_HAZARDS`, arms, and plays the tell. Live calls `go`. Recover applies the opening pose, the lock and `open`; otherwise idle. Gap clears hazards, restores the phase pose and idles. Leaving for a transition or the finale clears hazards, the lock and the jam. `lock` is the part centre only in `recover` while it stands. `&attack=` replaces every deck with that attack. The debug line shows window, attack and hazard count. Animation order is death, hurt, a cue, open, tell, idle.
- `src/scenes/Play.ts`: done. `LOCK_TURN` is 1.8. A lock steers free rising balls and skips the other homing. `loseLife` calls `onLifeLost` on every life and `jam(0)` where the size is reset. `hurt` is `loseLife(true)`.
- The Warden: done. `volley` is 3 to 5 jamming shots from `body`, 600 ms, with a free side. `sweep` is two shrink-0.8 beams and one free lane. `reaper` is one 1800 ms skull and two shrink shots, no jam. Each opens with pose `open` and lock `core`. Phase 1 plays `[volley]` and has no pose. Phase 2 keeps `open` and plays `[sweep, reaper, volley]` with gap 2000 to 1200. The file imports types and `src/core` only.
- Content tests: done. Five paddle positions, three pool levels, twenty seeds, on every attack. Same seed and view match. Hard wind-up is at least `MIN_WINDUP_MS` before the floor. Openings point at a real pose and the core. Ids are unique. `AUDIO_ASSETS` imported, and every `tell.sfx` is one of its keys.

Findings
- None.

Scope and shortcuts
- Clean. The diff is this phase plus this log. `src/platform/debugOverlay.ts` and `src/art/procedural.ts` are the debug line and the three painted textures the phase asks for. Nothing under "Do not" was built. No `any`, `as unknown as`, ts-ignore, eslint-disable, skipped tests, or `Math.random` in the new boss code. The one new random call is `randomSeed()` in `Play`, and `Math.random` stays inside `Rng`. `console.warn` is inside the dev guard. No `juice.flash` in the boss or hazard code. The paddle alpha is the jam; the tint is still the lighting system's.

For the user
- Nobody has heard it. The keys that reached the sound manager are `laser_spinup`, `ab_meteor_whoosh` and `ui_deny` for the tells, `ui_locked` for the jam, `sfx_smaller` for the shrink, `ab_blackhole_open` when the skull leaves, and `breach` then `death` when it lands.
- Whether each attack reads as fair, especially the skull. Jam is 600 ms, a shrink is 0.8 and they stack until a ball is lost, and the lock turns at 1.8 rad/s.
- A skull hit ends the attack, so the opening does not follow. God mode spends no life and still ends the attack.
- I did not repeat the phone-sized `?lighting=low` frame-rate pair. The implementer's numbers are in their handoff: both sides at 60 fps, main thread about 1 ms without hazards and about 1.1 ms with them.
- Hazard counts I saw on a full pool: volley 3, sweep 2, reaper 3. A drained pool raises the volley to 5; the content tests cover that, and this run never drained the pool.

## Phase 5: DONE, 2026-11-17, Claude (Cursor agent)

Read this first: the scope is wider than phase-5-reference-boss.md. That file says "do not add
framework features, hazards, steps or HUD elements". The user's message that started this phase
asked for a film-style fight in eight steps and for new placeholder audio, and a second message
asked for a named recording as the boss music. I took the user's messages as the spec for those
items and the README's rules for how to build them. Everything under "Deviations" follows from
that. The shield the user wondered about is not built; it is under "Waiting on the user".

Built
- `src/core/Boss.ts`: `envelope`, `letterbox`, `BossState.stepLength`; `skip()` ends the award
  after `AWARD_GUARD_MS`; new and changed constants (table below).
- `src/systems/BossDirector.ts`: `BossHud.cinema` (`bars`, `dark`, `title`, `award`), worked out
  on the fight clock each frame; `BossStage.shot`, `.glimpse`, `.unveil`; `BossHost.frame` and
  `.addCoins` (`titleCard` and `backdrop` removed); framework camera shots for the reveal, phase
  scenes and death; a key light on the boss during the reveal; hit-stop on each kill shot; the
  award (score, coins, trophy) and the ending theme in the aftermath.
- `src/ui/BossCinemaView.ts` (new), `src/scenes/Hud.ts`: the curtain, the letterbox bars, the
  title card (epithet over the name) and the award card, drawn in the HUD scene.
- `src/systems/HazardSystem.ts`: a free ball breaks a flying skull; a paddle hit gets a jolt, a
  local light, a word ("JAMMED", "SHRUNK") and a sound; shots and beams have launch sounds.
- `src/systems/BossBody.ts`: `focus`; the sprite is solid sooner as it arrives.
- `src/systems/AudioSystem.ts`, `src/art/bossMusic.ts` (new), `src/scenes/Play.ts`: a second
  `MusicEngine` plays `BOSS_TRACK`; `Play.preload` loads it for boss levels; `Play.frameShot`.
- `src/bosses/warden.ts`: three phases (was two), new entrance, two phase scenes and death,
  the core's light, a trophy. Attack plans are unchanged.
- `src/art/procedural.ts`: the `boss_trophy` texture. `src/config.ts`: 13 keys in `AUDIO_ASSETS`.
- `scripts/build-boss-audio.py` (new): synthesizes the 13 effects. `scripts/build-boss-music.py`
  (new): downloads the recording (`--fetch`, yt-dlp) and cuts the track. `.gitignore`: the
  downloaded source, `art-src/music/boss-source.wav`.
- `docs/boss-fights/authoring.md` (new, 288 lines). `design.md`: facts corrected, "As built"
  added. Root `README.md`: dev parameters, project layout, "Boss sprites".
- Tests: `tests/boss.test.ts` (award skip and timeout, `stepLength`, `envelope`, `letterbox`),
  `tests/bosses.test.ts` (every sound key used by boss code is in `AUDIO_ASSETS` and its file
  exists; the Warden's three phases), `tests/music.test.ts` (the boss track's cue sheet).

How the user's eight steps map
1. Fade to black, music off: `hush`, 1600 ms.
2. Approach and lightning: the Warden's `entrance`: three footfalls with shakes, a growl, then
   two cuts (the eye, the whole body) each lit by `glimpse()`.
3. Reveal: `unveil()`, a glide shot, the `tell` animation and a roar; then the framework's
   push-in under a key light.
4. Title card and letterbox: `reveal`, 3600 ms. "KEEPER OF THE GATE" over "WARDEN".
5. Boss music and into play: the track starts with the card; bars open and the camera pulls
   back as play begins.
6. Phase scenes: hit-stop on the kill shot, bars, push-in, the phase's `enter` scene.
7. Death and triumph: `finale` (music cut, death scene), then `boss_victory` in the aftermath.
8. Award: card with the trophy (spins; still under reduced motion), +2,000 and +25 coins.
   A tap goes on after 1.8 s; with no tap it goes on after 12 s. The level song returns at
   `rest` 6.5 s in.

Coverage table (all in `src/bosses/warden.ts`, all seen in the lab unless noted)

| Feature | Where |
| --- | --- |
| Normal, steel, weak and lit parts | `body`; `guard` (steel); `core` (`weak: 3`, `light`) |
| Five animations | `sprite.anims`: idle, tell, open, hurt, death |
| Pose | `open` lifts the guard; phases 2 and 3 hold it, every opening uses it |
| Motion | `sway(50, 5200)`, `sway(90, 3600)`, `sway(120, 2800)` |
| `setup` that spawns | `core-exposed`: `s.spawn(wall())`, `s.paddle.resetSize()` |
| `setup` that retires | `last-stand`: `s.retire('guard')` |
| Phases with different intensity | low, mid, high. The placeholder track sounds the same under all three |
| Epithet, trophy | "Keeper of the gate", "Warden's Eye" |
| Cutscenes: light, impact, sound, anim | all four scenes; also `shot`, `glimpse`, `unveil` in the entrance |
| Deck longer than one | phase 2 `[sweep, volley]`, phase 3 `[reaper, sweep, volley]` |
| Shot, beam, skull | `volley`, `sweep`, `reaper` |
| Jam and shrink | volley shots jam; sweep beams and reaper shots shrink |
| Opening with pose and lock | `OPENING = { pose: 'open', lock: 'core' }` on all three |
| `tell.sfx` | `laser_spinup`, `ab_meteor_whoosh`, `boss_growl` |
| Plans using `rng`, the paddle, `phaseProgress` | `volley` reads all three |

Measurements
- Taken in the in-editor browser on `http://127.0.0.1:5173/?map=bosslab.tmj` with the game loop
  asleep and stepped 1/60 s at a time. The paddle was a bot: it follows the ball and steps off a
  marked hazard when the ball is at least 0.55 s away. Times are from level start to the award;
  the intro is 9.4 s of that. A person will be slower than the bot.
- Pools 20/44/56 (the final numbers), god mode off:

| Difficulty | Run 1 | Run 2 |
| --- | --- | --- |
| Easy | 148.9 s, 0 lives lost | 126.0 s, 0 |
| Normal | 191.0 s, 0 | 121.7 s, 0 |
| Hard | 94.9 s, 0 | 166.9 s, 1 |

- More Normal times on the same pools (god mode on, so lives mean nothing): 169.8, 82.6, 91.8 s.
  The Normal mean over five runs is about 131 s, range 83 to 191 s. The spread is the core: a
  ball going straight up under the open eye lands several triple hits in a row.
- Earlier pools, same bot: 10/12/12 about 56 s; 22/26/40 124 s; 16/36/44 102 s and 94 s.
- Most hazards alive at once: 5. No `[boss]` plan warning in any run.
- The opening: the core takes 3 hits a ball against 1 on the body, by `weak: 3`. I did not time
  core-only against body-only runs.
- Not measured: hits from one use of each ability, and from ten seconds of each laser mode. The
  constants are unchanged (`ABILITY_HITS` 2, `EXPLOSION_HITS` 3).

Numbers changed, and why
| Name | Was | Is | Why |
| --- | --- | --- | --- |
| `HUSH_MS` | 900 | 1600 | Room for a fade to black. |
| `HUSH_DARK` | 0.45 | 1 | The boss is not seen until lightning shows it. |
| `REVEAL_MS` | 2400 | 3600 | The title card fades in, holds long enough to read, fades out. |
| `AFTERMATH_MS` | 1800 | 12000 | It is now the award, and the cooldown before it goes on by itself. |
| `BOSS_SWELL_S` | 1.6 | 0.05 | The song opens on its loudest notes; a slow fade swallowed them. |
| `BOSS_STINGER` | `fanfare_stab` | `boss_victory` | The ending theme the user asked for. |
| `AWARD_GUARD_MS`, `AWARD_TROPHY_MS`, `STINGER_MS`, `BARS_MS` | new | 1800, 900, 6500, 450 | The award and the bars. |
| `BOSS_DEFEAT_COINS`, `SKULL_POP_RADIUS` | new | 25, 26 px | The award's coins; the ball breaking a skull. |
| Warden phases | 2 | 3 | A phase scene is seen twice; the skull waits for the last phase. |
| Warden pools | 12, 12 | 20, 44, 56 | 12/12 was under a minute. These reach the 2 to 3 minute target. |
| Warden scenes | entrance 1800, exposed 1200, death 2200 ms | 4200, 1800, cornered 2000, 3000 ms | The approach, the glimpses and the roar need the time. |

Placeholder audio to replace (all new files, under `public/assets/`)

| File | Key | Heard when |
| --- | --- | --- |
| `audio/music/boss-placeholder.mp3` | `boss_music` | The fight, from the title card to the final hit. 115.7 s: the piece once with its opening (`open`), then once more to loop on (`loop`), 30 bars each at 125 BPM. Cut from the YouTube recording. **Not ours: do not ship it.** A replacement needs `src/art/bossMusic.ts` to match it. |
| `audio/boss/stomp.mp3` | `boss_stomp` | Footfalls in the dark. |
| `audio/boss/growl.mp3` | `boss_growl` | In the dark; the last phase's scene; the reaper's wind-up. |
| `audio/boss/roar.mp3` | `boss_roar` | The reveal and both phase scenes. |
| `audio/boss/title.mp3` | `boss_title` | The title card. |
| `audio/boss/phase-break.mp3` | `boss_phase` | The kill shot of phases 1 and 2. |
| `audio/boss/death.mp3` | `boss_death` | The death scene. |
| `audio/boss/explode.mp3` | `boss_explode` | The last blast of the death scene. |
| `audio/boss/victory.mp3` | `boss_victory` | The triumphant theme after the death, 8 s. |
| `audio/boss/award.mp3` | `boss_award` | The trophy landing on the award card. |
| `audio/boss/paddle-hit.mp3` | `boss_paddle_hit` | A shot or beam hitting the paddle. |
| `audio/boss/skull-pop.mp3` | `boss_skull_pop` | A ball breaking a skull. |
| `audio/boss/shot.mp3` | `boss_shot` | A shot leaving the boss. |
| `audio/boss/beam.mp3` | `boss_beam` | A beam firing. |

Keep each replacement's file name and the game needs no change. The 13 effects are synthesized
(`scripts/build-boss-audio.py`, written by a subagent); each is peak-normalised near -3 dBFS.
The Warden still uses existing keys too: `thunder`, `brick_steel`, `brick_tnt`, `laser_spinup`,
`ab_meteor_whoosh`, and the Phase 4 hazard sounds.

Verified
- `pnpm typecheck`: passes. `pnpm lint`: passes. `pnpm build`: succeeds (precache 275 entries,
  20,279 KiB).
- `pnpm test`: 551 passed, 1 failed, in 23 files (was 534 passed and the same 1 failed). The
  failure is the old one, `tests/skills.test.ts` > "readies the gun more often than bullet time".
- Intro, stepped: black by the end of the hush (`dark` 1) with the bars closing; glimpses at
  1500 and 2600 ms of the entrance with the two camera cuts (`dark` dips to 0.12); title card
  with the push-in (zoom 1.3) and bars; at the first frame of the fight the camera is at rest,
  bars 0, `dark` 0 and the boss bar is up. Screenshots looked right on a desktop window, a
  390 x 844 phone window and a 16:9 window with wing plates.
- Skips: a tap 1.7 s into the entrance (mid close-up, screen black) gives a fight with `dark` 0,
  bars 0, camera at rest, no key light, sprite solid. A tap in each phase scene lands in the
  next phase with its `setup` applied (20 bricks on the board after the first, the guard gone
  after the second), bars 0 and the camera at rest. A tap in the finale does nothing.
- Phase scenes and death: bars and push-in (1.25; 1.45 for the death); the award shows the
  name, the trophy, +2,000 and +25 coins; a tap once the card asks for one goes to Results
  with the camera back at rest and `hud.boss` null. The guard before that is unit-tested.
- Reduced motion: bars and title card, no dark, no glimpses, no camera move.
- Hits: "SHRUNK" over the paddle on a beam hit; a skull on a paddle held still takes a life and
  clears the hazards; one of 8 skulls was broken by the ball in 40 s of reaper-only on Hard.
- Music, in real time with sound running: the boss engine decodes 115.700 s and finds the sync
  click (lead 0); one `open` voice starts with the title card and runs on unchanged through
  `build`, `groove`, `drive` and `fever`; `follow` gives `loop` after `open` and `loop` after
  `loop`; nothing plays from the final hit. The level song coming back at `menu` after the
  theme was seen before the track was swapped, not after.
  With ffmpeg: the first note sits at 0.258 s, and the 20 ms after the loop's end match the
  loop's start to -132 dB, so the wrap reads the same audio. In the source the second pass is
  the first again sample for sample from 20 s on, with a lag of exactly 57.6 s.
- Manual 3 (the guide): following only `authoring.md`, I added the id `dummy`, a `BossDef` with
  one part and one phase, registered it, copied the lab map with `boss` set to `dummy`, and ran
  the three checks. In the browser it showed its title card ("HELL FOUNDRY" over "DUMMY"),
  fought, died, showed the award and went to Results. Both were then removed; `git status`
  shows no trace.
- Regression (bot, 30 simulated s each, Normal): `?level=1`, level 10 (cleared at 27 s and went
  on), 24, 30, `?arcade=waves`, `?arcade=descent`. No exceptions, `window.boss` undefined,
  `hud.boss` null, camera zoom unchanged.

Not verified
- Nobody has heard anything. Every sound and the music were checked as numbers only.
- The tutorial on a fresh save: it started on a cleared save and ran 75 simulated seconds with
  no error, but it waits for inputs my bot does not give, so it was not played through.
- Ability and laser hit counts (above). Core-only against body-only timing.
- "Every attack can be avoided on reaction by a first-timer": only the bot's runs speak to it.
- The award going on by itself after 12 s: unit-tested (`ends the award by itself when nobody
  taps`), not watched in the browser.
- What plays under Results when the award is tapped away before 6.5 s. By the code the level
  song is still stopped then.
- The full fight was not replayed end to end after the music swap; the music check, the tests
  and the build were. The song is one piece, so the phases' intensities are not audible.
- A controller, a TV, a real phone.
- One `pnpm test` run timed out in `tests/procgen.test.ts` while the machine's load average was
  67. The next run at normal load passed; I did not look further.

Deviations from the documents
- Framework features in a phase that forbids them: the cinema layer, camera shots, the award,
  coins, the skull breaking, hit feedback, a second music engine, 13 sound keys, a procedural
  texture. Asked for by the user; see the top of this entry.
- `scripts/build-boss-audio.py` and `scripts/build-boss-music.py` are new scripts, and
  `.gitignore` gained one line. The phase names no scripts.
- design.md's "Left out" list still names letterbox bars and the real boss track. I left the
  list alone and recorded the departures under "As built".
- `src/core/Boss.ts` and `src/scenes/Play.ts` were not Prettier-clean before this phase, so I
  formatted only my own lines there.

Open
- The boss track is a commercial recording. It is in the PWA precache (2.3 MB) and in `dist`.
  It is a placeholder by the user's instruction and has to go before release.
- The ending theme is played as a sound effect, so it follows the effects setting and volume,
  not the music's.
- `Play.titleBand()` still returns a take-down function that nothing uses now.
- On the 16:9 stage the wing plates stay visible outside the letterbox during scenes.
- The save on the spare origin `127.0.0.1:5173` was changed during testing and put back
  (reduced motion on, Easy, god mode on). Its coins grew by 25 for every test award and stand
  at 601. `localhost:5173`, the user's origin, was never touched.

Later
- A boss track with a section per mood, so the phases climb. Only the cue sheet changes.
- A shield, if the user wants bullets to do visible damage (design.md lists a Shield powerup
  blocking skulls as left out).
- Fading the wing plates during scenes. A per-boss award trophy texture.

Closing summary for the user
- What exists: a boss framework (parts as bricks under an animated sprite, phases with a hit
  pool, planned attacks with warnings and openings, cutscenes, a film-style flow from fade to
  black to an award), one reference boss (the Warden, three phases, about two minutes), a dev
  lab (`?map=bosslab.tmj`), a guide (`authoring.md`), and tests that check every registered
  boss.
- What is placeholder: all 14 audio files above; the Warden's sprite sheet (every cell is one
  generated creature, and its eye sits in the head rather than a chest cavity); the trophy
  (drawn in code); the Warden itself, which is a test boss.
- What was left out: bosses in shipped levels and `index.json`; Arcade boss waves; the shield;
  beat-synced cues; phase checkpoints; boss save data. design.md lists the rest.
- Waiting on your ear: every sound and the music; the loop point of the boss track; the level
  of the track against the effects; the step from the award into the next level's music (the
  lab is the last level, so it cannot be heard there).
- Waiting on your eye: the pacing of the intro (about 9.4 s), the phase scenes and the award;
  the title card against the Gohma reference; whether each attack reads as fair, the skull
  above all; the jam (600 ms), the shrink (0.8 a hit) and the lock-on strength; whether a boss
  level should keep the stars' sounds and the win celebration; the fight on a phone, a desktop
  and a TV with a controller.
- Still yours to decide: the shield; whether agents may commit after a PASS.

## Phase 5 review: FIX, 2026-11-17, Grok (Cursor agent)

The Warden, the guide, and the film flow are in place and the approach is sound. Two build items are not done, and one document still describes work that is already in the tree. This is the first review of this phase.

Ran
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm build`: pass (precache 275 entries, 20,279 KiB).
- `pnpm test`: 551 passed, 1 failed. The failure is `tests/skills.test.ts` > "readies the gun more often than bullet time" (`SKILLS.gun.cooldownMs` is 6000, bullet time is 3000). That file and `src/core/Skills.ts` are unchanged from HEAD, where the same numbers already fail the test. Not a Phase 5 defect.
- Manual, in the browser at `http://127.0.0.1:5173/?map=bosslab.tmj&debug`, Normal, reduced motion off: the reveal shows "Keeper of the gate" over "Warden", the bars are closed and the camera is pushed in (zoom above the play view), then the fight starts with the bars open, the camera at the play zoom, music mood `low`, pool 20/20, and the label `WARDEN · GUARD UP`. During play the sprite used `warden-idle`, `warden-tell` and `warden-open` with the windows gap, live and recover. A volley wind-up drew three hazards. The health bar and the debug overlay were up. On Easy beforehand the pool was 16, which is `20 * 0.8`.
- Not checked: the hush, the entrance, the glimpses and the unveil (the intro had finished before the first sample landed). Hurt and death animations, a phase scene, the award, a beam, a skull, a jam and a shrink were not watched. Sound was not heard. The three window shapes, `?level=1`, `?level=10`, `?level=24`, `?level=30`, both Arcade modes and a fresh tutorial were not played. The authoring check that adds a second boss and deletes it was not repeated, because this review cannot edit code. The spare origin's save was put back to Easy, reduced motion on, god mode on; its coin count read 626 afterwards (the handoff said 601). `localhost` was not opened.

Build items
- Coverage: done. The table matches `src/bosses/warden.ts`: normal body, steel guard, core `weak: 3` with a light, all five anims, a pose, sway, a setup that spawns and one that retires, three intensities, an epithet, entrance and two phase scenes and a death using light, impact, sound and `anim`, decks longer than one attack, shot, beam, skull, jam, shrink, an opening with pose and lock, tell sounds, and plans that read `rng`, the paddle and `phaseProgress`. Idle, tell, open, the volley and the title card were seen in the lab. The other rows were not seen this review; the handoff says they were.
- Tuning: not done. The handoff's own Normal times include 82.6 s and 91.8 s, under the two-minute floor, and the five-run spread is 83 s to 191 s. Hits from one use of each ability, ten seconds of each laser mode, and a core-only run against a body-only run were not measured. Nobody has played the attacks as a first reaction.
- `authoring.md`: done. 288 lines, the eight sections in order, examples from the Warden. The signatures I checked against `src/core/Boss.ts` and `src/systems/BossDirector.ts` match the source, including `BossDef`, `PartDef`, `PhaseDef`, `Cue`, `Cutscene`, `Shot`, `AttackDef`, `HazardSpec` and `PaddleEffect`. The steps match `BOSS_IDS`, `scripts/build-bosses.py`, `src/bosses/index.ts` and `?map=`.
- Documents: done differently. Constants and the API in `design.md` match the code, "As built" is there, and the root `README.md` has the dev parameters, the new files and the boss-sprite paragraph. "Left out" still says letterbox bars, shots the ball can pop, and a second music engine are not built.
- Regression: not done. The handoff records about 30 simulated seconds per route and an unfinished tutorial. The phase asks for a full level or wave on each route.

Findings
1. `src/bosses/warden.ts`: a Normal run is not held to two or three minutes. The handoff records god-mode Normal times of 82.6 s and 91.8 s on pools 20/44/56, and it does not record ability hits, laser hits, or a core-only time against a body-only time. Done means STATUS shows Normal runs from the first launch to the last hit that stay inside two to three minutes, plus those three measurements.
2. `docs/boss-fights/STATUS.md`: the regression is not the one the phase asks for. Thirty simulated seconds is not a full level, and the tutorial was not played through. Done means `?level=1`, `?level=10`, `?level=24`, `?level=30`, `?arcade=waves`, `?arcade=descent` and a fresh tutorial are each played for one full level or wave, the lab is played on a phone-shaped window, a desktop window and a 16:9 window with wing plates, and the result of each is written here.
3. `docs/boss-fights/design.md`: "Left out of this build" still lists letterbox bars, shots the ball can pop, and the work of a second `MusicEngine` as future work. `src/ui/BossCinemaView.ts` draws the bars, `src/systems/HazardSystem.ts` breaks a skull the ball touches, and `src/systems/AudioSystem.ts` already runs that second engine. Done means "Left out" no longer describes those as absent. The reasons stay under "As built".

Scope and shortcuts
- Wider than the phase file, and declared. The phase says to add no framework features. The cinema, the camera, the award, the second music engine, the thirteen sounds, the skull breaking and the paddle-hit feedback are in the tree because the user asked for them after Phase 4, and they are listed under "As built" and in the handoff. They are not a reason to throw the phase out.
- No boss in `index.json`. Boss files import types and `src/core` only.
- No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `Math.random`, skipped tests, or `juice.flash` in the boss code. The `[boss]` plan warning is a `console.warn` behind `import.meta.env.DEV`. Hazard counts are not scaled by the lighting tier. The new tests assert behaviour (fair plans, cue sheets, award skip, sound keys that exist on disk) and would fail if those broke.

For the user
- The new recording at https://youtu.be/a9vw6LtQY9w was not downloaded. It is another Ocarina of Time boss theme. The track already in the tree has the same problem and must not ship. This review does not add a music picker, because a review does not edit code.
- Still needs your ear: every placeholder sound and the boss track. Still needs your eye: whether a first-timer can dodge each attack, the intro, and the fight on a phone, a desktop and a TV with a controller.
- No commit. A FIX is not a sign-off.

## Phase 5 review: FIX, 2026-11-17, Claude (Cursor agent)

A second review of the same tree. There is no implementer entry after Grok's FIX, and the
working tree is still the handoff's (17 modified files, 7 new). I did not write this phase.

Why FIX and not RESTART. review.md says "After two FIX verdicts on the same phase without a
PASS, the verdict is RESTART." I read that as counting verdicts already given: one had been
given, so this is the second FIX. No fix round has happened yet, so nothing has been tried and
failed. The approach is sound and the problems are specific. This list replaces Grok's, so the
implementer has one list. **If the next review of Phase 5 is not a PASS, it must be RESTART.**
If the person running the phases reads the rule as "the second FIX becomes RESTART", then this
verdict is RESTART. In that case keep everything in the tree: the framework work, the Warden,
`authoring.md`, the audio and the scripts. Discard nothing. Redo the items below.

Ran
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm build`: pass (precache 275 entries,
  20,278.57 KiB).
- `pnpm test`: 551 passed, 1 failed, in 23 files. The failure is `tests/skills.test.ts` >
  "readies the gun more often than bullet time" (6000 is not under 3000). `git diff HEAD` shows
  that test and `src/core/Skills.ts` unchanged, so it is not a Phase 5 defect.
- The browser setup. I used the in-editor browser on a dev server I started at
  `http://127.0.0.1:5199`, and stopped it afterwards. That origin's save was not fresh: Easy,
  instructions seen, levels already played. I set Normal for the fight, and set instructions
  unseen for the tutorial check. Both are put back (Easy, instructions seen). My runs added coins
  (184 now) and level results there. `localhost:5173` and `127.0.0.1:5173` were not opened.
  Most checks were stepped: the loop was asleep and stepped 1/60 s at a time, with state read
  from `window.boss`, `window.game` and the audio singleton.
- Manual 1 (coverage, in `?map=bosslab.tmj`, Normal):
  - The intro. The hush goes to black with the bars closing. The entrance glimpses work (but see
    finding 3). The reveal shows the title card "KEEPER OF THE GATE" over "WARDEN", the camera
    pushes in 1.3 times and the music rises. Play starts with the bars at 0, the dark at 0, the
    camera at rest, mood `low`, the label `WARDEN · GUARD UP` and the boss bar with three pips.
  - A tap 2.8 s into the entrance gives a clean fight. There is no key light and the sprite is
    solid. The boss engine plays its `groove` playlist and the level song is stopped.
  - Phase 1 to 2: the bars close, the camera pushes in 1.25 times and pulls back before play.
    The wall spawns 6 bricks, the score gains 500, the mood is `mid` and the label is
    "CORE EXPOSED".
  - Phase 2 to 3, skipped by a tap: the guard is retired, the camera is at rest, the ball stays
    held, the label is "LAST STAND" and the mood is `high`.
  - The final hit. The music cuts, the bars close and the camera pushes in 1.45 times. Then the
    parts are retired, 0 bricks remain, and the score gains 2,000 and the coins 25. The award
    card shows the name, "Defeated", the spinning "WARDEN'S EYE" trophy, +2,000, +25 coins, and
    "Tap to continue" with its wait strip. A tap ends it: `hud.boss` is null, the zoom is 2,
    and Results show "ALL CLEAR" with 3 stars.
  - The attacks, each forced with `&attack=` and the paddle held still:
    - The reaper's skull took a life, the ball stayed in play and the attack ended.
    - A sweep beam shrank the paddle to 0.8 and showed "SHRUNK". Lock-on came up in recover.
    - Three volley shots jammed the paddle (alpha 0.45, "JAMMED" three times). Lock-on came up
      in recover.
  - The idle, tell, hurt and open animations were seen. The most hazards alive at once was 3.
- Manual 4 (signatures and constants):
  - The constants in `design.md` match `src/core/Boss.ts`.
  - The API blocks match the source: `BossStage`, `Shot`, `BossHost`, `BossHud`, `BossCinema`,
    `BossTitle`, `BossAward`, `skip` and `stepLength`. So do the signatures in `authoring.md`.
  - `envelope` and `letterbox` are exported from `src/core/Boss.ts` but not named in
    design.md. They are small helpers, so I did not make this a finding.
- Manual 5 (regression): the boss lab in three window shapes, the tutorial start, and a bot on
  every route. The bot is a paddle that follows the lowest falling ball and relaunches a held
  ball, with exceptions caught; I read the result after each run.
  - The lab windows. On a desktop window (1561 x 1283) everything looked right. On a 16:9
    window with wing plates (1600 x 900), the full dark covers the plates and the title card is
    fine. On a 390 x 844 phone-shaped window the title card fits.
  - The tutorial start. With instructions unseen, the boss lab shows no coach and leaves the
    flag alone. `?level=1` starts the coach at "move" with no boss and the zoom at 2.
  - `?level=1`: cleared at 105 s, no lives lost.
  - `?level=10`: cleared at 15 s.
  - `?level=24`: 240 s, 152 bricks down to 3, not finished.
  - `?level=30`: cleared at 66 s.
  - `?arcade=waves&seed=1K9ZQ2`: 120 s, the first wave cleared, still running.
  - `?arcade=descent&seed=1K9ZQ2`: 120 s, 40 bricks down to 1, still running.
  - On every route: no exceptions, `window.boss` undefined, `hud.boss` null, the zoom at 2, and
    after the Descent run, the level song playing on the one music engine.
- Not checked:
  - Manual 2 (tuning). I did not take my own times.
  - Manual 3 (adding a second boss from the guide). That needs code edits, which this review may
    not make.
  - Any sound by ear.
  - Reduced motion, a controller, a TV and a real phone.
  - A ball breaking a skull (the handoff saw one).
  - The award going on by itself after 12 s (unit-tested only).
  - The tutorial played through to its end.
  - Level 24 and Descent were not played to the end of a level or wave.

Build items
- Coverage table: done. Every row matches `src/bosses/warden.ts`, and the rows I could reach
  were seen in the lab (above).
- Tuning: not done. The handoff's Normal times run from 82.6 s to 191 s; 82.6 and 91.8 miss the
  two-to-three-minute target. It does not record the hits from one use of each ability, the
  hits from ten seconds of each laser mode, or a core-only time against a body-only time, so the
  aim "the opening is worth using" has no measurement.
- `authoring.md`: done, with one wrong rule (finding 4). It has 288 lines, the eight sections
  in order, and Warden examples.
- Documents: done differently. `design.md` "Left out" is stale (finding 5), and its flow
  promises music under Results that does not always play (finding 2). The root `README.md` and
  the closing summary are done.
- Regression: done differently. The handoff ran 30 simulated seconds per route. This review
  cleared levels 1, 10 and 30 and the first wave of Waves. Level 24, a full Descent level and a
  tutorial played through are still missing (finding 6).

Findings
1. `src/bosses/warden.ts`: a Normal run is not held to two to three minutes. Two of the five
   recorded Normal runs end under 92 s, on pools 20/44/56. The phase's other measurements are
   missing: ability hits, laser hits, and core-only against body-only. Done means: STATUS
   records several Normal runs, timed from the first launch to the last hit, that land inside
   two to three minutes, together with those three measurements.
2. `src/scenes/Play.ts`, `src/systems/BossDirector.ts`: Results can play in silence. The award
   card takes a tap from `AWARD_GUARD_MS` (1.8 s), but `BossDirector.music` stays null until
   `STINGER_MS` (6.5 s). Then the boss is no longer active, so `updateBossMusic` returns false.
   `steerMusic` does nothing while the music is stopped. And `Play.win()` skips `stopMusic`
   and the fanfare for a boss level. I tapped the card at about 2 s. Eight seconds into Results,
   `musicKey` and `wantedMusic` were undefined and neither engine was playing. design.md's flow
   says "The clear banner and results play over `rest`." Done means: Results play over the
   music design.md describes whenever the award ends: a tap as soon as one is allowed, a later
   tap, or the 12 s timeout. A test or a recorded browser check shows it.
3. `src/systems/BossDirector.ts` (`glimpse`) with `src/systems/LightingMoods.ts`: in a
   lights-out world, the world's own flashes can take a glimpse's place. The lab's world keeps
   running its sputter and lightning under the black hush and entrance, where nobody can see
   them, and each takes a slot under the limit of two whole-screen flashes a second. In one of
   four stepped intros, the world booked flashes at about 1273 and 1490 ms of the entrance. The
   first glimpse at 1500 ms was refused, and the eye close-up showed three times zoomed black.
   The second glimpse worked in all four runs. By the code, the world's flicker and thunder
   sounds can also play during the intro, which the user wanted silent; I have not heard them.
   Done means: over repeated intros in the lab, the boss file's glimpses are not lost to world
   flashes the player cannot see. The flash limit still holds. STATUS says whether world sounds
   play under the hush and entrance.
4. `docs/boss-fights/authoring.md` (line 202): the guide misstates the flash rule. "Keep two
   glimpses or impacts at least 400 ms apart, or the limiter drops the second." In fact
   `LightingSystem.claimFlash` allows two whole-screen flashes in any one-second window, shared
   with the world. It drops the third, however far apart the flashes are. The Warden shows it:
   the death scene's blast at 900 ms loses its flash, after the kill shot's impact at 0 and the
   blast at 500. The comment above `BREAKUP` in `src/bosses/warden.ts` says "two flashes at most
   burn". Done means: the guide states the rule as the code enforces it, and the Warden's death
   cues and that comment agree with it.
5. `docs/boss-fights/design.md`: "Left out of this build" describes built work as missing.
   Line 692 lists the letterbox bars, which `src/ui/BossCinemaView.ts` draws. The bullet for
   the real boss track (lines 679 to 684) lists work that `src/systems/AudioSystem.ts` now
   does: a second engine on the same music bus, and `playMusic`, `duckMusic` and the rest taught
   about it. What is still missing is the song itself and a `MusicEngine` that is generic over
   its mood type. "Shots the ball can pop" (lines 690 to 691) is correct as written: only
   skulls break, and "As built" says so. Grok's finding 3 was wrong on that item. Done means:
   "Left out" names only what is absent; "As built" keeps the reasons.
6. `docs/boss-fights/STATUS.md`: the regression is not complete. Done means: STATUS records a
   fresh save played through the tutorial to its end, level 24 cleared, and one full Descent
   level. The other routes and the three window shapes are recorded above.
7. `src/scenes/Play.ts`, `src/systems/BossDirector.ts`: leftovers from the title band.
   `Play.titleBand()` still returns a function that removes the band, which nothing calls, and
   its comment says the function is "for a scene that is skipped". The comment on `epithet` in
   `BossDef` (line 123) still says "title band". Done means: no unused return, and the comments
   describe the title card.

Scope and shortcuts
- Wider than the phase file, and declared. The cinema layer, the camera shots, the award, the
  coins, skull breaking, paddle-hit feedback, the second music engine, the 13 sound keys and the
  trophy texture were asked for by the user after Phase 4. They are listed in the handoff and
  under "As built".
- The new code has no `any`, `@ts-ignore`, `eslint-disable`, `juice.flash`, unguarded logging,
  skipped tests or quality-scaled hazard counts. Timers, `Math.random` and `try` appear only in
  code that predates the phase. No boss is in a shipped level or `index.json`.
- The tests check behaviour. Two existing tests were changed, both for real changes: the
  aftermath is now skippable, and the third phase changed the decks.

For the user
- Your ear: every placeholder sound and the boss track. Also, whether the world's flicker and
  thunder break the silent intro in a lights-out world (finding 3).
- Your eye:
  - The volley shows "JAMMED" once per shot, three times in about 150 ms.
  - On a 16:9 screen the wing plates show beside the bars during glimpses, the reveal and the
    scenes, as the implementer noted.
  - At 16:9 the eye close-up (`EYE_ZOOM` 3) frames the whole body rather than the eye.
  - With the dev `]` kill while the ball is held, "TAP TO LAUNCH" and the countdown show under
    the award. Normal play may never reach this.
- The boss track is a commercial recording and must not ship. The question about
  https://youtu.be/a9vw6LtQY9w in Grok's review still stands.
- No commit. A FIX is not a sign-off.

## Phase 5: DONE, 2026-11-17, Claude (Cursor agent)

The fix round for Claude's FIX review, which replaced Grok's list. The user asked for every
finding to be fixed and the work committed, so this round commits the whole phase.

Built
- `src/scenes/Play.ts`: the `defeated` host starts the director's current music before `win()`,
  so an award tapped before the calm came in no longer leaves Results silent (finding 2).
  `titleBand()` returns nothing and its comment describes the title card (finding 7).
  `syncLights()` tells the lighting whether a boss scene holds the room.
- `src/systems/LightingSystem.ts`: a `held` flag, set by the scene every frame.
- `src/systems/LightingMoods.ts`: while `held`, `Lightning` and `FailingLights` drop their
  pending flashes and push their next one past the scene, so they neither claim the flash limit
  nor play their sounds under the hush, the entrance or a scene (finding 3).
- `src/bosses/warden.ts`: the death scene has three blasts, at 500, 1100 and 1650 ms, and the
  comment says why: with the framework's blow at 0 and the last blast at 2300, no three flashes
  fall inside one second (finding 4). Pools are 20/48/62, up from 20/44/56 (finding 1).
- `src/systems/BossDirector.ts`: the `epithet` comment says title card (finding 7).
- `tests/bosses.test.ts`: every registered boss's entrance, phase scenes and death are run
  against a stub stage that counts `impact` and `glimpse` calls. The test fails if more flashes
  than `MAX_FLASH_HZ` allows fall inside one second. It counts the framework's blow at 0 ms of
  the death scene. With the old 900 ms blast put back it fails ("death: the flash at 900 ms").
- `docs/boss-fights/authoring.md`: the flash rule as the code enforces it: two whole-screen
  flashes in any one second, the third dropped while its ring, sparks and sound still play. The
  Warden's death flash times are given as the example. 294 lines.
- `docs/boss-fights/design.md`: "Left out" no longer lists the letterbox bars or the second
  music engine. What is left of the boss track is the song, its cue sheet and its cut, and
  optionally a `MusicEngine` generic over its mood. "Shots the ball can pop" stays, as the review
  said. "As built" gains the world's lights waiting while a scene runs.

Verified
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm build`: pass.
- `pnpm test`: 552 passed, 1 failed (was 551 and 1). The failure is the same
  `tests/skills.test.ts` test, unchanged from HEAD.
- The browser runs used the in-editor browser on dev servers at `http://127.0.0.1:5199` (the
  review's origin) and `http://127.0.0.1:5187` (a fresh save), both stopped afterwards. Most runs
  were stepped: the loop asleep and stepped 1/60 s at a time. A bot moved the paddle under the
  lowest falling ball and relaunched a held one, with god mode off.
- Finding 2: I tapped the award as soon as `skip()` allowed it, at about 2 s. Eight seconds into
  Results, `musicKey` was `music` and the level engine was playing the calm mood. The boss
  engine was stopped. By ear, the calm music now comes in over the victory theme on an early tap.
- Finding 3: in six stepped intros the only whole-screen flashes claimed during the hush and the
  entrance were the two glimpses (about 1502 and 2602 ms) and the unveil's impact (3202 ms), all
  granted. In a 50 s run, the boss's glimpses, unveil impact and phase-change impact were all
  granted. During play, the world's lightning struck 9 times and the failing lights blinked 10
  times. Neither flashed during a scene. While held, both moods return before they reach their
  sound calls, so the world's flicker and thunder do not play under the hush and entrance. That
  is by the code; I did not hear it.
- Finding 4: in one stepped death all five flashes were granted: 0, 500, 1117, 1650 and 2300 ms.
  The 1100 ms blast lands at 1117 ms because the kill's hit-stop delays the scene's cues. In another
  run the blow at 0 was refused, because normal play had spent both flashes in the second
  before the final hit.
- Finding 1, Normal, bot runs timed from the first launch to the final hit:
  - The old pools, 20/44/56: 152.9, 133.8, 178.3, 107.2, 165.1 and 111.1 s.
  - The new pools, 20/48/62: 177.9 s (1 life lost), 138.4 (2), 154.3 (1), 88.0 (0) and
    154.9 (0). Four of five land in two to three minutes.
  - Hard, 1.25 times the pools, so 78 in the last phase: 146.9 s, 1 life lost. Easy, 0.8 times
    the pools, so 50 in the last phase: 152.5 s, no life lost.
  - Phase 1 is steady at 31 to 47 s. Phases 2 and 3 vary widely. The fast runs come from a
    laser pickup on the core (8 laser hits), a ball trapped above the body (32 body hits in
    phase 3), and a ball looping straight up into the core. Phases 2 and 3 hold the core open the
    whole time, and most damage comes from core hits from below.
  - The most hazards alive at once was 5. No exceptions.
- Ability hits, one use each, the paddle under the body:
  - Phase 1: bomb 8, meteor 8, sweep 8 (each 2 on the body and 6 on the core). Black hole 0,
    lightning 0, frenzy 0.
  - Phase 3, with the body swaying ±120 px: sweep 8; meteor, bomb, lightning, black hole and
    frenzy 0. An earlier phase-3 meteor dealt 2 on the body.
  - Lightning and the black hole go for the lab's other bricks, not the boss.
- Laser hits, ten seconds of each mode in phase 3 with `?laser=`: gun 1.5, helix 1.6,
  scatter 0.8, swarm 0, ricochet 0.
- Core only against body only, phase 1, with the other part made immune at runtime (`weak` set
  to 0): core only 58.7 and 50.5 s, body only 50.4 and 64.3 s. A core hit is worth three body
  hits, but this bot does not aim, so it reaches the core no more often than the body. The
  numbers do not show that the opening is worth using. A player who aims may find otherwise.
- Finding 6, on the fresh save at `127.0.0.1:5187`: the tutorial ran move, launch, guard, catch,
  ability, gun and slow-mo, and the coach finished at 19.9 s. Level 1 cleared at 56 s with 3
  lives and `seenInstructions` true. `?level=24` cleared at 214.6 s. `?arcade=descent` went from
  tier 1 to tier 2 at 104.8 s, and `?arcade=waves` from tier 1 to 2 at 24.7 s. On every route:
  no exceptions, `window.boss` undefined, `hud.boss` null, and the zoom at `RENDER_ZOOM`.

Not verified
- Any sound by ear, including the world's silence under the intro.
- Reduced motion, a controller, a TV and a real phone.
- A ball breaking a skull.
- The award moving on by itself after 12 s, in the browser. It is unit-tested.
- A human playthrough of the fight.

Deviations from the documents
- `src/systems/LightingSystem.ts` and `src/systems/LightingMoods.ts` are outside the phase's
  file list. The fix for finding 3 belongs where the world's flashes are made.
- The Warden's death scene has three blasts rather than four, to stay under the flash limit.

Open
- The fight's fast tail. One Normal run in five ended at 88 s. Bigger pools would push the slow
  runs past three minutes. The cause is the core held open for all of phases 2 and 3, so a
  rising ball scores three times a body hit. Whether to close it between openings is a design
  call (see "Waiting on the user").
- The opening's worth is not shown by a bot that does not aim (above).
- In the lab most abilities and two laser modes deal few or no boss hits, because they go for
  the other bricks or miss the swaying body.
- An early tap on the award brings the calm music in over the victory theme.
- Side effects on the save at `127.0.0.1:5199`: difficulty set back to Easy. Coins and the
  ability stock changed during the runs. The helper keys I left in its localStorage are removed.
  `127.0.0.1:5187` now holds a save from the regression. `localhost:5173` was not opened.

Later
- A test harness that runs a boss's cues against a stub stage could check more than flashes,
  such as that every `anim` and sound a scene names exists.

## User request, outside the phases: DONE, 2026-11-17, Claude (Cursor agent)

The user asked for the Warden right after level 5, a boss every fifth Arcade round in both loops,
occasional lights-out Arcade rounds, and a faster Descent (see "Decisions from the user"). Every
file below is outside the Phase 5 list.

Built
- `src/core/Campaign.ts` (new): boss stops, campaign steps, `stepKey`, `stepAfter`, `validStops`.
- `public/assets/levels/boss05.tmj` (new, a copy of the lab titled "The Warden") and `index.json`
  (`"bosses": [{"after": 5, "map": "boss05.tmj"}]`).
- `src/core/SaveStore.ts`: `bossStopId`, `recordBoss`, `bossBeaten`; `recordWin` can hold the next
  level shut behind an unbeaten stop; `clearedCount` counts levels only.
- `src/core/Session.ts`: carried abilities are keyed by step (`level06`, `boss05`).
- `src/scenes/Preload.ts`, `BaseScene.ts`: load and validate the stops; dev `?stop=5`.
- `src/scenes/Play.ts`, `Results.ts`, `Pause.ts`, `Title.ts`, `Briefing.ts`, `WorldPath.ts`,
  `src/ui/icons.ts`: play a stop, route a win to the stop and on to the next level, the skull
  node and its Briefing, "Boss fight" on the title's campaign line.
- `src/core/Run.ts`: the Descent step rule (4.2 s at tier 1, 0.2 s less a tier, 1.8 s floor,
  down to 30% of that on a thin field), `isBossTier`, `isDarkTier` (from tier 3, 25%, seeded,
  never a boss tier).
- `src/systems/RunDirector.ts`: boss rounds in both loops, dark rounds, a 4-row rush after a
  Descent clear or a Descent boss, the run clock stopped during a fight.
- `src/systems/LightingSystem.ts`, `LightingMoods.ts`: `relook` changes the look mid-scene; moods
  can be torn down and rebuilt (the Forge haze is shared per scene, timers start from now).
- `src/systems/FeverSystem.ts`: `edgeAlpha` is settable, dimmed in dark rounds.
- `src/systems/BossDirector.ts`: the `defeated` doc only.
- Tests: `tests/campaign.test.ts` (new), `tests/run.test.ts`, `tests/session.test.ts`.

Verified
- pnpm typecheck, lint and build: clean.
- pnpm test: 568 passed, 1 failed. The failure is `tests/skills.test.ts` "readies the gun more
  often than bullet time", which failed before this work; the skills code is untouched.
- Browser, `127.0.0.1:5199`, stepping the loop by hand:
  - `?arcade=waves&seed=1K9ZQ2`: after wave 4 the board emptied into a dark boss room with the
    ball held. The Warden's intro, fight and death ran; then wave 6 (66 bricks, lit) and the
    level music.
  - `?arcade=descent&seed=1K9ZQ2`: steps 4.5 to 7.5 s apart at tier 1 with the ball lost now and
    then (the clock waits for a ball in play). A field clear brought 4 rows 0.38 s apart, then
    steps 2.6 s apart on the thin field. Tier 5 cleared the formation, started the Warden in the
    dark, and after the kill rushed 4 rows back under "TIER 5" with the lights on.
  - `?arcade=waves&seed=7` (Crypt) and `&seed=C&lighting=high` (Hell): wave 3 dark with a 1.5 s
    preview, wave 4 lit, wave 5 the boss. No console errors.
  - Campaign, on a fresh save with levels 1 to 5 won: the title read "Boss fight · 5/30 cleared";
    the map showed the skull after 5 as current and 6 locked; the skull opened a Briefing
    ("World 1 · Boss", The Warden, chips Warden, Lights out, Storm); Play ran the fight, the win
    saved `boss05` and unlocked 6, and level 6 started. Winning level 5 with the boss unbeaten
    led into the stop.
  - The "Boss" label on the map sat on level 4's stars; it now sits under the node.

Not verified
- The "Boss beaten" banner by eye (the screenshot lagged the game); its text is in code.
- Timed and Rounds goals with a boss round; Results after a stop lost; Pause → Restart in a stop.
- Sound by ear; a real phone.

Open
- Arcade boss rounds have no bricks, so no pickups beyond what the boss drops. Abilities carried
  in still work.
- The Arcade boss uses the campaign's pools (`EARLY_TIER_DAMAGE_MULT` unchanged). Tier 5 may be
  long or short against a run's stacked powerups; it needs a human playthrough.
- The new Descent pace is a first guess for the user to tune (`DESCENT_*` in `src/core/Run.ts`).
- Side effects: the save at `127.0.0.1:5199` was backed up, replaced by a fresh one for the
  campaign checks, and put back.

## User request: boss music waits for the title, 2026-11-17, Claude (Cursor agent)

The user found the boss music coming in over the title card's sound. `title.mp3` is loud for
4.6 s, but the music started with the reveal and the fight began at 3.6 s.

Built
- `src/core/Boss.ts`: `TITLE_SOUND_MS = 4600`; `REVEAL_MS` is now that plus 1000 (was 3600).
- `src/systems/BossDirector.ts`: the reveal is silent until `TITLE_SOUND_MS`, then `rise`.

Verified
- typecheck, lint, `tests/boss.test.ts` (77): clean.
- `?stop=5`, stepping the loop: card and title sound at 0 s, music at 4.6 s, card gone at 5.1 s,
  fight at 5.6 s with `low`.

Open
- `TITLE_SOUND_MS` must change with the title sound when the placeholder is replaced.

## User request: boss intro sounds one after another, 2026-11-17, Claude (Cursor agent)

The user still heard everything clashing. Logging every sound started showed why: the Warden's
entrance ends with a 4.4 s roar 1 s before the title, and its growl and thunder were still going,
so the title played over all three. This replaces the entry above; `TITLE_SOUND_MS` is gone.

Built
- `src/core/AudioMix.ts`: `audibleMs` (a recording is heard up to its last sample at -30 dB) and
  `detunedMs`. Tests in `tests/audioMix.test.ts`.
- `src/systems/AudioSystem.ts`: `heardMs(key)` from the decoded sound, cached; every one-shot
  records when it will have rung out, and `ringingMs()` says how long that is from now.
- `src/core/Boss.ts`: `BossState.holdUntil(ms)` keeps a timed step going at least that long and
  never shortens one; `REVEAL_MS` is back to 3600, now the shortest reveal; `MUSIC_LEAD_MS = 1000`.
  Tests in `tests/boss.test.ts`.
- `src/systems/BossDirector.ts`: the entrance lasts until its sounds have rung out. The reveal
  lasts the title sound's heard length plus `MUSIC_LEAD_MS`, the card stays for all but its last
  `CARD_LEAD_MS`, and the boss track waits for the title sound to end.

Verified
- typecheck, lint: clean. pnpm test: 575 passed, the same 1 failure in `tests/skills.test.ts`.
- `?stop=5`, real time, every sound start logged: entrance sounds from 2.0 s, the roar at 5.2 s
  (heard to about 9.3 s), the title alone at 9.46 s, the boss track at 14.17 s, the fight at
  15.1 s.

Open
- Lengths come from the files, so replacing a sound needs no code change.
- Phase scenes and the death scene are not held for their sounds.

## User request: the award waits for the victory theme, 2026-11-17, Claude (Cursor agent)

The award card and its chime went up as the 11 s victory theme began, and the calm track came in
at 6.5 s over both.

Built
- `src/core/Boss.ts`: `BossState.delayAward(ms)` and `awardMs`; the aftermath lasts the delay
  plus `AFTERMATH_MS`, and the tap guard counts from the award. `AWARD_BREAK_MS = 1000`;
  `STINGER_MS` is gone. Tests in `tests/boss.test.ts`.
- `src/systems/BossDirector.ts`: the award goes up once every sound playing at the death has rung
  out, plus `AWARD_BREAK_MS`; the calm track waits for the award's chime to ring out.
- `docs/boss-fights/design.md`: the aftermath row and the constants table.

Verified
- typecheck, lint: clean. pnpm test: 577 passed, the same 1 failure in `tests/skills.test.ts`.
- `?stop=5`, real time, from the kill: victory theme at 3.19 s (heard to about 13.5 s), the award
  at 14.68 s, its chime at 15.58 s, the calm track at 17.5 s, the end by itself at 26.7 s.

Open
- Taps do nothing while the theme plays, about 11 s on an empty field with the bars down.

## User request: Vesper, the Lure (World 2 finale): DONE, 2026-11-22, Claude (Cursor agent)

The user asked for a finished World 2 boss after level 20, and chose the Lantern Angler with the
twist that Vesper, the guide since Chapter I, is its lure. The plan was
`vesper_lantern_angler_boss_702f3e26.plan.md`. Two checks with the user: the look (a mix of two
concept takes) and phase 1's feel in the browser (approved).

The fight: three phases on a 96 BPM beat (pools 20, 28, 30). The Lure: wisps to catch and return,
ink from eyes that open over your lane, a decoy at the paddle. Feeding: the angler surfaces; a
lunge on your half, four false lights of which one is real, ink lanes walking the field in the
dark. Breach: four cryo-pods slide out; breaking one leaves a permanent light, so you choose
between sight and damage. Frenzy bites, a skull among homing wisps, and a narrowing undertow.

Built
- `src/bosses/angler.ts`, `anglerRig.ts`, `anglerMusic.ts`: the boss, its rig (lit head, lure
  and pods, a stalk curve, eyes, beat pulse, lights for the lantern, throat and pods) and its cue
  sheet. Entrance, Surfacing, Breach and death scenes. The death relights the room
  (`lighting.celebrate()`), which otherwise sat black through the victory theme.
- Framework: `look: 'decoy'` and `offset` on shots, the `returned` event, `HazardLooks` `skull`,
  `decoy`, `beam`, `shotGlow` and `fx` (`src/core/Boss.ts`, `src/systems/HazardSystem.ts`); a boss
  `music` track; the reveal's bar fill capped at 1 (`BossDirector.ts`).
- Scenery `abyss`: the Crypt's layers sunk and greened, the lake and ark stills, ripple, reflect,
  snuff, surge and `crossStill` in `ParallaxBackdrop.ts`; phone and 4x sets.
- FX `src/fx/library/angler.ts`; `abyss` added to the `only:` lists that had `crypt`.
- Audio: 15 `angler/*` effects in `scripts/build-boss-audio.py`, three Vesper lines, the track
  from `scripts/build-angler-music.py`. `AUDIO_ASSETS` +18.
- Cutscene `vesper-lure` (The Black Water, `src/cutscenes/lure.ts`) with `cs_plate_lake`.
- Campaign: `BOSS_IDS`, the Tiled Boss enum, `boss20.tmj`, and in `index.json` the stop after 20
  and the scene before it.
- Docs: `authoring.md` (the Angler as an example, slag, decoys, looks, `?stop=`).
- Tests: `bosses.test.ts` (sound count), `campaign.test.ts` (stop 20 is the Angler),
  `cutscenes.test.ts` (`vesper-lure` plays into the stop, goes to `abyss`, beats in order).

Verified
- typecheck: clean. lint: one error, `src/art/procedural.ts:465` (`h` unused), in committed code
  this work did not touch. pnpm test: 984 passed, 1 failed, the known `tests/skills.test.ts` one.
- Headless Chrome at `localhost:5199`, the paddle steered by script, god mode on, no console
  errors in any run: `?stop=20` from the entrance to the kill on Easy, and into phase 2 on Normal
  and Hard; every phase with `&phase=N` on Normal, phase 3 on to the award and Level 21 with
  reduced motion; each phase 1 attack with `&attack=`; phase 3 on the 16:9 stage;
  `?scene=vesper-lure` start to finish.
- The flash test covers the Angler's scenes.

Not verified
- Sound by ear: every effect, the voices and the track are synthesized and have not been heard.
- A human Normal run against the plan's 3 to 4 minutes. The scripted paddle took about 55 s on
  Easy and was in phase 2 after 90 s on Hard, which says little about a person.
- A real phone.

Open
- With a fresh save, `?stop=20` shows the "New: Phantoms" hint over the title card. In the
  campaign the phantoms were met earlier.


## User request: The Overseer (World 3 finale): DONE, 2026-11-22, Claude (Cursor agent)

The user asked for the World 3 finale from `docs/boss-fights/world3-finale.md`, following its
work order. Check-in 1: the user chose look B (Panopticon) and the default story. Check-in 2,
after playing `?stop=30`: phase 1 was too hard, the Mirror too fast, and the look should be
lighter; all three were eased (see Deviations).

The fight: the campaign's last stop, after level 30, on a 120 BPM beat (pools 24, 32, 36).
Recognition: the Mirror on its rail stands where the paddle would in a mirror; scans, packets
and the Warden's echo. Prediction: the eye recompiles, the heatmap comes up, and the Mirror
chases where the ball will cross its rail, feinting every fourth return; the Angler's echo (catch
the slag to freeze the Mirror), `overwrite` (a row of a cleared level built as bricks). Kernel:
the chamber falls into the data tunnel, the eye opens wide, the Mirror splits (the left copies
you, the right chases the ball); the Crucible's echo, `purge` (the safe gap in your least-used
zone) and `total-recall`. The death cracks the eye, dissolves the Mirrors into warm light,
relights the room and opens the door to daylight; then the `ending`.

Built
- Framework (`src/core/Boss.ts`, `src/systems/BossDirector.ts`, `src/systems/BossBody.ts`,
  `src/core/Campaign.ts`, `src/scenes/Title.ts`):
  - a stop after the last level (`validStops` allows `after === levelCount`; nothing follows
    it; the title line says "Boss fight" until it is beaten);
  - `BossStage.steer` with `BossDef.tick` and `BossTuning.steer` (0.85 / 1 / 1.12);
  - `BossStage.balls()` and `sinceReturn(partId)`;
  - habits (`HABIT_BIN` 100 px, `HABIT_HALF_LIFE_MS` 20 s) as `BossView.habits` and
    `BossStage.habits`;
  - `AttackPlan.bricks`.
  Tests in `tests/boss.test.ts`, `tests/campaign.test.ts`.
- Boss: `src/bosses/overseer.ts` (parts, poses `shut`/`open`/`wide`, eight attacks, three
  phases, `on()`, `tick`, entrance, `recompile` and `kernel` phase scenes, death),
  `overseerRig.ts` (housing, iris, shutters, lens, Mirrors, rail, heatmap, ghost line, glitch,
  divide, dissolve, door, lights, reduced motion), `overseerMusic.ts` (cue sheet). Registered in
  `src/bosses/index.ts`; `BOSS_IDS`; the Tiled Boss enum.
- Map: `public/assets/levels/boss30.tmj` ("The Overseer", darkness 0.25, lights out), and in
  `index.json` the stop after 30 and the scenes `the-door` (before `boss30`) and `ending`
  (after it).
- Scenery `kernel` (`scripts/build-backdrops.py`, `src/art/backdrops.ts`, both JSON sets): the
  Mainframe's layers under a chamber still walled with cameras, a tunnel to fall into, and the
  phone and 16:9 sets. `kernel` added to the FX `only:` lists and palettes next to `mainframe`,
  to `SCENERIES` in `src/scenes/FxLab.ts`, and to the cutscene actors' sprite sets
  (`ActorStage.ts`).
- Art: rig sheets in `art-src/bosses/overseer/` sliced by `scripts/build-bosses.py`; cutscene
  plates `cs_plate_door` and `cs_plate_daylight` (`scripts/build-cutscene-art.py`), made with
  Cursor's GenerateImage.
- Audio: 16 `overseer/*` effects appended to `scripts/build-boss-audio.py`, the track from
  `scripts/build-overseer-music.py` (`boss-overseer.mp3`), two Overseer lines through the
  `MACHINE` chain, and the ending's `cs_dawn` bed (`scripts/build-cutscene-audio.py`).
  `AUDIO_ASSETS` +18; the boss sound count in `tests/bosses.test.ts` is 65.
- Cutscenes: `src/cutscenes/door.ts` (`the-door`) and `src/cutscenes/ending.ts` (`ending`,
  closing on "Super Breaker / The End"), registered in `src/cutscenes/index.ts`.
- FX: `src/fx/library/overseer.ts` (`OVERSEER_FX`): slag and packet trails, the splash, and
  `recompile`, `crack`, `dissolve`, `daylight` for the scenes. Registered in `FX_LIBRARY` and used
  by the boss's `hazards.fx` and its cues.
- Docs: `authoring.md` (the Overseer as an example; steering and `tick`; `habits`;
  `AttackPlan.bricks`; the last stop; `pose` in cues; `?stop=30`).
- Tests: `bosses.test.ts`, `campaign.test.ts` (the Overseer after 30, the stop is the last
  step), `cutscenes.test.ts` (`the-door` and `ending` placement, scenery and beats),
  `fx.test.ts` (now checks `ANGLER_FX`, which it had left out, and `OVERSEER_FX`).

Verified
- `pnpm typecheck`: clean. `pnpm lint`: the one known error, `src/art/procedural.ts:465`.
  `pnpm test`: 1066 passed, 9 skipped (the sprite checks, which skip for rig bosses as they did
  for the Angler), 1 failed: the known `tests/skills.test.ts` one; `src/core/Skills.ts` is
  untouched.
- Headless Chrome at `localhost:5199` with the paddle steered by script and god mode on; no
  console errors or `[boss]` fairness warnings in any run:
  - every attack alone with `&attack=<id>`, at the phase it belongs to: each was seen;
  - every phase with `&phase=N`; the `recompile` and `kernel` scenes and the death, played
    into from the phase before;
  - `?stop=30` on Easy; phase 3 on Hard at 1600x900; phase 2 with reduced motion;
  - the whole run: `?level=30`, level won, `the-door` (tap holds tapped), the fight to the
    award, Results, `ending`, then the world map with the skull after 30 beaten.
- The flash test covers the Overseer's scenes.

Not verified
- Sound by ear: every effect, the track, the dawn bed and the two voice lines are synthesized
  or processed and have not been heard.
- A human Normal run for length. The scripted paddle and forced damage say nothing about it.
- A real phone.

Deviations from the documents
- Parts: fitted to the art, not the proposal. Crown and ring are steel, the eye is 4x5 at col 8,
  row 5 (weak 3), the lids are two 2x1 halves, and the Mirror sits at row 20 rather than 12.
- Mirror speeds are 260 px/s (copying) and 230 (chasing), not the proposed 380 and 300; phase 1
  was eased and the arena lightened at check-in 2. Arena darkness is 0.25.
- Habits count only while a ball is in play, not over the whole fight clock, so a serve or a
  scene teaches the boss nothing.
- Echo looks (3.5): not built. The Overseer has its own glitched skull and decoy art.
- `pose` in cues: authoring.md listed it under state a cue may not change, but the code allows
  it and the Angler used it. The Overseer's scenes only move to the pose their phase holds
  anyway; authoring.md now says so.
- Scenes cannot land stills. `the-door`'s last beat and the `ending`'s opening therefore show
  the kernel's shaft layers rather than the chamber, which only appears when the fight lands it.
- The door is a soft daylight glow from the rig, not painted art.
- `scripts/build-backdrops.py` got a feather and speck fix for the chamber still. The Abyss's
  16:9 set, built before the fix, was not rebuilt.
- Voice: only two Overseer lines are recorded, because the Ludo credits ran low. Every new line
  in `the-door` and the `ending` types out with blips (`RECORDED` is empty in both files).
- Formatting: Prettier rewrapped parts of files it touched that were not formatted before
  (`Boss.ts`, `backdrops.ts`, `palettes.ts`, some tests). `FxLab.ts` was put back to a one-line
  change.

Open
- `docs/boss-fights/README.md` shows a one-line change that adds `world3-finale.md` to its
  table. It is probably the user's, made with the handoff; not checked.
- After the last win, Results' "Play again" plays the `ending` and then replays the fight.
  That is `Results.ending()` as it was; "Map" plays the ending and lands on the map.
- Distortion in FX presets (`crack` here, and the Angler's and boss presets) ignores reduced
  motion; `FxEngine` applies it whatever the setting.
- Lines to record if the user tops up Ludo credits or picks another voice: three Overseer and
  two Vesper lines in `the-door`, the Vesper lines and narration in the `ending`.

Later
- Corrupted echo looks of the earlier bosses (3.5).
- Painted art for the open door.
