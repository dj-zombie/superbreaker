# Boss fights: design

The contract every phase builds toward. Facts about existing code were checked against commit
`69867e5`. There are no line numbers on purpose: find symbols by name, and re-check any fact you
rely on before you use it.

## Goal

A framework that a boss implements to define its fight, plus one throwaway reference boss
(`warden`, dev-only content) that exercises it. Not a roster.

A fight should change character across phases, telegraph every attack, play scripted moments that
drive light, particles, sound and music together, and grow out of this game: the ball is the
weapon, the paddle is the body, bricks and powerups are the arena.

## Decisions

1. **The boss is an animated sprite. Its hit zones are bricks.** Each part of a boss is a `Brick`
   in `BrickSystem` with an `owner`, invisible under the sprite. Every weapon already targets
   `BrickSystem` (ball, lasers, abilities, explosions, homing), so there is one hit path and
   nothing parallel. A boss with no sprite, or whose sheet failed to load, shows its parts as
   plain bricks; that is also what Phase 1 builds and what `?debug` reveals.
2. **Parts do not have health; the phase does.** A hit on any part drains the current phase's
   pool, measured in plain ball hits. Parts leave only when the boss retires them.
3. **Hazards hinder the paddle; only the skull takes a life.** Shots and beams jam or shrink the
   paddle. A skull is a separate, slower, rarer hazard that costs a life when the paddle touches
   it, the way a Descent breach does: the ball stays in play. Losing the ball costs a life as
   today.
4. **Attacks are plans.** When a wind-up starts, the attack returns plain data: which hazards,
   where, when. Warnings are drawn from that same data, so a warning cannot disagree with the hit,
   and plans can be checked in node tests.
5. **One fight clock.** Everything in a fight advances on dt handed down from `Play.update`,
   divided by `physics.world.timeScale` and stopped during hit-stop. Attack timing also waits
   while no ball is in play. Pause, bullet time and Hyperspeed then apply with no extra code.
6. **The flow belongs to the framework; the boss fills in the moments.** Every boss gets the same
   arc (below) and supplies its entrance, phase entries and death as cutscenes.
7. **Cutscenes only present.** State changes live in `PhaseDef.setup`. After any cutscene, skipped
   or not, the framework applies the same end state. Nothing depends on a cue having fired.
8. **One boss track for every boss.** Boss code names boss moods (`rise`, `low`, `mid`, `high`,
   `rest`) and the framework decides when each plays. Until the boss song exists, each mood is
   played from a section of the level song. Swapping in the real track changes audio code and
   data only, never a boss.
9. **Lock-on is automatic.** During an attack's opening the framework marks the weak point and
   bends rising balls toward it. There is no lock button: every key, pad button and the tap are
   already bound.
10. **Pure core, director, host.** `src/core/Boss.ts` is engine-free and unit-tested like
    `core/Run.ts`. `BossDirector` lives inside `Play` like `RunDirector` and talks to it through a
    `BossHost` of closures.

## The fight flow

`BossState.step` moves through these in order. "Held" means the ball sits on the paddle and the
serve clock is stopped. "Frozen" means physics is paused and only the paddle and the boss update,
the way the tutorial freezes play.

| Step | Owner | World | What happens | Ends |
| --- | --- | --- | --- | --- |
| `hush` | framework | held | Music fades out. The screen fades to black and the letterbox bars close. No intro card, no hint, no boss, no boss bar. | after `HUSH_MS` |
| `entrance` | boss | held | The boss arrives in the dark: the sprite drops and fades in, and the boss's `entrance` cutscene adds sounds, camera shots, glimpses of lightning, light and impacts, and lifts the dark. Still no music. | after the cutscene's length |
| `reveal` | framework | held | The boss track starts at `rise`. The title card shows the epithet over the name while the camera pushes in on the boss under a key light. The boss bar fills from empty. Any dark left lifts. The bars open and the camera pulls back as it ends. | after `REVEAL_MS` |
| `fight` | both | live | The hint appears and the serve clock runs. Phases, attacks, openings. The track follows the phase's intensity. | a pool empties |
| `transition` | boss | frozen | A hit-stop on the kill shot. Hazards clear. The bars close and the camera pushes in. The next phase's `enter` cutscene plays, then its `setup` runs and its pose applies. | after the cutscene's length |
| `finale` | boss | frozen | A hit-stop, hazards clear, the music cuts dead, the bars close and the camera pushes in. The `death` animation and cutscene play. | after the cutscene's length |
| `aftermath` | framework | frozen | Every part is retired and the arena is cleared. The ending theme plays and the award card shows the trophy, the score bonus and the coins. The level song comes back at `rest` after `STINGER_MS`. | a tap after `AWARD_GUARD_MS`, or after `AFTERMATH_MS` |
| `done` | | | `host.defeated()` | |

A step whose length is zero is passed through without stopping. A tap during `hush`, `entrance`
or `reveal` (after `SKIP_GUARD_MS`) jumps to `fight`: boss at rest, track playing, bar full,
title card removed, dark lifted, bars open, camera at rest. A tap during `transition` jumps to
its end. `finale` cannot be skipped. A tap during `aftermath` goes on to `done` once
`AWARD_GUARD_MS` has passed. In any step other than `fight`, taps never launch the ball, and
abilities, skills and stocked powerups do nothing.

After `done`, `Play.win()` runs as it does today, except that it does not stop the music, play
the fanfare or flash the camera. The clear banner and results play over `rest`. The next level
calls `audio.playMusic('music')`, finds the song already playing and leaves it, and
`MusicIntensity` steers it up from there. That is the ramp back into the action.

## Existing code this rests on

Open the symbol before relying on any of these.

**Play (`src/scenes/Play.ts`)**
- `preload()` loads the world's backdrop with `ParallaxBackdrop.preload(this, this.world)`.
- `create()` builds every system and passes each a host of closures. It ends with `resetBall()`,
  `showHint()`, `introCard()`, launching the HUD scene, and `audio.playMusic('music')`. The
  tutorial (`OnboardingCoach`) is created there when `save.state.seenInstructions` is false.
- `update()` ends with the only win rule: `if (this.hud.remaining > 0) return;` then
  `runDirector.onBoardEmpty()` or `win()`.
- The tutorial freeze is the model for freezing: `coach?.frozen` is checked in `update` (which
  then runs `updateFrozen`), `juice.holdWorld`, the scene RESUME handler, `fireSlot`, `useSkill`,
  `useStock` and `launch`. `syncFreeze()` pauses and resumes physics, but it is only called at the
  end of `updateCoach`, after `if (!coach) return`, so today it never runs without a tutorial.
- `updateAttachedBalls` stops the serve clock with `coach?.holdServe`.
- `onTap()` is: skip the clear banner, else launch a held ball, else fire the gun skill.
- `processBallBrick` lets fireballs plow through bricks whose health is at most `FIREBALL_DAMAGE`,
  and lets pierce pass through any breakable brick, re-hitting it every 200 ms.
- `onBallBrick` calls `bricks.hit(brick, fire ? FIREBALL_DAMAGE : hitDamage * hyper, 'ball',
  { stripArmor: fire })` and plays the hit sound by result.
- `onBrickDestroyed` holds the combo, `pacing.onBreak()`, `musicMood.onBreak()`,
  `fever.onBreak()`, skill charge, score and combo-milestone code. `onBrickHit` flashes a light
  for hits that did not destroy.
- `updatePacing` homes rising balls with `Ball.steerToward` at `NUDGE_TURN` or `ENDGAME_TURN`,
  and sets cruise speed from `1 - remaining / initialBreakables`. `endgameAssist` turns homing on
  when few bricks remain. `checkWallsDown` calls `bricks.shatterSteel()` when the player is stuck.
- `updateMusic` sends a `MusicCue` to `audio.steerMusic` every frame.
- `introCard()` builds the band with the level name. `win()` stops the music, plays
  `audio.fanfare()`, calls `lighting.celebrate()` and `juice.flash(...)`, then shows the clear
  banner, or the results when the level is the last in the list.
- `loseLife(breach)` takes a life. Without `breach` it also resets effects, Fever, powerups,
  lasers, skills, the shield and the paddle size, then `resetBall()` and `showHint()`. With
  `breach` (Descent) the ball stays in play and nothing resets.
- `runHost()` shows how a host is built. `onBricksAdded(bricks, board)` is what a director calls
  after adding bricks.

**Bricks (`src/systems/BrickSystem.ts`, `src/entities/Brick.ts`)**
- `hit`, `kill`, `explode` and `shatterBelow` are the four ways a brick takes damage. The last
  three call `takeHit(0, { lethal: true })` and then `destroy` without looking at the result.
- `append(specs)` adds bricks with a pop-in that tweens `y`, alpha and scale, and returns them.
  `remaining` counts breakable bricks that are not dead. `targets` is alive and breakable.
  `shatterBelow(y)` destroys every brick below `y`, steel included, with cause `breach`, which
  `Play.onBrickDestroyed` answers with a small burst and nothing else.
- Bricks are positioned from `spec.x`, `spec.y` plus `LEVEL_OFFSET_Y` and sized with
  `setDisplaySize`, so any size works. Static bricks have `body.moves = false`.
- `DestroyCause` is declared in `BrickSystem.ts` and imported only by `Play.ts`.
- `src/entities` and `src/core` never import from `src/systems`.
- A ball hit is 500 / 50 / 34 damage by difficulty (`DIFFICULTY` in `src/core/Difficulty.ts`)
  against a default brick health of 100 (`BRICK_HEALTH` in `src/core/procgen/grid.ts`).
- Laser bolts call `bricks.hit(brick, bolt.damage, 'laser', { chip: true })`.
- Abilities (`src/systems/AbilitySystem.ts`) call `bricks.kill(brick, 'ability')` and use the
  result to draw their kill effects. The black hole calls it on every brick in range every
  120 ms for as long as it lasts. The sweep also calls `bricks.hit(brick, 0, 'ability',
  { stripArmor: true })`.

**Physics**
- Arcade physics at 120 Hz, `useTree: false` (`src/main.ts`). `Body.preUpdate` calls
  `updateFromGameObject()` every step, so moving a brick's game object moves its body. Descent
  already tweens static bricks this way (`BrickSystem.shiftDown`).
- `physics.world.timeScale` above 1 is slower (bullet time is 2.2, Hyperspeed is 0.62).
- `juice.hitStop(ms)` pauses physics and resumes it from a scene timer unless `holdWorld()` is
  true.

**Lighting (`src/systems/LightingSystem.ts`, `src/systems/Backdrop.ts`)**
- `tintForeground` gives corner tints to visible bricks and to the paddle, every frame. Nothing
  else is tinted, and nothing else may tint the paddle.
- `castsStillShadow` treats a brick as still when `spec.moveX === 0 && y === homeY`, and the baked
  shadow is keyed by brick ids. A visible brick moved sideways by code would keep a stale shadow.
- On the High tier `ReliefLighting` calls `setLighting(true)` on bricks and the paddle, which
  need the world atlas's normal map.
- `flashAmbient(color, amount)` is rate-limited to `MAX_FLASH_HZ`. `dip(amount)` is a momentary
  drop, not a sustained dim. `pulse(color, amount)` and `celebrate()` exist. `addLight(o)` returns
  a `Light` with `kill()`. Budgets are 12 / 24 / 40 lights by tier (`LIGHTING_BUDGETS` in
  `src/systems/Quality.ts`); gameplay lights use priority 5 and up, ball lights 10.
- `Backdrop.setDark(amount)` is the sustained dim (the black hole uses it, and skips it under
  reduced motion). `juice.flash` is a camera flash and is not rate-limited.

**Audio (`src/systems/AudioSystem.ts`, `src/systems/MusicEngine.ts`, `src/art/music.ts`)**
- One song, `audio/music/pusher.mp3`, with a cue sheet in `src/art/music.json` written by
  `scripts/build-music.py`. Moods are `menu`, `calm`, `groove`, `build`, `drive`, `fever`,
  `danger` (`src/core/MusicMood.ts`); each loops its own sections. `menu` opens on the pad intro.
- `MusicEngine` is built for one buffer and one `MusicTrack`. `play(mood, volume)` starts at once
  with no fade-in. `setMood(mood, urgent)` cuts on the next bar, or beat when urgent, and does
  nothing when the music is stopped. `stop('cut' | 'fade' | 'tape')` ends it.
- `audio.playMusic(key)` returns early when that key is already playing. `audio.stopMusic(ending)`
  clears the wanted key. `refresh()` restarts the wanted key when the music setting is turned on.
- `audio.sfx(key, volume, detune, { delay, x })` passes the key to Phaser, which throws for a key
  that is not loaded. `fanfare_stab`, `fanfare_rise_a`, `fanfare_rise_b` and `fanfare_tail` exist.
- There is no boss song and no stinger asset yet.

**Art (`scripts/`, `art-src/`, `src/art/procedural.ts`, `src/scenes/Preload.ts`)**
- Generated art is kept as sheets on a flat white background in `art-src/`. `scripts/process-art.py`
  (Pillow) removes the white by flood fill from the border, cuts the grid and trims each cell on
  its own, which suits single sprites and would make animation frames jitter. Each asset family
  has its own self-contained script.
- The only sprite sheet and animation today is the coin: `load.spritesheet('coin', ...)` and
  `anims.create({ key: 'coin-spin', ... })` in `Preload`.
- Small icons are painted in code by the `painters` table in `src/art/procedural.ts`.

**HUD (`src/scenes/Hud.ts`, `src/ui/WingPlates.ts`)**
- The HUD scene reads `play.hud` (`HudState`) every frame. On the wide stage `Hud.create` builds
  only `WingPlates` and returns, so every HUD element has two renderers. The HUD is rebuilt when
  the stage flips between wide and narrow.
- Board HUD: the Fever bar is at `HUD_HEIGHT + 1`, effect rings run right from x = 30 at
  `HUD_HEIGHT + 30`, and the strip's label reads `title · detail`.
- `Meter` in `src/ui/widgets.ts` is the bar widget the wing plates use.

**Levels (`src/core/LevelParser.ts`, `public/assets/levels`)**
- Levels are Tiled `.tmj` maps. Map properties arrive as `[{ name, type, value }]` and are read in
  `parseLevel` (`title`, lighting). `validateLevel` requires a breakable brick. The map class
  `LevelLighting` in `superbreaker.tiled-project` lists the map properties.
- In dev, `?map=<file>.tmj` loads a map that is not in `index.json` as an extra level after the
  last one (`devMap` in `src/scenes/Preload.ts`). It plays in the first world, and winning it
  goes to the results screen.
- `tests/levels.test.ts` pins the campaign at 30 levels.

**Layout (`src/config.ts`, `src/core/Layout.ts`, `src/core/types.ts`)**
- The field is 600 wide on every device. Brick cells are 30 by 16; a level may use the 480 px
  below `LEVEL_OFFSET_Y` (`LEVEL_MAX_Y`). The arena is 640 to 840 tall, so the space between the
  lowest bricks and the paddle varies by device. A TV shows the same field with wings.
- The paddle is 104 wide (`PADDLE_BASE_WIDTH`) and resizes between 0.6 and 1.7 times that.
- Depths: bricks 0, aim arrow 4, ball 5, pickups 6.

## Files

| File | Phase | Holds |
| --- | --- | --- |
| `src/core/Boss.ts` | 1 to 4 | Ids, `BossState`, `hitsFor`, tuning, sprite and mood types, motion, plan types and helpers. No Phaser, no imports from `systems`, `entities` or `scenes`. |
| `src/core/Cues.ts` | 3 | `CueSheet`, the pure cue scheduler. |
| `src/systems/BossDirector.ts` | 1 to 4 | `BossDef` and friends, `BossHost`, `BossStage`, the director. |
| `src/systems/BossBody.ts` | 1, 2 | The parts and the sprite: spawn, lookup, retire, poses, motion, animation. |
| `src/systems/HazardSystem.ts` | 4 | Pooled shots, beams, skulls and warnings. |
| `src/ui/BossCinemaView.ts` | 5 | The HUD scene's drawing of `BossCinema`: the curtain, the letterbox bars, the title card and the award card. |
| `src/art/bossMusic.ts` | 5 | `BOSS_TRACK`, the boss track's cue sheet, and its cache key. |
| `src/bosses/index.ts` | 1 | `BOSSES: Record<BossId, BossDef>`. |
| `src/bosses/warden.ts` | 1 to 5 | The reference boss. |
| `public/assets/levels/bosslab.tmj` | 1 | Dev arena. Not in `index.json`. |
| `scripts/build-bosses.py`, `art-src/bosses/`, `public/assets/images/bosses/` | 2 | Boss sprite sheets and the script that cuts them. |
| `scripts/build-boss-audio.py`, `public/assets/audio/boss/` | 5 | The placeholder boss sound effects and the script that synthesizes them. |
| `scripts/build-boss-music.py`, `public/assets/audio/music/boss-placeholder.mp3` | 5 | The placeholder boss track and the script that cuts it from a recording. |
| `tests/boss.test.ts`, `tests/cues.test.ts`, `tests/bosses.test.ts` | 1 to 4 | State, cues, content checks. |

Boss files (`src/bosses/*`) import types and `src/core` only. Everything live reaches them
through `BossStage`. That keeps every boss importable in node tests.

## API

Members are tagged with the phase that adds them. A phase must not build members tagged later.

### Bricks (P1)

```ts
// src/entities/Brick.ts. DestroyCause moves here and BrickSystem re-exports it.
/** Takes a brick's hits in its place: a boss, for the parts of its body. */
export interface BrickOwner {
  /** Called instead of Brick.takeHit for a live, breakable owned brick. Never 'destroyed'. */
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult;
}
// Brick gains: owner?: BrickOwner

// src/systems/BrickSystem.ts
/** Owned bricks skip the pop-in: their owner brings them on. */
append(specs: readonly BrickSpec[], owner?: BrickOwner): Brick[];
/** Removes bricks with no events: no score, no drops, no chain. */
retire(bricks: readonly Brick[]): void;
```

For an owned brick: `hit` asks the owner instead of `takeHit`; `kill` and `explode` go through
`hit` with `{ lethal: true }` and never destroy it; `kill` returns false (nothing was killed, so
abilities draw no kill effect); `shatterBelow` skips it. Balls never pass through it: the plow
and pierce branches of `Play.processBallBrick` exclude owned bricks.

### `src/core/Boss.ts`

```ts
export const BOSS_IDS = ['warden'] as const;
export type BossId = (typeof BOSS_IDS)[number];

export type BossStep =
  | 'hush' | 'entrance' | 'reveal' | 'fight' | 'transition' | 'finale' | 'aftermath' | 'done';
export type AttackWindow = 'gap' | 'windup' | 'live' | 'recover';          // P4

/** The numbers BossState runs on. BossDirector derives one from a BossDef. */
export interface BossSpec {
  phases: Array<{
    hits: number;                       // P1: pool, in plain ball hits on Normal
    enterMs?: number;                   // P3: length of the phase's entry cutscene
    gapMs?: [number, number];           // P4: calm between attacks at a full and an empty pool
    deck?: Array<{ id: string; windupMs: number; liveMs: number; recoverMs: number }>;   // P4
  }>;
  entranceMs?: number;                  // P3
  deathMs?: number;                     // P3
}

export interface BossTuning { health: number; windup: number; gap: number }
export const BOSS_TUNING: Record<DifficultyId, BossTuning>;

export type BossEvent =
  | { type: 'step'; step: BossStep }
  | { type: 'phase'; phase: number }
  | { type: 'window'; window: AttackWindow; attack: string | null };       // P4

export class BossState {
  /** Starts in 'fight' at `phase`, or in 'hush' when `intro` is set (P3). */
  constructor(spec: BossSpec, tuning: BossTuning, opts?: { phase?: number; intro?: boolean });
  readonly step: BossStep;
  readonly phase: number;
  readonly pool: number;                // hits left in this phase
  readonly poolMax: number;
  readonly progress: number;            // 0..1 across all phases
  /** Only in 'fight'. Never carries past a phase boundary. Emptying the last pool is 'finale'. */
  damage(hits: number): BossEvent[];
  readonly stepMs: number;              // P3: time spent in the current step
  readonly stepLength: number;          // P5: how long the current step lasts; Infinity for fight and done
  tick(dt: number, ballInPlay: boolean): BossEvent[];   // P3
  skip(): BossEvent[];                  // P3; P5: in aftermath it goes to done after AWARD_GUARD_MS
  readonly window: AttackWindow;        // P4
  readonly attack: string | null;       // P4
  onLifeLost(): BossEvent[];            // P4
}

/** One hit on a part, in BrickSystem's units. */
export interface BossHit { cause: string; damage: number; lethal?: boolean; stripArmor?: boolean }
/** Brick damage as boss hits, so health means the same on every difficulty. */
export function hitsFor(hit: BossHit, hitDamage: number): number;

// P2: the sprite
export const BOSS_ANIMS = ['idle', 'tell', 'open', 'hurt', 'death'] as const;
export type BossAnim = (typeof BOSS_ANIMS)[number];
export interface SpriteDef {
  key: string;                             // texture key
  path: string;                            // under public/assets
  frameWidth: number; frameHeight: number; // px in the sheet
  width: number; height: number;           // px on the field
  dx?: number; dy?: number;                // sprite centre from the centre of the parts at rest
  anims: Record<BossAnim, { frames: number[]; fps: number }>;
}
/** Body motion: an offset from rest for the whole body at a fight-clock time. */
export type Motion = (clockMs: number) => { x: number; y: number };
export function sway(amplitude: number, periodMs: number): Motion;

// P3: the boss track
export const BOSS_MOODS = ['rise', 'low', 'mid', 'high', 'rest'] as const;
export type BossMood = (typeof BOSS_MOODS)[number];
export type BossIntensity = 'low' | 'mid' | 'high';
/** Which mood of the level song stands in for each boss mood until the boss song exists. */
export const BOSS_MOOD_FALLBACK: Record<BossMood, MusicMood>;

// P4: plans
export type PaddleEffect =
  | { kind: 'jam'; ms: number }            // the paddle holds still; it still bounces the ball
  | { kind: 'shrink'; factor: number };    // Paddle.resize, as the `smaller` pickup does
export type HazardSpec =
  | { kind: 'shot'; from: string; x: number; at: number; flightMs: number; onPaddle: PaddleEffect }
  | { kind: 'beam'; x: number; width: number; at: number; liveMs: number; onPaddle: PaddleEffect }
  | { kind: 'skull'; from: string; x: number; at: number; flightMs: number };   // takes a life
export interface AttackPlan { hazards: HazardSpec[] }
export interface BossView {
  rng: Rng;
  phaseProgress: number;                   // 0 at a full pool, 1 at an empty one
  paddle: { x: number; width: number };
  balls: Array<{ x: number; y: number; vx: number; vy: number }>;
  parts: Record<string, { x: number; y: number; width: number; height: number }>;
}
export interface AttackDef {
  id: string;
  windupMs: number;                        // warning time before anything can hurt
  liveMs: number;                          // every hazard in the plan ends inside this
  recoverMs: number;                       // the opening
  tell?: { sfx?: string };                 // the `tell` animation always plays
  opening?: { pose?: string; lock?: string };
  plan(v: BossView): AttackPlan;
}
/** The narrowest the widest free stretch of the paddle line gets while the plan is live. */
export function safeGap(plan: AttackPlan): number;
/** Every content rule a plan breaks, in words. Empty when the plan is fair. */
export function planProblems(plan: AttackPlan, attack: { liveMs: number }, partIds: readonly string[]): string[];
```

`hitsFor` rules, in order:
- `lethal` with cause `explosion` is `EXPLOSION_HITS`; any other `lethal` is `ABILITY_HITS`.
- cause `ball` without `stripArmor` is `damage / hitDamage` (1, or 2 under Hyperspeed).
- everything else (fireballs, lasers, zero-damage ability hits) is `damage / BRICK_HEALTH`.

Hazard geometry is in field pixels on the paddle line. A shot or skull is authored by `flightMs`,
the time from leaving its part to reaching the paddle line, not by speed, so reaction time is the
same in a short and a tall arena. `x` is where it lands. `at` is milliseconds after the live
window opens. For `safeGap`, a shot occupies `x ± SHOT_RADIUS` and a skull `x ± SKULL_RADIUS` for
`LAND_MS` either side of landing, and a beam occupies `x ± width / 2` from `at` to `at + liveMs`.

### `src/core/Cues.ts` (P3)

```ts
export class CueSheet<C extends { at: number }> {
  constructor(cues: readonly C[], lengthMs: number);
  readonly done: boolean;
  /** Advances the sheet and returns the cues that came due, in `at` order. */
  tick(dt: number): C[];
  /** Ends the sheet now. Cues that were not due never fire. */
  skip(): void;
}
```

### `src/systems/BossDirector.ts`

```ts
export interface PartDef {
  id: string;
  col: number; row: number; cols: number; rows: number;   // brick cells; rows 0 and 1 stay empty
  texture: string;                         // a key of BRICK_TINT: hit sparks, and the brick view
  kind?: 'normal' | 'steel';               // steel deflects and takes no damage
  weak?: number;                           // pool damage multiplier, default 1; 0 soaks hits
  light?: BrickSpec['light'];
}

export type Pose = Record<string, { dx?: number; dy?: number }>;   // P2: part id to px offset

export interface Cue { at: number; run(s: BossStage): void }       // P3
export interface Cutscene { lengthMs: number; cues: Cue[] }        // P3

export interface PhaseDef {
  id: string;
  title: string;                           // HUD detail
  hits: number;
  pose?: string;                           // P2
  motion?: Motion;                         // P2
  setup?(s: BossStage): void;              // P2: state changes; always runs
  intensity?: BossIntensity;               // P3: default rises with the phase
  enter?: Cutscene;                        // P3: not on the first phase
  deck?: AttackDef[];                      // P4: played in order, wrapping
  gapMs?: [number, number];                // P4
}

export interface BossDef {
  id: BossId;
  name: string;
  epithet?: string;                        // P3: title card kicker; default is the world's name
  parts: PartDef[];
  sprite?: SpriteDef;                      // P2
  poses?: Record<string, Pose>;            // P2
  phases: PhaseDef[];
  entrance?: Cutscene;                     // P3
  death?: Cutscene;                        // P3
  trophy?: string;                         // P5: the keepsake named on the award card
}

/** What cutscenes and phase hooks get: the live systems, plus what the fight owns. */
export interface BossStage {
  readonly scene: Phaser.Scene;            // P2 from here
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly scenery: ParallaxBackdrop;
  readonly powerups: PowerupSystem;
  readonly paddle: Paddle;
  readonly calm: boolean;
  readonly center: { x: number; y: number };   // of the body, now
  part(id: string): Brick | undefined;     // undefined once retired
  pose(id: string | null): void;           // null is the phase's own pose
  retire(...partIds: string[]): void;
  spawn(bricks: ArenaBrick[]): Brick[];    // ordinary bricks: they break, score and drop
  readonly audio: typeof audio;            // P3 from here
  anim(name: BossAnim): void;              // until the fight's state next changes
  light(o: LightOptions): Light;           // killed when its cutscene ends, or with the fight
  tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween;   // looks only
  impact(x: number, y: number, scale?: number, color?: number): void;
  shot(shot: Shot | null): void;           // P5 from here: points the camera until the scene ends
  glimpse(color?: number): void;           // lightning through the intro's dark, via flashAmbient
  unveil(): void;                          // lifts the intro's dark now
}

/** Where a scene points the camera: a zoom over the resting view and a field point to centre on. */
export interface Shot {
  zoom: number;
  x: number;
  y: number;
  cut?: boolean;                           // jump there; left out, the camera glides
}

/** What the director needs from Play. Built from closures, like RunHost. */
export interface BossHost {
  readonly scene: Phaser.Scene;            // P1 from here
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly scenery: ParallaxBackdrop;
  readonly powerups: PowerupSystem;
  readonly paddle: Paddle;
  ballInPlay(): boolean;
  timeScale(): number;                     // physics.world.timeScale
  hitDamage(): number;                     // a plain ball hit right now
  bricksAdded(bricks: readonly Brick[], board: boolean): void;
  creditHit(brick: Brick, cause: DestroyCause): void;
  addScore(n: number): void;
  addCoins(n: number): void;               // P5
  setLabel(title: string, detail: string | null): void;
  defeated(): void;
  setHud(view: BossHud | null): void;      // P2
  frame(zoom: number, x: number, y: number): void;   // P5: points Play's camera; (1, centre) is rest
  showHint(): void;                        // P3
  impact(x: number, y: number, scale: number, color: number): void;      // P3
  balls(): readonly Ball[];                // P4
  hurt(): void;                            // P4: a skull landed: Play.loseLife(true)
}

export class BossDirector implements BrickOwner {
  static current?: BossDirector;           // for the debug overlay, like LightingSystem.current
  /** `seed` (P4) feeds the fight's Rng. Play picks it once; it is the only randomness outside Rng. */
  constructor(def: BossDef, host: BossHost, opts?: { startPhase?: number; seed?: number });
  readonly state: BossState;
  readonly active: boolean;                // false once the fight is over
  readonly progress: number;
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult;
  update(dt: number): void;
  debugHit(hits: number): void;            // dev tools
  destroy(): void;
  readonly frozen: boolean;                // P3: transition, finale, aftermath
  readonly holdServe: boolean;             // P3: hush, entrance, reveal
  readonly cinematic: boolean;             // P3: any step but fight
  readonly music: BossMood | null;         // P3: what should be playing; null is silence
  skip(): boolean;                         // P3: true when the tap was consumed
  readonly lock: { x: number; y: number } | null;   // P4
  onLifeLost(): void;                      // P4
}

export interface BossHud {                 // P2, on HudState.boss
  name: string;
  title: string;
  phase: number;                           // 0-based
  phases: number;
  health: number;                          // 0..1 of the current phase's pool
  shown: boolean;                          // reveal, fight, transition and finale only
  cinema: BossCinema;                      // P5
}

/** What the HUD scene draws over the fight, worked out on the fight clock every frame. */
export interface BossCinema {              // P5
  bars: number;                            // letterbox, 0 open to 1 closed
  dark: number;                            // the black over the field, 0..1
  title: BossTitle | null;                 // { kicker, name, ms, holdMs }
  award: BossAward | null;                 // { name, trophy, score, coins, ms, ready, left }
}
```

`ArenaBrick` is a `BrickSpec` without an id; the framework assigns ids from `BOSS_ID_BASE` up so
they never collide with a level's.

### `src/systems/HazardSystem.ts` (P4)

Hazards have no physics bodies. They are pooled images moved by the fight clock, and whether one
hit the paddle is arithmetic on the paddle line at the moment it lands. The director calls
`arm(plan, windupMs)` when a wind-up starts (warnings appear), `go()` when the live window opens,
`update(dt)` every frame and `clear()` whenever the fight leaves the attack. The full sketch is
in [phase-4-attacks.md](phase-4-attacks.md). A skull in flight that comes within
`SKULL_POP_RADIUS` of a free ball breaks, at no cost (P5).

### How a hit is counted

`BossDirector.strike` runs inside a physics callback, so it only records:

1. Outside `fight`, answer `immune`.
2. A `lethal` hit on a part that took a lethal hit less than `LETHAL_GAP_MS` ago (fight clock):
   answer `immune`. Without this the black hole would land a hit every 120 ms.
3. A part with `weak: 0`: answer `armor`.
4. Otherwise add `hitsFor(...) * weak` to the hits pending, call `host.creditHit` once for each
   whole hit that accumulates, and answer `damaged`.

`BossDirector.update` then applies the pending hits with `state.damage` and reacts to the events.
Parts are retired, bricks spawned and steps changed only from `update`, never from `strike`.

### How the sprite animates

The framework picks the animation; a boss only supplies frames. Highest wins:

1. `death` in `finale`, held on its last frame.
2. `hurt` for `HURT_MS` after a counted hit, at most once every `HURT_GAP_MS`.
3. `open` during an opening (P4).
4. `tell` during a wind-up and while the attack is live (P4).
5. `idle`.

`BossStage.anim(name)` from a cue overrides 3 to 5 until the fight's step or attack window next
changes. The sprite follows the body's motion. Poses move parts, not the sprite: the `open`
picture and the `open` pose have to agree, and `?debug` shows the parts over the sprite to check.

### The boss track

`audio.bossMusic(mood)` (P3) starts the boss track at `mood`, coming in over `BOSS_SWELL_S` when
nothing is playing, or moves it to `mood` on the next beat. `audio.bossStinger()` plays the ending
theme. `Play` calls `audio.bossMusic(boss.music)` every frame while a boss is active, so a music
setting toggled mid-fight recovers by itself. The director stops the music itself at the hush
(`fade`) and at the final hit (`cut`).

The boss track is `BOSS_TRACK` in `src/art/bossMusic.ts`, played by a second `MusicEngine` on the
level song's bus and analyser (P5). `Play.preload` loads it for boss levels only. Its playlists
are keyed by `BOSS_MOOD_FALLBACK[mood]`; `rest` always plays on the level song's engine, and so
does every mood when the boss track is not loaded. The file is a placeholder cut from a recording
by `scripts/build-boss-music.py`: one song played through, so every mood has the same playlist
and a change of phase does not change what is heard. The stinger is `boss_victory`, a
synthesized placeholder, played as a sound effect.

## Constants

Starting values. They are tuning, not truth; change them with a reason in STATUS.md.

| Name | Value | Meaning |
| --- | --- | --- |
| `EXPLOSION_HITS` | 3 | Boss hits from one explosion. |
| `ABILITY_HITS` | 2 | Boss hits from one ability kill. |
| `LETHAL_GAP_MS` | 1000 | A part takes at most one lethal hit in this long. |
| `BOSS_TUNING` | easy `{ health: 0.8, windup: 1.25, gap: 1.25 }`, normal all 1, hard `{ health: 1.25, windup: 0.85, gap: 0.8 }` | Multipliers by difficulty. |
| `BOSS_ID_BASE` | 100000 | First brick id the framework hands out. |
| `BODY_MAX_SPEED` | 120 px/s | Fastest a part may move while the world is live. |
| `BODY_SCENE_SPEED` | 600 px/s | Fastest a part may move while the ball is held or the world is frozen. |
| `SPRITE_DEPTH` | 1 | Above bricks, below the ball. |
| `HURT_MS`, `HURT_GAP_MS` | 180, 250 | Length of the flinch, and the least time between two. |
| `HUSH_MS` | 1600 | Fade to black and silence before the entrance. |
| `HUSH_DARK` | 1 | How black the HUD's curtain goes from the hush until the entrance unveils the boss. Skipped under reduced motion. |
| `ENTRANCE_DROP` | 40 px | How far above rest the sprite starts its entrance. |
| `REVEAL_MS` | 3600 | The title card. |
| `AFTERMATH_MS` | 12000 | The award card goes on by itself after this. |
| `AWARD_GUARD_MS` | 1800 | Taps are ignored this long into the award. |
| `AWARD_TROPHY_MS` | 900 | When the trophy lands on the award card. |
| `STINGER_MS` | 6500 | The ending theme plays alone this long before the level song returns. |
| `BARS_MS` | 450 | The letterbox bars close and open over this. |
| `BOSS_DEFEAT_COINS` | 25 | Coins for the kill. |
| `SKULL_POP_RADIUS` | 26 px | A free ball this close to a flying skull breaks it. |
| `SKIP_GUARD_MS` | 400 | Taps are ignored this long into the intro. |
| `BOSS_SWELL_S` | 0.05 | Seconds the boss track takes to come in. Short: the placeholder song opens on its loudest notes. |
| `BOSS_MOOD_FALLBACK` | `{ rise: 'build', low: 'groove', mid: 'drive', high: 'fever', rest: 'menu' }` | Level-song moods standing in for the boss track. |
| `BOSS_STINGER` | `'boss_victory'` | Placeholder ending theme. |
| `BOSS_PHASE_BONUS` | 500 | Score for emptying a pool. |
| `BOSS_DEFEAT_BONUS` | 2000 | Score for the kill. |
| `MIN_WINDUP_MS` | 500 | Floor on wind-up after difficulty scaling. |
| `MIN_FLIGHT_MS` | 700 | Floor on a shot's flight time. |
| `MIN_SKULL_FLIGHT_MS` | 1600 | Floor on a skull's flight time. |
| `MAX_SKULLS` | 2 | Most skulls in one plan. |
| `MAX_JAM_MS` | 900 | Longest a hazard may jam the paddle. |
| `REGROUP_MS` | 1200 | Calm after a lost life before the next attack. |
| `MAX_HAZARDS` | 48 | Most hazards one plan may hold. |
| `SAFE_GAP` | 200 | Paddle line that must stay free at every moment: the widest paddle (104 x 1.7) plus a margin. |
| `SHOT_RADIUS`, `SKULL_RADIUS` | 10, 16 | Half-widths on the paddle line. |
| `LAND_MS` | 150 | A shot or skull occupies its landing spot this long either side of landing. |
| `LOCK_TURN` | same as `NUDGE_TURN` | Homing turn rate toward a locked part, rad/s. Lives in `Play.ts`. |

## Content rules

These hold for every boss and are checked by tests or by the reviewer.

- Boss files import types and `src/core` only.
- Parts and a boss level's arena bricks stay out of rows 0 and 1 (the boss bar sits there) and
  inside the level area. Arena bricks do not overlap parts.
- Parts are `normal` or `steel`: no regen, explosive or moving-brick parts.
- At least one part can be hurt in every phase.
- A boss level never runs the tutorial and never collapses.
- Hazard counts never scale with the quality tier. Only trails, lights and particles scale.
- Every attack's wind-up, scaled for Hard, is at least `MIN_WINDUP_MS`. Every shot flies at least
  `MIN_FLIGHT_MS` and every skull at least `MIN_SKULL_FLIGHT_MS`. Every jam is at most
  `MAX_JAM_MS`. Every plan keeps `SAFE_GAP` free.
- A plan holds at most `MAX_SKULLS` skulls, and a plan with a skull has no jam in it, so a skull
  can always be dodged.
- A boss keeps at most three lights alive, at priority 6 to 8, under the balls' 10.
- Hazards and warnings use `theme().palette.danger`; the lock reticle uses `palette.gold`. Both
  draw below the ball (depth 5) so the ball is never hidden. A skull never looks like a pickup.
- No text is needed to read an attack.

## As built

Where the code deliberately departs from the design above. Phase 5's departures were asked for by
the user after playing Phase 4 (see STATUS.md); each is one line.

- **Fade to black, not a dim.** The hush goes fully black on a curtain in the HUD scene instead of
  `Backdrop.setDark(0.45)`: the user wanted the boss unseen until lightning shows it.
- **Letterbox bars, a camera and a title card.** All three were left out or smaller in the design;
  the user asked for a film-style intro. They are drawn from `BossHud.cinema`, which the director
  works out on the fight clock, so a skip or a pause can never leave one behind.
- **The reveal is a title card, not `Play`'s title band.** `BossHost.titleCard` and
  `BossHost.backdrop` are gone; `BossHost.frame` and `addCoins` are new.
- **A hit-stop on every phase's kill shot.** The user's flow marks the kill shot before the
  scene starts.
- **The stinger plays in the aftermath, not the finale.** The death scene plays over silence and
  its own sounds; the ending theme starts when the boss is gone.
- **The aftermath is an award, and a tap ends it.** It was 1.8 s that could not be skipped; it is
  now a card with the trophy, the bonus and coins that waits for a tap or `AFTERMATH_MS`.
- **A ball breaks a skull.** "Shots the ball can pop" is listed as left out below. Skulls alone
  got it, because a skull landing where the ball was coming down was a loss nobody could avoid.
- **Paddle hits announce themselves.** A jam or a shrink now comes with a jolt, a light, a word
  and a sound: the user could not tell they had been hit.
- **The world's lightning and failing lights wait while a scene runs.** They shared the flash
  limit with the boss, flashing unseen under the black intro and taking a glimpse's place.
- **The boss track is a second engine.** Decision 8's fallback (the level song's sections) is
  kept only for when the boss track has not loaded. `MusicEngine` was not made generic over its
  mood type: the boss track's playlists are keyed by the level moods in `BOSS_MOOD_FALLBACK`.
- **The placeholder track ignores intensity.** It is one song played through, so `low`, `mid` and
  `high` sound the same. A track with a section per mood needs only a new cue sheet.
- **The Warden grew a third phase** in Phase 5 (it had two), so that a phase scene is seen twice
  and the skull waits for the last phase.

## Left out of this build

Listed so nobody builds them by accident. Each is a possible follow-up.

- **The real boss track.** It needs the song, its tempo and bar map, and which bars are `rise`,
  `low`, `mid`, `high`, `rest` and the stinger. The second engine that plays it is built (see "As
  built"); what is left is the file, its cue sheet in `src/art/bossMusic.ts` and its cut in
  `scripts/build-boss-music.py`, and optionally `MusicEngine` made generic over its mood type.
- **Arcade boss waves.** The design is agreed (every fifth tier, Waves only). It is one more work
  order after Phase 5.
- **Bosses in the shipped campaign.** The map property works from Phase 1. Levels 10, 20 and 30
  get it when real bosses exist; the Warden is throwaway. A Briefing chip and a WorldPath label
  go with that.
- Parts with their own health that break off; shots the paddle can bat back; shots the ball can
  pop; arena changes inside attack plans; shuffled decks.
- Beat-synced cues, fading the HUD during cutscenes, a shadow under the sprite,
  per-pixel relief lighting on the sprite.
- Phase checkpoints on retry, boss save data, a player-controlled choice of target, the Shield
  powerup blocking skulls.
