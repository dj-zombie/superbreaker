import { SHOT_RADIUS, SKULL_RADIUS, figure8, sway, type AttackDef, type BossView, type HazardSpec } from '../core/Boss';
import { BH } from '../core/procgen/grid';
import { FIELD_WIDTH } from '../core/types';
import type { BossDef, BossStage, Cutscene } from '../systems/BossDirector';
import { CRUCIBLE_KEYS, CrucibleRig, RIBS, crucibleRig } from './crucibleRig';

/** The forge's light: the heart's orange, the furnace's gold, white heat and steam. */
const HEART = 0xff5a1a;
const FURNACE = 0xffa040;
const WHITE_HOT = 0xfff0c8;
const STEAM = 0xd8d0c8;
/** The tempo the fight's beats are timed to: one beat, in ms. Its track is written at this tempo. */
const BEAT_MS = 500;

/** The rig, when the boss is drawn by it. */
function rig(s: BossStage): CrucibleRig | undefined {
  return s.rig instanceof CrucibleRig ? s.rig : undefined;
}

/** The heart, wherever it is, or the middle of the body once it is gone. */
function heart(s: BossStage): { x: number; y: number } {
  const h = s.part('heart');
  return h ? { x: h.x, y: h.y } : (s.rig?.focus ?? s.center);
}

/** `x`, kept at least `margin` px inside the field. */
function inField(x: number, margin: number): number {
  return Math.min(FIELD_WIDTH - margin, Math.max(margin, x));
}

/** Steam from the fists' vents: a white puff either side of the body. */
function steam(s: BossStage, count: number): void {
  const { x, y } = s.center;
  for (const dx of [-95, 95]) s.juice.burst(x + dx, y + 70, STEAM, count);
}

/**
 * The room comes down the shaft with it and stops dead with a clank. The furnace doors grind open
 * and their glow fills the room; a heartbeat starts, faint and then loud. Close on the heart, its
 * eyes open, and it roars as steam blows from its fists.
 */
const entrance: Cutscene = {
  lengthMs: 5600,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.unveil();
        s.scenery.land();
        s.audio.sfx('crucible_groan', 0.45);
      },
    },
    {
      at: 2150,
      run: (s) => {
        const { x, y } = s.center;
        s.audio.sfx('crucible_clank', 0.7);
        s.juice.shake(260, 0.01);
        s.lighting.dip(0.5);
        s.juice.burst(x - 140, y + 150, FURNACE, 10);
        s.juice.burst(x + 140, y + 150, FURNACE, 10);
      },
    },
    {
      at: 2600,
      run: (s) => {
        const { x, y } = s.center;
        s.audio.sfx('crucible_doors', 0.55);
        const glow = s.light({ x, y: y + 120, radius: 120, color: FURNACE, intensity: 0, priority: 7 });
        s.tween({ targets: glow, radius: 360, intensity: 0.9, duration: 1600, ease: 'Sine.InOut' });
      },
    },
    ...[
      { at: 3300, volume: 0.25 },
      { at: 3800, volume: 0.4 },
      { at: 4300, volume: 0.55 },
    ].map(({ at, volume }) => ({
      at,
      run: (s: BossStage) => {
        s.audio.sfx('crucible_heartbeat', volume);
        s.scenery.pulse(volume * 1.6);
        s.juice.shake(120, volume * 0.008);
      },
    })),
    {
      at: 4300,
      run: (s) => {
        s.shot({ zoom: 2.4, ...heart(s), cut: true });
        s.anim('open');
      },
    },
    {
      at: 4800,
      run: (s) => {
        const at = heart(s);
        s.shot({ zoom: 1.35, ...s.center });
        s.anim('tell');
        s.audio.sfx('crucible_roar', 0.65);
        s.impact(at.x, at.y, 1.2, HEART);
        steam(s, 18);
        const flare = s.light({ ...at, radius: 90, color: HEART, intensity: 0.4, priority: 7 });
        s.tween({ targets: flare, radius: 260, intensity: 1.2, duration: 600, ease: 'Sine.Out' });
      },
    },
  ],
};

/** The cage gives: every bar left blows off, and the bare heart screams. */
const exposed: Cutscene = {
  lengthMs: 2400,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.anim('hurt');
        s.audio.sfx('crucible_rib_break', 0.6);
        s.audio.sfx('crucible_groan', 0.4, 200);
        const r = rig(s);
        for (const id of RIBS) if (s.part(id)) r?.broken(id);
        r?.bare();
        const at = heart(s);
        s.impact(at.x, at.y, 1, FURNACE);
      },
    },
    {
      at: 800,
      run: (s) => {
        const at = heart(s);
        s.shot({ zoom: 2, ...at });
        s.anim('tell');
        s.audio.sfx('crucible_scream', 0.6);
        s.juice.shake(400, 0.006);
        const flare = s.light({ ...at, radius: 80, color: HEART, intensity: 0.4, priority: 7 });
        s.tween({ targets: flare, radius: 240, intensity: 1.3, duration: 700, ease: 'Sine.Out' });
      },
    },
  ],
};

/** How long the floor takes to give way under the meltdown, in ms. */
const FALL_MS = 2200;

/**
 * Meltdown: the cables snap one by one and the torso falls away. The floor gives way, and the room
 * drops past as the heart climbs out of the dark and roars.
 */
const meltdown: Cutscene = {
  lengthMs: 3600,
  cues: [
    {
      at: 0,
      run: (s) => {
        s.anim('hurt');
        s.audio.sfx('crucible_groan', 0.55, -200);
        s.juice.shake(500, 0.005);
      },
    },
    ...[400, 650, 850].map((at, i) => ({
      at,
      run: (s: BossStage) => {
        const { x, y } = heart(s);
        s.audio.sfx('crucible_snap', 0.5, i * 150, { x: x + (i - 1) * 26 });
        s.juice.sparkle(x + (i - 1) * 26, y - 60, FURNACE, 6);
        if (i === 2) rig(s)?.tearFree(false);
      },
    })),
    {
      at: 1100,
      run: (s) => {
        s.audio.sfx('crucible_crack', 0.65);
        s.juice.shake(900, 0.012);
        const fall = { k: 0 };
        s.tween({
          targets: fall,
          k: 1,
          duration: FALL_MS,
          ease: 'Cubic.InOut',
          onUpdate: () => s.scenery.fall(fall.k),
        });
      },
    },
    {
      at: 2400,
      run: (s) => {
        const at = heart(s);
        s.shot({ zoom: 1.5, ...at });
        s.anim('tell');
        s.audio.sfx('crucible_roar', 0.65, -150);
        s.impact(at.x, at.y, 1.4, HEART);
        const blaze = s.light({ ...at, radius: 120, color: HEART, intensity: 1.4, priority: 7 });
        s.tween({ targets: blaze, radius: 280, intensity: 0.5, duration: 900, ease: 'Sine.Out' });
      },
    },
  ],
};

/**
 * The blasts that burst the heart, each further out than the last: ms into the death scene, px
 * from the heart, and size. With the final hit's blow at 0, no three fall inside one second.
 */
const BLASTS = [
  { at: 700, dx: -26, dy: -10, scale: 0.8 },
  { at: 1450, dx: 34, dy: 16, scale: 1 },
  { at: 2200, dx: 0, dy: 0, scale: 1.5 },
] as const;

/** It goes white-hot and bursts, three times. What is left is a lump of slag that cools in the steam. */
const death: Cutscene = {
  lengthMs: 4600,
  cues: [
    {
      at: 0,
      run: (s) => {
        const at = heart(s);
        rig(s)?.overheat();
        s.anim('death');
        s.audio.sfx('crucible_meltdown', 0.6);
        s.juice.shake(2200, 0.004);
        const hot = s.light({ ...at, radius: 120, color: WHITE_HOT, intensity: 0.8, priority: 7 });
        s.tween({ targets: hot, radius: 220, intensity: 1.5, duration: 2200, ease: 'Sine.In' });
      },
    },
    ...BLASTS.map(({ at, dx, dy, scale }, i) => ({
      at,
      run: (s: BossStage) => {
        const { x, y } = heart(s);
        s.impact(x + dx, y + dy, scale, i === 2 ? WHITE_HOT : FURNACE);
        s.audio.sfx(i === 2 ? 'boss_explode' : 'brick_tnt', 0.45 + 0.1 * i, i * 100, { x: x + dx });
        s.juice.burst(x + dx, y + dy, FURNACE, 14 + 6 * i);
      },
    })),
    {
      at: 2500,
      run: (s) => {
        rig(s)?.cool();
        s.audio.sfx('crucible_cool', 0.55);
        const { x, y } = heart(s);
        s.juice.burst(x, y - 20, STEAM, 24);
        steam(s, 10);
        // The room cools with it: the furnace light sinks into the dark.
        const chill = s.light({ x: FIELD_WIDTH / 2, y, radius: 700, color: 0x000000, intensity: 0, negative: true });
        s.tween({ targets: chill, intensity: 0.45, duration: 1800, ease: 'Sine.InOut' });
      },
    },
    {
      at: 3400,
      run: (s) => {
        const { x, y } = heart(s);
        s.juice.sparkle(x, y - 30, STEAM, 8);
      },
    },
  ],
};

/** Every opening marks the heart: it is what the slag goes back to and where the triple damage is. */
const OPENING = { lock: 'heart' } as const;

/** Stoke: ms each glob flies, as a lob, and between the two of a full pool's pair. */
const STOKE_FLIGHT_MS = 3 * BEAT_MS;
const STOKE_STAGGER_MS = 2 * BEAT_MS;
/** Stoke: how far from the paddle a glob lands, in px, at the nearest and furthest. */
const STOKE_NEAR = 90;
const STOKE_FAR = 170;
/** Stoke: how many hits a caught glob deals. */
const SLAG_HITS = 3;

/** The ribs still standing, nearest `x` first: slag goes back to the one closest to where it was caught. */
function ribsNear(v: BossView, x: number): string[] {
  const ribs = RIBS.filter((id) => v.parts[id]);
  ribs.sort((a, b) => Math.abs(v.parts[a]!.x - x) - Math.abs(v.parts[b]!.x - x));
  return [...ribs, 'heart'];
}

/** Where a glob for the paddle lands: off to the side with more room, a short walk away. */
function lobFor(v: BossView, k: number): number {
  const reach = STOKE_NEAR + (STOKE_FAR - STOKE_NEAR) * k;
  const dir = v.paddle.x < FIELD_WIDTH / 2 ? 1 : -1;
  return inField(v.paddle.x + dir * reach, 40);
}

/**
 * Stoke: the furnace door opens and it lobs gold slag at the paddle line. It is harmless; catch it
 * and it flies back for three hits at the rib nearest, or the heart once the ribs are gone. One glob
 * at a full pool, two as it empties.
 */
function stoke(id: string, target: (v: BossView, x: number) => string[], from: string): AttackDef {
  return {
    id,
    windupMs: 2 * BEAT_MS,
    liveMs: STOKE_STAGGER_MS + STOKE_FLIGHT_MS + 100,
    recoverMs: 2 * BEAT_MS,
    tell: { sfx: 'crucible_stoke' },
    plan: (v) => {
      const count = v.phaseProgress < 0.5 ? 1 : 2;
      return {
        hazards: Array.from({ length: count }, (_, i): HazardSpec => {
          const x = i === 0 ? lobFor(v, v.rng.next()) : FIELD_WIDTH - lobFor(v, v.rng.next());
          return {
            kind: 'slag',
            from,
            x,
            at: i * STOKE_STAGGER_MS,
            flightMs: STOKE_FLIGHT_MS,
            returnTo: target(v, x),
            hits: SLAG_HITS,
          };
        }),
      };
    },
  };
}

/** Vent: a steam beam the width of half the field, burning this long, and what it leaves of the paddle. */
const VENT_WIDTH = 250;
const VENT_BURN_MS = 2 * BEAT_MS;
const VENT_SHRINK = 0.85;

/**
 * Vent: the fist over the paddle's half of the field flares and blows a beam of steam straight
 * down. Moving to the other half is always enough, and the next vent comes from there.
 */
const vent: AttackDef = {
  id: 'vent',
  windupMs: 3 * BEAT_MS,
  liveMs: VENT_BURN_MS,
  recoverMs: 2 * BEAT_MS,
  tell: { sfx: 'crucible_vent' },
  plan: ({ paddle }) => {
    const left = paddle.x < FIELD_WIDTH / 2;
    return {
      hazards: [
        {
          kind: 'beam',
          x: left ? VENT_WIDTH / 2 + 20 : FIELD_WIDTH - VENT_WIDTH / 2 - 20,
          width: VENT_WIDTH,
          at: 0,
          liveMs: VENT_BURN_MS,
          onPaddle: { kind: 'shrink', factor: VENT_SHRINK },
        },
      ],
    };
  },
};

/** Pressure: the field in three lanes, and how much of a lane each beam fills. */
const LANES = 3;
const LANE_FILL = 0.95;
const PRESSURE_SHRINK = 0.85;

/**
 * Pressure: the vents fire one lane after another, left, middle, right, on the beat. Each goes out
 * a moment before the next fires, so the way through is to follow the steam: step into the lane
 * that just went out.
 */
function pressure(id: string, stepMs: number, burnMs: number): AttackDef {
  const lane = FIELD_WIDTH / LANES;
  return {
    id,
    windupMs: 3 * BEAT_MS,
    liveMs: (LANES - 1) * stepMs + burnMs,
    recoverMs: 4 * BEAT_MS,
    tell: { sfx: 'crucible_vent' },
    opening: OPENING,
    plan: () => ({
      hazards: Array.from({ length: LANES }, (_, i): HazardSpec => {
        return {
          kind: 'beam',
          x: (i + 0.5) * lane,
          width: lane * LANE_FILL,
          at: i * stepMs,
          liveMs: burnMs,
          onPaddle: { kind: 'shrink', factor: PRESSURE_SHRINK },
        };
      }),
    }),
  };
}

/** Slag rain: the rake of darts, px apart, ms apart and how long each flies and jams. */
const RAIN_DARTS = 5;
const RAIN_SPACING = 40;
const RAIN_STAGGER_MS = BEAT_MS / 4;
const RAIN_FLIGHT_MS = 2 * BEAT_MS;
const RAIN_JAM_MS = 500;
/** Slag rain: when the glob in the gap sets off, and how far past the rake's end it lands. */
const RAIN_SLAG_AT = BEAT_MS;
const RAIN_SLAG_OFF = 90;

/**
 * Slag rain: a rake of jamming darts across where the paddle stood, and one glob of slag in the
 * free gap beside it. Stepping out of the rake is the same step that catches the glob.
 */
const slagRain: AttackDef = {
  id: 'slag-rain',
  windupMs: 2 * BEAT_MS,
  liveMs: RAIN_SLAG_AT + STOKE_FLIGHT_MS + 100,
  recoverMs: 4 * BEAT_MS,
  tell: { sfx: 'crucible_stoke' },
  opening: OPENING,
  plan: ({ rng, paddle }) => {
    const reach = ((RAIN_DARTS - 1) * RAIN_SPACING) / 2;
    const mid = inField(paddle.x, reach + SHOT_RADIUS);
    // The glob goes to whichever side of the rake has more room.
    const right = FIELD_WIDTH - (mid + reach) > mid - reach;
    const glob = right ? mid + reach + RAIN_SLAG_OFF : mid - reach - RAIN_SLAG_OFF;
    const dir = rng.chance(0.5) ? 1 : -1;
    return {
      hazards: [
        ...Array.from({ length: RAIN_DARTS }, (_, i): HazardSpec => {
          return {
            kind: 'shot',
            from: 'heart',
            x: mid + dir * (i * RAIN_SPACING - reach),
            at: i * RAIN_STAGGER_MS,
            flightMs: RAIN_FLIGHT_MS,
            onPaddle: { kind: 'jam', ms: RAIN_JAM_MS },
          };
        }),
        {
          kind: 'slag',
          from: 'shell',
          x: inField(glob, 30),
          at: RAIN_SLAG_AT,
          flightMs: STOKE_FLIGHT_MS,
          returnTo: ['heart'],
          hits: SLAG_HITS,
        },
      ],
    };
  },
};

/** Spit: darts on every eighth note, walking across the paddle line, and how far each moves on. */
const SPIT_DARTS = 8;
const SPIT_STEP_MS = BEAT_MS / 2;
const SPIT_FLIGHT_MS = 2 * BEAT_MS;
const SPIT_WALK = 40;
const SPIT_SHRINK = 0.92;

/**
 * Spit: the free heart spits a stream of darts on the eighth notes that walks across where the
 * paddle stood, one way or the other. Each lands on the beat; stepping against the walk clears it.
 */
const spit: AttackDef = {
  id: 'spit',
  windupMs: 2 * BEAT_MS,
  liveMs: (SPIT_DARTS - 1) * SPIT_STEP_MS + SPIT_FLIGHT_MS,
  recoverMs: 4 * BEAT_MS,
  tell: { sfx: 'crucible_scream' },
  opening: OPENING,
  plan: ({ rng, paddle }) => {
    const reach = ((SPIT_DARTS - 1) * SPIT_WALK) / 2;
    const mid = inField(paddle.x, reach + SHOT_RADIUS);
    const dir = rng.chance(0.5) ? 1 : -1;
    return {
      hazards: Array.from({ length: SPIT_DARTS }, (_, i): HazardSpec => {
        return {
          kind: 'shot',
          from: 'heart',
          x: mid + dir * (i * SPIT_WALK - reach),
          at: i * SPIT_STEP_MS,
          flightMs: SPIT_FLIGHT_MS,
          onPaddle: { kind: 'shrink', factor: SPIT_SHRINK },
        };
      }),
    };
  },
};

/** Ember skull: how long the skull flies, and the slag beside it: px off, when it sets off and lands. */
const SKULL_FLIGHT_MS = 4 * BEAT_MS;
const SKULL_SLAG_OFF = 130;
const SKULL_SLAG_AT = [0, BEAT_MS] as const;

/**
 * Ember skull: one slow burning skull for where the paddle stood, with a glob of slag either side.
 * Step aside onto a glob: it is the dodge and the counter at once.
 */
const emberSkull: AttackDef = {
  id: 'ember-skull',
  windupMs: 3 * BEAT_MS,
  liveMs: SKULL_FLIGHT_MS + 100,
  recoverMs: 4 * BEAT_MS,
  tell: { sfx: 'crucible_roar' },
  opening: OPENING,
  plan: ({ rng, paddle }) => {
    const x = inField(paddle.x, SKULL_RADIUS);
    // One glob each side of the skull. Near a wall both go to the open side, one beyond the other.
    const left = x - SKULL_SLAG_OFF;
    const right = x + SKULL_SLAG_OFF;
    const sides = [
      left >= 30 ? left : x + 2 * SKULL_SLAG_OFF,
      right <= FIELD_WIDTH - 30 ? right : x - 2 * SKULL_SLAG_OFF,
    ];
    if (rng.chance(0.5)) sides.reverse();
    return {
      hazards: [
        { kind: 'skull', from: 'heart', x, at: 0, flightMs: SKULL_FLIGHT_MS },
        ...sides.map((side, n): HazardSpec => {
          return {
            kind: 'slag',
            from: 'heart',
            x: side,
            at: SKULL_SLAG_AT[n]!,
            flightMs: STOKE_FLIGHT_MS,
            returnTo: ['heart'],
            hits: SLAG_HITS,
          };
        }),
      ],
    };
  },
};

/** Where the bare heart climbs to once it is free, under the room it tore itself out of. */
const RISEN_DY = -10 * BH;

/**
 * The first boss. A furnace torso holds the Crucible's heart in a cage of four ribs. The ball
 * breaks the ribs, and the gold slag it lobs is the player's best weapon: caught, it flies back.
 * Bare, the heart takes triple damage and the vents press in lanes. Torn free, it flies a figure
 * of eight and spits on the beat. Every attack is timed to the track and comes after two
 * thumps of the heart, so the fight is learned by ear as much as by eye.
 */
export const crucible: BossDef = {
  id: 'crucible',
  name: 'The Crucible',
  epithet: 'Heart of the forge',
  parts: [
    // The furnace torso and the cage's cap are iron: they deflect.
    { id: 'shell', col: 6, row: 2, cols: 8, rows: 12, texture: 'brick_steel', kind: 'steel' },
    { id: 'cap', col: 8, row: 14, cols: 4, rows: 4, texture: 'brick_steel', kind: 'steel' },
    { id: 'rib1', col: 8, row: 18, cols: 1, rows: 8, texture: 'brick_orange2', health: 6 },
    { id: 'rib2', col: 9, row: 18, cols: 1, rows: 8, texture: 'brick_orange2', health: 6 },
    { id: 'rib3', col: 10, row: 18, cols: 1, rows: 8, texture: 'brick_orange2', health: 6 },
    { id: 'rib4', col: 11, row: 18, cols: 1, rows: 8, texture: 'brick_orange2', health: 6 },
    { id: 'heart', col: 9, row: 18, cols: 2, rows: 6, texture: 'brick_red', weak: 3 },
  ],
  rig: crucibleRig(),
  scenery: 'crucible',
  hazards: { shot: CRUCIBLE_KEYS.dart, slag: CRUCIBLE_KEYS.slag, splash: CRUCIBLE_KEYS.splash },
  beatLock: true,
  poses: {
    // Up inside the torso, where no ball reaches it, while the ribs stand in front of it.
    caged: { heart: { dy: -14 * BH } },
    risen: { heart: { dy: RISEN_DY } },
  },
  phases: [
    {
      id: 'caged',
      title: 'Caged',
      // Four ribs of six: a pool that breaks them all, and slag that cracks them three at a time.
      hits: 24,
      pose: 'caged',
      motion: sway(36, 8000),
      intensity: 'low',
      deck: [stoke('stoke', ribsNear, 'shell'), vent],
      gapMs: [2800, 2200],
    },
    {
      id: 'exposed',
      title: 'Exposed',
      hits: 40,
      motion: sway(60, 6000),
      intensity: 'mid',
      setup: (s) => {
        // Whatever ribs the pool did not get to break went with the cage in the scene.
        const left = RIBS.filter((id) => s.part(id));
        for (const id of left) rig(s)?.broken(id);
        s.retire(...left);
        rig(s)?.bare();
        s.paddle.resetSize();
      },
      enter: exposed,
      deck: [pressure('pressure', 2 * BEAT_MS, 600), slagRain, stoke('stoke-heart', () => ['heart'], 'shell')],
      gapMs: [2400, 1700],
    },
    {
      id: 'meltdown',
      title: 'Meltdown',
      hits: 44,
      pose: 'risen',
      motion: figure8(130, 34, 8000),
      intensity: 'high',
      setup: (s) => {
        s.retire('shell', 'cap');
        rig(s)?.tearFree(true);
        s.scenery.fall(1);
        s.paddle.resetSize();
      },
      enter: meltdown,
      deck: [spit, emberSkull, pressure('pressure-fast', 1.5 * BEAT_MS, 450)],
      gapMs: [2000, 1400],
    },
  ],
  on: (s, e) => {
    if (e.type === 'broken') {
      const at = s.part(e.part) ?? s.center;
      s.audio.sfx('crucible_rib_break', 0.55, 0, { x: at.x });
      s.juice.shake(160, 0.005);
      return;
    }
    if (e.type !== 'window' || e.window !== 'windup') return;
    // Two hard thumps of the heart on the beats before every attack, and the vents flare for a beam.
    const r = rig(s);
    r?.thump(2);
    if (e.attack === 'vent' || e.attack?.startsWith('pressure')) r?.flare();
  },
  entrance,
  death,
  trophy: 'Crucible Heart',
};
