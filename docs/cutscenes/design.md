# Cutscene director: design

Written from the code. The pure part lives in `src/core/cutscene/`, the Phaser part in
`src/systems/cutscene/`, `src/ui/cutscene/` and `src/scenes/Cutscene.ts`. Scripts live in
`src/cutscenes/`.

## 1. The shape of it

A cutscene is data: a `CutsceneDef` with a cast, assets, how it opens and closes, and a
`script` of `Step`s made with the builders in `src/core/cutscene/builders.ts`. Nothing in a
script calls Phaser.

```
CutsceneDef --compile()--> Timeline --sampleFrame(t)--> CutsceneFrame --CutsceneDirector--> views
                                 \--> cues (sfx, voice, fx, shake, ...) fire as the Playhead passes them
```

- `compile(def, env)` walks the script once and lays every step on a clock. The result is a
  `Timeline`: one track per animated value (letterbox, fade, grade, camera, backdrop, each
  actor's pose), marks for discrete changes (scenery, music, actor animation and facing), the
  dialog lines, cards, plates, ambient fields, one-shot cues, holds and labels.
- `sampleFrame(timeline, t, { calm })` is pure: everything on screen at time `t`. The views keep
  no time of their own, so seeking anywhere draws the right picture, and the core is tested
  without a renderer (`tests/cutscene*.test.ts`).
- The `Playhead` owns time. It stops at holds (a `tap` line, a `hold()` step, a `voice` line
  waiting for its clip), skips, and seeks. Cues fire once as it passes them and never on a skip
  or a seek.
- `CutsceneDirector` samples a frame every update and applies it: camera, grade, letterbox,
  backdrop, actors, plates, ambient fields, dialog, cards, music; and fires the cues it passed.

### Beats and moves

In a sequence, **beats** take their time: `say`, `narrate`, `card`, `wait`, `hold`, `descend`.
Every other step is a **move**: it starts and the script goes on at once, unless it is given
`wait: true`. `together(...)` starts its steps at the same moment and lasts as long as its
longest beat; `seq(...)` nests a sequence. A move only changes the fields it names, so a camera
move to `{ zoom: 1 }` and a `handheld` sway can overlap.

Moves persist. A `pushIn` stays pushed in and a `dutch` stays rolled until another move changes
them, so each beat should settle what it doesn't want to inherit (Chapter II levels and recenters
the camera as the descent starts).

## 2. The pieces

| Piece                  | Where                                    | What it does                                                                        |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Camera                 | `CameraRig`                              | Presets over a `Shot` (center, zoom, roll) plus handheld sway, drift and depth blur |
| Grade                  | `GradeFx`, `grades.ts`                   | Color matrix, vignette and duotone; named presets lerp into each other              |
| Letterbox, fade, flash | `LetterboxView`                          | Bars, a full-screen fade, flashes                                                   |
| Wipes                  | `ui/fx/wipes`                            | `dip`, `wipe`, `iris`, `pixelate`, `burn`, `shroud`, `glitch` in a world's style    |
| Dialog                 | `DialogView`                             | `box`, `bubble`, `caption`, `card`; typed text with markup, portraits, hold-to-skip |
| Cards                  | `CardView`                               | Chapter cards in a world's lettering                                                |
| Backdrop               | `ParallaxBackdrop`                       | Pace, sway, glow, tint, `fall`, `switchTo`, `descend`, snapshot and restore         |
| Plates                 | `PlateLayer`                             | Full-screen illustrations with a Ken Burns pan, over the backdrop and the actors    |
| Actors                 | `ActorStage`                             | Images, sheets, boss sheets, the Breaker, and registered rigs; emotes and lights    |
| Ambient                | `AmbientFields`, `fx/library/ambient.ts` | Long-running particle fields at a depth band                                        |
| Audio                  | `AudioSystem`                            | Voice bus with auto-duck, text blips, scene music beds, sfx                         |

### Depth

The world camera draws the backdrop (depth below -90, with the `back` and `between` ambient
bands inside it), actors (`ACTOR_DEPTH`, 5), plates (10) and the `front` ambient band. Everything at `UI_DEPTH`
(1000) and up is drawn by a second camera, `cutscene-ui`, which the grade and the camera moves
don't touch: letterbox, dialog, cards and wipes stay sharp and level whatever the shot does.

### Text markup

`parseLine` reads a small markup inside lines:

- `{p:400}` pauses the typing for that many ms;
- `{speed=0.5}...{/speed}` types slower or faster;
- `{color=#ff8a3d}...{/color}` colors a span, by `#rrggbb` or a palette name (`accent`,
  `accent2`, `gold`, `danger`, `good`);
- `{shake}...{/shake}` and `{wave}...{/wave}` move the letters.

Punctuation pauses by itself.

Each glyph pops in as it is typed. The pop is timed from when that glyph appeared, on the view's
own clock, and scales about the glyph's center (Phaser's bitmap text renderer multiplies `x` by
the glyph scale, so a plain scale would push letters apart).

### Calm and low tier

`calm` (reduced motion) drops shakes, sway, drift, whips, letter motion and most emotes, and
types lines at once. The grade's filter passes (color matrix, duotone, blur) are a High-tier
extra, checked every frame; below High the grade falls back to a multiply tint on the backdrop
and the actors. The vignette is a single image and shows on every tier. Without rich effects
(the Low tier) wipes fall back to a dip. The cutscene runs the same `FrameMonitor` as play, so a
slow machine steps down resolution and tier mid-scene. The script doesn't change.

## 3. Routing

`public/assets/levels/index.json` lists scenes against campaign steps:

```json
"scenes": [{ "id": "chapter-2", "before": "level11" }]
```

`before` plays a scene before a step starts, `after` once it is cleared. `Campaign.validScenes`
drops entries that name unknown scenes or steps; `sceneBetween(from, to, entries, seen)` picks
the first one that hasn't been seen. The three places a step can end or start ask
`storyBetween()`: the clear banner in `Play` (after a level or a stop), `Results` (the last step
of the campaign) and `Title.startLevel`. A scene is marked in `save.state.seenScenes` when it
ends or is skipped, and plays once.

### Handoff

A scene says what it leaves on screen (`closes`). With `handoff: 'continuous'` the next scene
launches under the cutscene, receives a `BackdropSnapshot` (world, scroll offsets, pace) and
restores it, and the cutscene's cameras fade out over it: the scrolling shaft never cuts. A skip
always uses `dissolve`. `theme` is the ordinary themed transition. A scene that opens on
`inherit` takes the snapshot of the screen it was started from, which is how Chapter II picks up
the piñata bonus's backdrop.

## 4. Decisions

- **Scripts are data, compiled up front.** Seeking, skipping, tests and scene validation all fall
  out of having the whole timeline before the first frame. The cost is that a script can't branch
  on what happens at runtime; nothing here needs that.
- **One clock, no tweens.** Views sample the frame instead of running Phaser tweens, so nothing
  drifts out of step after a hold or a seek.
- **Holds stop the clock.** Animation that should keep moving while the player reads (idle
  loops, sway, ambient fields, the backdrop scroll) runs on real time in the views.
- **Plates cover the actors.** A memory replaces the stage while it shows, so nobody standing
  there shows through it; the front ambient fields still drift over it.
- **The Breaker is an actor** dressed in the current world's paddle and ball, so it matches
  wherever the scene is.

## 5. Not done

- **Ending scene.** The `after` routing from `Results` is in place; no ending is written, so
  `index.json` has no entry for it.
- **Voice-over.** The voice bus, ducking and `voice` holds work; no lines are recorded. Lines
  type with blips until their clip is added (see the authoring guide).
- **Rig-only bosses and other rigs.** `boss:<id>` needs a boss with a sprite sheet. A boss drawn
  by a rig (the Crucible) or the jack-in-the-box (`JackRig`) needs `registerActorRig(prefix,
build)` with an `ActorRig` adapter before it can be cast.
- **Art.** Chapter II has one memory plate (`cs_plate_lid`); more plates can be generated the
  same way.
- **Branching and choices.** Not supported by design (see above).
