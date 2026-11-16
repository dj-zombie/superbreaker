# Phase 3: cinematic flow

Read [README.md](README.md) and [design.md](design.md) first, especially "The fight flow" and
"The boss track". Phase 2 must show PASS in [STATUS.md](STATUS.md).

## Goal

Every boss fight runs the same arc: silence, the boss's entrance, the music swelling in under a
title card with its name, the fight, a staged change between phases, a final blow that cuts the
music to a stinger and a death scene, then calm music before the level ends.

When this phase is done, `?map=bosslab.tmj` starts dim and silent with the ball held; the Warden
drops in with light and sound; the boss track fades in as a band with its name crosses the field
and the health bar fills; the hint appears and play starts. Emptying the first pool freezes play
for a short scene before phase 2. The last hit freezes play, cuts the music, plays the stinger
and the death animation, then calm music fades in, the bonus pops, and the results screen
follows without the usual fanfare. A tap skips the intro and the phase scene, never the death.

## Read first

- `src/core/Onboarding.ts`, `tests/onboarding.test.ts`: a pure step machine and its tests.
- `src/scenes/Play.ts`: `create` (its last twenty lines), `update`, `updateFrozen`, `updateCoach`,
  `syncFreeze`, `updateAttachedBalls`, `onTap`, `launch`, `fireSlot`, `useSkill`, `useStock`,
  `updateMusic`, `introCard`, `showHint`, `clearHint`, `onExplosion`, `win`, `showClearBanner`,
  `gameOver`, `requestPause`, and the RESUME handler in `create`.
- `src/systems/JuiceSystem.ts`: `hitStop`, `holdWorld`, `inHitStop`, `shake`, `ring`, `burst`,
  `popText`.
- `src/systems/MusicEngine.ts`: all of it. `src/systems/AudioSystem.ts`: `playMusic`,
  `steerMusic`, `stopMusic`, the private `haltMusic` and `musicEngine`, `refresh`, `duckMusic`,
  `sfx`, `fanfare`, `thunder`, `whoosh`.
- `src/art/music.ts`, `src/art/music.json`, `tests/music.test.ts`.
- `src/systems/Backdrop.ts`: `setDark`. `src/systems/LightingSystem.ts`: `flash`, `flashAmbient`,
  `pulse`, `celebrate`, `addLight`, `LightOptions`, `Light`.
- `src/config.ts`: `AUDIO_ASSETS`.

## Build

### 1. `src/core/Cues.ts` and `tests/cues.test.ts`

`CueSheet` as in design.md. Cues are returned in `at` order whatever order they were given in. A
cue at 0 comes due on the first `tick`, including `tick(0)`. A cue at exactly `lengthMs` comes
due. `done` is true once `lengthMs` has passed or `skip()` was called. After `done`, `tick`
returns nothing.

Tests: order; each cue is returned exactly once; one large `dt` returns every cue passed, in
order; a cue at 0; a cue at `lengthMs`; `skip()` drops cues not yet due and sets `done`; an empty
sheet of length 0 is done after its first tick.

### 2. `src/core/Boss.ts`

Members tagged P3: the `intro` option, `stepMs`, `tick`, `skip`, `BossSpec.entranceMs`,
`deathMs`, `phases[].enterMs`, `BOSS_MOODS`, `BossMood`, `BossIntensity`, `BOSS_MOOD_FALLBACK`,
and the constants `HUSH_MS`, `REVEAL_MS`, `AFTERMATH_MS`, `SKIP_GUARD_MS`, `BOSS_SWELL_S`,
`BOSS_STINGER`, `HUSH_DARK`, `ENTRANCE_DROP`.

- With `intro`, the state starts in `hush`. `tick(dt, ballInPlay)` advances `stepMs` and moves
  `hush` to `entrance` after `HUSH_MS`, `entrance` to `reveal` after `entranceMs`, `reveal` to
  `fight` after `REVEAL_MS`, `transition` to `fight` after the phase's `enterMs`, `finale` to
  `aftermath` after `deathMs`, `aftermath` to `done` after `AFTERMATH_MS`. Each change returns a
  `step` event. Time left over carries into the next step, and a zero-length step is entered and
  left in the same tick, with an event for each.
- `damage` that empties a pool other than the last returns the `phase` event and, when the new
  phase's `enterMs` is above zero, also enters `transition` and returns that `step` event.
  Without `enterMs` it stays in `fight`, as in Phase 1.
- `skip()`: in `hush`, `entrance` or `reveal`, once `SKIP_GUARD_MS` has passed since the state was
  created, go to `fight`. In `transition`, once `SKIP_GUARD_MS` has passed in that step, go to
  `fight`. Otherwise return `[]`.
- `tick` does nothing in `fight` yet. Phase 4 uses `ballInPlay`; until then name the parameter so
  lint accepts it unused.
- Phase 1's tests stay as they are and must still pass.

Tests: the intro timeline to the millisecond; a zero-length entrance emits `entrance` and
`reveal` in one tick; `damage` during the intro does nothing; skip before and after the guard;
skip in `transition`; skip in `fight`, `finale` and `aftermath` returns `[]`; a phase with
`enterMs` enters `transition` and returns to `fight` with the new phase's full pool; the
finale-aftermath-done timeline; no `intro` still starts in `fight`.

In `tests/music.test.ts`: every boss mood in `BOSS_MOOD_FALLBACK` maps to a mood that has a
playlist in `MUSIC_TRACK`.

### 3. Audio

- `MusicEngine.play(mood, volume, fadeIn = 0)`: when it starts a new play-through and `fadeIn` is
  above zero, the session's gain ramps from 0 to 1 over `fadeIn` seconds. Nothing else changes.
- `AudioSystem.bossMusic(mood: BossMood)`: with the same guards as `playMusic` (sound present,
  music setting on, audio unlocked, engine available), set the wanted and current key to
  `music`; if the engine is not playing, `play(BOSS_MOOD_FALLBACK[mood], <the level music's
  volume>, BOSS_SWELL_S)`, otherwise `setMood(BOSS_MOOD_FALLBACK[mood], true)`.
- `AudioSystem.bossStinger()`: plays `BOSS_STINGER` through `sfx`.

Do not build a second engine or a second cue sheet. That is the follow-up described under "Left
out" in design.md.

### 4. The director

Types tagged P3: `Cue`, `Cutscene`, `PhaseDef.intensity`, `PhaseDef.enter`, `BossDef.epithet`,
`entrance`, `death`, the P3 members of `BossStage`, `BossHost` and `BossDirector`.

- Build the state with `intro` unless `opts.startPhase` is given. Derive `entranceMs`, `deathMs`
  and each `enterMs` from the cutscenes' `lengthMs`, zero when absent.
- Each `update(dt)`: compute the clock step as in Phase 1, call `state.tick`, apply pending hits,
  then handle every event in order. All of the below happens in `update`.
- **Cutscenes.** A running cutscene is a `CueSheet` ticked with the clock step; each due cue's
  `run(stage)` is called. Lights from `stage.light` and tweens from `stage.tween` belong to the
  running cutscene and are killed and stopped when it ends or is skipped.
- **At construction with an intro (`hush`).** `audio.stopMusic('fade')`. Dim with
  `host.backdrop.setDark(HUSH_DARK)` unless reduced motion is on. Do not spawn the body. The HUD
  view has `shown: false`. Leave the label alone.
- **`entrance`.** Spawn the body. While the step lasts, the sprite's alpha and height above rest
  follow `stepMs / entranceMs` (from 0 and `ENTRANCE_DROP` to 1 and 0), computed each frame from
  the state, not tweened. Start the `entrance` cutscene.
- **`reveal`.** End the entrance cutscene. The sprite is at rest and opaque. Call
  `host.titleCard(epithet ?? the world's name, name, REVEAL_MS - 500)` and keep the remover. Set
  the label. The HUD view is `shown` with `health` rising from 0 to 1 across the step. Lift the
  dim with `setDark(0)`.
- **`fight`.** However it was reached, make the end state true: body spawned, at rest and opaque;
  any cutscene ended; the title card removed if it is still up; dim lifted; label set; HUD shown.
  Run the `setup` of each phase up to the current one that has not run yet, apply the pose, and,
  when coming from the intro, call `host.showHint()`.
- **`phase` followed by `transition`.** Add the bonus, set the label, start the phase's `enter`
  cutscene. The phase's `setup` and pose wait for `fight`.
- **`phase` without `transition`.** As Phase 2.
- **`finale`.** `audio.stopMusic('cut')`, `audio.bossStinger()`, play the `death` animation and
  hold its last frame, call `host.impact` at the body's centre, start the `death` cutscene.
- **`aftermath`.** End the cutscene. Retire every part, fade the sprite out and destroy it,
  `shatterBelow(-Infinity)`, add `BOSS_DEFEAT_BONUS` with a `popText`, set the HUD view to null.
- **`done`.** Become inactive and call `host.defeated()`.
- `frozen`: `transition`, `finale`, `aftermath`. `holdServe`: `hush`, `entrance`, `reveal`.
  `cinematic`: active and not in `fight`.
- `music`: null in `hush`, `entrance` and `finale`; `rise` in `reveal`; the phase's intensity in
  `fight` and `transition`; `rest` from `aftermath` on. A phase's default intensity is `low` for
  the first, `high` for the last, `mid` otherwise, and `mid` for a one-phase boss.
- `skip()`: returns false when not `cinematic`. Otherwise passes to `state.skip()`, handles the
  events, and returns true, so the tap does nothing else.
- `stage.anim(name)` plays that animation until the step next changes. `stage.impact` calls
  `host.impact` with defaults of scale 1 and `palette.danger`.

### 5. `src/scenes/Play.ts`

- Extract the band in `introCard()` into `private titleBand(kicker, name, holdMs): () => void`,
  which returns a function that removes the band at once. `introCard()` calls it with today's
  timings, so levels without a boss look exactly as before, in both the normal and the calm
  branch.
- `private bossImpact(x, y, scale, color)`: a ring, a burst, a shake, `lighting.flash` at the
  point, `scenery.flash`, `lighting.flashAmbient`, and a haptic, sized by `scale`. Model it on
  `onExplosion` but with no `juice.flash`, no sound and no `hitStop`.
- `create`: on a boss level whose director starts with an intro, skip `showHint()`,
  `introCard()` and `audio.playMusic('music')`. `juice.holdWorld` and the RESUME handler also
  hold while `boss?.frozen`.
- Freezing: `update` takes the `updateFrozen` path when the coach or the boss is frozen.
  `syncFreeze` treats either as frozen. Call `syncFreeze()` directly after `updateCoach(dt)` in
  both `update` and `updateFrozen` instead of inside `updateCoach`, and once more right after
  `boss.update(dt)` in `update`. `updateFrozen` also calls `boss?.update(dt)` and the boss music
  line below.
- `launch`, `fireSlot`, `useSkill` and `useStock` return while `boss?.cinematic`.
- `onTap`: after the clear-banner check and before launching, `if (this.boss?.skip()) return`.
- `updateAttachedBalls`: the serve clock also waits while `boss?.holdServe`.
- `updateMusic`: while a boss is active, call `audio.bossMusic(mood)` when `boss.music` is not
  null, and return without steering.
- `win()`: on a level with a boss, do not call `audio.stopMusic()`, `audio.fanfare()` or
  `juice.flash`, and pass `tail: false`.
- `bossHost()` gains `titleCard`, `showHint` and `impact`.

### 6. The Warden

Give it `epithet`, an `entrance` (about 1800 ms), an `enter` on phase 2 (about 1200 ms) and a
`death` (about 2200 ms). Each is a handful of cues that use light, particles and sound together
through `BossStage`: for example a rumble and a growing light as it arrives, a roar
(`s.anim('tell')`) with an impact, a flash as the guard opens, a spreading run of impacts as it
dies. Use only sound keys in `AUDIO_ASSETS` and only methods you have read. Keep to three lights.

### 7. Content tests

`tests/bosses.test.ts`, for every boss: every cue's `at` is within its cutscene's length; the
first phase has no `enter`; every cutscene has a positive length.

## Do not

- Do not build attacks, hazards, lock-on, or the `tell` and `open` animation rules.
- Do not let a cue change fight state: no retiring, spawning, posing or damaging from a cue.
- Do not add letterbox bars, hide the HUD, or sync cues to the beat.
- Do not change the fanfare, the clear banner or the results screen for levels without a boss.

## Checks

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

Manual, at `?map=bosslab.tmj` with sound on. Record what you saw and heard.

1. The whole arc plays in order as described under "Goal". The ball cannot be launched and
   abilities do nothing until the hint appears. Paddle movement works throughout.
2. The music is silent through the hush and entrance, fades in at the reveal, and changes with
   phase 2. On the last hit it stops at once and the stinger plays; calm music fades in before
   the results. No fanfare plays.
3. A tap during the intro, after a moment, jumps to the fight: boss in place, bar full, band
   gone, dim lifted, music playing, hint showing. A tap in the first 400 ms does nothing.
4. A tap during the phase scene ends it and phase 2 is fully set up (pose, bricks). A tap during
   the death scene does nothing.
5. Pause and resume in each step: nothing advances while paused, and play is still frozen after
   resuming in a frozen step.
6. Empty the pool with several balls in the air: they freeze in place and carry on afterwards.
7. Lose all lives: game over as usual. Retry: the intro plays again and can be skipped.
8. Turn the music setting off and on during the fight: the boss music comes back in the right
   mood within a moment. Turn it off during the hush: it stays silent.
9. Reduced motion on: no dim, the title band fades instead of slamming, no camera flash anywhere
   in the fight.
10. `&phase=2`: starts straight in the fight at phase 2 with no intro, and phase 1's and phase
    2's setups have both run.
11. `?level=1`: the intro card, hint, music, clear banner and fanfare are exactly as before.
    `?arcade=waves` plays as before. The tutorial on a fresh save still freezes and resumes play
    correctly.

## For the user to confirm

- Whether the placeholder moods and stinger are acceptable until the boss song exists.
- The pacing of the hush, reveal and aftermath, and the Warden's three scenes.
- The step from the aftermath into the next level's music cannot be heard in the lab, because the
  lab is always the last level. It follows from `playMusic` returning early; confirm it when a
  boss sits in the campaign.

## Record in STATUS.md

Each manual check; the sound keys the Warden uses; the measured length of the whole intro; any
change to non-boss code beyond the list above; anything left open.
