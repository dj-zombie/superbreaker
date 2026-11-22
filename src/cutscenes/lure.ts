import { frameRun } from '../art/sheets';
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
} from '../core/cutscene';

const img = (key: string, ext = 'png'): AssetRef => ({
  key,
  path: `images/cutscenes/${key}.${ext}`,
});
const snd = (key: string): AssetRef => ({ key, path: `audio/cutscenes/${key}.mp3` });

/**
 * The Black Water. Plays before the World 2 finale. Vesper meets the Breaker at the bottom of the
 * Crypt and leads it down to a lake no light has touched, as she has led it all along. On the
 * water her lantern is the only warm thing, and deep under it, if you look, something looks back.
 * The fight that follows shows what she is.
 */
export const LURE = cutscene(
  'vesper-lure',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'abyss', pace: 0, handoff: 'continuous' },
    skip: 'always',
    cast: {
      vesper: {
        name: 'Vesper',
        color: 0xffc46b,
        sprite: 'cs_vesper',
        size: 160,
        portrait: 'cs_vesper_face',
        anims: { idle: { frames: frameRun(0, 33), fps: 13.5 } },
        idle: 'idle',
        light: { color: 0xffb35a, radius: 150, intensity: 0.9 },
      },
      breaker: { name: 'Breaker', sprite: 'breaker' },
    },
    assets: {
      images: [img('cs_vesper_face'), img('cs_plate_lake', 'jpg')],
      sheets: [{ ...img('cs_vesper', 'webp'), frameWidth: 260, frameHeight: 348 }],
      sfx: [snd('cs_heartbeat'), snd('cs_chime')],
      music: [snd('cs_wind')],
    },
  },
  [
    // 1. The bottom of the Crypt, quiet. A lantern comes up out of the fog.
    label('open'),
    together(
      letterbox(1, 900),
      grade('crypt', 2200),
      backdrop({ pace: 0.25, ms: 2200, ease: 'out' }),
      ambient('ambient.fog', { depth: 'between', intensity: 0.8, ms: 2000 }),
      music('cs_wind', 2400, 0.5),
    ),
    wait(900),
    together(sfx('cs_chime', 0.8), enter('vesper', [0.64, 0.42], 'fade', 1600)),
    wait(600),
    together(enter('breaker', [0.38, 0.6], 'fade', 1000), camera('drift', { amount: 0.4, ms: 1600 })),
    wait(700),
    say('vesper', 'There you are, Breaker.', { hold: 'tap', side: 'right' }),
    actor('breaker', { emote: 'bounce' }),
    say('vesper', "We're nearly through. Only the water left.", { hold: 'tap', side: 'right' }),

    // 2. Down, past the last of the Crypt, to the black water.
    label('descent'),
    together(
      descend('abyss', { ms: 5200, land: 0.3 }),
      grade('night', 4000),
      actor('vesper', { to: [0.56, 0.38], ms: 2600, ease: 'inOut' }),
      actor('breaker', { to: [0.44, 0.56], ms: 3000, ease: 'inOut' }),
      ambient('ambient.wisps', { depth: 'between', intensity: 0.5, ms: 2400 }),
    ),
    narrate('Under the Crypt lies a lake{p:200} no light has ever touched.', { hold: 'auto' }),
    wait(400),

    // 3. The lake. Her lantern on the causeway; deep under it, two eyes.
    label('lake'),
    together(
      music(null, 1800),
      sfx('angler_drip', 0.6),
      plate('cs_plate_lake', {
        ms: 7200,
        fadeMs: 700,
        from: { zoom: 1.2, y: 0.28 },
        to: { zoom: 1.04, y: 0.78 },
      }),
      grade('neutral', 700),
    ),
    wait(2600),
    sfx('angler_drip', 0.45),
    wait(2000),
    together(sfx('cs_heartbeat', 0.8), grade('dread', 2000)),
    wait(900),
    together(sfx('angler_glint', 0.7), haptic('light')),
    wait(1700),

    // 4. She does not look down. She only calls.
    label('lure'),
    together(
      sfx('angler_hum', 0.5),
      camera('pushIn', { subject: 'vesper', amount: 0.25, ms: 5000, ease: 'inOut' }),
    ),
    say('vesper', 'Stay close to my light.', { hold: 'tap', side: 'right' }),
    together(sfx('cs_heartbeat', 1), shake(500, 0.004), actor('vesper', { emote: 'shiver' })),
    say('vesper', '{wave}Closer{/wave}...', { hold: 2400, side: 'right' }),

    // 5. The lantern sinks onto the water, and the fight takes the field.
    label('handoff'),
    together(
      letterbox(0, 900),
      grade('neutral', 1400),
      camera('reset', { ms: 1400, ease: 'inOut' }),
      exit('vesper', 'fade', 1400),
      actor('breaker', { to: [0.5, 0.86], ms: 1300, ease: 'inOut' }),
      ambientOff('ambient.fog', 1800),
      ambientOff('ambient.wisps', 1800),
    ),
    wait(1200),
    exit('breaker', 'fade', 500),
    wait(600),
  ],
);
