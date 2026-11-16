# Reviewing a phase

You are reviewing work you did not write. Your job is to find out whether the phase is done
properly, not to finish it. You may run commands and the game. You may not edit code; the only
file you write is [STATUS.md](STATUS.md).

Be specific and be fair: every finding names a file and what is wrong, and anything you could not
check is listed as not checked rather than assumed.

## Steps

1. **Read** [README.md](README.md), [design.md](design.md), the phase file, and the implementer's
   handoff in STATUS.md. Note every deviation and open item it declares.
2. **See what changed**: `git status` and `git diff` (plus untracked files). Read every changed
   line. The tree should hold this phase's work and nothing else.
3. **Run the checks yourself**: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Do not rely on the
   handoff's results.
4. **Check scope.** Every changed file is in the phase's list or explained in the handoff.
   Nothing tagged for a later phase in design.md was built. Nothing under "Do not" was done.
   Nothing extra was added.
5. **Check every item under "Build"** against the code. For each: done, not done, or done
   differently (say how).
6. **Check that nothing was invented.** For every call the new code makes into existing code,
   open the callee and confirm it exists with that signature and does what the caller assumes.
   Confirm every sound key is in `AUDIO_ASSETS`, every brick texture is a key of `BRICK_TINT`,
   and every texture key is loaded or painted somewhere.
7. **Search for shortcuts.** In the changed and added files, look for each of these and judge
   every hit:
   - `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
   - `setTimeout`, `setInterval`, `delayedCall`, `addEvent`, `Date.now`, `performance.now`,
     `onComplete`, `onUpdate`, `on('animationcomplete'` where the callback changes fight state
   - `Math.random` (allowed once, for the fight's seed in `Play.ts`, from Phase 4)
   - `.skip(`, `.only(`, `.todo(` in tests; tests with no assertion; assertions that cannot fail
   - `try` / `catch` that swallows an error; `?.` or `?? default` hiding a value that should
     always exist
   - `juice.flash` in boss code; tinting the paddle; hazard counts that depend on quality tier
   - TODO, FIXME, commented-out code, console logging outside dev guards
8. **Read the tests as an adversary.** For each new test ask: would it still pass if the feature
   were broken? Are the phase's named cases all present? Were any existing tests changed, and if
   so was the change justified in the handoff?
9. **Do the phase's manual checks yourself**, in a browser, including the ones about levels
   without a boss. Note what you saw for each. If you cannot run a browser or hear sound, say so
   and list those checks as not checked.
10. **Check the boss files** (`src/bosses/*`): they import types and `src/core` only, and follow
    the content rules in design.md.
11. **Read for quality.** Does the new code look like its neighbours? Is state changed in one
    place? Is anything duplicated that already exists in the codebase? Is there dead code, or
    options nobody uses? Are comments about why, not what?

## Verdict

Write one entry in STATUS.md using the review template there, with one of:

- **PASS**: every Build item is done, every automated check passes, every manual check you could
  run passes, no shortcut stands, scope is clean. Open items are only those the phase file lists
  under "For the user to confirm", or checks you could not run, which you list.
- **FIX**: the approach is sound and the list of problems is short and specific. Number them.
  Each says the file, the problem, and what done looks like. Do not prescribe the code.
- **RESTART**: the approach is wrong, the design was not followed, shortcuts were used to pass
  checks, or the problems are too many to list usefully. Say what the next agent should keep and
  what it should discard.

After two FIX verdicts on the same phase without a PASS, the verdict is RESTART.

A phase is not PASS if a manual check that matters to the phase's goal was never run by anyone.
Say which, so the person running the phases can run it or accept it.
