import { frameRun } from '../art/sheets';
import {
  ambient,
  ambientOff,
  backdrop,
  camera,
  card,
  cutscene,
  descend,
  enter,
  exit,
  actor,
  flash,
  grade,
  haptic,
  label,
  letterbox,
  music,
  narrate,
  plate,
  say,
  scenery,
  sfx,
  shake,
  together,
  wait,
  type AssetRef,
  type SayStep,
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

/**
 * Chapter II: The Crypt. Plays between the piñata after the Warden and Level 11. It takes over
 * the carnival's backdrop, crossfades back to the broken Foundry, lets the Warden have his last
 * word, drops through the floor into the Crypt and hands the scrolling shaft to Level 11.
 */
export const CHAPTER_2 = cutscene(
  'chapter-2',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'crypt', pace: 1, handoff: 'continuous' },
    skip: 'always',
    cast: {
      warden: {
        name: 'The Warden',
        color: 0x4fd6c4,
        sprite: 'cs_warden',
        size: 243,
        portrait: 'cs_warden_face',
        // Frames and rates as scripts/build-sprite-anims.py prints them.
        anims: {
          broken: { frames: frameRun(0, 64), fps: 14.4 },
          crumble: { frames: frameRun(64, 48), fps: 20.8, loop: false },
        },
        idle: 'broken',
        light: { color: 0xff9a3c, radius: 90, intensity: 0.7 },
      },
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
      images: [img('cs_warden_face'), img('cs_vesper_face'), img('cs_plate_lid', 'jpg')],
      sheets: [{ ...img('cs_vesper', 'webp'), frameWidth: 260, frameHeight: 348 }, img('cs_warden', 'json')],
      voice: VOICE,
      sfx: [snd('cs_heartbeat'), snd('cs_rumble'), snd('cs_crack'), snd('cs_chime')],
      music: [snd('cs_wind')],
    },
  },
  [
    // 1. The carnival settles and the Foundry comes back, quiet.
    label('open'),
    together(
      letterbox(1, 900),
      grade('ember', 2600),
      backdrop({ pace: 0.25, ms: 2600, ease: 'out' }),
      scenery('hell', 0.25),
    ),
    wait(1400),

    // 2. The camera eases out over the cooling forge.
    label('establish'),
    together(
      camera('pullBack', { from: { zoom: 1.22 }, ms: 7000, ease: 'inOut' }),
      ambient('ambient.sparks', { depth: 'between', intensity: 0.6, ms: 1500 }),
      ambient('ambient.dust', { depth: 'front', intensity: 0.4, ms: 2000 }),
      backdrop({ glow: 0.25, ms: 3000 }),
    ),
    narrate('The Foundry falls silent{p:200} for the first time in a thousand years.', {
      hold: 'auto',
    }),
    wait(400),

    // 3. The Warden, broken, has the last word.
    label('warden'),
    together(
      music(null, 2200),
      enter('warden', [0.5, 0.42], 'fall', 900),
      camera('drift', { amount: 0.4, ms: 900 }),
    ),
    wait(820),
    together(
      sfx('boss_stomp', 0.8),
      shake(380, 0.006),
      haptic('medium'),
      actor('warden', { emote: 'shake' }),
    ),
    wait(700),
    say('warden', 'You think breaking the forge {shake}sets you free{/shake}?', {
      ...vo('vo_warden_01'),
      hold: 'tap',
    }),
    together(
      camera('pushIn', { subject: 'warden', amount: 0.3, ms: 6000, ease: 'inOut' }),
      grade('dread', 4500),
      sfx('cs_heartbeat', 0.9),
    ),
    say('warden', 'The fire was never the prison.', { ...vo('vo_warden_02'), hold: 'tap' }),
    // From the fire on top down to what it holds shut.
    together(
      plate('cs_plate_lid', {
        ms: 3800,
        fadeMs: 500,
        from: { zoom: 1.18, y: 0.25 },
        to: { zoom: 1.04, y: 0.7 },
      }),
      grade('neutral', 500),
    ),
    say('warden', 'It was the {color=#ff8a3d}lid{/color}.', { ...vo('vo_warden_03'), hold: 3000 }),
    together(grade('dread', 400), sfx('cs_heartbeat', 1)),
    wait(500),

    // 4. The floor gives way.
    label('fall'),
    together(
      sfx('cs_rumble'),
      shake(1600, 0.012),
      haptic('heavy'),
      ambient('ambient.debris', { depth: 'front', intensity: 1, ms: 300 }),
      actor('warden', { emote: 'shiver', anim: 'crumble' }),
      backdrop({ fall: 1, ms: 1700, ease: 'in' }),
      camera('dutch', { amount: 6, ms: 1500 }),
    ),
    wait(1100),
    together(
      flash(260, 0xffffff, 0.9),
      sfx('cs_crack'),
      exit('warden', 'fall', 900),
      ambientOff('ambient.sparks', 600),
      ambientOff('ambient.dust', 600),
    ),
    wait(500),

    // 5. The long way down: through the clouds, the Foundry turns into the Crypt.
    label('descent'),
    together(
      music('cs_wind', 2400, 0.7),
      ambient('ambient.speedlines', { depth: 'front', intensity: 0.9, ms: 600 }),
      ambientOff('ambient.debris', 1400),
      grade('crypt', 4200),
      camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 2400, ease: 'inOut' }),
      camera('handheld', { amount: 0.5, ms: 800 }),
      enter('breaker', [0.5, 0.34], 'fall', 1400),
    ),
    descend('crypt', { ms: 5400, through: 'ambient.cloudbank', peak: 4.2, land: 0.4 }),
    ambientOff('ambient.speedlines', 900),

    // 6. Arrival: mist, wisps, and a lantern in the dark.
    label('arrival'),
    together(
      camera('drift', { amount: 0.5, ms: 1600 }),
      ambient('ambient.fog', { depth: 'between', intensity: 0.8, ms: 2000 }),
      ambient('ambient.wisps', { depth: 'between', intensity: 0.7, ms: 2400 }),
      actor('breaker', { to: [0.42, 0.6], ms: 1800, ease: 'out' }),
      backdrop({ glow: 0.15, ms: 2000 }),
    ),
    wait(1200),
    together(sfx('cs_chime', 0.8), enter('vesper', [0.7, 0.44], 'fade', 1600)),
    wait(1200),
    say('vesper', 'Another one falls.', { ...vo('vo_vesper_01'), hold: 'tap', side: 'right' }),
    actor('breaker', { emote: 'bounce' }),
    say('vesper', 'Keep your light close, Breaker.', {
      ...vo('vo_vesper_02'),
      hold: 'tap',
      side: 'right',
    }),
    say('vesper', 'Down here, {wave}the dark remembers{/wave}.', {
      ...vo('vo_vesper_03'),
      hold: 'tap',
      side: 'right',
    }),

    // 7. The chapter card.
    label('card'),
    together(exit('vesper', 'fade', 1400), camera('reset', { ms: 1800, ease: 'inOut' })),
    card('Chapter II', 'The Crypt', 3400, 'crypt'),

    // 8. Hand the shaft to Level 11.
    label('handoff'),
    together(
      letterbox(0, 900),
      grade('neutral', 1400),
      backdrop({ pace: 1, glow: 0, ms: 1400, ease: 'inOut' }),
      // Down to the paddle's line, where Level 11's own paddle takes over.
      actor('breaker', { to: [0.5, 0.86], ms: 1300, ease: 'inOut' }),
      ambientOff('ambient.fog', 1800),
      ambientOff('ambient.wisps', 1800),
    ),
    wait(1200),
    exit('breaker', 'fade', 500),
    wait(600),
  ],
);
