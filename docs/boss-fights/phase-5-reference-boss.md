# Phase 5: reference boss and authoring guide

Read [README.md](README.md) and [design.md](design.md) first. Phase 4 must show PASS in
[STATUS.md](STATUS.md).

## Goal

The Warden exercises every part of the API and is tuned enough to judge the framework by. The
documents match the code. Someone who has never seen this work can add a second boss from the
guide alone.

This phase adds no framework features. If the Warden cannot use part of the API without a
framework change, that is a finding to report, not something to build.

## Read first

- Everything under `src/bosses/`, `src/systems/BossDirector.ts`, `src/systems/BossBody.ts`,
  `src/systems/HazardSystem.ts`, `src/core/Boss.ts`, `src/core/Cues.ts`, and the three test
  files.
- Every entry in [STATUS.md](STATUS.md), for deviations and open items.
- The root `README.md`: its dev-parameter paragraph, its project structure list, and its
  "Generated art" section.

## Build

### 1. Coverage

Make a table in STATUS.md with one row for each of these and where the Warden uses it. Add the
smallest use for anything missing.

- Parts: a `normal` part, a `steel` part, a `weak` multiplier above 1, a part with a `light`.
- A sprite with all five animations seen in play.
- A pose, a `motion`, a `setup` that spawns bricks, a `setup` that retires a part.
- Two phases with different `intensity`, an `epithet`.
- An `entrance`, an `enter` and a `death`, each using `stage.light`, `stage.impact`, a sound and
  `stage.anim` at least once across the three.
- A deck of more than one attack; a shot, a beam and a skull; a `jam` and a `shrink`; an
  `opening` with a pose and a lock; a `tell.sfx`; a plan that uses `rng`, one that reads the
  paddle, one that reads `phaseProgress`.

### 2. Tuning

Play the fight on Easy, Normal and Hard and adjust only the Warden's numbers and the constants
table in `src/core/Boss.ts`. Aim for:

- A clean Normal run takes two to three minutes from the first launch to the last hit.
- Every attack can be avoided on reaction by someone seeing it for the first time.
- The opening is worth using: hitting the core in an opening is clearly faster than hitting the
  body.

Measure and record in STATUS.md: the time and lives lost for one run on each difficulty; hits
dealt to the pool by one use of each ability and by ten seconds of each laser mode you can
reach; the largest hazard count seen. List every number you changed and why.

### 3. `docs/boss-fights/authoring.md`

A guide for adding a boss, written from the code as it is, not from design.md. Every signature
in it is copied from the source. It covers, in order:

1. What a boss is here, in five sentences.
2. The steps: add the id; make the sprite sheet and run `scripts/build-bosses.py`; write the
   `BossDef`; register it; make or edit a map with the `boss` property; run the tests.
3. Parts, poses and the sprite, and how to line them up with `?debug`.
4. Phases, `setup`, intensity.
5. Cutscenes: what a cue may and may not do.
6. Attacks: plans, the fairness rules, openings and lock-on, the skull.
7. The dev tools: every URL parameter, key and console handle.
8. A checklist before calling a boss done.

Use the Warden for every example. Keep it under 300 lines.

### 4. Bring the documents up to date

- `design.md`: correct every signature, constant and rule that differs from the code. Where the
  code deliberately departed from the design, say what and why in one line each under a new
  heading "As built".
- Root `README.md`: add the boss dev parameters to the dev paragraph, the new folders and files
  to the project structure list, and a short "Boss sprites" paragraph beside the other art
  scripts.
- `STATUS.md`: a closing summary for the user: what exists, what is placeholder (music moods,
  stinger, sounds, the Warden's art), what was left out, and every item waiting on their ear or
  eye from the earlier phases.

### 5. Regression pass

Play each of these for at least one full level or wave and record the result: `?level=1`,
`?level=10`, `?level=24`, `?level=30`, `?arcade=waves`, `?arcade=descent`, a fresh save through
the tutorial, and the boss lab on a phone-shaped window, a desktop window and a 16:9 window with
wing plates. Run `pnpm build` and confirm it succeeds.

## Do not

- Do not add framework features, hazards, steps or HUD elements.
- Do not put a boss in a shipped level or in `index.json`.
- Do not rewrite design.md's decisions; only correct facts and add "As built".
- Do not create documents other than `authoring.md`.

## Checks

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

Manual:

1. The coverage table is complete and each row can be seen in the lab.
2. The three tuning targets are met, with the measurements recorded.
3. Following `authoring.md` literally, without reading other documents, is enough to add a
   second boss id with one part and one phase and see it in a copy of the lab map. Do this, record
   that it worked, then remove the second boss and the copied map again.
4. Every signature and constant in `design.md` and `authoring.md` matches the source.
5. The regression pass is recorded.

## For the user to confirm

- The whole fight on a phone, a desktop and a TV with a controller.
- Everything listed as waiting on them in the closing summary.

## Record in STATUS.md

The coverage table, the measurements, the changed numbers, the regression results, the closing
summary.
