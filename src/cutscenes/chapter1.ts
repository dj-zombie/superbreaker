import {
  actor,
  ambient,
  ambientOff,
  backdrop,
  camera,
  card,
  cutscene,
  enter,
  exit,
  fade,
  flash,
  fx,
  grade,
  haptic,
  label,
  letterbox,
  music,
  narrate,
  parseLine,
  plate,
  say,
  scenery,
  seq,
  sfx,
  shake,
  together,
  transition,
  wait,
  type ActorAnim,
  type AssetRef,
  type SayStep,
  type Speaker,
  type Step,
} from '../core/cutscene';

/**
 * Voice-over clips that exist, with their lengths in ms: a spoken line stays up as long as its
 * clip runs, so the scene keeps to the score's clock instead of waiting on the voice.
 */
const VO_MS: Record<string, number> = {
  vo_intro_01: 4827,
  vo_intro_02: 3234,
  vo_crucible_01: 3240,
  vo_intro_03: 7018,
  vo_intro_04: 4529,
  vo_intro_05: 3925,
  vo_intro_06: 3934,
};
const RECORDED = new Set<string>(Object.keys(VO_MS));
const VOICE: AssetRef[] = [...RECORDED].map((key) => ({
  key,
  path: `audio/cutscenes/vo/${key}.mp3`,
}));
const vo = (key: string): Pick<SayStep, 'voice'> => (RECORDED.has(key) ? { voice: key } : {});

const img = (key: string, ext = 'png'): AssetRef => ({
  key,
  path: `images/cutscenes/${key}.${ext}`,
});
const snd = (key: string): AssetRef => ({ key, path: `audio/cutscenes/${key}.mp3` });

/**
 * A line spoken over the score: typed at about the pace it is said, and up for as long as its
 * clip, with a breath after.
 */
function spoken(who: Speaker, text: string, key: string, opts: Partial<SayStep> = {}): Step {
  const ms = VO_MS[key] ?? 3000;
  const letters = Math.max(1, parseLine(text).text.length);
  const cps = letters / ((ms * 0.8) / 1000);
  const reveal = parseLine(text, cps).revealMs;
  return say(who, text, { ...vo(key), cps, hold: Math.max(250, ms + 500 - reveal), ...opts });
}

/** Steps placed on the score's clock: they start this many seconds after it does. */
type Cue = readonly [seconds: number, ...steps: Step[]];

/**
 * Lays cues out against the score. Each runs in its own branch from the score's first beat, so a
 * spoken line or a card never pushes the hits after it off the music. Branches compile in time
 * order, which is what actors' last positions and the ambient fields' on and off rely on.
 */
function scored(cues: readonly Cue[]): Step {
  const sorted = [...cues].sort((a, b) => a[0] - b[0]);
  return together(...sorted.map(([s, ...steps]) => seq(wait(Math.round(s * 1000)), ...steps)));
}

// The storm plate's slow push, so the lit frames a strike flashes in line up with it.
const STORM_MS = 10_600;
const STORM_FROM = { x: 0.5, y: 0.18, zoom: 1.15 };
const STORM_TO = { x: 0.5, y: 0.52, zoom: 1 };
const stormAt = (s: number) => {
  const k = Math.min(1, Math.max(0, (s * 1000) / STORM_MS));
  return {
    x: STORM_FROM.x + (STORM_TO.x - STORM_FROM.x) * k,
    y: STORM_FROM.y + (STORM_TO.y - STORM_FROM.y) * k,
    zoom: STORM_FROM.zoom + (STORM_TO.zoom - STORM_FROM.zoom) * k,
  };
};

/**
 * Lightning over the storm plate: the painted bolt flickers in twice over the dark frame, with
 * the flash, the crack and the shake. `big` is a close strike; otherwise it is further off.
 */
function strike(s: number, big: boolean): Cue[] {
  const lit = (at: number, ms: number, fadeMs: number): Cue => [
    at,
    plate('cs_plate_storm', { ms, fadeMs, from: stormAt(at), to: stormAt(at + ms / 1000) }),
  ];
  return [
    lit(s, 180, 30),
    lit(s + 0.26, big ? 520 : 300, 80),
    [
      s,
      flash(big ? 240 : 160, 0xe6dcff, big ? 0.8 : 0.45),
      sfx(big ? 'cs_thunder_close' : 'ab_lightning', big ? 0.95 : 0.55),
      shake(big ? 800 : 300, big ? 0.012 : 0.005),
      haptic(big ? 'heavy' : 'light'),
    ],
  ];
}

/** A bolt over a live backdrop: the strike, the room lit for a moment, and the thunder. */
function bolt(s: number, at: readonly [number, number], tint: number): Cue[] {
  return [
    [
      s,
      fx('ability.lightning_strike', at, { tint, scale: 1.3 }),
      flash(200, 0xdfe8ff, 0.75),
      backdrop({ glow: 0.6, ms: 60 }),
      sfx('thunder', 0.7),
      shake(380, 0.008),
    ],
    [s + 0.18, backdrop({ glow: 0.05, ms: 700, ease: 'out' })],
  ];
}

/** A rig's patterns: the volley and the logo read their anims by name, not frames. */
const named = (...names: string[]): Record<string, ActorAnim> =>
  Object.fromEntries(names.map((n) => [n, { frames: [], fps: 1, loop: true }]));
const PATTERNS = named('spiral', 'fan', 'ring', 'rain', 'stop');
const volley = (kind: string) => ({
  name: 'Volley',
  sprite: `volley:${kind}`,
  size: 64,
  anims: PATTERNS,
  idle: 'stop',
});

// Where the Crucible hangs: its torso, the jets on its fists, and the heart on its hook.
const TORSO: readonly [number, number] = [0.5, 0.27];
const JET_L: readonly [number, number] = [0.383, 0.37];
const JET_R: readonly [number, number] = [0.617, 0.37];
const HEART: readonly [number, number] = [0.5, 0.47];

/** The spark's run through the volley, from one gap to the next. */
const WEAVE: readonly (readonly [number, number])[] = [
  [0.3, 0.72],
  [0.22, 0.84],
  [0.42, 0.66],
  [0.62, 0.8],
  [0.78, 0.68],
  [0.7, 0.86],
  [0.48, 0.74],
  [0.28, 0.62],
  [0.36, 0.82],
  [0.6, 0.64],
  [0.76, 0.78],
  [0.56, 0.86],
  [0.5, 0.74],
];

/**
 * Chapter I: Hell Foundry. The game's opening, before Level 1. A tap lights it (and unlocks the
 * audio), then everything runs on the score: a storm over the Foundry, a spark falling through
 * the forge's shafts, the Crucible waking to burn it in a storm of slag, a glimpse of the Crypt
 * and the Mainframe below, the spark forged into the Breaker, the title, and the shaft handed to
 * Level 1 where it is.
 */
export const CHAPTER_1 = cutscene(
  'chapter-1',
  {
    opens: { scenery: 'hell', grade: 'night', pace: 0.3 },
    closes: { scenery: 'hell', pace: 1, handoff: 'continuous' },
    skip: 'always',
    scored: true,
    cast: {
      spark: {
        name: 'Spark',
        sprite: 'comet:cs_spark',
        size: 48,
        anims: named('burn', 'flare'),
        idle: 'burn',
        light: { color: 0xffc860, radius: 120, intensity: 0.8 },
      },
      crucible: {
        name: 'The Crucible',
        color: 0xff6a2a,
        sprite: 'cs_crucible_torso',
        size: 260,
        light: { color: 0xff5a1f, radius: 230, intensity: 0.55 },
      },
      heart: {
        name: 'The Crucible',
        sprite: 'cs_crucible_heart',
        size: 120,
        anims: {
          calm: { frames: [0, 6, 0, 0], fps: 2, loop: true },
          wake: { frames: [0, 7, 7, 1], fps: 5 },
          scream: { frames: [2, 9, 8, 9], fps: 6, loop: true },
          hot: { frames: [11, 4, 11, 4], fps: 8, loop: true },
          hurt: { frames: [3, 10, 10], fps: 6 },
        },
        idle: 'calm',
        light: { color: 0xff3a1a, radius: 150, intensity: 0.85 },
      },
      volley: volley('slag'),
      jetL: volley('slag'),
      jetR: volley('slag'),
      data: volley('data'),
      warden: {
        name: 'The Warden',
        sprite: 'boss:warden',
        size: 230,
        anims: { tell: { frames: [3, 4], fps: 4, loop: true } },
        light: { color: 0x9a6bff, radius: 130, intensity: 0.6 },
      },
      breaker: { name: 'Breaker', sprite: 'breaker' },
      logo: {
        name: 'Super Breaker',
        sprite: 'logo:cs_logo',
        size: 190,
        anims: named('ignite', 'dark'),
        idle: 'dark',
        light: { color: 0xff7a2a, radius: 280, intensity: 0.45 },
      },
    },
    assets: {
      images: [
        img('cs_plate_storm', 'jpg'),
        img('cs_plate_storm_dark', 'jpg'),
        img('cs_plate_anvil', 'jpg'),
        img('cs_plate_lid', 'jpg'),
        img('cs_spark'),
        { key: 'cs_crucible_torso', path: 'images/bosses/crucible/torso.png' },
        { key: 'cs_logo', path: 'images/ui/logo/shattered.webp' },
        { key: 'cs_logo_glow', path: 'images/ui/logo/shattered_glow.webp' },
      ],
      sheets: [
        {
          key: 'cs_crucible_heart',
          path: 'images/bosses/crucible/heart.png',
          frameWidth: 180,
          frameHeight: 220,
        },
      ],
      voice: VOICE,
      sfx: [
        snd('cs_thunder_close'),
        snd('cs_braam'),
        snd('cs_riser'),
        snd('cs_volley'),
        snd('cs_anvil'),
        snd('cs_heartbeat'),
        snd('cs_rumble'),
        snd('cs_crack'),
      ],
      music: [snd('cs_intro_score')],
    },
  },
  [
    // 1. Dark, a few embers, and the tap that lights it all (and lets the browser play sound).
    label('ignite'),
    together(
      letterbox(1, 0),
      fade(0.86, 0),
      ambient('ambient.sparks', { depth: 'between', intensity: 0.3, ms: 1500 }),
    ),
    wait(900),
    narrate('{wave}Touch to ignite{/wave}', { box: 'caption', hold: 'tap', blip: false }),
    together(fade(1, 350), sfx('cs_heartbeat', 0.6)),
    wait(450),

    // Everything from here keeps to the score (cs_intro_score): its sections turn at 16, 32, 36,
    // 53 and 65.6 s, with hits at 54, 58 and 62, an accent at 74 and the peak at 82.
    scored([
      // 2. The storm over the Foundry.
      [
        0,
        label('storm'),
        music('cs_intro_score', 60, 0.9),
        fade(0, 120),
        plate('cs_plate_storm_dark', {
          ms: STORM_MS,
          fadeMs: 200,
          from: STORM_FROM,
          to: STORM_TO,
        }),
        ambient('weather.rain', { depth: 'front', intensity: 0.9, ms: 300 }),
      ],
      ...strike(0, true),
      [
        1.8,
        spoken('narrator', 'Before the first light,{p:300} there were only walls.', 'vo_intro_01'),
      ],
      [4.1, flash(160, 0xb8a8ff, 0.22), sfx('thunder', 0.3)],
      ...strike(7.9, false),

      // 3. Something falls: the plate gives way to the forge's own shafts racing past.
      ...strike(10, true),
      [9.6, spoken('narrator', 'Then,{p:200} something fell.', 'vo_intro_02')],
      [
        10.2,
        label('spark'),
        ambientOff('weather.rain', 900),
        grade('ember', 1600),
        enter('spark', [0.62, -0.06], 'cut'),
        actor('spark', {
          path: [
            [0.42, 0.26],
            [0.58, 0.48],
            [0.5, 0.72],
          ],
          ms: 5400,
        }),
        ambient('ambient.speedlines', { depth: 'front', intensity: 0.7, ms: 500 }),
        backdrop({ pace: 2.6, glow: 0.15, ms: 2400, ease: 'in' }),
        camera('follow', { subject: 'spark', ms: 5400 }),
        camera({ zoom: 1.18 }, { ms: 1600 }),
        sfx('ab_meteor_whoosh', 0.7),
      ],
      [12, fx('screen.flare', 'spark', { tint: 0xffc860 })],
      [
        15.6,
        ambientOff('ambient.speedlines', 600),
        backdrop({ pace: 0.25, glow: 0, ms: 900, ease: 'out' }),
        camera({ zoom: 1, x: 0.5, y: 0.5 }, { ms: 900, ease: 'inOut' }),
      ],

      // 4. The Crucible wakes.
      [
        16,
        label('crucible'),
        grade('dread', 500),
        enter('crucible', TORSO, 'fall', 900),
        enter('heart', HEART, 'fall', 1100),
        actor('spark', { to: [0.5, 0.74], ms: 900, ease: 'out' }),
        ambient('ambient.sparks', { depth: 'between', intensity: 0.8, ms: 600 }),
        camera('pushIn', { subject: [0.5, 0.4], amount: 0.14, ms: 5000 }),
      ],
      [
        16.6,
        sfx('boss_stomp', 0.9),
        sfx('crucible_roar', 0.7),
        shake(900, 0.012),
        haptic('heavy'),
        fx('boss.vent', JET_L),
        fx('boss.vent', JET_R),
      ],
      [17.6, actor('heart', { anim: 'wake' })],
      [
        20,
        actor('heart', { anim: 'scream', emote: 'shake' }),
        fx('boss.heart_pulse', 'heart'),
        camera('dutch', { amount: -4, ms: 1800 }),
      ],
      [
        20.5,
        spoken('crucible', '{shake}Another spark.{/shake} Burn it.', 'vo_crucible_01', {
          side: 'right',
        }),
      ],
      [
        24,
        actor('heart', { anim: 'hot' }),
        fx('boss.telegraph', 'heart'),
        sfx('crucible_stoke', 0.7),
        camera('level', { ms: 900 }),
        actor('spark', { emote: 'bounce' }),
      ],
      [
        25,
        enter('volley', HEART, 'cut'),
        actor('volley', { anim: 'fan' }),
        actor('spark', {
          path: [
            [0.4, 0.72],
            [0.6, 0.7],
            [0.5, 0.74],
          ],
          ms: 3000,
        }),
      ],
      [28, actor('volley', { anim: 'ring' })],
      [29.2, sfx('cs_riser', 0.8)],

      // 5. The breath before it, then the storm of slag.
      [
        32,
        label('volley'),
        actor('volley', { anim: 'stop' }),
        actor('spark', { anim: 'flare' }),
        grade('bw', 250),
        backdrop({ pace: 0, ms: 300 }),
        flash(120, 0xffffff, 0.5),
        camera('punch', { amount: 0.12 }),
        camera({ zoom: 1.35, x: 0.5, y: 0.66, angle: 0 }, { ms: 3500, ease: 'in' }),
        camera('rackFocus', { amount: 0.5, ms: 300 }),
      ],
      [33, sfx('cs_heartbeat', 0.9)],
      [35.4, camera('rackFocus', { amount: 0, ms: 400 })],
      [
        36,
        grade('ember', 200),
        flash(220, 0xffd0a0, 0.8),
        camera({ zoom: 1.06, x: 0.5, y: 0.52, angle: 0 }, { ms: 600, ease: 'out' }),
        camera('handheld', { amount: 0.7, ms: 400 }),
        backdrop({ pace: 3, glow: 0.2, ms: 800 }),
        ambient('ambient.speedlines', { depth: 'front', intensity: 0.8, ms: 400 }),
        actor('volley', { anim: 'spiral' }),
        enter('jetL', JET_L, 'cut'),
        enter('jetR', JET_R, 'cut'),
        actor('jetL', { anim: 'rain' }),
        actor('jetR', { anim: 'rain' }),
        actor('spark', { anim: 'burn', path: WEAVE, ms: 14_300 }),
        sfx('cs_volley', 0.7),
        shake(400, 0.008),
        haptic('heavy'),
      ],
      [37.5, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [39, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [
        39.8,
        flash(140, 0xffe0b0, 0.5),
        fx('screen.flare', 'spark', { tint: 0xffc860 }),
        camera('whip', { subject: 'spark', ms: 320 }),
      ],
      [
        40,
        actor('volley', { anim: 'ring' }),
        actor('jetL', { anim: 'fan' }),
        actor('jetR', { anim: 'fan' }),
        sfx('cs_volley', 0.7),
      ],
      [41.5, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [43, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [
        44,
        actor('volley', { anim: 'spiral' }),
        actor('jetL', { anim: 'rain' }),
        actor('jetR', { anim: 'rain' }),
        camera('dutch', { amount: 5, ms: 1500 }),
        sfx('cs_volley', 0.7),
      ],
      [46, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [47.5, fx('impact.bullet', 'spark', { scale: 1.4 })],
      [
        48,
        actor('volley', { anim: 'ring' }),
        actor('jetL', { anim: 'fan' }),
        actor('jetR', { anim: 'fan' }),
        camera('dutch', { amount: -5, ms: 1500 }),
        sfx('cs_volley', 0.8),
      ],
      // The spark turns on the heart.
      [
        50.4,
        actor('spark', { to: [0.5, 0.53], ms: 650, ease: 'in' }),
        camera('level', { ms: 600 }),
      ],
      [
        51.05,
        actor('spark', { anim: 'flare' }),
        actor('heart', { anim: 'hurt', emote: 'shake' }),
        actor('volley', { anim: 'stop' }),
        actor('jetL', { anim: 'stop' }),
        actor('jetR', { anim: 'stop' }),
        flash(280, 0xffffff, 0.95),
        sfx('cs_crack', 1),
        sfx('crucible_rib_break', 0.8),
        fx('boss.part_break', 'heart'),
        fx('ability.bomb_blast', 'heart'),
        shake(800, 0.016),
        camera('punch', { amount: 0.15 }),
        haptic('heavy'),
      ],
      [51.15, actor('spark', { to: [0.5, 0.24], ms: 900, ease: 'out' })],

      // 6. What lies below: the Crypt, the Machine, and what they hold down.
      [52.3, transition('glitch', 700)],
      [
        52.65,
        label('below'),
        exit('crucible', 'cut'),
        exit('heart', 'cut'),
        exit('volley', 'cut'),
        exit('jetL', 'cut'),
        exit('jetR', 'cut'),
        exit('spark', 'cut'),
        ambientOff('ambient.speedlines', 200),
        ambientOff('ambient.sparks', 300),
        scenery('crypt', 0.4),
        grade('crypt', 300),
        camera('still', { ms: 0 }),
        camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 0 }),
        backdrop({ pace: 0.4, glow: 0, ms: 0 }),
      ],
      ...bolt(54, [0.3, 0.55], 0xc8d4ff),
      [
        54,
        enter('warden', [0.5, 0.42], 'fade', 900),
        ambient('ambient.fog', { depth: 'between', intensity: 0.8, ms: 800 }),
        ambient('ambient.wisps', { depth: 'between', intensity: 0.8, ms: 800 }),
        camera('pushIn', { subject: 'warden', amount: 0.15, ms: 4000 }),
      ],
      [
        54.1,
        spoken(
          'narrator',
          'Below the fire,{p:150} the Crypt.{p:250} Below the Crypt,{p:150} the Machine.',
          'vo_intro_03',
        ),
      ],
      [55.5, actor('warden', { anim: 'tell' })],
      ...bolt(56.6, [0.72, 0.5], 0xb8a0ff),
      [
        58,
        flash(160, 0x8ff6ff, 0.9),
        exit('warden', 'cut'),
        ambientOff('ambient.fog', 200),
        ambientOff('ambient.wisps', 200),
        scenery('mainframe', 0.6),
        grade('neon', 0),
        ambient('weather.digital', { depth: 'between', intensity: 1, ms: 200 }),
        camera({ zoom: 1, x: 0.5, y: 0.5 }, { ms: 0 }),
        camera('pushIn', { subject: [0.5, 0.45], amount: 0.12, ms: 3600 }),
        enter('data', [0.5, 0.45], 'cut'),
        actor('data', { anim: 'ring' }),
        sfx('laser_spinup', 0.5),
        sfx('flicker', 0.5),
        haptic('medium'),
      ],
      [60, actor('data', { anim: 'spiral' })],
      [
        61.2,
        spoken('narrator', 'And beneath it all,{p:300} something that wants out.', 'vo_intro_04'),
      ],
      [61.75, transition('dip', 500), actor('data', { anim: 'stop' })],
      [
        62,
        exit('data', 'cut'),
        ambientOff('weather.digital', 200),
        plate('cs_plate_lid', {
          ms: 3800,
          fadeMs: 400,
          from: { zoom: 1.28, y: 0.78 },
          to: { zoom: 1.06, y: 0.55 },
        }),
        grade('dread', 300),
        sfx('cs_heartbeat', 1),
        shake(2600, 0.004),
      ],
      [62.5, scenery('hell', 0.3)],
      [63, sfx('cs_rumble', 0.7)],

      // 7. The spark strikes the anvil and the Breaker is forged.
      [
        65.6,
        label('forge'),
        plate('cs_plate_anvil', {
          ms: 4800,
          fadeMs: 150,
          from: { zoom: 1.3, y: 0.45 },
          to: { zoom: 1.08, y: 0.55 },
        }),
        flash(320, 0xffffff, 1),
        grade('ember', 200),
        sfx('cs_anvil', 1),
        shake(900, 0.02),
        haptic('heavy'),
        ambient('ambient.sparks', { depth: 'front', intensity: 1, ms: 200 }),
        camera('reset', { ms: 0 }),
        backdrop({ pace: 0.6, glow: 0.3, ms: 0 }),
      ],
      [66, spoken('narrator', 'They built the walls to keep it in.', 'vo_intro_05')],
      [
        69.9,
        enter('spark', [0.5, 0.08], 'cut'),
        actor('spark', { to: [0.5, 0.585], ms: 350, ease: 'in' }),
      ],
      [
        70.25,
        exit('spark', 'pop', 200),
        enter('breaker', [0.5, 0.6], 'pop', 500),
        actor('breaker', { scale: 1.8 }),
        flash(240, 0xfff0c0, 0.9),
        fx('ability.meteor_impact', [0.5, 0.59]),
        fx('screen.anamorphic', [0.5, 0.59], { tint: 0xffc860 }),
        fx('impact.sparkle', [0.5, 0.59]),
        sfx('sfx_hyper', 0.6),
        shake(400, 0.01),
      ],
      [
        70.3,
        spoken('narrator', 'You were made{p:200} to break them.', 'vo_intro_06'),
        camera('pushIn', { subject: [0.5, 0.56], amount: 0.22, ms: 3300 }),
        actor('breaker', { emote: 'bounce' }),
      ],

      // 8. The title.
      [
        74,
        label('title'),
        camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 250, ease: 'out' }),
        camera('punch', { amount: 0.14 }),
        enter('logo', [0.5, 0.3], 'pop', 450),
        actor('breaker', { to: [0.5, 0.72], ms: 600, ease: 'out' }),
        flash(260, 0xffffff, 0.95),
        sfx('cs_braam', 1),
        shake(900, 0.018),
        haptic('heavy'),
        fx('fanfare.burst', [0.5, 0.3], { scale: 1.4 }),
        fx('screen.anamorphic', [0.5, 0.3], { tint: 0xff8a3d }),
        ambient('ambient.godrays', { depth: 'between', intensity: 0.7, ms: 600 }),
        backdrop({ pace: 1.2, glow: 0.4, ms: 600 }),
      ],
      [74.25, actor('logo', { anim: 'ignite' })],
      [
        75,
        camera('pushIn', { subject: [0.5, 0.34], amount: 0.08, ms: 6000 }),
        fx('fanfare.firework', [0.22, 0.2]),
      ],
      [76.5, fx('fanfare.firework', [0.78, 0.18])],
      [78, fx('fanfare.crackle', [0.5, 0.3])],
      [81.4, exit('logo', 'fade', 900), camera('reset', { ms: 1200, ease: 'inOut' })],

      // 9. The chapter card.
      [82, label('card'), card('Chapter I', 'Hell Foundry', 3000, 'hell')],
    ]),

    // 10. Hand the shaft to Level 1: the paddle drops to its line, where the real one takes over.
    label('handoff'),
    together(
      letterbox(0, 900),
      grade('neutral', 1400),
      backdrop({ pace: 1, glow: 0, ms: 1400, ease: 'inOut' }),
      camera('reset', { ms: 1200 }),
      ambientOff('ambient.sparks', 1400),
      ambientOff('ambient.godrays', 1400),
      music(null, 2500),
      actor('breaker', { to: [0.5, 0.86], scale: 1, ms: 1300, ease: 'inOut' }),
    ),
    wait(1300),
    exit('breaker', 'fade', 500),
    wait(600),
  ],
);
