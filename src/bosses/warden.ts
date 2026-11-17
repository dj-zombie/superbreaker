import { SHOT_RADIUS, SKULL_RADIUS, sway, type AttackDef, type HazardSpec } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { ArenaBrick, BossDef, BossStage, Cutscene } from '../systems/BossDirector';

/** The wall the Warden drops under itself: its first column, its row and how many bricks. */
const WALL_COL = 7;
const WALL_ROW = 16;
const WALL_BRICKS = 6;
/** The Warden's own light: the violet of its body and the red of its eye. */
const VIOLET = 0x9b6bff;
const EYE_RED = 0xff3c2a;
/**
 * The blasts that break the Warden up, each further out than the last: ms into the death scene,
 * px from the body's centre, and size. They are far enough apart that two flashes at most burn.
 */
const BREAKUP = [
  { at: 300, dx: -40, dy: -15, scale: 0.7 },
  { at: 650, dx: 60, dy: 15, scale: 0.8 },
  { at: 1000, dx: -85, dy: 40, scale: 0.9 },
  { at: 1350, dx: 105, dy: -25, scale: 1 },
] as const;

function wall(): ArenaBrick[] {
  return Array.from({ length: WALL_BRICKS }, (_, i): ArenaBrick => {
    return {
      x: (WALL_COL + i) * BW,
      y: WALL_ROW * BH,
      width: BW,
      height: BH,
      texture: 'brick_purple2',
      kind: 'normal',
      health: BRICK_HEALTH,
      armor: 0,
      moveX: 0,
      moveSpeed: 0,
      regenDelay: 0,
    };
  });
}

/** Where the eye is now, or the middle of the body once the core is gone. */
function eye(s: BossStage): { x: number; y: number } {
  return s.part('core') ?? s.center;
}

/** It comes out of the dark: a rumble under a swelling glow, then a roar as it lands. */
const entrance: Cutscene = {
  lengthMs: 1800,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = s.center;
        s.audio.sfx('thunder', 0.4, -200);
        const glow = s.light({ x, y, radius: 70, color: VIOLET, intensity: 0.2, priority: 7 });
        s.tween({ targets: glow, radius: 240, intensity: 1.1, duration: 1100, ease: 'Sine.In' });
      },
    },
    {
      at: 1150,
      run: (s) => {
        const { x, y } = s.center;
        s.anim('tell');
        s.impact(x, y, 1.2, VIOLET);
        s.audio.sfx('ab_meteor_impact', 0.55);
      },
    },
  ],
};

/** The guard lets go: a roar, the eye flares, and its light bursts out. */
const exposed: Cutscene = {
  lengthMs: 1200,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        s.anim('tell');
        s.audio.sfx('brick_steel', 0.5, -300);
        const flare = s.light({ x, y, radius: 80, color: EYE_RED, intensity: 0.3, priority: 7 });
        s.tween({ targets: flare, radius: 220, intensity: 1.3, duration: 600, ease: 'Cubic.In' });
      },
    },
    {
      at: 650,
      run: (s) => {
        const { x, y } = eye(s);
        s.impact(x, y, 1.3, EYE_RED);
        s.audio.sfx('surge', 0.5);
      },
    },
  ],
};

/** It breaks up from the eye outward while the eye burns out, then goes all at once. */
const death: Cutscene = {
  lengthMs: 2200,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        const ember = s.light({ x, y, radius: 160, color: EYE_RED, intensity: 1.4, priority: 7 });
        s.tween({ targets: ember, radius: 60, intensity: 0, duration: 1900, ease: 'Sine.In' });
      },
    },
    ...BREAKUP.map(({ at, dx, dy, scale }, i) => ({
      at,
      run: (s: BossStage) => {
        const { x, y } = s.center;
        s.impact(x + dx, y + dy, scale);
        // Each blast a little higher than the last, so the run climbs.
        s.audio.sfx('brick_tnt', 0.4, i * 100, { x: x + dx });
      },
    })),
    {
      at: 1800,
      run: (s) => {
        const { x, y } = s.center;
        s.impact(x, y, 1.6);
        s.audio.sfx('brick_collapse', 0.6);
      },
    },
  ],
};

/** What every attack gives away once it is spent: the guard lifts off the eye, and the eye is marked. */
const OPENING = { pose: 'open', lock: 'core' } as const;
/** How long the Warden stands open after an attack, in ms. */
const OPEN_MS = 2200;
/** The volley: px between its columns, then ms between its shots, of their flight and of their jam. */
const VOLLEY_SPACING = 40;
const VOLLEY_STAGGER_MS = 70;
const VOLLEY_FLIGHT_MS = 800;
const VOLLEY_JAM_MS = 600;
/** The sweep: how many lanes the field splits into, and how much of a lane's width a beam fills. */
const SWEEP_LANES = 3;
const SWEEP_FILL = 0.95;
/** The sweep: ms from one beam firing to the next, ms each one burns, and what it leaves of the paddle. */
const SWEEP_STAGGER_MS = 250;
const SWEEP_BURN_MS = 600;
const SWEEP_SHRINK = 0.8;
/** The reaper: ms the skull flies, px from it to the shot on either side, and ms those shots fly. */
const REAPER_FLIGHT_MS = 1800;
const REAPER_SPREAD = 130;
const REAPER_SHOT_FLIGHT_MS = 800;
/** The reaper: when its two shots set off, in ms, so both land and are gone before the skull does. */
const REAPER_SHOT_AT = [100, 500] as const;
const REAPER_SHRINK = 0.8;

/** `x`, kept at least `margin` px inside the field. */
function inField(x: number, margin: number): number {
  return Math.min(FIELD_WIDTH - margin, Math.max(margin, x));
}

/** A rake of jamming shots across where the paddle stood: three at a full pool, five at an empty one. */
const volley: AttackDef = {
  id: 'volley',
  windupMs: 900,
  liveMs: 1200,
  recoverMs: OPEN_MS,
  tell: { sfx: 'laser_spinup' },
  opening: OPENING,
  plan: ({ rng, paddle, phaseProgress }) => {
    const count = 3 + Math.round(2 * phaseProgress);
    const reach = ((count - 1) * VOLLEY_SPACING) / 2;
    // The rake lands whole on the field, and it is narrow enough to leave one side of it free.
    const mid = inField(paddle.x, reach + SHOT_RADIUS);
    const dir = rng.chance(0.5) ? 1 : -1;
    return {
      hazards: Array.from({ length: count }, (_, i): HazardSpec => {
        return {
          kind: 'shot',
          from: 'body',
          x: mid + dir * (i * VOLLEY_SPACING - reach),
          at: i * VOLLEY_STAGGER_MS,
          flightMs: VOLLEY_FLIGHT_MS,
          onPaddle: { kind: 'jam', ms: VOLLEY_JAM_MS },
        };
      }),
    };
  },
};

/** Two beams that shrink what they touch. They leave one lane free: the middle, or either side. */
const sweep: AttackDef = {
  id: 'sweep',
  windupMs: 1000,
  liveMs: 900,
  recoverMs: OPEN_MS,
  tell: { sfx: 'ab_meteor_whoosh' },
  opening: OPENING,
  plan: ({ rng }) => {
    const lane = FIELD_WIDTH / SWEEP_LANES;
    const free = rng.int(0, SWEEP_LANES - 1);
    const burning: number[] = [];
    for (let i = 0; i < SWEEP_LANES; i++) if (i !== free) burning.push(i);
    // Which of the two fires first is left to chance as well.
    if (rng.chance(0.5)) burning.reverse();
    return {
      hazards: burning.map((i, n): HazardSpec => {
        return {
          kind: 'beam',
          x: (i + 0.5) * lane,
          width: lane * SWEEP_FILL,
          at: n * SWEEP_STAGGER_MS,
          liveMs: SWEEP_BURN_MS,
          onPaddle: { kind: 'shrink', factor: SWEEP_SHRINK },
        };
      }),
    };
  },
};

/** A skull from the eye for where the paddle stood, and a shrinking shot to either side of it. */
const reaper: AttackDef = {
  id: 'reaper',
  windupMs: 1100,
  liveMs: 1900,
  recoverMs: OPEN_MS,
  tell: { sfx: 'ui_deny' },
  opening: OPENING,
  plan: ({ rng, paddle }) => {
    const x = inField(paddle.x, SKULL_RADIUS);
    // One shot each side of the skull. Near a wall both go to the open side, one beyond the other.
    const left = x - REAPER_SPREAD;
    const right = x + REAPER_SPREAD;
    const sides = [
      left >= SHOT_RADIUS ? left : x + 2 * REAPER_SPREAD,
      right <= FIELD_WIDTH - SHOT_RADIUS ? right : x - 2 * REAPER_SPREAD,
    ];
    if (rng.chance(0.5)) sides.reverse();
    return {
      hazards: [
        { kind: 'skull', from: 'core', x, at: 0, flightMs: REAPER_FLIGHT_MS },
        ...sides.map((side, n): HazardSpec => {
          return {
            kind: 'shot',
            from: 'body',
            x: side,
            at: REAPER_SHOT_AT[n]!,
            flightMs: REAPER_SHOT_FLIGHT_MS,
            onPaddle: { kind: 'shrink', factor: REAPER_SHRINK },
          };
        }),
      ],
    };
  },
};

/**
 * The reference boss: dev-only content that exercises the framework. Its body is the band across
 * the shoulders. The core is the eye, which takes triple damage and hangs below the body, and a
 * steel guard under the core shields it from below, so the ball has to come at it from the side.
 * In the second phase the guard pulls up behind the core and the core can be hit from below.
 * Its three attacks use every hazard between them, and after each one the guard lifts for a while.
 */
export const warden: BossDef = {
  id: 'warden',
  name: 'Warden',
  epithet: 'Keeper of the gate',
  parts: [
    { id: 'body', col: 7, row: 3, cols: 6, rows: 2, texture: 'brick_purple2' },
    // The core's top row lies under the body, so only the two rows below it can be hit.
    { id: 'core', col: 9, row: 4, cols: 2, rows: 3, texture: 'brick_red', weak: 3 },
    { id: 'guard', col: 9, row: 7, cols: 2, rows: 1, texture: 'brick_steel', kind: 'steel' },
  ],
  sprite: {
    key: 'boss_warden',
    path: 'images/bosses/warden.png',
    frameWidth: 320,
    frameHeight: 240,
    width: 300,
    height: 225,
    // Puts the eye in the middle of the core and the shoulders across the body.
    dx: 2,
    dy: 49.5,
    anims: {
      idle: { frames: [0, 1, 2, 1], fps: 5 },
      tell: { frames: [3, 4], fps: 8 },
      open: { frames: [5], fps: 1 },
      hurt: { frames: [6], fps: 1 },
      death: { frames: [7, 8], fps: 3 },
    },
  },
  poses: {
    // Three rows up, inside the body and on top of the core, where no ball can reach the guard.
    open: { guard: { dy: -3 * BH } },
  },
  phases: [
    { id: 'guard-up', title: 'Guard up', hits: 12, motion: sway(50, 5200), deck: [volley] },
    {
      id: 'core-exposed',
      title: 'Core exposed',
      hits: 12,
      pose: 'open',
      motion: sway(90, 3600),
      setup: (s) => {
        s.spawn(wall());
      },
      enter: exposed,
      deck: [sweep, reaper, volley],
      // It presses harder once the guard is gone.
      gapMs: [2000, 1200],
    },
  ],
  entrance,
  death,
};
