# Writing a cutscene

Written from the code. Every builder here is in `src/core/cutscene/builders.ts`, every type in
`src/core/cutscene/types.ts`. Chapter II (`src/cutscenes/chapter2.ts`) is the example
throughout; [design.md](design.md) explains how the pieces fit.

## 1. The steps

1. **Write the def** in `src/cutscenes/<id>.ts` with `cutscene(id, frame, script)`. Cutscene
   files import from `src/core` only.
2. **Register it** in `src/cutscenes/index.ts`: add it to `CUTSCENES`.
3. **Route it** in `public/assets/levels/index.json`:
   `"scenes": [{ "id": "chapter-2", "before": "level11" }]`. Use `before` with a step key
   (`level11`, a stop) to play it before that step, or `after` to play it once the step is
   cleared. A scene plays once per save.
4. **Make the art and sounds** (section 5) and list them in the def's `assets`.
5. **Watch it** with `?scene=<id>`, jumping in with `&at=<label or ms>`.
6. **Run** `pnpm typecheck`, `pnpm lint`, `pnpm test`. `tests/cutscenes.test.ts` checks every
   registered scene: no script problems (unknown fx, sfx, sprites or actors), every asset file
   on disk, a length between 20 s and 2 min, and an end frame with no letterbox and a neutral
   grade, so the level after it starts clean.

## 2. The frame

```ts
export const CHAPTER_2 = cutscene(
  'chapter-2',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'crypt', pace: 1, handoff: 'continuous' },
    skip: 'always',
    cast: { ... },
    assets: { ... },
  },
  [ ...script ],
);
```

- `opens.scenery`: the world on screen at the start, or `inherit` to take over the screen the
  scene was started from (its backdrop keeps scrolling).
- `closes`: the world and pace the scene ends on. With `handoff: 'continuous'` the next level
  picks the backdrop up where the scene leaves it; `dissolve` crossfades; `theme` is the usual
  themed transition. End on the next level's world at pace 1, with the letterbox off and the
  grade back to `neutral`.
- `skip`: `always`, `after-seen` (only once watched through) or `never`. Holding the button
  skips; a skip always dissolves.

## 3. The cast

```ts
vesper: {
  name: 'Vesper',
  color: 0xffc46b,                 // name plate and text accent
  sprite: 'cs_vesper',             // an image or sheet key from assets
  size: 160,                       // height on stage, in board units
  portrait: 'cs_vesper_face',      // shown in the dialog box
  anims: { idle: { frames: [0, 1, 2, 3, 4, 3, 2, 1], fps: 6, loop: true } },
  idle: 'idle',
  light: { color: 0xffb35a, radius: 150, intensity: 0.9 },
},
```

`sprite` can also be a built-in:

- `breaker`: the paddle and ball, dressed as the world on screen;
- `boss:<id>`: a boss's own sheet with its fight animations (`idle`, `tell`, `open`, `hurt`,
  `death`), plus any `anims` the entry adds. The Warden adds `broken` and `crumble`;
- `volley:<slag|spirit|data>`: a bullet-hell emitter. Its anims are patterns, `spiral`, `fan`,
  `ring` and `rain`, and `stop` holds fire. Calm mode thins it out, and the Low tier halves its
  pool;
- `comet:<image>`: a glowing core whose trail follows wherever it moves, for a fast `path`.
  `flare` bursts it;
- `logo:<image>`: an image with `<image>_glow` layered over it; `ignite` lights the glow with a
  stutter, and any other anim puts it out;
- anything registered with `registerActorRig(prefix, build)` in `src/systems/cutscene/ActorStage.ts`.
  Rig-drawn bosses (the Crucible) and the jack-in-the-box need one before they can be cast.

A rig reads its anims by name, but the script checks that every `anim` a scene asks for is in the
cast entry's `anims`, so list them with empty frames: `{ frames: [], fps: 1 }`.

A cast member without a `sprite` is a voice: it can speak, with its portrait, but never stands
on stage. `narrator` is always available and has no face.

## 4. The script

Positions are fractions of the board, `[x, y]`, so a scene fits any screen height. Beats (`say`,
`narrate`, `card`, `wait`, `hold`, `descend`) take their time; everything else starts and lets
the script go on, unless given `wait: true`. Group what starts together with `together(...)`.
Moves persist until something changes them.

Put a `label()` at the top of each beat. Labels show up in `window.cutscene.labels()` and work
with `&at=`.

### Dialog

```ts
say('warden', 'It was the {color=#ff8a3d}lid{/color}.', { hold: 3000 }),
say('vesper', 'Down here, the dark {wave}remembers{/wave}.', { side: 'right', ...vo('vesper_02') }),
narrate('The Foundry went quiet.', { box: 'caption' }),
```

- `hold`: `tap` (default) waits for the player, `voice` for the clip, `auto` the reading time,
  or a number of ms.
- `box`: `box` (default), `bubble`, `caption` or `card`. `side` puts the portrait left or right;
  `mood` picks a portrait frame by name.
- Markup: `{p:300}`, `{speed=0.5}`, `{color=...}`, `{shake}`, `{wave}`.

### Picture

| Builder                          | Example                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `camera(preset, opts)`           | `camera('pushIn', { subject: 'warden', amount: 0.3, ms: 6000 })`                |
| `camera(shot, opts)`             | `camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 2400 })`                   |
| `grade(id, ms)`                  | `grade('dread', 1600)`, or a partial `Grade`                                    |
| `letterbox(to, ms)`              | `letterbox(1, 900)`                                                             |
| `fade(to, ms, color)`            | `fade(1, 600, 0x000000)`                                                        |
| `flash(ms, color, amount)`       | `flash(260, 0xffffff, 0.9)`                                                     |
| `shake(ms, intensity)`           | `shake(1600, 0.012)`                                                            |
| `transition(kind, ms)`           | `transition('iris', 800)`                                                       |
| `plate(image, opts)`             | `plate('cs_plate_lid', { ms: 5200, from: { zoom: 1.18 }, to: { zoom: 1.04 } })` |
| `card(kicker, title, ms, world)` | `card('Chapter II', 'The Crypt', 3400, 'crypt')`                                |

The camera presets: `establish`, `pushIn`, `pullBack`, `pan`, `tilt`, `drift`, `handheld`,
`still`, `whip`, `punch`, `dutch`, `level`, `follow`, `rackFocus`, `reset`. `amount` is the zoom
added for `pushIn` and `punch`, degrees for `dutch`, and the amplitude for `handheld` and `drift`.

The grades: `neutral`, `ember`, `dusk`, `crypt`, `bw`, `noir`, `memory`, `dread`, `neon`,
`night`.

### World

```ts
scenery('hell', 0.25),                         // change world, with a crossfade
backdrop({ pace: 0.25, glow: 0.15, ms: 2000 }), // pace, sway, glow, tint, fall
backdrop({ fall: 1, ms: 1700, ease: 'in' }),   // the floor gives way
descend('crypt', { ms: 5400, through: 'ambient.cloudbank', peak: 4.2, land: 0.4 }),
```

`descend` races the scroll up to `peak`, switches the art halfway down behind the `through`
field, and lands at `land`.

### Actors

```ts
enter('vesper', [0.7, 0.44], 'fade', 1600),
actor('breaker', { to: [0.42, 0.6], ms: 1800, ease: 'out' }),
actor('warden', { emote: 'shiver', anim: 'crumble' }),
exit('warden', 'fall', 900),
```

Entrances and exits: `fade`, `fall`, `rise`, `left`, `right`, `pop`, `cut`. Emotes: `bounce`,
`shake`, `nod`, `shiver`, `flash`. An actor also takes `path`, `face`, `alpha`, `scale` and
`angle`.

### Particles and sound

```ts
ambient('ambient.fog', { depth: 'between', intensity: 0.8, ms: 2000 }),
ambientOff('ambient.fog', 1800),
fx('boss.vent', 'warden'),     // a one-shot effect at an actor or a point
sfx('cs_chime', 0.8),
music('cs_wind', 2400, 0.7),   // a looping bed; music(null) stops it
haptic('heavy'),
```

Ambient fields (`src/fx/library/ambient.ts`): `clouds`, `cloudbank`, `through`, `fog`,
`godrays`, `dust`, `snow`, `wisps`, `sparks`, `debris`, `speedlines`, each `ambient.<name>`.
`depth` is `back`, `between` (inside the parallax layers), `front` or `board`. Any effect from
the FX Lab (`?fx=lab`) works with `fx()`.

## 5. Art and sound

### Pictures

Generate the source art into `art-src/cutscenes/` on a flat white background (portraits,
sprite sheets) or as a finished picture (plates). Add an entry to `ART` in
`scripts/build-cutscene-art.py` and run it:

```
python3 scripts/build-cutscene-art.py              # everything
python3 scripts/build-cutscene-art.py cs_vesper    # one entry
```

It keys and trims portraits, cuts sheets on their grid (and fails if a frame's content touches
the edge of its cell), resizes plates, and trims and fits single `sprite`s (already cut out, such
as a rig's core), writing to `public/assets/images/cutscenes/`. A plate entry with `unlit: True`
paints out its brightest cold light (a lightning bolt) and `dim` darkens it, so one painting
gives a dark frame and a lit one to flicker over it: Chapter I's storm does that. It needs
Pillow and numpy; if the system Python lacks them, use a venv:

```
python3 -m venv /tmp/sb-venv && /tmp/sb-venv/bin/pip install pillow numpy
/tmp/sb-venv/bin/python scripts/build-cutscene-art.py
```

### Sounds

`scripts/build-cutscene-audio.py` synthesizes the placeholder sounds (numpy, ffmpeg) into
`public/assets/audio/cutscenes/`. The music bed `cs_wind` is a seamless loop.

Generated sounds, scores and voice clips go in `art-src/cutscenes/audio/` and
`art-src/cutscenes/vo/`, with an entry in the script's `SOURCED` table: it trims the silence,
evens the loudness and fades the tail, and can run an ffmpeg filter chain first (the Crucible's
furnace voice). `python3 scripts/build-cutscene-audio.py vo_intro_01` rebuilds one.

A scene scored to one long track, like Chapter I, can place every cue on the score's clock
instead of in sequence: give each line a numeric `hold` (the clip's length) so no line stops the
clock, and set `scored: true` in the frame so a tap doesn't hurry a line and run the picture
ahead of the music (a tap then only shows the skip hint).

### Voice-over

Every line can name its clip with `vo('<key>')`. Until a clip is recorded, the line types out
with blips. To add one, save it as `public/assets/audio/cutscenes/vo/<key>.mp3` and add the key
to `RECORDED` at the top of the scene file:

```ts
const RECORDED = new Set<string>(['warden_01']);
```

Recorded lines duck the music, and a line with `hold: 'voice'` waits for its clip to end.

## 6. Debugging

- `?scene=chapter-2&at=arrival` starts a scene, optionally at a label or a time in ms.
- `window.cutscene` in the console: `play(id, at?)`, `seek(label or ms)`, `pause()`, `resume()`,
  `step(ms)`, `skip()`, `labels()`, `time()`, `length()`.
- Seeking doesn't fire cues on the way (no sounds, no one-shot fx), so a frame reached by
  seeking can look calmer than the same frame played through.
- A beat that looks wrong after another one usually inherited a move: check what the camera,
  grade and backdrop were last told.
