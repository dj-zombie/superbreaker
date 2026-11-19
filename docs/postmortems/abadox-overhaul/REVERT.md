# Putting the repo back

How to undo the Abadox overhaul. Both ways below were rehearsed on a copy of this repo on 19 November 2026 and left it as described under [What you should see](#what-you-should-see).

## Where things stand

- Branch `master` at `9519f74`. Nothing from the overhaul was committed or staged.
- `git status` lists 429 paths. Three groups are **not** part of the overhaul and both ways leave them alone:
  - `public/assets/audio/boss/*.mp3`: your 11 edited boss sounds (changed 17 November).
  - `docs/ref/`: your Abadox stage maps.
  - `docs/postmortems/`: this write-up and the `what-not-to-do` art.
- Everything else in `git status` is the overhaul: 138 changed files, 3 deleted, and about 400 new ones.

Before you start, close any room map that is open in Tiled (`gullet.tmj`, `charnel.tmj`, `throat.tmj`), or a save there will write it back.

## Way 1: park it on a branch (recommended)

Nothing is deleted. The whole attempt becomes one commit on a side branch, and `master` goes back to how it was. This is the safe one: git refuses to switch branches if it would overwrite anything.

```sh
cd /Users/zombie/git/superbreaker

git switch -c archive/abadox-overhaul
git add -A -- . ':(exclude)public/assets/audio/boss' ':(exclude)docs/ref' ':(exclude)docs/postmortems'
git commit -m "Archive the rejected Abadox overhaul. Do not merge."
git switch master

rm -rf art-src/foreground/preview
```

The last line removes three contact sheets that the overhaul's `.gitignore` line was hiding.

The branch is local and adds about 82 MB to `.git`. To delete the attempt for good later:

```sh
git branch -D archive/abadox-overhaul
```

Git frees the space by itself some weeks after that.

## Way 2: delete it outright

Nothing is kept except what is in `docs/postmortems/`. There is no undo.

```sh
cd /Users/zombie/git/superbreaker

# 1. Put every tracked file back, except your boss sounds.
git restore --source=HEAD --staged --worktree -- . ':(exclude)public/assets/audio/boss'

# 2. See what would be deleted. docs/ref and docs/postmortems must NOT be in this list.
git clean -nd -e docs/ref -e docs/postmortems

# 3. Delete it.
git clean -fd -e docs/ref -e docs/postmortems
```

Read the list from step 2 before running step 3. It should be about 276 lines, all of them overhaul files: `art-src/kits/`, `art-src/backdrops/gullet/`, `docs/mockups/`, `public/assets/images/rooms/`, `tiled/`, the room maps, the new scripts, sources and tests.

## What you should see

```sh
git status --short
```

```
 M public/assets/audio/boss/award.mp3
 M public/assets/audio/boss/beam.mp3
 M public/assets/audio/boss/death.mp3
 M public/assets/audio/boss/explode.mp3
 M public/assets/audio/boss/phase-break.mp3
 M public/assets/audio/boss/roar.mp3
 M public/assets/audio/boss/shot.mp3
 M public/assets/audio/boss/skull-pop.mp3
 M public/assets/audio/boss/stomp.mp3
 M public/assets/audio/boss/title.mp3
 M public/assets/audio/boss/victory.mp3
?? docs/postmortems/
?? docs/ref/
```

Then:

| Check            | Expected                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` | Clean                                                                                                  |
| `pnpm test`      | 582 pass, 1 fails: `tests/skills.test.ts`, gun cooldown against bullet time. It fails in `9519f74` too |
| `pnpm lint`      | 1 error: an unused `h` in `src/art/procedural.ts`. It is in `9519f74` too                              |

The game is then exactly the last commit: the forge backdrop, the original bricks, 30 generated levels, no rooms, no new brick kinds.

## Builds that still hold the rejected version

`dist/`, the iOS project's copy (`ios/App/App/public`) and the Android project's copy (`android/app/src/main/assets`) were rebuilt at 2:56 AM on 19 November, with the overhaul in them. They are ignored by git, so neither way above touches them. After reverting:

```sh
pnpm cap:sync     # rebuilds dist/ and copies it into the iOS and Android projects
```

- Run the app again from Xcode or Android Studio to replace what is installed on a device.
- If the web build was deployed after 2:56 AM, deploy again.
- The desktop and CrazyGames builds are older than the overhaul and need nothing.
- The dev server picks the change up by itself. Reload the page.

Saved games need nothing. Progress is stored by level number, and the levels are back in their slots.

## Leftovers outside the repo

None of these affect the game. Delete them when you like.

| Path                                                     | What it is                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `/tmp/sb/`, `/tmp/abx/`                                  | Scratch screenshots, mockup drafts, crops of the references |
| `/tmp/backdrop-hd/`, `/tmp/realesrgan/`                  | The upscaled backdrop plates and the upscaler               |
| `~/.cursor/plans/abadox_brick_overhaul_0ffcd51a.plan.md` | The original plan                                           |
| `scripts/__pycache__/`                                   | Compiled copies of the deleted scripts (ignored by git)     |

## Getting something back from the branch

Only with Way 1. A single file comes back like this:

```sh
git show archive/abadox-overhaul:src/core/Terrain.ts > src/core/Terrain.ts
```

The two pieces of code that do not depend on the art are listed in [README.md](README.md#what-is-in-the-working-tree-and-what-it-is-worth). Neither is a matter of copying files. The new brick kinds and the wall collision are spread through `src/scenes/Play.ts`, `src/systems/BrickSystem.ts`, `src/core/LevelParser.ts` and `src/core/types.ts`, mixed with the room and skin code. Bringing one back means porting it on to `master` by hand, with the art parts left out, and then drawing a sprite for it.
