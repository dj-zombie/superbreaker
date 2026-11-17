import { SHOT_RADIUS, SKULL_RADIUS, sway, type AttackDef, type HazardSpec } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { ArenaBrick, BossDef, BossStage, Cutscene } from '../systems/BossDirector';

/** The wall the Warden drops under itself: its first column, its row and how many bricks. */
const WALL_COL = 7;
const WALL_ROW = 16;
const WALL_BRICKS = 6;
/** The Warden's own light: the violet of its body, the red of a blow, and the amber of its eye. */
const VIOLET = 0x9b6bff;
const EYE_RED = 0xff3c2a;
const EYE = 0xffc83c;
/**
 * The blasts that break the Warden up, each further out than the last: ms into the death scene,
 * px from the body's centre, and size. With the final hit's blow at 0 and the last blast at 2300,
 * no three of them fall inside one second, so the flash limit refuses none.
 */
const BREAKUP = [
  { at: 500, dx: -40, dy: -15, scale: 0.7 },
  { at: 1100, dx: 70, dy: 20, scale: 0.85 },
  { at: 1650, dx: -100, dy: 35, scale: 1 },
] as const;
/**
 * Its footfalls in the dark, each nearer than the last: ms into the entrance, how loud, and how
 * hard the floor shakes.
 */
const FOOTFALLS = [
  { at: 0, volume: 0.3, shake: 0.003 },
  { at: 750, volume: 0.45, shake: 0.005 },
  { at: 2000, volume: 0.6, shake: 0.008 },
] as const;
/** A footfall shakes the floor for this long, in ms. */
const FOOTFALL_MS = 160;
/** How close the camera stands on the eye in the dark, then on the whole of it, then as it roars. */
const EYE_ZOOM = 3;
const BODY_ZOOM = 1.5;
const ROAR_ZOOM = 1.35;

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

/**
 * It comes in the dark: footfalls, each nearer, and a growl. Lightning shows the eye, close, and
 * then the whole of it. Then the dark lifts and it roars.
 */
const entrance: Cutscene = {
  lengthMs: 4200,
  cues: [
    ...FOOTFALLS.map(({ at, volume, shake }) => ({
      at,
      run: (s: BossStage) => {
        s.audio.sfx('boss_stomp', volume);
        s.juice.shake(FOOTFALL_MS, shake);
      },
    })),
    {
      at: 1200,
      run: (s) => {
        s.audio.sfx('boss_growl', 0.5);
      },
    },
    {
      at: 1500,
      run: (s) => {
        s.shot({ zoom: EYE_ZOOM, ...eye(s), cut: true });
        s.glimpse();
        s.audio.sfx('thunder', 0.5, -200);
      },
    },
    {
      at: 2600,
      run: (s) => {
        s.shot({ zoom: BODY_ZOOM, ...s.center, cut: true });
        s.glimpse();
        s.audio.sfx('thunder', 0.55);
      },
    },
    {
      at: 3200,
      run: (s) => {
        const { x, y } = s.center;
        s.unveil();
        s.shot({ zoom: ROAR_ZOOM, x, y });
        s.anim('tell');
        s.audio.sfx('boss_roar', 0.6);
        s.impact(x, y, 1.2, VIOLET);
        const glow = s.light({ x, y, radius: 90, color: VIOLET, intensity: 0.3, priority: 7 });
        s.tween({ targets: glow, radius: 240, intensity: 1.1, duration: 700, ease: 'Sine.Out' });
      },
    },
  ],
};

/** The guard gives: it reels as its plating cracks, then the eye flares and it roars. */
const exposed: Cutscene = {
  lengthMs: 1800,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        s.anim('hurt');
        s.audio.sfx('boss_phase', 0.55);
        s.audio.sfx('brick_steel', 0.5, -300);
        const flare = s.light({ x, y, radius: 80, color: EYE_RED, intensity: 0.3, priority: 7 });
        s.tween({ targets: flare, radius: 220, intensity: 1.3, duration: 700, ease: 'Cubic.In' });
      },
    },
    {
      at: 750,
      run: (s) => {
        const { x, y } = eye(s);
        s.anim('tell');
        s.impact(x, y, 1.3, EYE_RED);
        s.audio.sfx('boss_roar', 0.5);
      },
    },
  ],
};

/** The guard breaks off for good: it reels, growls low, then the bare eye blazes and it roars. */
const cornered: Cutscene = {
  lengthMs: 2000,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = s.part('guard') ?? eye(s);
        s.anim('hurt');
        s.impact(x, y, 0.9, VIOLET);
        s.audio.sfx('boss_phase', 0.6);
      },
    },
    {
      at: 500,
      run: (s) => {
        s.audio.sfx('boss_growl', 0.5);
      },
    },
    {
      at: 1000,
      run: (s) => {
        const { x, y } = eye(s);
        s.anim('tell');
        s.shot({ zoom: BODY_ZOOM, x, y });
        s.impact(x, y, 1.5, EYE_RED);
        s.audio.sfx('boss_roar', 0.6, 200);
        const blaze = s.light({ x, y, radius: 120, color: EYE_RED, intensity: 1.4, priority: 7 });
        s.tween({ targets: blaze, radius: 260, intensity: 0.4, duration: 800, ease: 'Sine.Out' });
      },
    },
  ],
};

/** It breaks up from the eye outward while the eye burns out, then goes all at once. */
const death: Cutscene = {
  lengthMs: 3000,
  cues: [
    {
      at: 0,
      run: (s) => {
        const { x, y } = eye(s);
        s.audio.sfx('boss_death', 0.6);
        const ember = s.light({ x, y, radius: 160, color: EYE_RED, intensity: 1.4, priority: 7 });
        s.tween({ targets: ember, radius: 60, intensity: 0, duration: 2300, ease: 'Sine.In' });
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
      at: 2300,
      run: (s) => {
        const { x, y } = s.center;
        s.impact(x, y, 1.6);
        s.audio.sfx('boss_explode', 0.6);
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
  tell: { sfx: 'boss_growl' },
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
 * In the second phase the guard pulls up behind the core and the core can be hit from below, and
 * in the third the guard is gone and the Warden throws everything it has.
 * Its three attacks use every hazard between them, and after each one the guard lifts for a while.
 */
export const warden: BossDef = {
  id: 'warden',
  name: 'Warden',
  epithet: 'Keeper of the gate',
  parts: [
    { id: 'body', col: 7, row: 3, cols: 6, rows: 2, texture: 'brick_purple2' },
    // The core's top row lies under the body, so only the two rows below it can be hit.
    {
      id: 'core',
      col: 9,
      row: 4,
      cols: 2,
      rows: 3,
      texture: 'brick_red',
      weak: 3,
      // The eye. It smoulders, and the fight strobes it while the core is open to be hit.
      light: { color: EYE, radius: 64, intensity: 0.9 },
    },
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
    {
      id: 'guard-up',
      title: 'Guard up',
      hits: 20,
      motion: sway(50, 5200),
      intensity: 'low',
      deck: [volley],
    },
    {
      id: 'core-exposed',
      title: 'Core exposed',
      hits: 48,
      pose: 'open',
      motion: sway(90, 3600),
      intensity: 'mid',
      setup: (s) => {
        s.spawn(wall());
        // Each phase starts fair: whatever the last one took off the paddle comes back.
        s.paddle.resetSize();
      },
      enter: exposed,
      deck: [sweep, volley],
      // It presses harder once the guard is up.
      gapMs: [2000, 1300],
    },
    {
      id: 'last-stand',
      title: 'Last stand',
      hits: 62,
      pose: 'open',
      motion: sway(120, 2800),
      intensity: 'high',
      setup: (s) => {
        s.retire('guard');
        s.paddle.resetSize();
      },
      enter: cornered,
      deck: [reaper, sweep, volley],
      // With nothing left to guard, it throws everything.
      gapMs: [1600, 1000],
    },
  ],
  entrance,
  death,
  trophy: "Warden's Eye",
};
