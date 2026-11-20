import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BONUSES } from '../src/bonus';
import {
  FRONT_SLOTS,
  GALLERY_MS,
  BAG_HP,
  BAG_HP_PER_COIN,
  BAG_JACKPOT,
  BAG_WAVES,
  MAX_CATS,
  WAVE_TAIL_MS,
  bagCoins,
  duckCoins,
  frontSlots,
  gallery,
  lifeFor,
  pathFor,
  planWave,
  waveCoins,
  waveStarts,
  type WaveEvent,
} from '../src/bonus/gallery';
import { BONUS_IDS, MEDALS, medalFor, type BonusStats } from '../src/core/Bonus';
import { AUDIO_ASSETS, IMAGE_ASSETS } from '../src/config';
import { Rng } from '../src/core/Rng';
import { FIELD_WIDTH } from '../src/core/types';
import type { Field } from '../src/systems/BonusDirector';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const FIELD: Field = { left: 0, right: FIELD_WIDTH, top: 60, bottom: 900, paddleY: 860 };

/** Every wave of one playing, as the stage plans it from its seed. */
function plan(seed: number): WaveEvent[][] {
  const rng = new Rng(seed);
  return waveStarts().map((_, i) => planWave(rng.fork('wave', i), i));
}

describe('bonus registry', () => {
  it('has a def for every id, under its own id', () => {
    expect(Object.keys(BONUSES).sort()).toEqual([...BONUS_IDS].sort());
    for (const id of BONUS_IDS) expect(BONUSES[id].id).toBe(id);
  });
});

describe.each(Object.values(BONUSES))('$id', (def) => {
  it('has a name, rules and a timer', () => {
    expect(def.name.length).toBeGreaterThan(0);
    expect(def.rules.length).toBeGreaterThan(0);
    expect(def.durationMs).toBeGreaterThanOrEqual(20_000);
    expect(def.durationMs).toBeLessThanOrEqual(90_000);
  });

  it('asks for more for each medal', () => {
    const [b, s, g] = def.medals;
    expect(b).toBeGreaterThan(0);
    expect(s).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(s);
  });

  it('costs a lost ball no more than a bronze run can spare', () => {
    const cost = def.medalBy === 'coins' ? (def.ballLost.coins ?? 0) : (def.ballLost.score ?? 0);
    expect(cost).toBeLessThan(def.medals[0] / 4);
  });

  it('shows a picture the game loads beside each rule that has one', () => {
    const images = new Set(IMAGE_ASSETS.map((a) => a.key));
    for (const rule of def.rules) {
      expect(rule.text.length).toBeGreaterThan(0);
      if (rule.icon) expect(images.has(rule.icon), rule.icon).toBe(true);
    }
  });

  it('previews each medal with stats that earn it', () => {
    if (!def.preview) return;
    for (const m of ['none', ...MEDALS] as const) {
      const stats = def.preview(m);
      const value = def.medalBy === 'coins' ? stats.coins : stats.score;
      expect(medalFor(value, def.medals), m).toBe(m);
    }
  });

  it('lays out tally rows with numbers', () => {
    const stats: BonusStats = { score: 1234, coins: 5, bestCombo: 7, counts: { hits: 10, boltHits: 8, shots: 0 } };
    for (const row of def.tally(stats)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(Number.isFinite(row.value), row.label).toBe(true);
      expect(row.value, row.label).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('bonus sounds', () => {
  const keys = new Set<string>(AUDIO_ASSETS.map((a) => a.key));
  const SRC = join(__dirname, '..', 'src');
  // Everything that plays a sound in a bonus stage: the framework's files and every stage's own.
  const files = [
    join(SRC, 'systems', 'BonusDirector.ts'),
    join(SRC, 'systems', 'CollectibleSystem.ts'),
    join(SRC, 'ui', 'BonusTallyView.ts'),
    ...readdirSync(join(SRC, 'bonus')).map((f) => join(SRC, 'bonus', f)),
  ];

  it('names only sounds the game loads', () => {
    let found = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const named = /(?:\.sfx\(\s*|_SFX = |\bsfx: )'([^']+)'/g;
      for (const [, key] of source.matchAll(named)) {
        found++;
        expect(keys.has(key!), `${file}: ${key}`).toBe(true);
      }
      // The medal sounds sit in a table.
      for (const [, key] of source.matchAll(/(?:bronze|silver|gold): '([a-z_0-9]+)'/g)) {
        found++;
        expect(keys.has(key!), `${file}: ${key}`).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(10);
  });

  it('has a file on disk behind every gallery sound', () => {
    const gallery = [...keys].filter((key) => key.startsWith('gallery_'));
    expect(gallery.length).toBeGreaterThanOrEqual(5);
    for (const key of gallery) {
      const path = AUDIO_ASSETS.find((a) => a.key === key)!.path;
      const file = join(__dirname, '..', 'public', 'assets', path);
      expect(existsSync(file), `${key}: ${path}`).toBe(true);
      expect(statSync(file).size, key).toBeGreaterThan(400);
    }
  });
});

describe('shooting gallery waves', () => {
  it('fits every wave in the timer, with room for its targets to land', () => {
    const starts = waveStarts();
    expect(starts.length).toBeGreaterThanOrEqual(6);
    for (const at of starts) expect(at + WAVE_TAIL_MS).toBeLessThanOrEqual(GALLERY_MS);
    expect(gallery.durationMs).toBe(GALLERY_MS);
  });

  it('only ever puts the cat in the front row, never too many, never alone', () => {
    for (const seed of SEEDS) {
      plan(seed).forEach((wave, i) => {
        const at = `seed ${seed}, wave ${i}`;
        const cats = wave.filter((e) => e.kind === 'cat');
        expect(cats.every((e) => e.lane === 'front'), at).toBe(true);
        expect(cats.length, at).toBeLessThanOrEqual(MAX_CATS);
        expect(wave.some((e) => e.kind !== 'cat'), at).toBe(true);
        if (i === 0) expect(cats.length, at).toBe(0);
      });
    }
  });

  it('never pops two targets up in one slot of a wave', () => {
    for (const seed of SEEDS) {
      plan(seed).forEach((wave, i) => {
        const slots = wave.filter((e) => e.lane === 'front').map((e) => e.slot);
        expect(new Set(slots).size, `seed ${seed}, wave ${i}`).toBe(slots.length);
        for (const s of slots) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(FRONT_SLOTS);
        }
      });
    }
  });

  it('drifts a money bag over on the bag waves, and only then', () => {
    for (const seed of SEEDS) {
      plan(seed).forEach((wave, i) => {
        const bags = wave.filter((e) => e.kind === 'bag');
        expect(bags.length, `seed ${seed}, wave ${i}`).toBe(BAG_WAVES.includes(i) ? 1 : 0);
        expect(bags.every((e) => e.lane === 'sky')).toBe(true);
      });
    }
  });

  it('plans the same waves from the same seed', () => {
    expect(plan(7)).toEqual(plan(7));
    expect(plan(7)).not.toEqual(plan(8));
  });

  it('gets busier as it goes', () => {
    let early = 0;
    let late = 0;
    for (const seed of SEEDS) {
      const waves = plan(seed);
      early += waves[0]!.length;
      late += waves[waves.length - 1]!.length;
    }
    expect(late).toBeGreaterThan(early * 1.5);
  });

  it('keeps every target on the field or crossing it', () => {
    const xs = frontSlots(FIELD);
    expect(xs).toHaveLength(FRONT_SLOTS);
    for (const x of xs) {
      expect(x).toBeGreaterThan(FIELD.left);
      expect(x).toBeLessThan(FIELD.right);
    }
    for (const seed of SEEDS.slice(0, 10)) {
      plan(seed).forEach((wave, i) => {
        for (const e of wave) {
          const path = pathFor(e, FIELD);
          const life = lifeFor(e, i) ?? 6_000;
          for (let t = 0; t <= life; t += 100) {
            const p = path(t);
            expect(p.y, `${e.kind} in ${e.lane}`).toBeGreaterThan(FIELD.top);
            expect(p.y, `${e.kind} in ${e.lane}`).toBeLessThan(FIELD.paddleY - 100);
          }
        }
      });
    }
  });

  it('crosses the field on a rail within its wave time', () => {
    for (const e of plan(3).flat()) {
      if (e.lane !== 'back' && e.lane !== 'mid' && e.lane !== 'sky') continue;
      const p = pathFor(e, FIELD);
      const end = p(12_000).x;
      expect(e.dir > 0 ? end > FIELD.right : end < FIELD.left, `${e.kind} in ${e.lane}`).toBe(true);
    }
  });

  it('puts gold within reach of a perfect run without combos, on every seed', () => {
    expect(gallery.medalBy).toBe('coins');
    for (const seed of SEEDS) {
      const most = plan(seed).reduce((sum, wave) => sum + waveCoins(wave), 0);
      expect(most, `seed ${seed}`).toBeGreaterThanOrEqual(gallery.medals[2]);
      // Bronze is for showing up and trying: a quarter of the ducks and one bag.
      expect(gallery.medals[0], `seed ${seed}`).toBeLessThanOrEqual(most * 0.3);
    }
  });

  it('pays more coins a duck as the combo climbs, and double for the ball', () => {
    expect(duckCoins(1, false)).toBe(1);
    expect(duckCoins(1.5, false)).toBe(2);
    expect(duckCoins(3, false)).toBe(3);
    expect(duckCoins(1, true)).toBe(2);
    expect(bagCoins(BAG_HP, 0) + BAG_JACKPOT).toBeGreaterThanOrEqual(15);
  });

  it('spills bag coins by damage, the same however it is dealt', () => {
    let hp = BAG_HP;
    let one = 0;
    while (hp > 0) one += bagCoins(hp, --hp);
    let three = 0;
    for (hp = BAG_HP; hp > 0; hp = Math.max(0, hp - 3)) three += bagCoins(hp, Math.max(0, hp - 3));
    expect(one).toBe(BAG_HP / BAG_HP_PER_COIN);
    expect(three).toBe(one);
    expect(bagCoins(BAG_HP, BAG_HP - 1)).toBe(0);
  });
});
