import { SHOT_RADIUS, SKULL_RADIUS, figure8, sway, type AttackDef, type BossView, type HazardSpec } from '../core/Boss';
import { BH, BW } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { BossDef, BossStage, Cutscene, Pose } from '../systems/BossDirector';
import { ANGLER_TRACK } from './anglerMusic';
import { ANGLER_KEYS, AnglerRig, EYE_DY, EYE_LANES, LANTERN, PODS, THROAT, anglerRig } from './anglerRig';

/** The deep's light: the lantern's gold, the souls it holds, the ink's violet and the ice of a lie. */
const SOUL = 0xffe0a0;
const INK = 0x7a3ac8;
const COLD = 0x9ad8ff;
/** The tempo the fight's beats are timed to: one beat, in ms. Its track is written at this tempo. */
const BEAT_MS = 625;

/** The rig, when the boss is drawn by it. */
function rig(s: BossStage): AnglerRig | undefined {
  return s.rig instanceof AnglerRig ? s.rig : undefined;
}

/** The lure, wherever it is, or the middle of the body. */
function lure(s: BossStage): { x: number; y: number } {
  const l = s.part('lure');
  return l ? { x: l.x, y: l.y } : (s.rig?.focus ?? s.center);
}

/** `x`, kept at least `margin` px inside the field. */
function inField(x: number, margin: number): number {
  return Math.min(FIELD_WIDTH - margin, Math.max(margin, x));
}

/** The skull's centre across the field at rest: the eyes over the lanes are placed from it. */
const SKULL_X = FIELD_WIDTH / 2;

/** How far a raised jaw lifts the teeth into the skull, in px. */
const JAW_LIFT = -4 * BH;
/**
 * Where the pods hide while it lurks: tucked inside the skull and teeth, where no ball reaches.
 * Each must sit strictly inside the steel, never on its edge.
 */
const TUCKED: Pose = {
  pod1: { dx: 5 * BW },
  pod2: { dx: 3 * BW, dy: -4 * BH },
  pod3: { dx: -3 * BW, dy: -4 * BH },
  pod4: { dx: -5 * BW },
};

/** Every opening marks a part for the length of this many beats. */
const OPEN_BEATS = 4;
const OPEN_MS = OPEN_BEATS * BEAT_MS;
/** Openings: the lure, or the throat with the jaw raised. */
const LURE_OPEN = { lock: 'lure' } as const;
const MAW_OPEN = { pose: 'gape', lock: 'maw' } as const;
const MAW_OPEN_HIGH = { pose: 'breach-gape', lock: 'maw' } as const;

/** A caught wisp: how many hits it deals on its way back, and how long it flies down. */
const WISP_HITS = 3;
const WISP_FLIGHT_MS = 3 * BEAT_MS;
/** Drift: how far from the paddle a wisp lands, at the nearest and furthest, and the stagger of a pair. */
const DRIFT_NEAR = 80;
const DRIFT_FAR = 160;
const DRIFT_STAGGER_MS = 2 * BEAT_MS;

/** Where a wisp for the paddle lands: off to the side with more room, a short walk away. */
function driftFor(v: BossView, k: number): number {
  const reach = DRIFT_NEAR + (DRIFT_FAR - DRIFT_NEAR) * k;
  const dir = v.paddle.x < FIELD_WIDTH / 2 ? 1 : -1;
  return inField(v.paddle.x + dir * reach, 40);
}

/**
 * Drift: the lantern swells warm and lets a wisp of its light drift down. It is harmless; catch it
 * and it flies home for three hits. One at a full pool, two as it empties.
 */
const drift: AttackDef = {
  id: 'drift',
  windupMs: 3 * BEAT_MS,
  liveMs: DRIFT_STAGGER_MS + WISP_FLIGHT_MS + 100,
  recoverMs: 2 * BEAT_MS,
  tell: { sfx: 'angler_wisp' },
  plan: (v) => {
    const count = v.phaseProgress < 0.5 ? 1 : 2;
    return {
      hazards: Array.from({ length: count }, (_, i): HazardSpec => {
        const x = i === 0 ? driftFor(v, v.rng.next()) : FIELD_WIDTH - driftFor(v, v.rng.next());
        return {
          kind: 'slag',
          from: 'lure',
          x,
          at: i * DRIFT_STAGGER_MS,
          flightMs: WISP_FLIGHT_MS,
          returnTo: ['lure'],
          hits: WISP_HITS,
        };
      }),
    };
  },
};

/** Glint: how wide a lane is, the drops of ink across each marked lane, and how they jam. */
const LANE_W = FIELD_WIDTH / EYE_LANES.length;
const GLINT_DROPS = [-40, 0, 40] as const;
const GLINT_FLIGHT_MS = 2 * BEAT_MS;
const GLINT_JAM_MS = 600;
/** Glint: when the wisp in the clear lanes sets off, once the pool is half gone. */
const GLINT_WISP_AT = BEAT_MS;

/** The lane `x` is in. */
function laneOf(x: number): number {
  return Math.min(EYE_LANES.length - 1, Math.max(0, Math.floor(x / LANE_W)));
}

/**
 * Glint: eyes open in the dark over two lanes side by side, one of them the paddle's, and ink drips
 * from each, all at once on the beat. Where the eyes are is where not to be. Once the pool is half
 * gone a wisp drifts into the clear lanes after the ink: the step that dodges is the step that catches.
 */
const glint: AttackDef = {
  id: 'glint',
  windupMs: 4 * BEAT_MS,
  liveMs: GLINT_WISP_AT + WISP_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_glint' },
  opening: LURE_OPEN,
  plan: (v) => {
    const p = laneOf(v.paddle.x);
    const other = p === 0 ? 1 : p === EYE_LANES.length - 1 ? p - 1 : v.rng.chance(0.5) ? p - 1 : p + 1;
    const marked = [p, other].sort((a, b) => a - b);
    const hazards: HazardSpec[] = marked.flatMap((lane) =>
      GLINT_DROPS.map(
        (d): HazardSpec => ({
          kind: 'shot',
          from: 'skull',
          x: EYE_LANES[lane]! + d,
          at: 0,
          flightMs: GLINT_FLIGHT_MS,
          onPaddle: { kind: 'jam', ms: GLINT_JAM_MS },
          offset: { dx: EYE_LANES[lane]! - SKULL_X, dy: EYE_DY },
        }),
      ),
    );
    if (v.phaseProgress >= 0.5) {
      // The clear side with more room, a lane clear of the ink.
      const left = marked[0]!;
      const right = EYE_LANES.length - 1 - marked[1]!;
      const lane = right >= left ? marked[1]! + Math.min(2, right) : marked[0]! - Math.min(2, left);
      hazards.push({
        kind: 'slag',
        from: 'lure',
        x: EYE_LANES[lane]!,
        at: GLINT_WISP_AT,
        flightMs: WISP_FLIGHT_MS,
        returnTo: ['lure'],
        hits: WISP_HITS,
      });
    }
    return { hazards };
  },
};

/** Beckon: the lie lands where the paddle stands, and narrows it this much. */
const BECKON_SHRINK = 0.8;
/** Beckon: the real wisp that follows it once the pool is half gone, a beat later and this far off. */
const BECKON_WISP_AT = BEAT_MS;
const BECKON_WISP_OFF = 150;

/**
 * Beckon: the lantern goes dark, then a light drifts down to the paddle, slow and inviting. It is a
 * lie: cold, falling dead straight, with no trail, and it chimes like glass. Caught, it narrows the
 * paddle. Once the pool is half gone the real wisp follows a beat later, to one side.
 */
const beckon: AttackDef = {
  id: 'beckon',
  windupMs: 4 * BEAT_MS,
  liveMs: BECKON_WISP_AT + WISP_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_blink' },
  opening: LURE_OPEN,
  plan: (v) => {
    const x = inField(v.paddle.x, 40);
    const hazards: HazardSpec[] = [
      {
        kind: 'shot',
        from: 'lure',
        x,
        at: 0,
        flightMs: WISP_FLIGHT_MS,
        onPaddle: { kind: 'shrink', factor: BECKON_SHRINK },
        look: 'decoy',
      },
    ];
    if (v.phaseProgress >= 0.5) {
      const dir = x < FIELD_WIDTH / 2 ? 1 : -1;
      hazards.push({
        kind: 'slag',
        from: 'lure',
        x: inField(x + dir * BECKON_WISP_OFF, 40),
        at: BECKON_WISP_AT,
        flightMs: WISP_FLIGHT_MS,
        returnTo: ['lure'],
        hits: WISP_HITS,
      });
    }
    return { hazards };
  },
};

/** Lunge: the bite is half the field wide, burns this long, and what it leaves of the paddle. */
const LUNGE_WIDTH = 260;
const LUNGE_BURN_MS = 2 * BEAT_MS;
const LUNGE_SHRINK = 0.85;

/** The middle of a bite on one half of the field. */
function biteAt(left: boolean, width: number): number {
  return left ? width / 2 + 20 : FIELD_WIDTH - width / 2 - 20;
}

/**
 * Lunge: the head leans over the paddle's half and the lure swings that way; then it bites straight
 * down. Moving to the other half is always enough. After, the jaw hangs open on its green throat.
 */
const lunge: AttackDef = {
  id: 'lunge',
  windupMs: 4 * BEAT_MS,
  liveMs: LUNGE_BURN_MS,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_lunge' },
  opening: MAW_OPEN,
  plan: ({ paddle }) => ({
    hazards: [
      {
        kind: 'beam',
        x: biteAt(paddle.x < FIELD_WIDTH / 2, LUNGE_WIDTH),
        width: LUNGE_WIDTH,
        at: 0,
        liveMs: LUNGE_BURN_MS,
        onPaddle: { kind: 'shrink', factor: LUNGE_SHRINK },
      },
    ],
  }),
};

/** False light: four lights walking across the paddle line, one a beat, this far apart. */
const FALSE_COUNT = 4;
const FALSE_WALK = 110;
const FALSE_SHRINK = 0.9;

/**
 * False light: four lights drift down one after another on the beat, walking across where the
 * paddle stood. Three are lies; one is warm and trails sparks. Catch that one and let the rest fall.
 */
const falseLight: AttackDef = {
  id: 'false-light',
  windupMs: 4 * BEAT_MS,
  liveMs: (FALSE_COUNT - 1) * BEAT_MS + WISP_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_blink' },
  opening: LURE_OPEN,
  plan: ({ rng, paddle }) => {
    const reach = ((FALSE_COUNT - 1) * FALSE_WALK) / 2;
    const mid = inField(paddle.x, reach + 40);
    const dir = rng.chance(0.5) ? 1 : -1;
    const real = rng.int(0, FALSE_COUNT - 1);
    return {
      hazards: Array.from({ length: FALSE_COUNT }, (_, i): HazardSpec => {
        const x = mid + dir * (i * FALSE_WALK - reach);
        const at = i * BEAT_MS;
        if (i === real) {
          return { kind: 'slag', from: 'lure', x, at, flightMs: WISP_FLIGHT_MS, returnTo: ['lure'], hits: WISP_HITS };
        }
        return {
          kind: 'shot',
          from: 'lure',
          x,
          at,
          flightMs: WISP_FLIGHT_MS,
          onPaddle: { kind: 'shrink', factor: FALSE_SHRINK },
          look: 'decoy',
        };
      }),
    };
  },
};

/** Snuff: the field in three lanes of ink, one every two beats, each gone a beat before the next. */
const SNUFF_LANES = 3;
const SNUFF_FILL = 0.95;
const SNUFF_STEP_MS = 2 * BEAT_MS;
const SNUFF_BURN_MS = BEAT_MS;
const SNUFF_SHRINK = 0.9;

/**
 * Snuff: the lantern and every light on the lake go out, and ink pours down lane after lane on the
 * beat, one way or the other. Follow it: step into the lane it just left. The lantern comes back
 * as the last lane drains.
 */
const snuff: AttackDef = {
  id: 'snuff',
  windupMs: 4 * BEAT_MS,
  liveMs: (SNUFF_LANES - 1) * SNUFF_STEP_MS + SNUFF_BURN_MS,
  recoverMs: 3 * BEAT_MS,
  tell: { sfx: 'angler_snuff' },
  opening: LURE_OPEN,
  plan: ({ rng }) => {
    const lane = FIELD_WIDTH / SNUFF_LANES;
    const ltr = rng.chance(0.5);
    return {
      hazards: Array.from({ length: SNUFF_LANES }, (_, i): HazardSpec => {
        const n = ltr ? i : SNUFF_LANES - 1 - i;
        return {
          kind: 'beam',
          x: (n + 0.5) * lane,
          width: lane * SNUFF_FILL,
          at: i * SNUFF_STEP_MS,
          liveMs: SNUFF_BURN_MS,
          onPaddle: { kind: 'shrink', factor: SNUFF_SHRINK },
        };
      }),
    };
  },
};

/** Frenzy: bites from one half then the other, one a beat, each this long. */
const FRENZY_BITES = 4;
const FRENZY_BURN_MS = (3 * BEAT_MS) / 4;
const FRENZY_SHRINK = 0.92;

/**
 * Frenzy: it bites on every beat, the paddle's half first and then the other, back and forth. Each
 * bite is gone before the next comes down: cross as the jaw closes. Then it hangs open, panting.
 */
const frenzy: AttackDef = {
  id: 'frenzy',
  windupMs: 3 * BEAT_MS,
  liveMs: (FRENZY_BITES - 1) * BEAT_MS + FRENZY_BURN_MS,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_shriek' },
  opening: MAW_OPEN_HIGH,
  plan: ({ paddle }) => {
    const first = paddle.x < FIELD_WIDTH / 2;
    return {
      hazards: Array.from({ length: FRENZY_BITES }, (_, i): HazardSpec => ({
        kind: 'beam',
        x: biteAt(i % 2 === 0 ? first : !first, LUNGE_WIDTH),
        width: LUNGE_WIDTH,
        at: i * BEAT_MS,
        liveMs: FRENZY_BURN_MS,
        onPaddle: { kind: 'shrink', factor: FRENZY_SHRINK },
      })),
    };
  },
};

/** The pods still standing, nearest `x` first, then the lure: a wisp goes home to the closest. */
function podsNear(v: BossView, x: number): string[] {
  const pods = PODS.filter((id) => v.parts[id]);
  pods.sort((a, b) => Math.abs(v.parts[a]!.x - x) - Math.abs(v.parts[b]!.x - x));
  return [...pods, 'lure'];
}

/** Drowned: how long the drowned soul sinks, and the wisps beside it: px off, when they set off. */
const DROWNED_FLIGHT_MS = 5 * BEAT_MS;
const DROWNED_WISP_OFF = 130;
const DROWNED_WISP_AT = [0, BEAT_MS] as const;

/**
 * Drowned: a drowned soul, a skull in a shroud of ink, sinks slowly for where the paddle stood,
 * with a wisp either side. Step aside onto a wisp: it is the dodge and the counter at once, and it
 * flies home to crack the pod nearest.
 */
const drowned: AttackDef = {
  id: 'drowned',
  windupMs: 4 * BEAT_MS,
  liveMs: DROWNED_FLIGHT_MS + 100,
  recoverMs: 3 * BEAT_MS,
  tell: { sfx: 'angler_shriek' },
  opening: MAW_OPEN_HIGH,
  plan: (v) => {
    const x = inField(v.paddle.x, SKULL_RADIUS);
    const left = x - DROWNED_WISP_OFF;
    const right = x + DROWNED_WISP_OFF;
    // One wisp each side of it. Near a wall both go to the open side, one beyond the other.
    const sides = [
      left >= 30 ? left : x + 2 * DROWNED_WISP_OFF,
      right <= FIELD_WIDTH - 30 ? right : x - 2 * DROWNED_WISP_OFF,
    ];
    if (v.rng.chance(0.5)) sides.reverse();
    return {
      hazards: [
        { kind: 'skull', from: 'maw', x, at: 0, flightMs: DROWNED_FLIGHT_MS },
        ...sides.map(
          (side, n): HazardSpec => ({
            kind: 'slag',
            from: 'lure',
            x: side,
            at: DROWNED_WISP_AT[n]!,
            flightMs: WISP_FLIGHT_MS,
            returnTo: podsNear(v, side),
            hits: WISP_HITS,
          }),
        ),
      ],
    };
  },
};

/** Undertow: pairs of ink drops, half a beat apart, at the edges of a gap that wanders and narrows. */
const UNDERTOW_PAIRS = 6;
const UNDERTOW_STEP_MS = BEAT_MS / 2;
const UNDERTOW_FLIGHT_MS = 2 * BEAT_MS;
const UNDERTOW_WIDE = 200;
const UNDERTOW_NARROW = 120;
const UNDERTOW_DRIFT = 40;
const UNDERTOW_SHRINK = 0.92;

/**
 * Undertow: ink falls in pairs on the half beat, marking the edges of a way through that drifts
 * across the line and closes in. Ride the current between them.
 */
const undertow: AttackDef = {
  id: 'undertow',
  windupMs: 3 * BEAT_MS,
  liveMs: (UNDERTOW_PAIRS - 1) * UNDERTOW_STEP_MS + UNDERTOW_FLIGHT_MS + 100,
  recoverMs: OPEN_MS,
  tell: { sfx: 'angler_surge' },
  opening: MAW_OPEN_HIGH,
  plan: ({ rng, paddle }) => {
    // It drifts toward the side with more room, so the way through never runs into a wall.
    const dir = paddle.x < FIELD_WIDTH / 2 ? 1 : -1;
    const sway = rng.chance(0.5) ? 1 : 0.5;
    return {
      hazards: Array.from({ length: UNDERTOW_PAIRS }, (_, i) => {
        const k = i / (UNDERTOW_PAIRS - 1);
        const half = UNDERTOW_WIDE + (UNDERTOW_NARROW - UNDERTOW_WIDE) * k;
        const mid = inField(paddle.x + dir * i * UNDERTOW_DRIFT * sway, half + SHOT_RADIUS);
        return [-1, 1].map(
          (side): HazardSpec => ({
            kind: 'shot',
            from: 'maw',
            x: inField(mid + side * half, SHOT_RADIUS),
            at: i * UNDERTOW_STEP_MS,
            flightMs: UNDERTOW_FLIGHT_MS,
            onPaddle: { kind: 'shrink', factor: UNDERTOW_SHRINK },
          }),
        );
      }).flat(),
    };
  },
};

/**
 * Vesper rises out of the black water with her lantern, the one warm thing in the room, and calls
 * the player closer, as she always has. Behind her, in the dark, eyes open one by one. The lantern
 * swells and lights what she hangs from.
 */
const entrance: Cutscene = {
  lengthMs: 6400,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.unveil();
        s.scenery.surge(0.15);
        s.audio.sfx('angler_drip', 0.5);
      },
    },
    {
      at: 500,
      run: (s) => {
        s.shot({ zoom: 2.2, ...lure(s), cut: true });
        s.audio.sfx('angler_hum', 0.45);
      },
    },
    {
      at: 1500,
      run: (s) => {
        s.audio.sfx('angler_vesper_come', 0.8);
      },
    },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({
      at: 2750 + i * 430,
      run: (s: BossStage) => {
        s.audio.sfx('angler_glint', 0.22 + i * 0.05, -i * 80);
        if (i === 2) s.shot({ zoom: 1.6, x: s.center.x, y: s.center.y });
      },
    })),
    {
      at: 5400,
      run: (s) => {
        s.shot({ zoom: 1.2, ...s.center });
        s.anim('tell');
        s.audio.sfx('angler_shriek', 0.7);
        s.juice.shake(600, 0.006);
        const tide = { k: 0.15 };
        s.tween({ targets: tide, k: 0.9, duration: 500, yoyo: true, hold: 300, onUpdate: () => s.scenery.surge(tide.k) });
        const glow = s.light({ ...s.center, radius: 100, color: THROAT, intensity: 0, priority: 7 });
        s.tween({ targets: glow, radius: 420, intensity: 0.7, duration: 700, yoyo: true, ease: 'Sine.Out' });
      },
    },
  ],
};

/**
 * The lake heaves as the whole of it comes up out of the water, and her voice splits in two: the
 * thing under it has been speaking all along.
 */
const surfacing: Cutscene = {
  lengthMs: 3400,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.anim('hurt');
        s.audio.sfx('angler_surge', 0.6);
        s.juice.shake(1400, 0.006);
        const rise = { k: 0 };
        s.tween({
          targets: rise,
          k: 1,
          duration: 1600,
          ease: 'Sine.InOut',
          onUpdate: () => {
            rig(s)?.surface(rise.k);
            s.scenery.surge(Math.sin(rise.k * Math.PI) * 0.9 + 0.2 * rise.k);
          },
        });
      },
    },
    {
      at: 1500,
      run: (s) => {
        s.shot({ zoom: 1.9, ...lure(s) });
        s.anim('tell');
        s.audio.sfx('angler_vesper_hungry', 0.85);
      },
    },
    {
      at: 2700,
      run: (s) => {
        s.shot({ zoom: 1.25, ...s.center });
        s.pose('gape');
        const glow = s.light({ ...s.center, radius: 90, color: THROAT, intensity: 0.3, priority: 7 });
        s.tween({ targets: glow, radius: 260, intensity: 1, duration: 600, ease: 'Sine.Out' });
      },
    },
  ],
};

/**
 * Her face splits open on the lantern's cold light, the pods slide out of the dark on either side,
 * and behind it the drowned ark it nests in comes into view.
 */
const breach: Cutscene = {
  lengthMs: 3800,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.anim('hurt');
        rig(s)?.frenzy();
        s.audio.sfx('angler_shriek', 0.75, -150);
        s.juice.shake(900, 0.009);
        const ark = { k: 0 };
        s.tween({
          targets: ark,
          k: 1,
          duration: 2400,
          ease: 'Sine.InOut',
          onUpdate: () => {
            s.scenery.crossStill('ark', ark.k);
            s.scenery.surge(0.3 + 0.6 * Math.sin(ark.k * Math.PI));
          },
        });
      },
    },
    {
      at: 900,
      run: (s) => {
        s.shot({ zoom: 2, ...lure(s) });
        s.anim('tell');
        s.audio.sfx('angler_vesper_hungry', 0.7, -300);
        const cold = s.light({ ...lure(s), radius: 60, color: COLD, intensity: 0.3, priority: 7 });
        s.tween({ targets: cold, radius: 200, intensity: 1, duration: 500, yoyo: true, ease: 'Sine.Out' });
      },
    },
    {
      at: 1800,
      run: (s) => {
        s.shot({ zoom: 1.15, ...s.center });
        s.pose('breach');
        s.audio.sfx('angler_surge', 0.5, 200);
      },
    },
    {
      at: 2400,
      run: (s) => {
        s.audio.sfx('angler_pod_crack', 0.6);
        for (const id of PODS) {
          const p = s.part(id);
          if (p) s.fx.play('angler.spores', p.x, p.y, { bare: true });
        }
      },
    },
  ],
};

/**
 * Her lantern cracks and goes out, and the souls it held stream up out of it, warm. The head
 * sinks back into the black water. Last, one small light stays where she hung: the real Vesper,
 * and with the dark's maker gone, the room's own lights come back on.
 */
const death: Cutscene = {
  lengthMs: 5600,
  cues: [
    {
      at: 0,
      run: (s) => {
        const at = lure(s);
        rig(s)?.shatter();
        s.anim('death');
        s.audio.sfx('angler_death', 0.7);
        s.impact(at.x, at.y, 1, COLD);
        s.fx.play('angler.shatter', at.x, at.y, { bare: true });
        s.juice.shake(800, 0.006);
      },
    },
    {
      at: 900,
      run: (s) => {
        const at = lure(s);
        s.fx.play('angler.souls', at.x, at.y, { bare: true });
        const warm = s.light({ ...at, radius: 80, color: SOUL, intensity: 0.2, priority: 7 });
        s.tween({ targets: warm, radius: 360, intensity: 0.9, duration: 1600, yoyo: true, ease: 'Sine.InOut' });
      },
    },
    {
      at: 2000,
      run: (s) => {
        rig(s)?.sink();
        s.audio.sfx('angler_surge', 0.5, -300);
        const tide = { k: 0.9 };
        s.tween({ targets: tide, k: 0, duration: 3000, ease: 'Sine.Out', onUpdate: () => s.scenery.surge(tide.k) });
      },
    },
    {
      at: 4300,
      run: (s) => {
        const at = lure(s);
        const ember = s.light({ ...at, radius: 30, color: LANTERN, intensity: 0, priority: 7 });
        s.tween({ targets: ember, radius: 120, intensity: 0.8, duration: 900, ease: 'Sine.Out' });
        s.juice.sparkle(at.x, at.y, SOUL, 6);
        s.audio.sfx('angler_vesper_free', 0.8);
        s.lighting.celebrate();
      },
    },
  ],
};

/** A caught wisp lights the room this long, and this bright: for a moment the whole of it shows. */
const FLARE_MS = 3 * BEAT_MS;
const FLARE_LIGHT = 0.75;
/** A freed soul's light, where it settles over the field. */
const FREED_Y = 470;
const FREED_RADIUS = 150;
const FREED_LIGHT = 0.55;

/**
 * The World 2 finale. Vesper, who has lit the way through the crypt, is the lure of a thing that
 * lives under the black water. Phase one, she drifts warm wisps to be caught and thrown back at
 * her, and tells lies that are cold. Phase two, the head comes up and lunges, and the lies come in
 * crowds. Phase three, the pods of souls it keeps slide out to be broken, each freeing a light that
 * stays. Warm light helps; cold light lies. Every attack starts on the beat of a 96 BPM track.
 */
export const angler: BossDef = {
  id: 'angler',
  name: 'Vesper, the Lure',
  epithet: 'What the dark remembers',
  parts: [
    // The head is steel: the dome, and the teeth over a shut mouth.
    { id: 'skull', col: 6, row: 2, cols: 8, rows: 4, texture: 'brick_steel', kind: 'steel' },
    { id: 'teeth', col: 6, row: 6, cols: 8, rows: 6, texture: 'brick_steel', kind: 'steel' },
    // The throat, behind the teeth until the jaw opens: triple damage.
    { id: 'maw', col: 7, row: 8, cols: 6, rows: 3, texture: 'brick_green', weak: 3 },
    { id: 'lure', col: 9, row: 15, cols: 2, rows: 3, texture: 'brick_yellow' },
    // The pods of souls, tucked away until the breach.
    { id: 'pod1', col: 2, row: 3, cols: 2, rows: 4, texture: 'brick_teal2', health: 4 },
    { id: 'pod2', col: 4, row: 7, cols: 2, rows: 4, texture: 'brick_teal2', health: 4 },
    { id: 'pod3', col: 14, row: 7, cols: 2, rows: 4, texture: 'brick_teal2', health: 4 },
    { id: 'pod4', col: 16, row: 3, cols: 2, rows: 4, texture: 'brick_teal2', health: 4 },
  ],
  rig: anglerRig(),
  scenery: 'abyss',
  hazards: {
    slag: ANGLER_KEYS.wisp,
    splash: ANGLER_KEYS.splash,
    shot: ANGLER_KEYS.ink,
    skull: ANGLER_KEYS.skull,
    decoy: { key: ANGLER_KEYS.decoy, color: COLD, sfx: 'angler_decoy' },
    beam: { color: INK, negative: true },
    shotGlow: INK,
    fx: { slagTrail: 'angler.wisp_trail', splash: 'angler.splash', shotTrail: 'angler.ink_trail' },
  },
  beatLock: true,
  music: { key: 'boss_music_angler', track: ANGLER_TRACK },
  poses: {
    shut: TUCKED,
    gape: { ...TUCKED, teeth: { dy: JAW_LIFT } },
    breach: {},
    'breach-gape': { teeth: { dy: JAW_LIFT } },
  },
  phases: [
    {
      id: 'lure',
      title: 'The Lure',
      hits: 20,
      pose: 'shut',
      motion: sway(40, 16 * BEAT_MS),
      intensity: 'low',
      setup: (s) => {
        rig(s)?.surface(0);
      },
      deck: [drift, glint, drift, beckon],
      gapMs: [4 * BEAT_MS, 3 * BEAT_MS],
    },
    {
      id: 'feeding',
      title: 'Feeding',
      hits: 28,
      pose: 'shut',
      motion: sway(56, 12 * BEAT_MS),
      intensity: 'mid',
      setup: (s) => {
        rig(s)?.surface(1);
        s.paddle.resetSize();
      },
      enter: surfacing,
      deck: [lunge, falseLight, snuff, lunge, drift],
      gapMs: [4 * BEAT_MS, 3 * BEAT_MS],
    },
    {
      id: 'breach',
      title: 'Breach',
      hits: 30,
      pose: 'breach',
      motion: figure8(60, 22, 16 * BEAT_MS),
      intensity: 'high',
      setup: (s) => {
        const r = rig(s);
        r?.surface(1);
        r?.frenzy();
        s.scenery.crossStill('ark', 1);
        s.paddle.resetSize();
      },
      enter: breach,
      deck: [frenzy, drowned, undertow, falseLight],
      gapMs: [3 * BEAT_MS, 2 * BEAT_MS],
    },
  ],
  on: (s, e) => {
    const r = rig(s);
    if (e.type === 'broken') {
      // A pod gives up its soul, and the light it frees stays for the rest of the fight.
      const pod = s.part(e.part) ?? s.center;
      s.audio.sfx('angler_shriek', 0.35, 300, { x: pod.x });
      s.juice.shake(160, 0.005);
      s.fx.play('angler.souls', pod.x, pod.y, { bare: true, scale: 0.6 });
      const freed = s.light({ x: pod.x, y: FREED_Y, radius: 40, color: SOUL, intensity: 0, flicker: 'candle', priority: 6 });
      s.tween({ targets: freed, radius: FREED_RADIUS, intensity: FREED_LIGHT, duration: 1400, ease: 'Sine.Out' });
      return;
    }
    if (e.type === 'returned') {
      // The wisp goes home warm and the room flares: for a moment the whole of it shows.
      const at = lure(s);
      s.audio.sfx('angler_catch', 0.55, 0, { x: at.x });
      const flare = s.light({ x: at.x, y: at.y - 60, radius: 160, color: LANTERN, intensity: FLARE_LIGHT, priority: 7 });
      s.tween({ targets: flare, radius: 520, intensity: 0, duration: FLARE_MS, ease: 'Sine.In' });
      s.scenery.pulse(0.5);
      return;
    }
    if (e.type !== 'window') return;
    if (e.window === 'windup') {
      switch (e.attack) {
        case 'glint': {
          // The eyes open over the lanes the ink will fall in.
          const lanes = new Set((s.plan?.hazards ?? []).filter((h) => h.kind === 'shot').map((h) => laneOf(h.x)));
          r?.openEyes([...lanes]);
          break;
        }
        case 'beckon':
        case 'false-light':
          r?.blink(2 * BEAT_MS);
          break;
        case 'snuff':
          r?.blink(4 * BEAT_MS + (SNUFF_LANES - 1) * SNUFF_STEP_MS + SNUFF_BURN_MS);
          s.scenery.snuff();
          break;
        case 'lunge': {
          const bite = s.plan?.hazards.find((h) => h.kind === 'beam');
          r?.lunge(bite && bite.x < FIELD_WIDTH / 2 ? -1 : 1);
          break;
        }
        case 'frenzy':
          s.juice.shake(300, 0.004);
          break;
      }
      return;
    }
    if (e.window === 'live' && e.attack === 'lunge') {
      s.audio.sfx('angler_bite', 0.6);
      s.juice.shake(220, 0.007);
      return;
    }
    if (e.window === 'recover' || e.window === 'gap') {
      r?.openEyes([]);
      r?.lunge(0);
    }
  },
  entrance,
  death,
  trophy: "Vesper's Lantern",
};
