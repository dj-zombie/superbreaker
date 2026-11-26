import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Particles: {
        ParticleProcessor: class {
          constructor(
            public x = 0,
            public y = 0,
            public active = true,
          ) {}
        },
      },
    },
  },
}));

import { BOSSES } from '../src/bosses';
import { AUDIO_ASSETS } from '../src/config';
import { sceneBetween, stepKey, validScenes } from '../src/core/Campaign';
import {
  compile,
  GRADES,
  Playhead,
  sampleFrame,
  scriptProblems,
  type CutsceneDef,
  type KnownAssets,
} from '../src/core/cutscene';
import { CUTSCENES } from '../src/cutscenes';
import { ABILITY_FX } from '../src/fx/library/abilities';
import { AMBIENT_FX } from '../src/fx/library/ambient';
import { BOSS_FX } from '../src/fx/library/boss';
import { BRICK_FX } from '../src/fx/library/bricks';
import { ELEMENT_FX } from '../src/fx/library/elements';
import { FANFARE_FX } from '../src/fx/library/fanfare';
import { IMPACT_FX } from '../src/fx/library/impacts';
import { POWERUP_FX } from '../src/fx/library/powerups';
import { SCREEN_FX } from '../src/fx/library/screen';
import { WEAPON_FX } from '../src/fx/library/weapons';
import { WEATHER_FX } from '../src/fx/library/weather';
import { sheetFrames } from './sheets';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const SOUNDS = new Set(AUDIO_ASSETS.map((a) => a.key));
const FIELDS = new Set(Object.keys({ ...AMBIENT_FX, ...WEATHER_FX }));
const PRESETS = new Set(
  [
    ABILITY_FX,
    AMBIENT_FX,
    BOSS_FX,
    BRICK_FX,
    ELEMENT_FX,
    FANFARE_FX,
    IMPACT_FX,
    POWERUP_FX,
    SCREEN_FX,
    WEAPON_FX,
    WEATHER_FX,
  ].flatMap((group) => Object.keys(group)),
);
const VOLLEYS = new Set(['slag', 'spirit', 'data']);

/** What a scene may name: rigs that draw one of its images must load that image. */
function knownFor(def: CutsceneDef): KnownAssets {
  const images = new Set((def.assets?.images ?? []).map((a) => a.key));
  return {
    fx: (id) => PRESETS.has(id),
    field: (id) => FIELDS.has(id),
    sfx: (key) => SOUNDS.has(key),
    sprite: (key) => {
      const [rig, arg = ''] = key.split(':');
      if (key === 'breaker') return true;
      if (rig === 'boss') return arg in BOSSES;
      if (rig === 'volley') return VOLLEYS.has(arg);
      if (rig === 'comet' || rig === 'logo') return images.has(arg);
      return false;
    },
  };
}

describe.each(Object.values(CUTSCENES))('cutscene $id', (def) => {
  it('has no script problems', () => {
    expect(scriptProblems(def, knownFor(def))).toEqual([]);
  });

  it('ships every asset it loads', () => {
    const a = def.assets ?? {};
    const missing = [a.images, a.sheets, a.voice, a.sfx, a.music]
      .flatMap((list) => list ?? [])
      .filter((r) => !existsSync(join(ASSETS, r.path)))
      .map((r) => r.path);
    expect(missing).toEqual([]);
  });

  it('animates its cast with only frames their sheets hold', () => {
    const sheets = new Map((def.assets?.sheets ?? []).map((s) => [s.key, s]));
    for (const [id, actor] of Object.entries(def.cast ?? {})) {
      const sheet = sheets.get(actor.sprite ?? '');
      if (!sheet) continue;
      const frames = sheetFrames(sheet.path, sheet.frameWidth, sheet.frameHeight);
      for (const [name, anim] of Object.entries(actor.anims ?? {})) {
        for (const frame of anim.frames)
          expect(frames.has(String(frame)), `${id} ${name}: ${frame}`).toBe(true);
      }
    }
  });

  it('runs between 20 s and 2 min', () => {
    const ms = compile(def).lengthMs;
    expect(ms).toBeGreaterThan(20_000);
    expect(ms).toBeLessThan(120_000);
  });

  it('plays through to the end with a tap at every hold, showing the held line in full', () => {
    const tl = compile(def);
    const head = new Playhead(tl);
    let taps = 0;
    for (let i = 0; i < 100_000 && !head.done; i++) {
      head.tick(16);
      const held = head.held;
      if (!held) continue;
      const f = sampleFrame(tl, head.time, { calm: false });
      if (held.line) {
        expect(f.dialog?.line).toBe(held.line);
        expect(f.dialog?.complete).toBe(true);
      }
      head.release();
      taps++;
    }
    expect(head.done).toBe(true);
    expect(taps).toBe(tl.holds.length);
  });

  it('ends with the letterbox out and the grade neutral, ready to hand over', () => {
    const tl = compile(def);
    const end = sampleFrame(tl, tl.lengthMs, { calm: false });
    expect(end.letterbox).toBe(0);
    expect(end.grade).toEqual(GRADES.neutral);
  });
});

describe('cutscenes in levels/index.json', () => {
  const index = JSON.parse(readFileSync(join(ASSETS, 'levels', 'index.json'), 'utf8')) as {
    levels: string[];
    scenes?: unknown;
  };
  const steps = new Set(index.levels.map((_, i) => stepKey({ index: i + 1 })));

  it('names scenes that exist, at levels that exist', () => {
    const raw = (index.scenes ?? []) as unknown[];
    const scenes = validScenes(raw, (id) => id in CUTSCENES);
    expect(scenes).toHaveLength(raw.length);
    for (const s of scenes) {
      for (const at of [s.before, s.after])
        if (at?.startsWith('level')) expect(steps.has(at)).toBe(true);
    }
  });

  it('opens the game with Chapter I, before Level 1', () => {
    const scenes = validScenes(index.scenes);
    expect(sceneBetween(undefined, { index: 1 }, scenes, () => false)).toBe('chapter-1');
    expect(
      sceneBetween(undefined, { index: 1 }, scenes, (id) => id === 'chapter-1'),
    ).toBeUndefined();
  });

  it('plays Chapter II between the Warden and Level 11', () => {
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 10, stop: 'boss' }, { index: 11 }, scenes, () => false)).toBe(
      'chapter-2',
    );
  });
});

describe('chapter-1', () => {
  const tl = compile(CUTSCENES['chapter-1']!);

  it('has a label for every beat, in order', () => {
    const beats = [
      'ignite',
      'storm',
      'spark',
      'crucible',
      'volley',
      'below',
      'forge',
      'title',
      'card',
      'handoff',
    ];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });

  it('waits for a tap before the score, so the tap unlocks the sound', () => {
    const score = tl.music.find((m) => m.value.bed === 'cs_intro_score');
    expect(tl.holds[0]?.kind).toBe('tap');
    expect(tl.holds[0]!.at).toBeLessThan(score!.at);
  });

  it('keeps time with the score: no line stops the clock after the tap', () => {
    expect(tl.holds).toHaveLength(1);
  });

  it('goes down through the Crypt and the Mainframe and back up to the Foundry', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['crypt', 'mainframe', 'hell']);
  });
});

describe('chapter-2', () => {
  const tl = compile(CUTSCENES['chapter-2']!);

  it('falls from the Foundry into the Crypt', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['hell', 'crypt']);
  });

  it('has a label for every beat, in order', () => {
    const beats = ['open', 'establish', 'warden', 'fall', 'descent', 'arrival', 'card', 'handoff'];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });
});

describe('vesper-lure', () => {
  const tl = compile(CUTSCENES['vesper-lure']!);

  it('plays on the way into the Angler, after level 20', () => {
    const index = JSON.parse(readFileSync(join(ASSETS, 'levels', 'index.json'), 'utf8')) as {
      scenes?: unknown;
    };
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 20 }, { index: 20, stop: 'boss' }, scenes, () => false)).toBe(
      'vesper-lure',
    );
  });

  it('goes down from the Crypt to the black water', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['abyss']);
  });

  it('has a label for every beat, in order', () => {
    const beats = ['open', 'descent', 'lake', 'lure', 'handoff'];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });
});

describe('chapter-3', () => {
  const tl = compile(CUTSCENES['chapter-3']!);

  it('plays between the Angler and Level 21, after the Black Water', () => {
    const index = JSON.parse(readFileSync(join(ASSETS, 'levels', 'index.json'), 'utf8')) as {
      scenes?: unknown;
    };
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 20, stop: 'boss' }, { index: 21 }, scenes, () => false)).toBe(
      'chapter-3',
    );
    expect(sceneBetween({ index: 20 }, { index: 20, stop: 'boss' }, scenes, () => false)).toBe(
      'vesper-lure',
    );
  });

  it('opens on the black water and falls into the Mainframe', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['abyss', 'mainframe']);
  });

  it('has a label for every beat, in order', () => {
    const beats = [
      'open',
      'souls',
      'ark',
      'wake',
      'fall',
      'threshold',
      'arrival',
      'card',
      'handoff',
    ];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });

  it('gives the Mainframe its recorded voice', () => {
    const voiced = tl.cues.filter((c) => c.kind === 'voice').map((c) => c.step.key);
    expect(voiced).toEqual([
      'vo_mainframe_01',
      'vo_mainframe_02',
      'vo_mainframe_03',
      'vo_mainframe_04',
    ]);
  });
});

describe('the-door', () => {
  const tl = compile(CUTSCENES['the-door']!);

  it('plays on the way into the Overseer, after level 30', () => {
    const index = JSON.parse(readFileSync(join(ASSETS, 'levels', 'index.json'), 'utf8')) as {
      scenes?: unknown;
    };
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 30 }, { index: 30, stop: 'boss' }, scenes, () => false)).toBe(
      'the-door',
    );
  });

  it('drops from the Mainframe into the chamber the fight is in', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['kernel']);
    expect(CUTSCENES['the-door']!.closes.scenery).toBe(BOSSES.overseer.scenery);
  });

  it('has a label for every beat, in order', () => {
    const beats = ['open', 'descent', 'door', 'watch', 'handoff'];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });
});

describe('ending', () => {
  const tl = compile(CUTSCENES['ending']!);

  it('plays after the Overseer, the last step of the campaign', () => {
    const index = JSON.parse(readFileSync(join(ASSETS, 'levels', 'index.json'), 'utf8')) as {
      scenes?: unknown;
    };
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 30, stop: 'boss' }, undefined, scenes, () => false)).toBe(
      'ending',
    );
  });

  it('has a label for every beat, in order', () => {
    const beats = [
      'open',
      'light',
      'door',
      'montage',
      'surface',
      'celebrate',
      'card',
      'handoff',
    ];
    const at = beats.map((b) => tl.labels.get(b));
    expect(at.every((t) => t !== undefined)).toBe(true);
    expect([...at].sort((x, y) => x! - y!)).toEqual(at);
  });

  it('climbs back up through the worlds the bosses fell in, and ends over the Mainframe', () => {
    expect(tl.scenery.map((m) => m.value.id)).toEqual(['kernel', 'abyss', 'hell', 'hell', 'mainframe']);
    expect(CUTSCENES['ending']!.closes.scenery).toBe('mainframe');
  });

  it('shows all four trophies in the montage, one card each', () => {
    const montage = tl.labels.get('montage')!;
    const surface = tl.labels.get('surface')!;
    const titles = tl.cards.filter((c) => c.at >= montage && c.at < surface).map((c) => c.title);
    expect(titles).toEqual(['The Overseer', 'The Angler', 'The Warden', 'The Crucible']);
  });

  it('keeps the fireworks sky over the stage until the end card is gone', () => {
    const sky = tl.plates.find((p) => p.image === 'cs_plate_victory')!;
    const card = tl.cards[tl.cards.length - 1]!;
    expect(sky.behind).toBe(true);
    expect(sky.at + sky.ms).toBeGreaterThanOrEqual(card.at + card.ms);
  });

  it("gives Vesper every one of her lines in her own voice", () => {
    const voiced = tl.cues.filter((c) => c.kind === 'voice').map((c) => c.step.key);
    expect(voiced).toEqual([1, 2, 3, 4, 5, 6].map((n) => `vo_vesper_end_0${n}`));
  });
});
