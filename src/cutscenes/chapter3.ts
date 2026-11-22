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
  'vo_mainframe_01',
  'vo_mainframe_02',
  'vo_mainframe_03',
  'vo_mainframe_04',
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

/** A rig's anims: the comet and the volley read them by name, not frames. */
const named = (...names: string[]): Record<string, ActorAnim> =>
  Object.fromEntries(names.map((n) => [n, { frames: [], fps: 1, loop: true }]));

const CYAN = 0x5ff6ff;
const ALARM = 0xff2a3a;
const WARM = 0xffc46b;

// Where Vesper hung over the water, and where the Breaker waits on the shore.
const LURE: Vec = [0.5, 0.44];
const SHORE: Vec = [0.42, 0.64];
const EYE: Vec = [0.5, 0.28];

// The ark plate's slow push, so the lit frames a strike flashes in line up with it.
const ARK_MS = 11_000;
const ARK_FROM = { x: 0.5, y: 0.2, zoom: 1.2 };
const ARK_TO = { x: 0.5, y: 0.62, zoom: 1.02 };
const arkAt = (s: number) => {
  const k = Math.min(1, Math.max(0, (s * 1000) / ARK_MS));
  return {
    x: ARK_FROM.x + (ARK_TO.x - ARK_FROM.x) * k,
    y: ARK_FROM.y + (ARK_TO.y - ARK_FROM.y) * k,
    zoom: ARK_FROM.zoom + (ARK_TO.zoom - ARK_FROM.zoom) * k,
  };
};

/**
 * Lightning over the ark, `s` seconds into its plate: the painted bolt and the hull's strip lights
 * flicker in twice over the dark frame, with the flash, the thunder and the shake. `big` is close.
 */
function strike(s: number, big: boolean): Step {
  const lit = (at: number, ms: number, fadeMs: number) =>
    plate('cs_plate_ark', { ms, fadeMs, from: arkAt(at), to: arkAt(at + ms / 1000) });
  return seq(
    wait(Math.round(s * 1000)),
    together(
      lit(s, 180, 30),
      flash(big ? 240 : 160, 0xe6dcff, big ? 0.8 : 0.45),
      sfx(big ? 'cs_thunder_close' : 'ab_lightning', big ? 0.95 : 0.55),
      shake(big ? 800 : 300, big ? 0.012 : 0.005),
      haptic(big ? 'heavy' : 'light'),
    ),
    wait(260),
    lit(s + 0.26, big ? 560 : 320, 90),
  );
}

/**
 * Chapter III: The Mainframe. Plays between the Angler and Level 21. It takes over the black
 * lake where Vesper's lantern broke: rain falls through the Crypt, lightning shows the ark under
 * the water, and the ark wakes up as the Mainframe, which has been counting every wall the Breaker
 * broke. Vesper's freed light goes into the Breaker, the lake drops away, and the fall runs down a
 * shaft that turns from crypt stone to circuitry while the rain turns to code. The Mainframe
 * welcomes it, and the shaft goes to Level 21.
 */
export const CHAPTER_3 = cutscene(
  'chapter-3',
  {
    opens: { scenery: 'inherit' },
    closes: { scenery: 'mainframe', pace: 1, handoff: 'continuous' },
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
      mainframe: {
        name: 'The Mainframe',
        color: CYAN,
        sprite: 'cs_mainframe_eye',
        size: 150,
        portrait: 'cs_mainframe_face',
        light: { color: CYAN, radius: 220, intensity: 0.7 },
      },
      data: {
        name: 'Volley',
        sprite: 'volley:data',
        size: 64,
        anims: named('spiral', 'fan', 'ring', 'rain', 'stop'),
        idle: 'stop',
      },
      breaker: { name: 'Breaker', sprite: 'breaker' },
      // The Breaker again, built where it lands so it wears the Mainframe's set, with Vesper's
      // light inside it now.
      landed: {
        name: 'Breaker',
        sprite: 'breaker',
        light: { color: 0xffb35a, radius: 90, intensity: 0.45 },
      },
    },
    assets: {
      images: [
        img('cs_spark'),
        img('cs_vesper_face'),
        img('cs_mainframe_face'),
        img('cs_mainframe_eye'),
        img('cs_plate_ark', 'jpg'),
        img('cs_plate_ark_dark', 'jpg'),
        img('cs_plate_threshold', 'jpg'),
      ],
      voice: VOICE,
      sfx: [
        snd('cs_thunder_close'),
        snd('cs_wake'),
        snd('cs_glitch'),
        snd('cs_heartbeat'),
        snd('cs_rumble'),
        snd('cs_crack'),
        snd('cs_chime'),
        snd('cs_braam'),
      ],
      music: [snd('cs_rain'), snd('cs_mainframe_bed')],
    },
  },
  [
    // 1. The lake after the fight: the souls rising, and rain coming down through the Crypt.
    label('open'),
    together(
      scenery('abyss'),
      letterbox(1, 900),
      grade('night', 2200),
      backdrop({ pace: 0.2, glow: 0.1, ms: 2200, ease: 'out' }),
      ambient('ambient.wisps', { depth: 'between', intensity: 0.8, ms: 1500 }),
      music('cs_rain', 2600, 0.8),
    ),
    wait(1200),
    together(sfx('thunder', 0.35), flash(160, 0xb8a8ff, 0.2)),
    wait(500),
    together(
      ambient('weather.rain', { depth: 'front', intensity: 0.7, ms: 2400 }),
      camera('pullBack', { from: { zoom: 1.15 }, ms: 6000, ease: 'inOut' }),
    ),
    wait(1400),
    narrate('The lantern broke,{p:300} and the dark{p:200} let go of everything it held.', {
      hold: 'auto',
    }),

    // 2. One light stays where she hung: Vesper, herself again.
    label('souls'),
    together(
      sfx('cs_chime', 0.8),
      enter('vesper', [0.5, 0.72], 'fade', 900),
      actor('vesper', {
        path: [[0.46, 0.62], [0.55, 0.52], LURE],
        ms: 3000,
        ease: 'out',
      }),
      enter('breaker', [0.5, 0.86], 'fade', 900),
      actor('breaker', { to: SHORE, ms: 2400, ease: 'out' }),
    ),
    wait(2800),
    say('vesper', "It's over.{p:300} It wore my light so long{p:150} I forgot it was mine.", {
      ...vo('vo_vesper_ch3_01'),
      hold: 'tap',
      side: 'right',
    }),
    actor('breaker', { emote: 'nod' }),
    say('vesper', 'Thank you,{p:150} Breaker.', {
      ...vo('vo_vesper_ch3_02'),
      hold: 'tap',
      side: 'right',
    }),

    // 3. Lightning, and for a moment the ark under the water shows, lit along its whole hull.
    label('ark'),
    together(
      plate('cs_plate_ark_dark', { ms: ARK_MS, fadeMs: 600, from: ARK_FROM, to: ARK_TO }),
      grade('neutral', 600),
      camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 600 }),
      strike(0.5, true),
      strike(4.4, false),
      seq(
        wait(1500),
        say('vesper', 'That was never a tomb under the water,{p:200} Breaker.', {
          ...vo('vo_vesper_ch3_03'),
          hold: 'tap',
          side: 'right',
        }),
      ),
      seq(wait(6200), sfx('flicker', 0.6)),
      strike(7.6, true),
      seq(wait(8600), sfx('flicker', 0.5), grade('dread', 2400)),
      wait(ARK_MS - 600),
    ),

    // 4. The ark wakes. An eye opens over the lake, and it has been watching all along.
    label('wake'),
    together(
      sfx('cs_wake', 0.9),
      shake(2600, 0.004),
      haptic('medium'),
      backdrop({ glow: 0.35, tint: 0xb8f4ff, ms: 2400 }),
      ambientOff('ambient.wisps', 2000),
    ),
    wait(1500),
    together(
      enter('mainframe', EYE, 'rise', 1400),
      flash(220, CYAN, 0.6),
      fx('screen.anamorphic', EYE, { tint: CYAN }),
      camera('pushIn', { subject: 'mainframe', amount: 0.16, ms: 7000, ease: 'inOut' }),
      sfx('flicker', 0.6),
    ),
    wait(1300),
    together(sfx('cs_glitch', 0.3), actor('mainframe', { emote: 'flash' })),
    say('mainframe', '{shake}Seal two of three{/shake}...{p:300} broken.', {
      ...vo('vo_mainframe_01'),
      hold: 'voice',
    }),
    together(camera('dutch', { amount: -4, ms: 2400 }), sfx('cs_heartbeat', 0.8)),
    say('mainframe', 'Thank you,{p:150} {color=#5ff6ff}Breaker{/color}.', {
      ...vo('vo_mainframe_02'),
      hold: 'voice',
    }),
    actor('vesper', { emote: 'shiver' }),
    say('vesper', 'It was {shake}counting{/shake}.{p:250} Every wall you broke.', {
      ...vo('vo_vesper_ch3_04'),
      hold: 'tap',
      side: 'right',
    }),
    // The alarm: twice, well under three flashes a second.
    together(flash(200, ALARM, 0.45), sfx('cs_glitch', 0.25), shake(300, 0.006), haptic('light')),
    wait(650),
    together(flash(200, ALARM, 0.45), shake(300, 0.006), actor('mainframe', { emote: 'flash' })),
    wait(500),
    say(
      'mainframe',
      'You were not made to escape.{p:400} You were made to {color=#ff3a5a}open the door{/color}.',
      { ...vo('vo_mainframe_03'), hold: 'voice' },
    ),

    // 5. Vesper goes into the Breaker's light, and the lake drops away beneath them.
    label('fall'),
    together(camera('level', { ms: 900 }), camera({ zoom: 1.05 }, { ms: 900 })),
    say('vesper', "Then don't let it see you coming.{p:250} Take my light.", {
      ...vo('vo_vesper_ch3_05'),
      hold: 'tap',
      side: 'right',
    }),
    together(actor('vesper', { to: SHORE, ms: 650, ease: 'in' }), sfx('ab_meteor_whoosh', 0.5)),
    wait(650),
    together(
      actor('vesper', { anim: 'flare' }),
      exit('vesper', 'pop', 200),
      flash(260, 0xffd08a, 0.85),
      fx('impact.sparkle', 'breaker'),
      fx('screen.flare', 'breaker', { tint: WARM }),
      actor('breaker', { emote: 'bounce' }),
      sfx('sfx_hyper', 0.6),
      haptic('medium'),
    ),
    wait(800),
    together(
      music(null, 1500),
      sfx('cs_rumble'),
      shake(1600, 0.012),
      haptic('heavy'),
      ambient('ambient.debris', { depth: 'front', intensity: 1, ms: 300 }),
      backdrop({ fall: 1, ms: 1700, ease: 'in' }),
      exit('mainframe', 'fade', 1200),
      camera('dutch', { amount: 5, ms: 1500 }),
    ),
    wait(1100),
    together(flash(260, 0xffffff, 0.9), sfx('cs_crack'), sfx('cs_thunder_close', 0.6)),
    wait(400),

    // 6. Down the shaft: candles and stone give way to circuitry, and the rain turns to code.
    label('threshold'),
    together(
      plate('cs_plate_threshold', {
        ms: 6600,
        fadeMs: 500,
        from: { x: 0.5, y: 0.08, zoom: 1.25 },
        to: { x: 0.5, y: 0.92, zoom: 1.04 },
        ease: 'inOut',
      }),
      camera({ zoom: 1, x: 0.5, y: 0.5, angle: 0 }, { ms: 600, ease: 'out' }),
      camera('handheld', { amount: 0.5, ms: 800 }),
      grade('crypt', 600),
      backdrop({ glow: 0, tint: 0xffffff, ms: 600 }),
      ambientOff('ambient.debris', 1000),
      ambient('ambient.speedlines', { depth: 'front', intensity: 0.9, ms: 600 }),
      exit('breaker', 'cut'),
      music('cs_mainframe_bed', 3500, 0.75),
      sfx('ab_meteor_whoosh', 0.6),
      seq(wait(900), scenery('mainframe', 3)),
      seq(
        wait(1600),
        together(
          grade('neon', 4200),
          ambientOff('weather.rain', 2600),
          ambient('weather.digital', { depth: 'front', intensity: 1, ms: 2600 }),
        ),
      ),
      seq(wait(6000), together(transition('glitch', 600), sfx('cs_glitch', 0.35))),
    ),

    // 7. The Mainframe: it lands, and the machine says hello the only way it knows.
    label('arrival'),
    together(
      backdrop({ pace: 0.5, glow: 0.2, ms: 2600, ease: 'out' }),
      ambientOff('ambient.speedlines', 900),
      camera('drift', { amount: 0.5, ms: 1600 }),
      enter('landed', [0.5, 0.4], 'fall', 1200),
      seq(wait(1200), actor('landed', { to: [0.5, 0.64], ms: 1400, ease: 'out' })),
      enter('data', [0.5, 0.3], 'cut'),
      actor('data', { anim: 'ring' }),
      sfx('laser_spinup', 0.5),
    ),
    wait(2000),
    together(actor('data', { anim: 'stop' }), sfx('cs_glitch', 0.25)),
    wait(500),
    say('mainframe', 'Welcome to the Mainframe.{p:400} Every wall here is {wave}watching{/wave}.', {
      ...vo('vo_mainframe_04'),
      hold: 'voice',
    }),
    actor('landed', { emote: 'bounce' }),
    say('vesper', "Then let's give it something to watch.", {
      ...vo('vo_vesper_ch3_06'),
      hold: 'tap',
      side: 'right',
    }),

    // 8. The chapter card.
    label('card'),
    together(
      exit('data', 'fade', 800),
      camera('reset', { ms: 1800, ease: 'inOut' }),
      sfx('cs_braam', 0.8),
      fx('screen.anamorphic', [0.5, 0.42], { tint: CYAN }),
      backdrop({ pace: 0.8, ms: 3000 }),
    ),
    card('Chapter III', 'The Mainframe', 3400, 'mainframe'),

    // 9. Hand the shaft to Level 21.
    label('handoff'),
    together(
      letterbox(0, 900),
      grade('neutral', 1400),
      backdrop({ pace: 1, glow: 0, ms: 1400, ease: 'inOut' }),
      camera('reset', { ms: 1200 }),
      ambientOff('weather.digital', 1800),
      music(null, 2500),
      // Down to the paddle's line, where Level 21's own paddle takes over.
      actor('landed', { to: [0.5, 0.86], ms: 1300, ease: 'inOut' }),
    ),
    wait(1300),
    exit('landed', 'fade', 500),
    wait(600),
  ],
);
