import {
  actor,
  ambient,
  ambientOff,
  backdrop,
  camera,
  cutscene,
  descend,
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
  sfx,
  shake,
  together,
  wait,
  type AssetRef,
  type SayStep,
  type Vec,
} from '../core/cutscene';

/**
 * Voice-over clips that exist. A line names its clip either way; until the clip is recorded and
 * listed here it types out with blips instead.
 */
const RECORDED = new Set<string>();
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

const CYAN = 0x5ff6ff;
const ALARM = 0xff2a3a;
const WARM = 0xffc46b;

// Where the eye comes down into its socket, and where the Breaker stands under it.
const EYE: Vec = [0.5, 0.3];
const FLOOR: Vec = [0.5, 0.64];

/**
 * The Door. Plays before the World 3 finale. Thirty walls down, the Mainframe runs out of floors,
 * and the Breaker, with Vesper's light inside it, drops into the chamber at the bottom, where
 * every camera turns to look. There is a door there with three seals, two of them broken. The
 * eye that has been keeping count comes down into its socket: it has learned how the Breaker
 * moves, and built a copy to open the last seal without it. The fight that follows is that copy.
 */
export const THE_DOOR = cutscene(
  'the-door',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'kernel', pace: 0, handoff: 'continuous' },
    skip: 'always',
    cast: {
      overseer: {
        name: 'The Overseer',
        color: CYAN,
        sprite: 'cs_mainframe_eye',
        size: 150,
        portrait: 'cs_mainframe_face',
        light: { color: CYAN, radius: 220, intensity: 0.7 },
      },
      // Vesper is inside the Breaker's light now: a voice, with no body of her own.
      vesper: { name: 'Vesper', color: WARM, portrait: 'cs_vesper_face' },
      breaker: {
        name: 'Breaker',
        sprite: 'breaker',
        light: { color: 0xffb35a, radius: 90, intensity: 0.45 },
      },
    },
    assets: {
      images: [
        img('cs_vesper_face'),
        img('cs_mainframe_face'),
        img('cs_mainframe_eye'),
        img('cs_plate_door', 'jpg'),
      ],
      voice: VOICE,
      sfx: [snd('cs_heartbeat'), snd('cs_glitch')],
      music: [snd('cs_mainframe_bed')],
    },
  },
  [
    // 1. The Mainframe's shaft, still falling: the code rain, and the Breaker coming down it.
    label('open'),
    together(
      letterbox(1, 900),
      grade('neon', 2000),
      backdrop({ pace: 0.5, ms: 2000, ease: 'out' }),
      ambient('weather.digital', { depth: 'front', intensity: 0.6, ms: 1500 }),
      music('cs_mainframe_bed', 2400, 0.6),
    ),
    wait(600),
    together(
      enter('breaker', [0.5, 0.46], 'fall', 1100),
      camera('drift', { amount: 0.4, ms: 1600 }),
    ),
    wait(1100),
    narrate('Thirty walls down,{p:250} the Mainframe ran out of floors.', { hold: 'auto' }),

    // 2. The last drop, into the chamber at the bottom, walled with cameras round an empty socket.
    label('descent'),
    together(
      descend('kernel', { ms: 5000, land: 0 }),
      grade('night', 3000),
      actor('breaker', { to: FLOOR, ms: 3000, ease: 'inOut' }),
      ambientOff('weather.digital', 2000),
      music(null, 3000),
    ),
    narrate('At the very bottom,{p:200} every camera it had{p:200} turned to look.', {
      hold: 'auto',
    }),
    together(sfx('overseer_shutter', 0.5), shake(300, 0.003)),
    wait(600),

    // 3. The door: three seals round its rim, two of them dark and cracked, one still awake.
    label('door'),
    together(
      plate('cs_plate_door', {
        ms: 9000,
        fadeMs: 700,
        from: { x: 0.5, y: 0.15, zoom: 1.25 },
        to: { x: 0.5, y: 0.8, zoom: 1.04 },
        ease: 'inOut',
      }),
      grade('neutral', 700),
      sfx('overseer_hum', 0.5),
      // The plate paints the Breaker in: the one on stage keeps out of sight while it is up.
      actor('breaker', { alpha: 0, ms: 600 }),
    ),
    wait(2600),
    together(
      sfx('cs_heartbeat', 0.8),
      grade({ saturation: -0.2, brightness: 0.92, vignette: 0.5 }, 2400),
    ),
    wait(1600),
    say('vesper', 'A door.{p:300} Two of its seals are broken{p:200}... the two you broke.', {
      ...vo('vo_vesper_door_01'),
      hold: 'tap',
      side: 'right',
    }),
    wait(3600),

    // 4. The eye comes down into the socket. It has been learning, and it has built something.
    label('watch'),
    together(
      actor('breaker', { alpha: 1, ms: 800 }),
      sfx('overseer_scan', 0.6),
      shake(1200, 0.003),
      haptic('light'),
      enter('overseer', EYE, 'rise', 1400),
      fx('screen.anamorphic', EYE, { tint: CYAN }),
      camera('pushIn', { subject: 'overseer', amount: 0.14, ms: 7000, ease: 'inOut' }),
    ),
    wait(1400),
    say('overseer', 'Thirty walls.{p:300} Every one of them{p:200} a lesson.', {
      ...vo('vo_overseer_door_01'),
      hold: 'voice',
    }),
    together(sfx('cs_glitch', 0.3), actor('overseer', { emote: 'flash' })),
    say(
      'overseer',
      'I know how you move,{p:200} {color=#5ff6ff}Breaker{/color}.{p:300} I built one of my own.',
      { ...vo('vo_overseer_door_02'), hold: 'voice' },
    ),
    together(
      flash(200, ALARM, 0.4),
      shake(300, 0.006),
      haptic('light'),
      sfx('overseer_glitch', 0.5),
    ),
    wait(500),
    say('overseer', 'It will open the {color=#ff3a5a}third seal{/color}{p:200} without you.', {
      ...vo('vo_overseer_door_03'),
      hold: 'voice',
    }),
    actor('breaker', { emote: 'shiver' }),
    say('vesper', "Then don't stand where it expects you.{p:250} I'm right here.", {
      ...vo('vo_vesper_door_02'),
      hold: 'tap',
      side: 'right',
    }),
    actor('breaker', { emote: 'bounce' }),

    // 5. The Breaker drops to the paddle's line, where the fight's own paddle takes over.
    label('handoff'),
    together(
      letterbox(0, 900),
      grade('neutral', 1400),
      camera('reset', { ms: 1400, ease: 'inOut' }),
      exit('overseer', 'fade', 1200),
      actor('breaker', { to: [0.5, 0.86], ms: 1300, ease: 'inOut' }),
      sfx('overseer_hum', 0.35, -300),
    ),
    wait(1300),
    exit('breaker', 'fade', 500),
    wait(600),
  ],
);
