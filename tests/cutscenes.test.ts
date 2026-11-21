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
import { compile, GRADES, Playhead, sampleFrame, scriptProblems } from '../src/core/cutscene';
import { CUTSCENES } from '../src/cutscenes';
import { AMBIENT_FX } from '../src/fx/library/ambient';
import { WEATHER_FX } from '../src/fx/library/weather';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const SOUNDS = new Set(AUDIO_ASSETS.map((a) => a.key));
const FIELDS = new Set(Object.keys({ ...AMBIENT_FX, ...WEATHER_FX }));
const known = {
  fx: (id: string) => FIELDS.has(id),
  sfx: (key: string) => SOUNDS.has(key),
  sprite: (key: string) => key === 'breaker' || (key.startsWith('boss:') && key.slice(5) in BOSSES),
};

describe.each(Object.values(CUTSCENES))('cutscene $id', (def) => {
  it('has no script problems', () => {
    expect(scriptProblems(def, known)).toEqual([]);
  });

  it('ships every asset it loads', () => {
    const a = def.assets ?? {};
    const missing = [a.images, a.sheets, a.voice, a.sfx, a.music]
      .flatMap((list) => list ?? [])
      .filter((r) => !existsSync(join(ASSETS, r.path)))
      .map((r) => r.path);
    expect(missing).toEqual([]);
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

  it('plays Chapter II between the Warden and Level 11', () => {
    const scenes = validScenes(index.scenes);
    expect(sceneBetween({ index: 10, stop: 'boss' }, { index: 11 }, scenes, () => false)).toBe(
      'chapter-2',
    );
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
