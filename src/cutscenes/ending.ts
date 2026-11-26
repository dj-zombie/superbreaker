import type { SceneryId } from '../art/backdrops';
import {
  actor,
  ambient,
  ambientOff,
  backdrop,
  card,
  cutscene,
  enter,
  exit,
  flash,
  fx,
  grade,
  haptic,
  label,
  letterbox,
  music,
  narrate,
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
  type Step,
  type Vec,
} from '../core/cutscene';

/**
 * Voice-over clips that exist. A line names its clip either way; until the clip is recorded and
 * listed here it types out with blips instead.
 */
const RECORDED = new Set<string>([
  'vo_vesper_end_01',
  'vo_vesper_end_02',
  'vo_vesper_end_03',
  'vo_vesper_end_04',
  'vo_vesper_end_05',
  'vo_vesper_end_06',
]);
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

/** A rig's anims: the comet reads them by name, not frames. */
const named = (...names: string[]): Record<string, ActorAnim> =>
  Object.fromEntries(names.map((n) => [n, { frames: [], fps: 1, loop: true }]));

const WARM = 0xffc46b;
const DAYLIGHT = 0xfff2d8;
const CYAN = 0x5ff6ff;
const SUNRISE = { brightness: 1.05, saturation: 0.12, tint: 0xffe2b8, tintAmount: 0.1, vignette: 0.2 };

/** One bar of the anthem, at 128 BPM: the montage cuts on bars. */
const BAR = 1875;
/** How long each trophy of the montage holds the screen. */
const STOP_MS = Math.round(BAR * 1.5);

// Where a trophy hangs over its card, and where the Breaker stands on the surface plate's ledge.
const TROPHY: Vec = [0.5, 0.3];
const LEDGE: Vec = [0.5, 0.695];

/**
 * One stop on the climb back up: the world a boss fell in, with its trophy popping in over a card
 * in that world's lettering. The first stop is already in its world.
 */
function stop(
  world: SceneryId | null,
  trophy: string,
  kicker: string,
  title: string,
  lettering: SceneryId,
): Step {
  return together(
    ...(world ? [scenery(world, 1.6)] : []),
    transition('flash', 420, DAYLIGHT),
    enter(trophy, TROPHY, 'pop', 380),
    fx('fanfare.burst', TROPHY),
    sfx('fanfare_stab', 0.7),
    shake(220, 0.004),
    haptic('light'),
    card(kicker, title, STOP_MS, lettering),
    seq(wait(STOP_MS - 320), exit(trophy, 'fade', 300)),
  );
}

/** A volley of firework shells from low on the stage, `gap` ms apart, bursting across the sky. */
function fireworks(xs: readonly number[], gap: number, delay = 0): Step {
  return together(
    ...xs.map((x, i) => seq(wait(delay + i * gap), fx('fanfare.firework', [x, 0.64]))),
  );
}

// The surface plate holds until the fireworks sky takes over, which then holds to the end.
const SURFACE_MS = 9200;
const VICTORY_MS = 11_400;

/**
 * The Ending. Plays after the Overseer, the campaign's last fight. The eye is dark and nothing at
 * the bottom of the Mainframe is watching any more. The door it opened lets the daylight in, and
 * Vesper bursts out of the Breaker's light to see it. The climb back up runs through every world
 * and the trophy each boss gave up, on the anthem's bars, and comes out at sunrise on the surface,
 * where the fireworks go up. The last card thanks the player, and the credits take over.
 */
export const ENDING = cutscene(
  'ending',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'mainframe', pace: 1, handoff: 'dissolve' },
    skip: 'always',
    cast: {
      vesper: {
        name: 'Vesper',
        color: WARM,
        sprite: 'comet:cs_spark',
        size: 40,
        portrait: 'cs_vesper_face',
        anims: named('burn', 'flare'),
        idle: 'burn',
        light: { color: 0xffb35a, radius: 130, intensity: 0.85 },
      },
      breaker: {
        name: 'Breaker',
        sprite: 'breaker',
        light: { color: 0xffb35a, radius: 90, intensity: 0.45 },
      },
      lens: {
        name: "The Overseer's Lens",
        sprite: 'cs_trophy_overseer',
        size: 150,
        light: { color: CYAN, radius: 170, intensity: 0.7 },
      },
      lantern: {
        name: "Vesper's Lantern",
        sprite: 'cs_trophy_angler',
        size: 150,
        light: { color: WARM, radius: 170, intensity: 0.7 },
      },
      eye: {
        name: "Warden's Eye",
        sprite: 'cs_trophy_warden',
        size: 150,
        light: { color: 0xb07cff, radius: 170, intensity: 0.7 },
      },
      heart: {
        name: 'Crucible Heart',
        sprite: 'cs_trophy_crucible',
        size: 150,
        light: { color: 0xff7a2a, radius: 170, intensity: 0.75 },
      },
    },
    assets: {
      images: [
        img('cs_spark'),
        img('cs_vesper_face'),
        img('cs_trophy_overseer'),
        img('cs_trophy_angler'),
        img('cs_trophy_warden'),
        img('cs_trophy_crucible'),
        img('cs_plate_daylight', 'jpg'),
        img('cs_plate_surface', 'jpg'),
        img('cs_plate_victory', 'jpg'),
      ],
      voice: VOICE,
      sfx: [snd('cs_chime'), snd('cs_riser')],
      music: [snd('cs_anthem')],
    },
  },
  [
    // 1. The chamber after the fight: the eye dark, and nothing down here watching any more.
    label('open'),
    together(
      scenery('kernel'),
      letterbox(1, 900),
      grade('night', 1500),
      backdrop({ pace: 0, glow: 0.05, ms: 1500 }),
      ambient('ambient.dust', { depth: 'between', intensity: 0.5, ms: 2000 }),
    ),
    wait(800),
    together(enter('breaker', [0.5, 0.62], 'fade', 1200), sfx('overseer_hum', 0.3, -600)),
    wait(1400),
    narrate('The eye went dark.{p:300} For the first time,{p:200} nothing down here was watching.', {
      hold: 'auto',
    }),

    // 2. The door it opened lets the light in, and Vesper bursts out of the Breaker's light.
    label('light'),
    together(
      sfx('overseer_door', 0.8),
      sfx('cs_riser', 0.6),
      shake(1800, 0.003),
      backdrop({ glow: 0.5, tint: DAYLIGHT, ms: 3000, ease: 'inOut' }),
      grade('dusk', 3000),
      ambient('ambient.godrays', { depth: 'front', intensity: 0.8, ms: 2500 }),
    ),
    wait(2200),
    together(
      sfx('cs_chime', 0.9),
      sfx('sfx_hyper', 0.5),
      enter('vesper', [0.5, 0.6], 'pop', 300),
      actor('vesper', {
        path: [
          [0.64, 0.52],
          [0.5, 0.38],
          [0.36, 0.5],
          [0.58, 0.44],
        ],
        ms: 1800,
        ease: 'out',
      }),
      actor('vesper', { anim: 'flare' }),
      actor('breaker', { emote: 'bounce' }),
      flash(220, WARM, 0.5),
      fx('fanfare.burst', 'breaker', { tint: WARM }),
      fx('screen.flare', 'breaker', { tint: WARM }),
      haptic('medium'),
    ),
    wait(1200),
    together(actor('vesper', { anim: 'burn' }), actor('vesper', { emote: 'bounce' })),
    say('vesper', 'It opened the door {wave}anyway{/wave}!', {
      ...vo('vo_vesper_end_01'),
      hold: 'voice',
      side: 'right',
    }),
    actor('breaker', { emote: 'nod' }),
    say(
      'vesper',
      'It counted every wall you broke.{p:250} It never once counted {color=#ffc46b}me{/color}.',
      { ...vo('vo_vesper_end_02'), hold: 'voice', side: 'right' },
    ),

    // 3. Through the door: the bridge, and daylight at the end of it.
    label('door'),
    together(
      plate('cs_plate_daylight', {
        ms: 7000,
        fadeMs: 1400,
        from: { x: 0.5, y: 0.55, zoom: 1 },
        to: { x: 0.5, y: 0.32, zoom: 1.35 },
        ease: 'inOut',
      }),
      grade(SUNRISE, 1400),
      exit('vesper', 'fade', 1200),
      exit('breaker', 'fade', 1200),
      ambientOff('ambient.dust', 1200),
    ),
    wait(1500),
    narrate('Past the last wall,{p:250} the light was waiting.', { hold: 'auto' }),
    wait(1400),

    // 4. The climb back up, on the anthem: every world it took, and the trophy each boss gave up.
    label('montage'),
    together(
      music('cs_anthem', 300, 0.85),
      grade('neutral', 400),
      ambientOff('ambient.godrays', 400),
      backdrop({ glow: 0.15, tint: 0xffffff, pace: 1.6, ms: 600 }),
      ambient('ambient.speedlines', { depth: 'front', intensity: 0.45, ms: 400 }),
      say(
        'vesper',
        'Look how far we came,{p:200} Breaker.{p:250} Every one of them,{p:150} {shake}broken{/shake}.',
        { ...vo('vo_vesper_end_03'), hold: 'auto', side: 'right' },
      ),
      seq(
        stop(null, 'lens', "The Overseer's Lens", 'The Overseer', 'mainframe'),
        stop('abyss', 'lantern', "Vesper's Lantern", 'The Angler', 'crypt'),
        stop('hell', 'eye', "The Warden's Eye", 'The Warden', 'hell'),
        stop('hell', 'heart', 'The Crucible Heart', 'The Crucible', 'hell'),
      ),
    ),

    // 5. The surface at sunrise, the place the Breaker was never meant to reach.
    label('surface'),
    together(
      transition('flash', 700, 0xffffff),
      plate('cs_plate_surface', {
        behind: true,
        ms: SURFACE_MS,
        fadeMs: 500,
        from: { x: 0.5, y: 0.3, zoom: 1.18 },
        to: { x: 0.5, y: 0.56, zoom: 1 },
        ease: 'out',
      }),
      scenery('mainframe', 1),
      ambientOff('ambient.speedlines', 500),
      backdrop({ pace: 1, glow: 0, ms: 800 }),
      grade(SUNRISE, 800),
      sfx('fanfare_rise_a', 0.6),
      enter('breaker', LEDGE, 'rise', 1400),
    ),
    wait(1500),
    together(
      sfx('cs_chime', 0.8),
      enter('vesper', [0.54, 0.6], 'pop', 300),
      actor('vesper', {
        path: [
          [0.66, 0.5],
          [0.5, 0.4],
          [0.34, 0.5],
          [0.58, 0.54],
        ],
        ms: 2400,
        ease: 'inOut',
      }),
      fx('impact.sparkle', 'breaker'),
    ),
    wait(900),
    say('vesper', "Daylight!{p:250} I'd forgotten it was {wave}warm{/wave}.", {
      ...vo('vo_vesper_end_04'),
      hold: 'voice',
      side: 'right',
    }),
    together(
      fireworks([0.25, 0.72, 0.46, 0.82, 0.18], 380),
      ambient('weather.confetti', { depth: 'front', intensity: 0.7, ms: 1200 }),
      sfx('fanfare_stab', 0.6),
      actor('breaker', { emote: 'bounce' }),
      actor('vesper', {
        path: [
          [0.3, 0.42],
          [0.5, 0.3],
          [0.7, 0.42],
          [0.56, 0.54],
        ],
        ms: 2600,
        ease: 'inOut',
      }),
      haptic('medium'),
    ),
    wait(600),
    say(
      'vesper',
      "Nobody's keeping count any more.{p:300} So let's count {color=#ffc46b}you{/color}.",
      { ...vo('vo_vesper_end_05'), hold: 'voice', side: 'right' },
    ),

    // 6. The whole sky goes up.
    label('celebrate'),
    together(
      plate('cs_plate_victory', {
        behind: true,
        ms: VICTORY_MS,
        fadeMs: 1500,
        from: { x: 0.5, y: 0.62, zoom: 1.12 },
        to: { x: 0.5, y: 0.5, zoom: 1 },
        ease: 'out',
      }),
      fx('fanfare.celebrate', [0.5, 0.5]),
      sfx('fanfare_tail', 0.7),
      shake(500, 0.004),
      haptic('heavy'),
      actor('breaker', { to: [0.5, 0.6], ms: 1500, ease: 'inOut' }),
      actor('vesper', {
        path: [
          [0.62, 0.46],
          [0.5, 0.36],
          [0.38, 0.46],
          [0.5, 0.5],
        ],
        ms: 3000,
        ease: 'inOut',
      }),
      fireworks([0.7, 0.3, 0.55, 0.2, 0.8, 0.4], 420, 1200),
    ),
    say('vesper', 'You did it,{p:200} Breaker.{p:250} You {wave}really{/wave} did it!', {
      ...vo('vo_vesper_end_06'),
      hold: 'voice',
      side: 'right',
    }),

    // 7. The last card, under the fireworks.
    label('card'),
    together(
      fireworks([0.3, 0.7, 0.5, 0.22, 0.78], 600, 200),
      card('Thank you for playing', 'Super Breaker', 3800, 'mainframe'),
    ),

    // 8. Out of the letterbox, and on to the credits.
    label('handoff'),
    together(
      letterbox(0, 1200),
      grade('neutral', 1500),
      ambientOff('weather.confetti', 1500),
      music(null, 2400),
      exit('vesper', 'fade', 1200),
      exit('breaker', 'fade', 1200),
    ),
    wait(2600),
  ],
);
