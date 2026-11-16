# Phase 4: attacks

Read [README.md](README.md) and [design.md](design.md) first, especially decisions 3, 4 and 9,
the plan types, and "Content rules". Phase 3 must show PASS in [STATUS.md](STATUS.md).

## Goal

The boss attacks. Each attack warns before it can hurt, hinders the paddle if it lands, and is
followed by an opening in which the weak point is marked and the ball is drawn to it. One hazard,
the skull, costs a life. Every attack can be shown to be fair by a test.

When this phase is done, the Warden cycles through attacks while a ball is in play: its sprite
winds up, markers show on the paddle line where each hazard will land and how soon, then shots
fall and beams fire. A shot that lands on the paddle jams it for a moment or shrinks it. A skull
that the paddle touches costs a life and the ball keeps going. After each attack the core is
exposed, a reticle marks it, and rising balls curve toward it. Losing a life clears the hazards
and gives a breather.

## Read first

- `src/core/Rng.ts`. `src/core/Homing.ts` and `tests/homing.test.ts`.
- `src/entities/Paddle.ts`, `src/entities/Ball.ts` (`steerToward`).
- `src/systems/InputSystem.ts`: how input sets `paddle.targetX`.
- `src/scenes/Play.ts`: `updatePacing`, `loseLife`, `rearm`, `updateTimeScale`, `bossHost`.
- `src/art/procedural.ts`: the `painters` table, `ALWAYS_PROCEDURAL`, `paintFallback`.
- `src/systems/LaserSystem.ts`: how pooled objects are kept and recycled.
- `src/systems/LightingSystem.ts`: `addLight` with `area`, `follow` and `priority`.
- `src/ui/theme.ts`: `theme().palette`.
- The director, body and Warden as Phase 3 left them.

## Build

### 1. `src/core/Boss.ts`

Members tagged P4: `AttackWindow`, the `window` event, `BossSpec.phases[].gapMs` and `deck`,
`BossState.window`, `attack`, `onLifeLost`, `PaddleEffect`, `HazardSpec`, `AttackPlan`,
`BossView`, `AttackDef`, `safeGap`, and the constants `MIN_WINDUP_MS`, `MIN_FLIGHT_MS`,
`MIN_SKULL_FLIGHT_MS`, `MAX_SKULLS`, `MAX_JAM_MS`, `REGROUP_MS`, `MAX_HAZARDS`, `SAFE_GAP`,
`SHOT_RADIUS`, `SKULL_RADIUS`, `LAND_MS`. Also:

```ts
/** Every rule a plan breaks, in words. Empty when the plan is fair. */
export function planProblems(plan: AttackPlan, attack: { liveMs: number }, partIds: readonly string[]): string[];
```

**The attack cycle**, inside `fight` only:
- The window goes `gap`, `windup`, `live`, `recover`, and back to `gap`, taking the next attack
  in the deck each time and wrapping. Each change returns a `window` event carrying the attack's
  id, or null for `gap`.
- The cycle advances only on ticks where `ballInPlay` is true. A phase with no deck stays in
  `gap` and returns no window events.
- `gap` lasts the phase's `gapMs` interpolated from its first value at a full pool to its second
  at an empty one, times `tuning.gap`. The default `gapMs` is `[2600, 1600]`.
- `windup` lasts `max(MIN_WINDUP_MS, windupMs * tuning.windup)`. `live` and `recover` last the
  attack's own times.
- Leaving `fight`, or changing phase, puts the window back to `gap` with a `window` event if it
  was not already there, and the new phase starts at the top of its deck.
- `onLifeLost()` puts the window to `gap` for at least `REGROUP_MS`, with a `window` event if it
  was not already there. The interrupted attack is not replayed.

**`safeGap(plan)`**: over the time the plan is live, the smallest value of "the widest stretch of
x in 0..600 that no hazard occupies", using the occupancy rules in design.md. An empty plan
returns 600.

**`planProblems`** reports: more than `MAX_HAZARDS`; a hazard that starts before 0 or ends after
`liveMs` (a shot or skull ends at `at + flightMs`, a beam at `at + liveMs`); a shot flying less
than `MIN_FLIGHT_MS`; a skull flying less than `MIN_SKULL_FLIGHT_MS`; more than `MAX_SKULLS`; a
skull together with any jam; a jam longer than `MAX_JAM_MS`; a shrink factor outside 0.6 to 1; an
`x` outside 0..600; a `from` that is not a part id; `safeGap` below `SAFE_GAP`.

Tests in `tests/boss.test.ts`:
- The cycle visits the four windows in order with the right lengths; the deck wraps; nothing
  advances while no ball is in play; a phase without a deck emits nothing; Hard's wind-up is
  shorter than Normal's but never under `MIN_WINDUP_MS`; the gap shortens as the pool empties;
  a phase change mid-attack returns to `gap`; `onLifeLost` mid-attack returns to `gap` for
  `REGROUP_MS` and the next attack is the following one in the deck.
- `safeGap`: empty plan is 600; one beam of width 100 at x 300 gives 250; two beams that overlap
  in time are both counted and two that do not are counted separately; a shot only counts within
  `LAND_MS` of landing; a skull uses `SKULL_RADIUS`.
- `planProblems`: one failing case per rule, and one plan that passes them all.

### 2. `Paddle.jam`

`jam(ms)` holds the paddle where it is for `ms` of real time; `jam(0)` releases it; `jammed`
reads it. While jammed, `step` counts the time down, keeps `x`, sets `vx` to 0 and still clamps
`targetX`, so the paddle goes where the player is pointing the moment it is released. Show it
with the paddle's alpha (lower while jammed, 1 after), set in `step`. The paddle's tint belongs
to the lighting system; do not touch it.

### 3. `src/systems/HazardSystem.ts`

No physics bodies. Hazards are pooled images moved by the fight clock, and hits are worked out
with arithmetic on the paddle line.

```ts
export interface HazardHost {
  readonly scene: Phaser.Scene;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  partPos(id: string): { x: number; y: number } | undefined;
  hurt(): void;
}
export class HazardSystem {
  constructor(host: HazardHost);
  /** A wind-up began: show where and when everything in the plan will land. */
  arm(plan: AttackPlan, windupMs: number): void;
  /** The live window opened: `at` times count from now. */
  go(): void;
  /** `dt` is fight-clock milliseconds. */
  update(dt: number): void;
  clear(): void;
  readonly count: number;
  destroy(): void;
}
```

- **Warnings.** From `arm`, every hazard has a marker on the paddle line at its `x`: a small mark
  for a shot, a strip as wide as the beam for a beam, a larger skull mark for a skull. Each
  marker closes in (a shrinking ring, or a filling strip) so that it completes exactly when the
  hazard lands or fires. Markers are static shapes under reduced motion, with the same timing
  shown by fill.
- **Shots and skulls.** At `at` after `go`, the image appears at its part's position (the top of
  the arena above `x` if the part is gone) and moves in a straight line to `(x, paddle.y)`,
  arriving after `flightMs`. On arrival, if `|x - paddle.x| <= paddle.halfWidth + radius`, apply
  the effect; otherwise it fizzles on the line. Then it returns to the pool.
- **Beams.** A column of the beam's width from the top of the arena to the paddle line: faint
  from `arm`, bright from `at` to `at + liveMs`. While bright, the first frame the paddle
  overlaps it applies the effect, once per beam.
- **Effects.** `jam`: `paddle.jam(ms)`. `shrink`: `paddle.resize(factor)`. Skull: `host.hurt()`.
  Each with a spark and a sound.
- **Looks.** Paint `hazard_shot`, `hazard_skull` and `hazard_mark` in `src/art/procedural.ts` the
  way `spark` and `ring` are painted and registered. Everything is `palette.danger`, drawn at a
  depth between the aim arrow (4) and the ball (5). The skull must not resemble any pickup: it
  is larger than a shot, does not spin like a coin or rock like a powerup, and has its own launch
  sound.
- **Lights.** One light for each live beam and each skull in flight, priority 7, never more than
  three alive in total. Shots have none.
- **Cost.** At most `MAX_HAZARDS` hazards at once, from pools that never shrink or leak. No
  particles per frame per hazard; a trail may be added on the Medium and High tiers only.
- `clear()` removes everything at once, markers included.

### 4. The director

Types tagged P4: `PhaseDef.deck`, `PhaseDef.gapMs`, `BossHost.balls`, `BossHost.hurt`,
`BossDirector.lock`, `BossDirector.onLifeLost`.

- Give the state each phase's deck timings and `gapMs`. Call `hazards.update` with the clock step
  every frame in `fight`.
- One `Rng` per fight, from a seed in `opts.seed`. `Play` picks that seed once with
  `Math.random()` when it builds the director; that line is the only randomness outside `Rng`.
- **`windup`.** Build a `BossView` from the live paddle, balls and parts, call the attack's
  `plan`, and in dev builds `console.warn` every line from `planProblems`. In every build, drop
  hazards beyond `MAX_HAZARDS`. Call `hazards.arm`. Play the `tell` animation and `tell.sfx`.
- **`live`.** `hazards.go()`. The `tell` animation carries on.
- **`recover`.** If the attack has an `opening`: apply its pose, set the lock to its part, and
  play the `open` animation. Otherwise `idle`.
- **`gap`.** `hazards.clear()`, the phase's own pose, no lock, `idle`.
- Leaving `fight` for any reason clears hazards, the lock and any jam.
- `lock`: the centre of the lock part while the window is `recover` and the part is alive,
  otherwise null. A reticle (the `ring` texture, `palette.gold`, below the ball) sits on it; it
  turns slowly unless reduced motion is on.
- `onLifeLost()`: pass to the state, handle the events, clear hazards.
- Animation priority is now the full list in design.md.
- Dev: `&attack=<id>` makes every phase's deck that one attack. The `?debug` line gains the
  window, the attack id and the hazard count.

### 5. `src/scenes/Play.ts`

- `updatePacing`: when `boss?.lock` is set, steer every free ball toward it with `LOCK_TURN`
  (a new constant beside `NUDGE_TURN`, with the same value) and skip the other homing.
- `loseLife`: call `boss?.onLifeLost()` on every lost life, and `paddle.jam(0)` where the paddle
  size is reset.
- `bossHost()` gains `balls` and `hurt`. `hurt` is `loseLife(true)`.

### 6. The Warden

Three attacks, each small, that between them use every hazard and effect:

- `volley`: three to five shots from `body` at columns around where the paddle was when the
  wind-up began, each `jam` for 600 ms, always leaving `SAFE_GAP` to one side.
- `sweep`: two beams that leave either the middle or one side free, chosen by `rng`, `shrink`
  0.8.
- `reaper`: one skull aimed at where the paddle was, flight 1800 ms, with two `shrink` shots
  elsewhere. No jam.

Each has `opening: { pose: 'open', lock: 'core' }`. Phase 1 "Guard up" has no pose of its own and
plays `[volley]`, so the core is only reachable in openings. Phase 2 "Core exposed" keeps
`pose: 'open'` and plays `[sweep, reaper, volley]` with a shorter `gapMs`.

### 7. Content tests

`tests/bosses.test.ts`, for every attack of every boss: run `plan` against views built from five
paddle positions, three values of `phaseProgress` and twenty seeds, and assert `planProblems` is
empty every time; the same seed and view give a deeply equal plan twice; its wind-up scaled for
Hard is at least `MIN_WINDUP_MS`; its `opening.pose` and `opening.lock` exist; attack ids are
unique within a boss. If `AUDIO_ASSETS` can be imported in a node test, also assert every
`tell.sfx` is one of its keys; if it cannot, say so in STATUS.md.

## Do not

- Do not give hazards physics bodies, colliders or overlap callbacks.
- Do not let any hazard other than the skull cost a life, or let a skull reset the ball.
- Do not scale hazard counts by quality tier or difficulty.
- Do not build shots that can be batted or popped, arena changes inside plans, or shuffled decks.
- Do not add an input for choosing a target.

## Checks

Automated: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

Manual, at `?map=bosslab.tmj`. `&attack=<id>` isolates one attack. Record what you saw.

1. Nothing attacks while the ball is on the paddle. Attacks begin after a launch.
2. For each attack: markers appear at the start of the wind-up and complete as each hazard
   arrives; no hazard arrives without a marker; standing in the free stretch is always safe.
3. A shot on the paddle jams it for about 600 ms (it dims, ignores input, still bounces the
   ball) and then goes where the pointer is. A beam shrinks it once.
4. The skull looks unlike a pickup, lands where its marker says, costs exactly one life when the
   paddle touches it, and the ball stays in play. Dodging it costs nothing. In god mode
   (Settings) it costs nothing.
5. After each attack the core is exposed and marked, and a rising ball visibly curves toward it.
   Outside openings the reticle is gone and balls fly straight.
6. Losing the ball clears every hazard and marker and the next wind-up comes no sooner than about
   a second after relaunch. Emptying the pool mid-attack clears them too.
7. Bullet time slows hazards with the ball. Pause freezes them.
8. With five balls in play and the busiest attack, the frame rate at `?lighting=low` in a
   phone-sized window is no worse than the same fight with no attack. Note both numbers from the
   `?debug` overlay.
9. Reduced motion on: markers still show timing, nothing pulses or spins.
10. The console shows no `planProblems` warnings across five minutes of play.
11. `?level=1`, `?arcade=waves` and `?arcade=descent` play as before, and the paddle is never
    jammed outside a boss fight.

## For the user to confirm

- Whether each attack is readable and fair by feel, especially the skull.
- The jam length, the shrink amount and the lock-on strength.
- The placeholder sounds for the tell, the jam and the skull.

## Record in STATUS.md

Each manual check with numbers where asked; the sound keys used; hazard counts per attack;
anything left open.
