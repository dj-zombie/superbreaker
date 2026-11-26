import {
  HABIT_BIN,
  SHOT_RADIUS,
  SKULL_RADIUS,
  type AttackDef,
  type AttackPlan,
  type BossView,
  type HazardSpec,
} from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { BossDef, BossStage, Cutscene, Pose } from '../systems/BossDirector';
import {
  CYAN,
  FOCUS,
  LID_TRAVEL,
  OVERSEER_KEYS,
  OverseerRig,
  VESPER,
  overseerRig,
} from './overseerRig';
import { OVERSEER_TRACK } from './overseerMusic';

/** The tempo the fight's beats are timed to: one beat, in ms. */
const BEAT_MS = 500;

/** The rig, when the boss is drawn by it. */
function rig(s: BossStage): OverseerRig | undefined {
  return s.rig instanceof OverseerRig ? s.rig : undefined;
}

/** `x`, kept at least `margin` px inside the field. */
function inField(x: number, margin: number): number {
  return Math.min(FIELD_WIDTH - margin, Math.max(margin, x));
}

/** The middle of habit bin `i` across the field. */
function binX(i: number): number {
  return (i + 0.5) * HABIT_BIN;
}

/** The habit bins, most used first. Ties keep the left one first. */
function favourites(habits: readonly number[]): number[] {
  return habits.map((_, i) => i).sort((a, b) => habits[b]! - habits[a]! || a - b);
}

/** The Mirror's rail: where it rests, and its half-width, in px. */
const MIRROR_COL = 8;
const MIRROR_COLS = 4;
const MIRROR_ROW = 20;
const MIRROR_HOME = (MIRROR_COL + MIRROR_COLS / 2) * BW;
const MIRROR_HALF = (MIRROR_COLS * BW) / 2;
/** The second Mirror, the last phase's: it rests on the right of the rail, and waits in the crown before that. */
const MIRROR2_COL = 13;
const MIRROR2_COLS = 3;
const MIRROR2_HOME = (MIRROR2_COL + MIRROR2_COLS / 2) * BW;
const MIRROR2_HALF = (MIRROR2_COLS * BW) / 2;
const STOWED = { dx: (9 - MIRROR2_COL) * BW, dy: (2 - MIRROR_ROW) * BH };
/** The Mirror copies the paddle this fast, and chases the ball this fast, in px/s on Normal. */
const COPY_SPEED = 260;
const CHASE_SPEED = 230;
/** Every this many returns of the ball it feints: off the wrong way for this long, this far. */
const FEINT_EVERY = 4;
const FEINT_MS = 300;
const FEINT_REACH = 90;
/** Caught slag thrown back at the Mirror freezes it this long. */
const STUN_MS = 2 * BEAT_MS;
/** The ball's radius: BALL_SIZE in entities/Ball is 22, and this module loads without the engine. */
const BALL_R = 11;

/**
 * Where a ball at `x` going `vx`, `vy` px/s crosses the line `dy` px above it, after bouncing off
 * the side walls. Null if it is not rising.
 */
export function crossing(x: number, vx: number, vy: number, dy: number): number | null {
  if (vy >= 0 || dy < 0) return null;
  const span = FIELD_WIDTH - 2 * BALL_R;
  const t = dy / -vy;
  const run = x + vx * t - BALL_R;
  const m = ((run % (2 * span)) + 2 * span) % (2 * span);
  return BALL_R + (m > span ? 2 * span - m : m);
}

type Rule = 'copy' | 'chase' | 'split';

/** What the Mirrors are doing: the phase's rule, and the feint the chase counts toward. */
interface Mind {
  rule: Rule;
  /** Balls rising toward the rail last frame: one more is a return off the paddle. */
  rising: number;
  returns: number;
  feintMs: number;
}

/**
 * One mind a fight, so a fight played again starts copying: its `tick` runs through the entrance,
 * before the first phase's setup.
 */
const minds = new WeakMap<BossStage, Mind>();

function mindOf(s: BossStage): Mind {
  let mind = minds.get(s);
  if (!mind) {
    mind = { rule: 'copy', rising: 0, returns: 0, feintMs: 0 };
    minds.set(s, mind);
  }
  return mind;
}

function think(s: BossStage, rule: Rule): void {
  const mind = mindOf(s);
  mind.rule = rule;
  mind.rising = 0;
  mind.returns = 0;
  mind.feintMs = 0;
}

/** Steers `id` toward `x` on the rail, kept between `lo` and `hi`. */
function railTo(
  s: BossStage,
  id: string,
  home: number,
  x: number,
  lo: number,
  hi: number,
  speed: number,
): void {
  s.steer(id, { dx: Math.min(hi, Math.max(lo, x)) - home, dy: 0 }, speed);
}

/** Where the paddle would be, seen in a mirror down the middle of the field. */
function mirrored(s: BossStage): number {
  return FIELD_WIDTH - s.paddle.x;
}

/** Where the first ball to come up reaches the rail, and how many are coming up at all. */
function forecast(s: BossStage, railY: number): { x: number | null; rising: number } {
  let x: number | null = null;
  let soonest = Infinity;
  let rising = 0;
  for (const b of s.balls()) {
    const at = crossing(b.x, b.vx, b.vy, b.y - railY);
    if (at === null) continue;
    rising++;
    const t = (b.y - railY) / -b.vy;
    if (t < soonest) {
      soonest = t;
      x = at;
    }
  }
  return { x, rising };
}

/** The Mirror goes where the ball will reach the rail, and every fourth return it feints first. */
function chase(s: BossStage, dt: number, r: OverseerRig | undefined): void {
  const m = s.part('mirror');
  if (!m) return;
  const mind = mindOf(s);
  const f = forecast(s, m.y);
  if (f.rising > mind.rising && ++mind.returns % FEINT_EVERY === 0) {
    mind.feintMs = FEINT_MS;
    r?.glitch(FEINT_MS);
    s.audio.sfx('overseer_glitch', 0.5, 0, { x: m.x });
  }
  mind.rising = f.rising;
  const goal = f.x ?? s.balls()[0]?.x ?? MIRROR_HOME;
  let want = goal;
  if (mind.feintMs > 0) {
    mind.feintMs -= dt;
    want = m.x - Math.sign(goal - m.x || 1) * FEINT_REACH;
  }
  r?.forecast(f.x);
  railTo(s, 'mirror', MIRROR_HOME, want, MIRROR_HALF, FIELD_WIDTH - MIRROR_HALF, CHASE_SPEED);
}

/** The last phase: the left Mirror copies the paddle on its half, the right one chases the ball on its. */
function divide(s: BossStage, r: OverseerRig | undefined): void {
  const mid = FIELD_WIDTH / 2;
  railTo(s, 'mirror', MIRROR_HOME, mirrored(s), MIRROR_HALF, mid - MIRROR_HALF, COPY_SPEED);
  const m2 = s.part('mirror2');
  if (!m2) return;
  const f = forecast(s, m2.y);
  r?.forecast(f.x !== null && f.x > mid ? f.x : null);
  railTo(
    s,
    'mirror2',
    MIRROR2_HOME,
    f.x ?? s.balls()[0]?.x ?? MIRROR2_HOME,
    mid + MIRROR2_HALF,
    FIELD_WIDTH - MIRROR2_HALF,
    CHASE_SPEED,
  );
}

/** The lids slide out from under the eye. */
const OPEN: Pose = { lidL: { dx: -LID_TRAVEL }, lidR: { dx: LID_TRAVEL } };

/** Every opening marks the eye for this many beats; in the first two phases the shutter opens for it. */
const OPEN_MS = 5 * BEAT_MS;
const EYE_OPEN = { pose: 'open', lock: 'eye' } as const;
const EYE_WIDE = { lock: 'eye' } as const;

/** Scan: beams this wide, this far apart, one a beat, each burning this long. */
const SCAN_WIDTH = 110;
const SCAN_STEP = 130;
const SCAN_BURN_MS = (3 * BEAT_MS) / 4;
const SCAN_SHRINK = 0.9;

/**
 * Scan: the eye focuses red and beams step across the line on the beat, toward where the paddle
 * stands most, each gone before the next: two, and `late` once the pool is half gone. In the
 * second phase it picks one of the two places it has seen most.
 */
function scan(id: string, picks: 1 | 2, late: 2 | 3): AttackDef {
  return {
    id,
    windupMs: 4 * BEAT_MS,
    liveMs: (late - 1) * BEAT_MS + SCAN_BURN_MS,
    recoverMs: OPEN_MS,
    tell: { sfx: 'overseer_scan' },
    opening: EYE_OPEN,
    plan: (v) => {
      const count = v.phaseProgress < 0.5 ? 2 : late;
      const bin = favourites(v.habits)[v.rng.int(0, picks - 1)]!;
      const target = inField(binX(bin), SCAN_WIDTH / 2);
      // It comes in from the side with more room, so every step lands inside the field.
      const dir = target < FIELD_WIDTH / 2 ? 1 : -1;
      return {
        hazards: Array.from({ length: count }, (_, i): HazardSpec => ({
          kind: 'beam',
          x: inField(target + dir * (count - 1 - i) * SCAN_STEP, SCAN_WIDTH / 2),
          width: SCAN_WIDTH,
          at: i * BEAT_MS,
          liveMs: SCAN_BURN_MS,
          onPaddle: { kind: 'shrink', factor: SCAN_SHRINK },
        })),
      };
    },
  };
}

const scanOne = scan('scan', 1, 2);
const scanTwo = scan('deep-scan', 2, 3);

/** Packet: shots straight down from the Mirror, half a beat apart, this far apart, and how they jam. */
const PACKET_SPREAD = 36;
const PACKET_FLIGHT_MS = 2 * BEAT_MS;
const PACKET_JAM_MS = 400;
const PACKET_MAX = 4;

/**
 * Packet: the Mirror fires a fan of data straight down from where it stands, which is wherever you
 * are not. Its shots land around the mirror of the paddle: stand in the middle and they find you.
 */
const packet: AttackDef = {
  id: 'packet',
  windupMs: 3 * BEAT_MS,
  liveMs: ((PACKET_MAX - 1) * BEAT_MS) / 2 + PACKET_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_packet' },
  opening: EYE_OPEN,
  plan: (v) => {
    const count = v.phaseProgress < 0.5 ? 3 : PACKET_MAX;
    const reach = ((count - 1) * PACKET_SPREAD) / 2;
    const x0 = inField(v.parts.mirror?.x ?? FIELD_WIDTH / 2, reach + SHOT_RADIUS);
    return {
      hazards: Array.from({ length: count }, (_, i): HazardSpec => ({
        kind: 'shot',
        from: 'mirror',
        x: x0 - reach + i * PACKET_SPREAD,
        at: (i * BEAT_MS) / 2,
        flightMs: PACKET_FLIGHT_MS,
        onPaddle: { kind: 'jam', ms: PACKET_JAM_MS },
      })),
    };
  },
};

/** The Warden's echo: a skull for the paddle, slow, and a shot either side a beat behind it. */
const REAPER_FLIGHT_MS = 4 * BEAT_MS;
const REAPER_SIDE = 140;
const REAPER_SIDE_FLIGHT_MS = 2 * BEAT_MS;
const REAPER_SHRINK = 0.85;

/** The Warden's skull and the shots beside it, from `at`, for a paddle at `x`. */
function reaper(x: number, at: number): HazardSpec[] {
  const sx = inField(x, SKULL_RADIUS);
  const sides = [sx - REAPER_SIDE, sx + REAPER_SIDE].map((side) =>
    side < SHOT_RADIUS || side > FIELD_WIDTH - SHOT_RADIUS
      ? sx - Math.sign(side - sx) * 2 * REAPER_SIDE
      : side,
  );
  return [
    { kind: 'skull', from: 'mirror', x: sx, at, flightMs: REAPER_FLIGHT_MS },
    ...sides.map((side): HazardSpec => ({
      kind: 'shot',
      from: 'mirror',
      x: inField(side, SHOT_RADIUS),
      at: at + BEAT_MS,
      flightMs: REAPER_SIDE_FLIGHT_MS,
      onPaddle: { kind: 'shrink', factor: REAPER_SHRINK },
    })),
  ];
}

/**
 * Recall: the Warden. The rig glitches and the Mirror plays back the Warden's skull, slow, for
 * where the paddle stands, with a shot either side. Step aside early.
 */
const recallWarden: AttackDef = {
  id: 'recall-warden',
  windupMs: 4 * BEAT_MS,
  liveMs: REAPER_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_rewind' },
  opening: EYE_OPEN,
  plan: (v) => ({ hazards: reaper(v.paddle.x, 0) }),
};

/** The Angler's echo: four lights walking across the line, one a beat, this far apart. */
const LURE_COUNT = 4;
const LURE_WALK = 110;
const LURE_FLIGHT_MS = 3 * BEAT_MS;
const LURE_SHRINK = 0.9;

/** Four lights from `at` across the two places the paddle stands most: one real, `hits` back at `to`. */
function lures(v: BossView, at: number, to: string[], hits: number): HazardSpec[] {
  const [a, b] = favourites(v.habits);
  const reach = ((LURE_COUNT - 1) * LURE_WALK) / 2;
  const mid = inField((binX(a!) + binX(b!)) / 2, reach + 40);
  const dir = v.rng.chance(0.5) ? 1 : -1;
  const real = v.rng.int(0, LURE_COUNT - 1);
  return Array.from({ length: LURE_COUNT }, (_, i): HazardSpec => {
    const x = mid + dir * (i * LURE_WALK - reach);
    const t = at + i * BEAT_MS;
    if (i === real)
      return {
        kind: 'slag',
        from: 'mirror',
        x,
        at: t,
        flightMs: LURE_FLIGHT_MS,
        returnTo: to,
        hits,
      };
    return {
      kind: 'shot',
      from: 'mirror',
      x,
      at: t,
      flightMs: LURE_FLIGHT_MS,
      onPaddle: { kind: 'shrink', factor: LURE_SHRINK },
      look: 'decoy',
    };
  });
}

/**
 * Recall: the Angler. Vesper's false lights, corrupted, walk down across where the paddle stands
 * most. One is warm: catch it and it strikes the Mirror, which freezes over for two beats.
 */
const recallAngler: AttackDef = {
  id: 'recall-angler',
  windupMs: 4 * BEAT_MS,
  liveMs: (LURE_COUNT - 1) * BEAT_MS + LURE_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_rewind' },
  opening: EYE_OPEN,
  plan: (v) => ({ hazards: lures(v, 0, ['mirror', 'eye'], 1) }),
};

/**
 * Rows of the levels before it, as the Overseer remembers them: the last level of each world,
 * column by column, '.' for none.
 */
const MEMORIES = [
  // Level 10, row 7.
  { texture: 'brick_yellow', cols: '..YYYY........YYYY..' },
  // Level 20, row 19.
  { texture: 'brick_purple2', cols: '...PPPP......PPPPPP.' },
  // Level 29, row 3.
  { texture: 'brick_white', cols: '.WWWWWW......WWWWWW.' },
] as const;
/** Where a remembered row goes up: one of these rows, between the Mirror and the paddle. */
const OVERWRITE_ROWS = [24, 26] as const;

/** A remembered row as ordinary bricks on `row`. */
function memory(m: (typeof MEMORIES)[number], row: number): NonNullable<AttackPlan['bricks']> {
  return [...m.cols].flatMap((c, col) =>
    c === '.'
      ? []
      : [
          {
            x: col * BW,
            y: row * BH,
            width: BW,
            height: BH,
            texture: m.texture,
            kind: 'normal' as const,
            health: BRICK_HEALTH,
            armor: 0,
            moveX: 0,
            moveSpeed: 0,
            regenDelay: 0,
          },
        ],
  );
}

/**
 * Overwrite: the eye plays back a row of a level you have already cleared and builds it, as
 * ordinary bricks, between the Mirror and the paddle. The middle stays open: the way to the eye.
 */
const overwrite: AttackDef = {
  id: 'overwrite',
  windupMs: 3 * BEAT_MS,
  liveMs: BEAT_MS,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_build' },
  opening: EYE_OPEN,
  plan: (v) => ({
    hazards: [],
    bricks: memory(
      MEMORIES[v.rng.int(0, MEMORIES.length - 1)]!,
      OVERWRITE_ROWS[v.rng.int(0, OVERWRITE_ROWS.length - 1)]!,
    ),
  }),
};

/** The Crucible's echo: slag to catch, the bins furthest from the darts, one a beat. */
const RAIN_GLOBS = 3;
const RAIN_FLIGHT_MS = 3 * BEAT_MS;
const RAIN_HITS = 3;
const RAIN_DARTS = [-30, 30] as const;
const RAIN_DART_FLIGHT_MS = 2 * BEAT_MS;

/** Slag from `at`, `globs` of it back at the eye, and darts at where the paddle stands most. */
function rain(v: BossView, at: number, globs: number, dart: 'jam' | 'shrink'): HazardSpec[] {
  const order = favourites(v.habits);
  const most = order[0]!;
  const far = order
    .slice(1)
    .sort((a, b) => Math.abs(b - most) - Math.abs(a - most) || v.habits[a]! - v.habits[b]!)
    .slice(0, globs)
    .sort((a, b) => v.habits[a]! - v.habits[b]!);
  return [
    ...RAIN_DARTS.map((d): HazardSpec => ({
      kind: 'shot',
      from: 'eye',
      x: inField(binX(most) + d, SHOT_RADIUS),
      at: at + BEAT_MS / 2,
      flightMs: RAIN_DART_FLIGHT_MS,
      onPaddle: dart === 'jam' ? { kind: 'jam', ms: 400 } : { kind: 'shrink', factor: 0.9 },
    })),
    ...far.map((bin, i): HazardSpec => ({
      kind: 'slag',
      from: 'eye',
      x: binX(bin),
      at: at + i * BEAT_MS,
      flightMs: RAIN_FLIGHT_MS,
      returnTo: ['eye'],
      hits: RAIN_HITS,
    })),
  ];
}

/**
 * Recall: the Crucible. Slag rains from the eye into the places the paddle goes least, and darts
 * fall where it goes most. Leave home, catch the slag, and it strikes the eye.
 */
const recallCrucible: AttackDef = {
  id: 'recall-crucible',
  windupMs: 3 * BEAT_MS,
  liveMs: (RAIN_GLOBS - 1) * BEAT_MS + RAIN_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_rewind' },
  opening: EYE_WIDE,
  plan: (v) => ({ hazards: rain(v, 0, RAIN_GLOBS, 'jam') }),
};

/** Purge: a beam over each lane but the two it has seen least, one a beat, each burning this long. */
const PURGE_FILL = 0.96;
const PURGE_BURN_MS = 3 * BEAT_MS;
const PURGE_SHRINK = 0.85;
const PURGE_SAFE = 2;

/**
 * Purge: the eye burns the line lane by lane, the far lanes first, closing in on the one place it
 * has not learned: where you stand least, with its least-used neighbour. Be there by the end.
 */
const purge: AttackDef = {
  id: 'purge',
  windupMs: 4 * BEAT_MS,
  liveMs: (FIELD_WIDTH / HABIT_BIN - PURGE_SAFE - 1) * BEAT_MS + PURGE_BURN_MS,
  recoverMs: OPEN_MS,
  tell: { sfx: 'overseer_purge' },
  opening: EYE_WIDE,
  plan: (v) => {
    const most = favourites(v.habits)[0]!;
    // The two lanes side by side it has seen least of; of equals, the furthest from the favourite.
    const pairs = v.habits.slice(1).map((_, i) => i);
    const score = (i: number) => v.habits[i]! + v.habits[i + 1]!;
    const from = (i: number) => Math.abs(i + 0.5 - most);
    const first = pairs.sort((a, b) => score(a) - score(b) || from(b) - from(a) || a - b)[0]!;
    const safe = [first, first + 1];
    const centre = first + 0.5;
    const lanes = v.habits
      .map((_, i) => i)
      .filter((i) => !safe.includes(i))
      .sort((a, b) => Math.abs(b - centre) - Math.abs(a - centre) || a - b);
    return {
      hazards: lanes.map((lane, i): HazardSpec => ({
        kind: 'beam',
        x: binX(lane),
        width: HABIT_BIN * PURGE_FILL,
        at: i * BEAT_MS,
        liveMs: PURGE_BURN_MS,
        onPaddle: { kind: 'shrink', factor: PURGE_SHRINK },
      })),
    };
  },
};

/** Total recall: when the Angler's lights follow the Warden's skull, and the Crucible's rain follows them. */
const TOTAL_LURES_AT = 4 * BEAT_MS;
const TOTAL_RAIN_AT = TOTAL_LURES_AT + (LURE_COUNT + 1) * BEAT_MS;
const TOTAL_GLOBS = 2;

/**
 * Total recall: every boss before it, one after another. The Warden's skull, then the Angler's
 * lights, then the Crucible's rain. Each warm light and glob caught strikes the eye.
 */
const totalRecall: AttackDef = {
  id: 'total-recall',
  windupMs: 4 * BEAT_MS,
  liveMs: TOTAL_RAIN_AT + (TOTAL_GLOBS - 1) * BEAT_MS + RAIN_FLIGHT_MS + 100,
  recoverMs: OPEN_MS + 2 * BEAT_MS,
  tell: { sfx: 'overseer_total' },
  opening: EYE_WIDE,
  plan: (v) => ({
    hazards: [
      ...reaper(v.paddle.x, 0),
      ...lures(v, TOTAL_LURES_AT, ['eye'], RAIN_HITS),
      ...rain(v, TOTAL_RAIN_AT, TOTAL_GLOBS, 'shrink'),
    ],
  }),
};

/** Under each recall's rewind, the boss it plays back, slowed and quiet. */
const ECHOES: Record<string, string> = {
  'recall-warden': 'boss_growl',
  'recall-angler': 'angler_vesper_come',
  'recall-crucible': 'crucible_roar',
  'total-recall': 'boss_roar',
};

/** Where the eye is now, or the body's centre once it is gone. */
function eyeAt(s: BossStage): { x: number; y: number } {
  return s.part('eye') ?? s.center;
}

/**
 * The bottom of the machine, dark. Every camera in the walls wakes, and the voice that welcomed
 * the Breaker in says what it has been doing all along. The eye sinks into the socket and opens,
 * and under it, out of glitching light, a copy of the paddle takes shape on the rail.
 */
const entrance: Cutscene = {
  lengthMs: 7200,
  cues: [
    {
      at: 0,
      run: (s) => {
        // The second Mirror goes up into the crown while nothing on the rail shows yet.
        s.pose('shut');
        s.shot({ zoom: 1.8, ...eyeAt(s), cut: true });
        s.audio.sfx('overseer_hum', 0.5);
      },
    },
    {
      at: 700,
      run: (s) => {
        s.unveil();
        s.audio.sfx('overseer_shutter', 0.45, -200);
      },
    },
    {
      at: 1600,
      run: (s) => {
        s.audio.sfx('vo_overseer_01', 0.9);
      },
    },
    {
      at: 3300,
      run: (s) => {
        const at = eyeAt(s);
        s.anim('tell');
        s.audio.sfx('overseer_scan', 0.45);
        const gaze = s.light({ ...at, radius: 60, color: CYAN, intensity: 0, priority: 7 });
        s.tween({
          targets: gaze,
          radius: 320,
          intensity: 0.8,
          duration: 900,
          yoyo: true,
          hold: 400,
          ease: 'Sine.Out',
        });
      },
    },
    {
      at: 5200,
      run: (s) => {
        const m = s.part('mirror') ?? s.center;
        s.shot({ zoom: 1.5, x: m.x, y: m.y - 60 });
        s.audio.sfx('overseer_glitch', 0.55, 0, { x: m.x });
      },
    },
    {
      at: 6400,
      run: (s) => {
        s.shot({ zoom: 1.15, ...s.center });
        s.anim('idle');
        s.audio.sfx('overseer_shutter', 0.6);
        s.juice.shake(400, 0.004);
      },
    },
  ],
};

/** The eye stutters, rewrites itself, and puts up what it has learned: where you stand burns red. */
const recompile: Cutscene = {
  lengthMs: 3600,
  cues: [
    {
      at: 0,
      run: (s) => {
        const at = eyeAt(s);
        s.shot({ zoom: 1.7, ...at });
        s.anim('hurt');
        rig(s)?.glitch(1600);
        s.fx.play('overseer.recompile', at.x, at.y, { bare: true });
        s.audio.sfx('overseer_recompile', 0.65);
        s.juice.shake(700, 0.004);
      },
    },
    {
      at: 1400,
      run: (s) => {
        const at = eyeAt(s);
        s.anim('tell');
        const red = s.light({ ...at, radius: 80, color: FOCUS, intensity: 0.2, priority: 7 });
        s.tween({
          targets: red,
          radius: 260,
          intensity: 0.9,
          duration: 600,
          yoyo: true,
          hold: 500,
          ease: 'Sine.Out',
        });
      },
    },
    {
      at: 2200,
      run: (s) => {
        s.shot({ zoom: 1.15, ...s.center });
        rig(s)?.showHabits(true);
        s.audio.sfx('overseer_scan', 0.5, -300);
      },
    },
  ],
};

/** How long the floor takes to give way under the chamber in the last phase's scene, in ms. */
const KERNEL_FALL_MS = 2400;

/**
 * The chamber drops away and the fight goes on falling down the data tunnel under it. The ring
 * cracks open, the shutter is gone for good, and a second Mirror comes out of the crown.
 */
const kernel: Cutscene = {
  lengthMs: 4400,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.anim('hurt');
        s.audio.sfx('overseer_split', 0.7);
        s.juice.shake(1600, 0.008);
        const fall = { k: 0 };
        s.tween({
          targets: fall,
          k: 1,
          duration: KERNEL_FALL_MS,
          ease: 'Cubic.InOut',
          onUpdate: () => s.scenery.fall(fall.k),
        });
      },
    },
    {
      at: 1500,
      run: (s) => {
        const at = eyeAt(s);
        s.shot({ zoom: 1.5, ...at });
        rig(s)?.divide();
        s.fx.play('overseer.crack', at.x, at.y, { bare: true });
        s.pose('wide');
        s.audio.sfx('overseer_shutter', 0.6, -300);
      },
    },
    {
      at: 2600,
      run: (s) => {
        const at = eyeAt(s);
        s.shot({ zoom: 1.15, ...s.center });
        s.anim('tell');
        s.impact(at.x, at.y, 1.2, CYAN);
        const glare = s.light({ ...at, radius: 120, color: CYAN, intensity: 1.2, priority: 7 });
        s.tween({ targets: glare, radius: 360, intensity: 0.4, duration: 900, ease: 'Sine.Out' });
      },
    },
    {
      at: 3400,
      run: (s) => {
        const m = s.part('mirror2') ?? s.center;
        s.audio.sfx('overseer_glitch', 0.55, 200, { x: m.x });
      },
    },
  ],
};

/** How long the door takes to open all the way, in ms. */
const DOOR_MS = 2600;

/**
 * The eye cracks and both Mirrors come apart into warm light: Vesper's, the one thing in the
 * Breaker the machine never counted. Dying, it opens the door anyway, and behind the socket there
 * is daylight. The room's own lights come back on.
 */
const death: Cutscene = {
  lengthMs: 7600,
  cues: [
    {
      at: 0,
      run: (s) => {
        const at = eyeAt(s);
        rig(s)?.dissolve();
        s.anim('death');
        s.fx.play('overseer.crack', at.x, at.y, { bare: true });
        s.audio.sfx('overseer_death', 0.75);
        s.juice.shake(900, 0.006);
      },
    },
    {
      at: 700,
      run: (s) => {
        for (const id of ['mirror', 'mirror2']) {
          const m = s.part(id);
          if (m) s.fx.play('overseer.dissolve', m.x, m.y, { bare: true });
        }
      },
    },
    {
      at: 1300,
      run: (s) => {
        const at = eyeAt(s);
        s.shot({ zoom: 1.5, ...at });
        s.impact(at.x, at.y, 1, VESPER);
        const warm = s.light({ ...at, radius: 60, color: VESPER, intensity: 0.2, priority: 7 });
        s.tween({
          targets: warm,
          radius: 300,
          intensity: 0.9,
          duration: 1800,
          yoyo: true,
          hold: 600,
          ease: 'Sine.InOut',
        });
      },
    },
    {
      at: 1700,
      run: (s) => {
        s.audio.sfx('vo_overseer_02', 0.9);
      },
    },
    {
      at: 4800,
      run: (s) => {
        const at = eyeAt(s);
        s.shot({ zoom: 1.1, ...s.center });
        s.audio.sfx('overseer_door', 0.8);
        s.fx.play('overseer.daylight', at.x, at.y, { bare: true });
        s.lighting.celebrate();
        const door = { k: 0 };
        s.tween({
          targets: door,
          k: 1,
          duration: DOOR_MS,
          ease: 'Sine.InOut',
          onUpdate: () => rig(s)?.openDoor(door.k),
        });
      },
    },
  ],
};

/**
 * The World 3 finale, and the campaign's last fight. The Overseer is the machine that has watched
 * every run, and it fights with what it has learned: the Mirror on its rail stands where the
 * paddle would in a mirror, then where the ball will come, then splits in two. Its attacks aim at
 * where the paddle stands most, and its echoes are the bosses before it. Every attack starts on
 * the beat of a 120 BPM track.
 */
export const overseer: BossDef = {
  id: 'overseer',
  name: 'The Overseer',
  epithet: 'The Third Seal',
  parts: [
    // The ring of cameras is steel round the eye: its crown, and each side of the socket.
    { id: 'crown', col: 6, row: 2, cols: 8, rows: 3, texture: 'brick_steel', kind: 'steel' },
    { id: 'ringL', col: 6, row: 5, cols: 2, rows: 5, texture: 'brick_steel', kind: 'steel' },
    { id: 'ringR', col: 12, row: 5, cols: 2, rows: 5, texture: 'brick_steel', kind: 'steel' },
    // The eye in the socket: triple damage, behind the shutter's lids until they open.
    { id: 'eye', col: 8, row: 5, cols: 4, rows: 5, texture: 'brick_teal2', weak: 3 },
    { id: 'lidL', col: 8, row: 10, cols: 2, rows: 1, texture: 'brick_steel', kind: 'steel' },
    { id: 'lidR', col: 10, row: 10, cols: 2, rows: 1, texture: 'brick_steel', kind: 'steel' },
    {
      id: 'mirror',
      col: MIRROR_COL,
      row: MIRROR_ROW,
      cols: MIRROR_COLS,
      rows: 2,
      texture: 'brick_steel',
      kind: 'steel',
    },
    {
      id: 'mirror2',
      col: MIRROR2_COL,
      row: MIRROR_ROW,
      cols: MIRROR2_COLS,
      rows: 2,
      texture: 'brick_steel',
      kind: 'steel',
    },
  ],
  rig: overseerRig(),
  scenery: 'kernel',
  hazards: {
    slag: OVERSEER_KEYS.slag,
    splash: OVERSEER_KEYS.splash,
    shot: OVERSEER_KEYS.packet,
    skull: OVERSEER_KEYS.skull,
    decoy: { key: OVERSEER_KEYS.decoy, color: CYAN, sfx: 'overseer_decoy' },
    beam: { color: FOCUS },
    shotGlow: CYAN,
    fx: {
      slagTrail: 'overseer.slag_trail',
      splash: 'overseer.splash',
      shotTrail: 'overseer.packet_trail',
    },
  },
  beatLock: true,
  music: { key: 'boss_music_overseer', track: OVERSEER_TRACK },
  poses: {
    shut: { mirror2: STOWED },
    open: { ...OPEN, mirror2: STOWED },
    wide: OPEN,
  },
  phases: [
    {
      id: 'recognition',
      title: 'Recognition',
      hits: 24,
      pose: 'shut',
      intensity: 'low',
      setup: (s) => {
        think(s, 'copy');
        rig(s)?.showHabits(false);
      },
      deck: [scanOne, packet, scanOne, recallWarden],
      gapMs: [5 * BEAT_MS, 4 * BEAT_MS],
    },
    {
      id: 'prediction',
      title: 'Prediction',
      hits: 32,
      pose: 'shut',
      intensity: 'mid',
      setup: (s) => {
        think(s, 'chase');
        rig(s)?.showHabits(true);
        s.paddle.resetSize();
      },
      enter: recompile,
      deck: [recallAngler, scanTwo, overwrite, packet, recallAngler],
      gapMs: [4 * BEAT_MS, 3 * BEAT_MS],
    },
    {
      id: 'kernel',
      title: 'Kernel',
      hits: 36,
      pose: 'wide',
      intensity: 'high',
      setup: (s) => {
        think(s, 'split');
        const r = rig(s);
        r?.showHabits(true);
        r?.divide();
        s.scenery.fall(1);
        s.paddle.resetSize();
      },
      enter: kernel,
      deck: [recallCrucible, purge, recallCrucible, totalRecall],
      gapMs: [3 * BEAT_MS, 2 * BEAT_MS],
    },
  ],
  entrance,
  death,
  tick: (s, dt) => {
    const r = rig(s);
    r?.watch(s.paddle.x);
    r?.habits(s.habits);
    switch (mindOf(s).rule) {
      case 'copy':
        r?.forecast(null);
        railTo(
          s,
          'mirror',
          MIRROR_HOME,
          mirrored(s),
          MIRROR_HALF,
          FIELD_WIDTH - MIRROR_HALF,
          COPY_SPEED,
        );
        break;
      case 'chase':
        chase(s, dt, r);
        break;
      case 'split':
        divide(s, r);
        break;
    }
    // Struck by its own slag, the Mirror freezes where it is.
    const m = s.part('mirror');
    if (m && s.sinceReturn('mirror') < STUN_MS)
      s.steer('mirror', { dx: m.x - MIRROR_HOME, dy: 0 }, 0);
  },
  on: (s, e) => {
    const r = rig(s);
    if (e.type === 'returned') {
      const at = s.part(e.part) ?? s.center;
      if (e.part === 'mirror') {
        // Vesper's warm light, caught and thrown back, freezes the copy of you over.
        r?.stun(STUN_MS);
        s.audio.sfx('overseer_freeze', 0.6, 0, { x: at.x });
        s.juice.sparkle(at.x, at.y, VESPER, 8);
      } else {
        r?.flinch();
        s.audio.sfx('overseer_hurt', 0.55, 0, { x: at.x });
      }
      return;
    }
    if (e.type !== 'window') return;
    if (e.window === 'windup') {
      const echo = ECHOES[e.attack ?? ''];
      if (echo) s.audio.sfx(echo, 0.3, -400);
      if (e.attack?.startsWith('recall') || e.attack === 'total-recall') r?.glitch(2 * BEAT_MS);
      return;
    }
    if (e.window === 'recover' && mindOf(s).rule !== 'split') {
      s.audio.sfx('overseer_shutter', 0.5);
    }
  },
  trophy: "The Overseer's Lens",
};
