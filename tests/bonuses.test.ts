import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The credits stage draws with Phaser at runtime; nothing here touches it.
vi.mock('phaser', () => ({ default: {} }));

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
import {
  CHILI_COINS,
  DROOP_PX,
  MINI,
  PEG_BOW,
  PEG_TOP,
  PINATAS,
  SWING_MAX,
  candyCoins,
  newRope,
  pegLayout,
  pinata,
  rollDrop,
  ropeEnd,
  spillFor,
  stepRope,
  swingFor,
  threeCoins,
  tierFor,
  type DropKind,
} from '../src/bonus/pinata';
import {
  BALL_AT,
  CREDITS_MS,
  FALL_SPEED,
  FIRE_AT,
  creditTimes,
  credits,
  plateLifeMs,
  plateY,
  starAt,
} from '../src/bonus/credits';
import { ARCADE_BONUS_IDS, BONUS_IDS, MEDALS, arcadeBonusFor, medalFor, type BonusStats } from '../src/core/Bonus';
import { CREDITS, STARRING } from '../src/credits';
import { MAX_BALLS } from '../src/core/Difficulty';
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
    const cost = def.medalBy === 'coins' ? (def.ballLost?.coins ?? 0) : (def.ballLost?.score ?? 0);
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

  it('has a file on disk behind every bonus stage sound', () => {
    const own = [...keys].filter((key) => key.startsWith('gallery_') || key.startsWith('pinata_'));
    expect(own.length).toBeGreaterThanOrEqual(10);
    for (const key of own) {
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
    expect(duckCoins(1)).toBe(1);
    expect(duckCoins(1.5)).toBe(2);
    expect(duckCoins(3)).toBe(3);
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

describe('arcade bonus rounds', () => {
  it('takes turns after each boss, starting with the gallery', () => {
    expect([1, 2, 3, 4].map(arcadeBonusFor)).toEqual(['gallery', 'pinata', 'gallery', 'pinata']);
    expect(arcadeBonusFor(0)).toBe('gallery');
  });
});

describe('the credits', () => {
  it('never comes up in Arcade', () => {
    expect(ARCADE_BONUS_IDS).not.toContain('credits');
    for (let n = 0; n <= 12; n++) expect(arcadeBonusFor(n)).not.toBe('credits');
  });

  it('rolls every credit, then the star plate, inside the timer', () => {
    const times = creditTimes();
    expect(times).toHaveLength(CREDITS.length);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    expect(starAt()).toBeGreaterThan(times[times.length - 1]!);
    // Room for the star plate to come down and take its hits before time runs out.
    expect(starAt() + 15_000).toBeLessThan(CREDITS_MS);
    expect(credits.durationMs).toBe(CREDITS_MS);
  });

  it('lets each plate fall the length of the field, and no further', () => {
    expect(plateY(FIELD, 0)).toBeGreaterThan(FIELD.top);
    const end = plateY(FIELD, plateLifeMs(FIELD));
    expect(end).toBeLessThan(FIELD.bottom);
    expect(end).toBeGreaterThan(FIELD.bottom - 120);
  });

  it('rolls the plates far enough apart that they never overlap', () => {
    const times = creditTimes();
    for (let i = 1; i < times.length; i++) {
      expect(((times[i]! - times[i - 1]!) / 1000) * FALL_SPEED).toBeGreaterThan(105);
    }
  });

  it('builds up the balls, then the fireballs, while the credits roll', () => {
    for (const at of BALL_AT) expect(at * CREDITS_MS).toBeLessThan(starAt());
    expect(FIRE_AT).toBeGreaterThan(BALL_AT[BALL_AT.length - 1]!);
    expect(FIRE_AT * CREDITS_MS).toBeLessThan(starAt());
  });

  it('ends with no tally, on the way to Victory', () => {
    expect(credits.noTally).toBe(true);
    expect(credits.medalBy ?? 'score').toBe('score');
  });

  it('stars the player last, with every credit filled in', () => {
    expect(STARRING.name).toBe('You');
    for (const c of CREDITS) {
      expect(c.role.length, c.name).toBeGreaterThan(0);
      expect(c.name.length, c.role).toBeGreaterThan(0);
    }
  });
});

describe('piñata fiesta', () => {
  /** Every piece one playing could spill, as the stage rolls them: `n` hits a piñata, in order. */
  function drops(seed: number, n: number, fiestaFrom = Infinity): DropKind[][] {
    const rng = new Rng(seed).fork('drops');
    let lastChili = false;
    return Array.from({ length: 6 }, (_, pinata) =>
      Array.from({ length: n }, (_, i) => {
        const kind = rollDrop(rng, { pinata, lastChili, fiesta: pinata * n + i >= fiestaFrom });
        lastChili = kind === 'chili';
        return kind;
      }),
    );
  }

  it('keeps every piñata over the field and clear of the pegs, at its widest swing and lowest droop', () => {
    for (let index = 0; index < PINATAS.length + 4; index++) {
      const tier = tierFor(index);
      const rope = newRope(tier, FIELD, index);
      rope.aim = SWING_MAX;
      for (let t = 0; t < 30_000; t += 16) {
        stepRope(rope, 16);
        const at = ropeEnd(rope);
        const where = `${tier.kind} #${index} at ${t}ms`;
        expect(at.x - tier.hit[0] / 2, where).toBeGreaterThan(FIELD.left);
        expect(at.x + tier.hit[0] / 2, where).toBeLessThan(FIELD.right);
        expect(at.y + tier.hit[1] / 2, where).toBeLessThan(FIELD.top + PEG_TOP - 10);
      }
      expect(rope.droop).toBeCloseTo(DROOP_PX, 0);
    }
  });

  it('swings wider and quicker with every hit, up to a limit', () => {
    for (const tier of PINATAS) {
      let last = swingFor(tier, 0);
      for (let hits = 1; hits < tier.hp; hits++) {
        const next = swingFor(tier, hits);
        expect(next.amp).toBeGreaterThanOrEqual(last.amp);
        expect(next.periodMs).toBeLessThan(last.periodMs);
        expect(next.amp).toBeLessThanOrEqual(SWING_MAX);
        last = next;
      }
    }
  });

  it('lowers each piñata in without a jump, and moves on smoothly when a hit changes its swing', () => {
    const rope = newRope(PINATAS[0]!, FIELD, 0);
    let prev = ropeEnd(rope);
    for (let t = 0; t < 4_000; t += 16) {
      if (t === 2_000) {
        const next = swingFor(PINATAS[0]!, 5);
        rope.aim = next.amp;
        rope.periodMs = next.periodMs;
      }
      stepRope(rope, 16);
      const at = ropeEnd(rope);
      expect(Math.hypot(at.x - prev.x, at.y - prev.y), `${t}ms`).toBeLessThan(12);
      prev = at;
    }
  });

  it('builds the multiball from its bursts without ever reaching the cap', () => {
    const balls = 1 + PINATAS.reduce((sum, t) => sum + t.balls, 0);
    expect(balls).toBeGreaterThanOrEqual(4);
    expect(balls).toBeLessThanOrEqual(MAX_BALLS);
    expect(MINI.balls).toBe(0);
    expect(PINATAS.map((t) => t.hp)).toEqual([...PINATAS.map((t) => t.hp)].sort((a, b) => a - b));
    expect(tierFor(PINATAS.length).kind).toBe('mini');
    expect(tierFor(PINATAS.length).at).not.toBe(tierFor(PINATAS.length + 1).at);
  });

  it('never drops a chili from the first piñata, two in a row, or in the fiesta', () => {
    let chilis = 0;
    for (const seed of SEEDS) {
      const all = drops(seed, 10, 40);
      expect(all[0]!.includes('chili'), `seed ${seed}`).toBe(false);
      const flat = all.flat();
      flat.forEach((k, i) => {
        if (k !== 'chili') return;
        chilis++;
        expect(flat[i - 1], `seed ${seed}, drop ${i}`).not.toBe('chili');
        expect(i, `seed ${seed}, drop ${i}`).toBeLessThan(40);
      });
    }
    // Rare enough to be a surprise, common enough to matter.
    const after = SEEDS.length * 30;
    expect(chilis / after).toBeGreaterThan(0.06);
    expect(chilis / after).toBeLessThan(0.2);
  });

  it('drops a golden candy now and then', () => {
    const flat = SEEDS.flatMap((seed) => drops(seed, 10).flat());
    const golden = flat.filter((k) => k === 'golden').length / flat.length;
    expect(golden).toBeGreaterThan(0.03);
    expect(golden).toBeLessThan(0.12);
  });

  it('rolls the same drops from the same seed', () => {
    expect(drops(7, 10)).toEqual(drops(7, 10));
    expect(drops(7, 10)).not.toEqual(drops(8, 10));
  });

  it('lays its pegs across the field, in reach of the ball and under the piñatas', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (let set = 0; set < 6; set++) {
        const pegs = pegLayout(set, FIELD, new Rng(seed).fork('pegs', set));
        expect(pegs).toHaveLength(7);
        for (const p of pegs) {
          expect(p.x).toBeGreaterThan(FIELD.left + 20);
          expect(p.x).toBeLessThan(FIELD.right - 20);
          expect(p.y).toBeGreaterThan(FIELD.top + PEG_TOP - 10);
          expect(p.y).toBeLessThan(FIELD.top + PEG_TOP + PEG_BOW + 10);
        }
        // Room for the ball between any two neighbours.
        for (let i = 1; i < pegs.length; i++) expect(pegs[i]!.x - pegs[i - 1]!.x).toBeGreaterThan(60);
      }
    }
  });

  it('spills more and pays more as the combo climbs, and twice as much candy in the fiesta', () => {
    expect(spillFor(1, false)).toBe(1);
    expect(spillFor(2, false)).toBe(2);
    expect(spillFor(1, true)).toBe(2);
    expect(spillFor(3, true)).toBe(4);
    expect([1, 1.5, 2, 3].map(candyCoins)).toEqual([1, 2, 2, 3]);
  });

  it('puts gold within reach of breaking the three piñatas cleanly, without combos', () => {
    expect(pinata.medalBy).toBe('coins');
    const most = threeCoins();
    expect(most).toBeGreaterThanOrEqual(pinata.medals[2]);
    // Bronze is for showing up: about a third of what the three hold.
    expect(pinata.medals[0]).toBeLessThanOrEqual(most * 0.35);
    // A chili stings without undoing a run.
    expect(CHILI_COINS).toBeLessThan(pinata.medals[0] / 4);
  });
});
