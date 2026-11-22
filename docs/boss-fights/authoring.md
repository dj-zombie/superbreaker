# Adding a boss

Written from the code. Every signature here is copied from `src/core/Boss.ts` or
`src/systems/BossDirector.ts`. The Warden (`src/bosses/warden.ts`) is the example throughout.
The Lantern Angler (`src/bosses/angler.ts`, World 2's finale) is the example for a body drawn by a
rig instead of a sprite sheet (`src/bosses/anglerRig.ts`), attacks timed to its own track
(`beatLock`, `music`), hazards in its own art (`hazards`), and a scenery it drives.

## 1. What a boss is here

A boss is a `BossDef`: a few **parts**, a picture drawn over them, some **phases**, and three
optional cutscenes. A part is a block of brick cells the ball bounces off; hits on any part come
out of the current phase's **pool**, and the boss dies when the last pool is empty. Between hits
the boss runs its phase's **attacks**, each a wind-up, a live window and an opening. The framework
owns the flow (black, entrance, title card, fight, phase scenes, death, award), the camera, the
letterbox bars, the music and the HUD; a boss file only supplies content. A map names its boss
with one property, and a boss level ends when the boss does.

## 2. The steps

1. **Add the id** to `BOSS_IDS` in `src/core/Boss.ts`:
   `export const BOSS_IDS = ['warden'] as const;`
2. **Make the sprite sheet.** Put a grid of frames on a flat white background in
   `art-src/bosses/<id>.jpg`, add a line to `BOSSES` in `scripts/build-bosses.py`
   (`"warden": {"source": "warden.jpg", "grid": (3, 3), "frame": (320, 240)}`) and run
   `python3 scripts/build-bosses.py` (needs Pillow). It writes
   `public/assets/images/bosses/<id>.png`, frames in reading order. A boss without a `sprite`
   shows its parts as plain bricks, which is enough to start.
3. **Write the `BossDef`** in `src/bosses/<id>.ts`. Boss files import types and `src/core` only.
4. **Register it** in `src/bosses/index.ts`:
   `export const BOSSES: Record<BossId, BossDef> = { warden };`
5. **Make a map.** Copy `public/assets/levels/bosslab.tmj` and set the map's custom property
   `boss` (a string) to the id. Bricks in the map are the arena. Leave rows 0 to 10 or so clear
   for the body. Do not add the map to `index.json`: play it with `?map=<file>.tmj`.
6. **Run** `pnpm typecheck`, `pnpm lint`, `pnpm test`. `tests/bosses.test.ts` checks every
   registered boss: parts on the grid, poses and openings that name real parts, cutscene cues
   inside their scene, every plan fair, every sound loaded, the sheet's frames.

```ts
export interface BossDef {
  id: BossId;
  name: string;
  /** The line over the name on the title card. The world's name when left out. */
  epithet?: string;
  parts: PartDef[];
  /** The picture drawn over the parts. Without one the parts show as bricks. */
  sprite?: SpriteDef;
  poses?: Record<string, Pose>;
  phases: PhaseDef[];
  /** The scene the boss arrives in, before the music and its name. */
  entrance?: Cutscene;
  /** The scene the boss dies in, after the final hit. */
  death?: Cutscene;
  /** The keepsake the award card spins once the boss is dead. Left out, the card has none. */
  trophy?: string;
}
```

## 3. Parts, poses and the sprite

```ts
export interface PartDef {
  id: string;
  /** Brick cells. Rows 0 and 1 stay empty. */
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** A key of BRICK_TINT: the hit sparks, and the brick's look. */
  texture: string;
  /** Steel deflects and takes no damage. */
  kind?: 'normal' | 'steel';
  /** Pool damage multiplier, default 1. 0 soaks hits. */
  weak?: number;
  light?: BrickSpec['light'];
}

export type Pose = Record<string, { dx?: number; dy?: number }>;
```

The Warden has three: `body` (6x2 cells), `core` (2x3, `weak: 3`, with a `light`) and `guard`
(2x1 steel under the core). Its one pose, `open: { guard: { dy: -3 * BH } }`, lifts the guard
inside the body where no ball reaches it. A pose only moves parts; it never changes what a part
is. Parts slide to a pose at `BODY_MAX_SPEED` in play and `BODY_SCENE_SPEED` in a scene.

```ts
export interface SpriteDef {
  key: string;
  path: string; // under public/assets
  frameWidth: number;
  frameHeight: number;
  width: number; // on the field, in px
  height: number;
  /** The sprite's centre from the centre of the parts at rest, in px. */
  dx?: number;
  dy?: number;
  anims: Record<BossAnim, { frames: number[]; fps: number }>;
}
```

All five animations are required: `idle`, `tell`, `open`, `hurt`, `death`. The framework picks
which plays; a cue may ask for one with `s.anim(name)`.

**Lining up.** Open `?map=<file>.tmj&debug`. Debug draws the parts' hit zones over the sprite.
Change `width`/`height` until the creature covers the parts, then `dx`/`dy` until the weak spot
sits on its part. The sprite is a look only: what the ball hits is always the parts.

## 4. Phases, `setup`, intensity

```ts
export interface PhaseDef {
  id: string;
  /** Shown after the boss's name on the HUD label. */
  title: string;
  /** The phase's pool, in plain ball hits on Normal. */
  hits: number;
  /** The pose the parts hold through the phase. Rest when left out. */
  pose?: string;
  /** How the whole body moves through the phase. Still when left out. */
  motion?: Motion;
  /** State changes for the phase. It also runs when a fight starts past this phase. */
  setup?(s: BossStage): void;
  /** How hard the boss track plays through the phase. Left out, it rises with the phases. */
  intensity?: BossIntensity;
  /** The scene that opens the phase, with play frozen. Not on the first: the entrance opens that. */
  enter?: Cutscene;
  /** The phase's attacks, played in order and wrapping. Without any the phase never attacks. */
  deck?: AttackDef[];
  /** The calm between attacks at a full and at an empty pool, in ms on Normal. */
  gapMs?: [number, number];
}
```

- `hits` is scaled by `BOSS_TUNING[difficulty].health` (0.8 / 1 / 1.25). A plain ball hit is 1,
  times the part's `weak`; an explosion is `EXPLOSION_HITS` (3), an ability kill `ABILITY_HITS` (2).
- `motion` is `(clockMs) => ({ x, y })`. `sway(amplitude, periodMs)` is the ready-made one.
- **Everything that changes the fight goes in `setup`**, never in a cutscene: a scene can be
  skipped, and `&phase=N` starts past it. The Warden's second phase spawns a wall
  (`s.spawn(wall())`) and gives the paddle its width back (`s.paddle.resetSize()`); its third
  retires the guard (`s.retire('guard')`).
- `intensity` is `'low' | 'mid' | 'high'`: the mood the phase asks the boss track for. The
  placeholder track (`src/art/bossMusic.ts`) is one song with the same playlist under every mood,
  so today the three sound alike.

## 5. Cutscenes

```ts
export interface Cue {
  at: number;
  run(s: BossStage): void;
}
export interface Cutscene {
  lengthMs: number;
  cues: Cue[];
}
```

`run` is called once, `at` ms of the fight clock into the scene. Play is frozen, the letterbox
bars are closed and a tap skips the scene after `SKIP_GUARD_MS` (the death scene cannot be
skipped). A skipped scene's remaining cues never run.

A cue **may** use these members of `BossStage`:

```ts
readonly calm: boolean;                       // reduced motion is on
readonly center: { x: number; y: number };    // middle of the parts
part(id: string): Brick | undefined;          // undefined once retired
readonly audio: typeof audio;                 // s.audio.sfx(key, volume, detune, { x })
anim(name: BossAnim): void;
light(o: LightOptions): Light;                // removed when the scene ends
tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween; // stopped at scene end
impact(x: number, y: number, scale?: number, color?: number): void; // a blow: shake, sparks, flash
shot(shot: Shot | null): void;                // points the camera until the scene ends
glimpse(color?: number): void;                // lightning through the intro's dark
unveil(): void;                               // lifts the intro's dark now
readonly juice: JuiceSystem;                  // s.juice.shake(ms, intensity)
```

```ts
export interface Shot {
  zoom: number;
  x: number;
  y: number;
  /** Jump there, as a film cuts. Left out, the camera glides. */
  cut?: boolean;
}
```

A cue **may not**: change state (`pose`, `retire`, `spawn`, anything on `paddle`, `bricks` or
`powerups`: that is `setup`'s job); call `juice.flash` (whole-screen flashes go through `impact`
and `glimpse`, which the photosensitivity limiter can refuse); use timers, `Math.random`,
`Date.now` or a tween's callbacks for anything but looks; play a sound key that is not in
`AUDIO_ASSETS` (Phaser throws); sit at an `at` past `lengthMs`.

What the framework does around your scenes, so do not do it yourself: fades to black and stops
the music (`HUSH_MS`), closes and opens the letterbox, shows the title card (`epithet` over
`name`) for `REVEAL_MS` with a slow push-in, starts the boss track, pushes in for phase scenes
and the death, pulls back before play resumes, cuts the music on the final hit, then plays the
ending theme and shows the award (`trophy`, score, coins, tap or wait `AFTERMATH_MS`). Under
reduced motion there is no dark, no glimpse and no camera move; your sounds still play.

The Warden's entrance (`lengthMs: 4200`): three `boss_stomp` footfalls with growing shakes, a
`boss_growl`, a cut to the eye with `s.glimpse()` and `thunder`, a cut to the whole body with a
second glimpse, then `s.unveil()`, `s.anim('tell')`, `boss_roar` and an `impact`.

Every `glimpse` and `impact` flashes the whole screen, and so does the framework's blow on the
final hit, at 0 ms of the death scene. The limiter lets two whole-screen flashes through in any
one second and drops the third; the ring, sparks and sound of a dropped impact still play. Space
them so no three fall inside one second. The world's lightning and failing lights wait while a
scene runs, so only your cues count. The Warden's death flashes at 0 (the framework's blow),
then its blasts at 500, 1100, 1650 and 2300.

## 6. Attacks

```ts
export interface AttackDef {
  id: string;
  /** Warning time before anything can hurt, in ms on Normal. */
  windupMs: number;
  /** Every hazard in the plan ends inside this, in ms. */
  liveMs: number;
  /** The opening after the attack, in ms. */
  recoverMs: number;
  /** Sound of the wind-up. The `tell` animation always plays. */
  tell?: { sfx?: string };
  /** What the boss gives away while it recovers: a pose to hold and a part to mark. */
  opening?: { pose?: string; lock?: string };
  plan(v: BossView): AttackPlan;
}

export type HazardSpec =
  | {
      kind: 'shot';
      from: string;
      x: number;
      at: number;
      flightMs: number;
      onPaddle: PaddleEffect;
      look?: 'decoy';
      offset?: { dx: number; dy: number };
    }
  | { kind: 'beam'; x: number; width: number; at: number; liveMs: number; onPaddle: PaddleEffect }
  /** Takes a life. */
  | { kind: 'skull'; from: string; x: number; at: number; flightMs: number }
  /** Harmless: caught, it flies back at the first part of `returnTo` still standing for `hits`. */
  | { kind: 'slag'; from: string; x: number; at: number; flightMs: number; returnTo: string[]; hits: number };

export type PaddleEffect =
  | { kind: 'jam'; ms: number }
  | { kind: 'shrink'; factor: number };
```

`plan` runs once as the wind-up starts and returns everything the attack will do; the warnings
on the paddle line are drawn from it. It may read only its `BossView`: `rng` (never
`Math.random`), `phaseProgress` (0 at a full pool, 1 at an empty one), `paddle: { x, width }`,
`balls`, `parts`. `x` is where a hazard lands on the paddle line; `at` is ms after the live
window opens.

**Fairness rules** (`planProblems` checks them: the tests run it over many paddle positions and
seeds, and a dev build logs `[boss] <id> <attack>: <problem>` for a plan that breaks one):

- at most `MAX_HAZARDS` (48); every `at >= 0`; everything ends inside `liveMs`; every `x` on
  the field; `from` names a part;
- a shot flies at least `MIN_FLIGHT_MS` (700), a skull at least `MIN_SKULL_FLIGHT_MS` (1600);
- at most `MAX_SKULLS` (2), and never a skull together with a jam;
- a jam lasts at most `MAX_JAM_MS` (900); a shrink factor is between 0.6 and 1;
- at least `SAFE_GAP` (200) px of the paddle line stays free;
- the wind-up is never under `MIN_WINDUP_MS` (500) on any difficulty.

**What hits do.** A shot or beam that finds the paddle jams or shrinks it, with a jolt, a light,
a word ("JAMMED", "SHRUNK") and a sound. Nothing but a skull costs a life. A skull that lands on
the paddle takes a life and ends the attack. A ball in flight that touches a skull breaks it
(`SKULL_POP_RADIUS`), so the ball and the skull arriving together is never a forced loss.

**Openings and lock-on.** While the boss recovers it holds `opening.pose` and marks
`opening.lock` with a reticle; rising balls bend toward the marked part. Every Warden attack
uses `{ pose: 'open', lock: 'core' }`: dodge the attack, then the eye is yours for `recoverMs`.
An attack without an opening gives the player nothing for surviving it.

**Gifts and lies.** Slag is the opposite of a shot: catch it and it flies back at the boss, and
the boss hears `{ type: 'returned', part, hits }` in `on()` (the Angler flares the room for three
beats). A shot with `look: 'decoy'` is drawn as a lookalike of the slag, but its warning on the
line is a shot's, so a player who reads the marks is never fooled. `offset` starts a shot away
from its part's centre, from an eye the picture draws there.

**Looks.** `hazards: HazardLooks` (`src/systems/HazardSystem.ts`) dresses the hazards in the boss's
art: textures for `shot`, `slag`, `splash`, `skull`, a `decoy` with its colour and sound, a `beam`
colour (`negative` darkens the room under a firing beam), `shotGlow` to light a shot too dark to
read, and `fx` presets for the trails and the splash.

## 7. Dev tools

Dev builds only (`pnpm dev`):

| Tool | What it does |
| --- | --- |
| `?map=bosslab.tmj` | Plays the boss lab (any map file under `public/assets/levels`). |
| `?stop=20` | Plays the campaign's boss stop after that level (here the Angler), as the campaign does. |
| `&phase=2` | Starts the fight in that phase (counted from 1), with every earlier `setup` run and no intro. |
| `&attack=volley` | Makes every phase's deck that one attack. |
| `&debug` | Draws the parts' hit zones and the performance overlay. |
| `&lighting=low` | Pins the lighting tier (`low`, `medium`, `high`). |
| `]` key | Empties the current pool: the next phase, or the kill. |
| `window.boss` | The running `BossDirector`: `boss.state.step`, `.phase`, `.pool`, `.poolMax`, `.window`; `boss.debugHit(n)`; `boss.skip()`. |
| `window.game` | The Phaser game. |

A tap, click or the launch key skips the intro and phase scenes, and goes on from the award.

## 8. Before calling a boss done

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass; nothing skipped.
- [ ] With `&debug`, the sprite covers the parts in every pose and the weak spot sits on its part.
- [ ] Each attack, alone with `&attack=<id>`, can be dodged on reaction on Hard, and its
      opening is worth using.
- [ ] Every phase is reachable with `&phase=N` and looks the same as when played into.
- [ ] Skipping every scene leaves the fight in the same state as watching it.
- [ ] The intro, a phase scene and the death read with sound off, and with reduced motion on.
- [ ] No cue changes state; no sound key is missing from `AUDIO_ASSETS`.
- [ ] A clean Normal run takes 2 to 3 minutes; Easy and Hard were both played to the end.
- [ ] The map is not in `index.json` until the boss is meant to ship.
