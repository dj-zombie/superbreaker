# Boss fights

Work orders for building the boss fight framework. Nothing here is built until
[STATUS.md](STATUS.md) says so.

| File | What it is |
| --- | --- |
| [design.md](design.md) | Decisions, the fight flow, the API contract, content rules. Read it before any phase. |
| `phase-N-*.md` | One work order per phase. One agent, one session, one phase. |
| [review.md](review.md) | The reviewer's work order. A separate agent runs it after every phase. |
| [STATUS.md](STATUS.md) | The log. Every agent writes to it before it stops. |

## Phases

1. [A boss you can kill](phase-1-killable-boss.md): a level names a boss, the boss's parts are
   bricks, every weapon damages it, pools drain through phases, the level ends when it dies.
2. [Sprite body and HUD](phase-2-sprite-and-hud.md): the Warden's generated sprite sheet, the
   animated sprite over the parts, poses, motion, the health bar on both HUD layouts, dev tools.
3. [Cinematic flow](phase-3-cinematic-flow.md): quiet start, entrance, music swell and title card,
   phase transitions, the final blow, the stinger, the calm afterwards.
4. [Attacks](phase-4-attacks.md): planned attacks, warnings, hazards that hinder the paddle, the
   skull that takes a life, openings with lock-on, fairness tests.
5. [Reference boss and authoring guide](phase-5-reference-boss.md): the Warden uses every part of
   the API, the guide is written from the code as built, the design doc is brought up to date.

Each phase leaves the game working and is only reachable through `?map=bosslab.tmj` in dev
builds. No shipped level changes in any phase.

## How a phase runs

1. The tree is clean (`git status` shows nothing) and STATUS.md shows the previous phase as PASS.
2. An implementing agent reads this file, design.md and the phase file, does the work, and writes
   its handoff in STATUS.md. It does not commit.
3. A reviewing agent, started fresh, follows review.md and writes a verdict in STATUS.md.
4. PASS: the phase is committed as one commit by whoever is running the phases (see "Commits").
   FIX: the same implementer, or a new one, addresses the listed items, then review again.
   RESTART: a new agent takes over from the STATUS.md entry.
5. Two FIX rounds without a PASS become a RESTART.

## Rules for the implementing agent

1. **The code is the source of truth.** Before using any function, field, texture or sound, open
   the file and read it. If design.md or the phase file disagrees with the code, the code wins:
   small mismatches (a renamed symbol, a moved line) you adapt to and note in STATUS.md; a
   mismatch that changes the design is a stop condition.
2. **Invent nothing.** Use only APIs you have read in this repo. Sound keys must be in
   `AUDIO_ASSETS` in `src/config.ts`. Brick textures must be keys of `BRICK_TINT`. New small
   textures are painted in `src/art/procedural.ts` the way existing ones are.
3. **Build what the phase lists and nothing else.** Ideas go under "Later" in STATUS.md. No new
   dependencies, no new input bindings, no changes to shipped levels.
4. **Stay inside the phase's file list.** Touching another file is allowed only when the phase
   cannot work without it; say which and why in STATUS.md.
5. **Fight logic runs on the fight clock.** Game state never changes from `setTimeout`,
   `setInterval`, `scene.time.delayedCall`, `scene.time.addEvent`, a tween callback, an animation
   callback, `Date.now` or `performance.now`. Tweens and animations are for looks only.
6. **No `Math.random` in boss code.** Use `Rng` from `src/core/Rng.ts`.
7. **No shortcuts to green.** No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`,
   skipped or deleted tests, weakened assertions, retries or sleeps in tests, try/catch that hides
   an error, or branches that exist only to satisfy a check.
8. **Tests assert behaviour.** A test that would still pass if the feature were broken is not a
   test. Do not test private details.
9. **Follow the house style.** Read two neighbouring files first. One-line `/** ... */` comments
   that say why, constants in `UPPER_SNAKE` with a comment and units, `as const` id arrays with
   `Record<Id, Def>` tables, hosts made of closures. No emojis.
10. **Respect accessibility.** Reduced motion is `calm()` / `lighting.calm` / `juice` guards.
    Whole-screen flashes go through `lighting.flashAmbient`; boss code never calls `juice.flash`.
11. **Verify before you claim.** Run `pnpm typecheck`, `pnpm lint` and `pnpm test`, and do the
    phase's manual checks in a browser. Write down what you ran and what you saw. If you could not
    check something (no browser, no sound), say so; it stays open until someone checks it.
12. **Do not commit, stash, reset or discard anything** unless the person running the phases told
    you to.

## When to stop

Stop working, write the handoff with the heading `STOPPED`, and say why, when any of these is
true. Stopping early is the right outcome; a fresh agent will continue.

- The same check has failed three times after three different fixes.
- Finishing would mean weakening an acceptance item, a test or a rule above.
- A fact in design.md or the phase file is wrong in a way that changes the design.
- The phase needs a behaviour change for normal, non-boss play that the phase file does not list.
- You are using an API you have not read, or you cannot explain why your code works.
- You have rewritten the same file's approach twice and are about to start a third.
- You are running low on context. Leave enough to write a complete handoff.

## Handoff

Append an entry to STATUS.md using the template there. It must contain: what was built (files),
what was verified and how (commands and results, manual checks done), every deviation from the
docs with the reason, anything not done, open questions, and "Later" ideas. Do not describe
anything as done or working that you did not check.

## Commits

Agents do not commit by default. After a PASS, the person running the phases makes one commit for
the phase, or tells an agent to. The repo's commit messages are one long plain-English sentence
that says what changed for the player or developer (see `git log`).

## Commands

| Command | Use |
| --- | --- |
| `pnpm install` | Once. pnpm 9 (`packageManager` in `package.json`). |
| `pnpm dev` | Dev server at `http://localhost:5173`. |
| `pnpm typecheck` | `tsc --noEmit` for the game and the desktop shell. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Vitest, node environment. Only `src/core`, art data and boss content run here. |

Useful dev URLs (dev builds only): `?level=1`, `?map=bosslab.tmj`, `?arcade=waves`, `?debug`,
`?lighting=low`. The Phaser game is `window.game`; from Phase 1 the running boss is `window.boss`.

## Kickoff prompts

Implementer:

> Implement Phase N of the boss fight framework in this repository. Before anything else, read
> `docs/boss-fights/README.md`, `docs/boss-fights/design.md` and `docs/boss-fights/phase-N-*.md`
> in full, then the newest entries in `docs/boss-fights/STATUS.md`. Follow the rules and stop
> conditions in the README exactly. Finish by writing your handoff in STATUS.md. Do not commit.

Reviewer:

> Review Phase N of the boss fight framework in this repository. You did not write it. Read
> `docs/boss-fights/review.md` and follow it exactly. You may run commands and the game, but you
> may not edit code. Finish by writing your verdict in `docs/boss-fights/STATUS.md`.
