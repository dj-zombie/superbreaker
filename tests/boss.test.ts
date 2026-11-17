import { describe, expect, it } from 'vitest';
import {
  ABILITY_HITS,
  AFTERMATH_MS,
  BOSS_TUNING,
  BossState,
  EXPLOSION_HITS,
  HUSH_MS,
  REVEAL_MS,
  SKIP_GUARD_MS,
  hitsFor,
  sway,
  type BossEvent,
  type BossSpec,
  type BossStep,
} from '../src/core/Boss';
import { DIFFICULTY, FIREBALL_DAMAGE } from '../src/core/Difficulty';
import { DIFFICULTIES } from '../src/core/types';

const spec: BossSpec = { phases: [{ hits: 12 }, { hits: 8 }, { hits: 20 }] };
const fight = (opts?: { phase?: number }) => new BossState(spec, BOSS_TUNING.normal, opts);

describe('BOSS_TUNING', () => {
  it('has an entry for every difficulty and Normal is all ones', () => {
    for (const id of DIFFICULTIES) {
      const t = BOSS_TUNING[id];
      expect(t, id).toBeDefined();
      for (const k of [t.health, t.windup, t.gap]) expect(k, id).toBeGreaterThan(0);
    }
    expect(BOSS_TUNING.normal).toEqual({ health: 1, windup: 1, gap: 1 });
  });
});

describe('hitsFor', () => {
  it("counts a plain ball hit as 1 for each difficulty's hitDamage", () => {
    for (const id of DIFFICULTIES) {
      const { hitDamage } = DIFFICULTY[id];
      expect(hitsFor({ cause: 'ball', damage: hitDamage }, hitDamage), id).toBe(1);
    }
  });

  it('counts double damage as 2', () => {
    for (const id of DIFFICULTIES) {
      const { hitDamage } = DIFFICULTY[id];
      expect(hitsFor({ cause: 'ball', damage: hitDamage * 2 }, hitDamage), id).toBe(2);
    }
  });

  it('counts a fireball as 2 on every difficulty', () => {
    for (const id of DIFFICULTIES) {
      const hit = { cause: 'ball', damage: FIREBALL_DAMAGE, stripArmor: true };
      expect(hitsFor(hit, DIFFICULTY[id].hitDamage), id).toBe(2);
    }
  });

  it('counts a laser bolt of 25 damage as 0.25', () => {
    expect(hitsFor({ cause: 'laser', damage: 25 }, DIFFICULTY.normal.hitDamage)).toBe(0.25);
    expect(hitsFor({ cause: 'laser', damage: 25 }, DIFFICULTY.easy.hitDamage)).toBe(0.25);
  });

  it('counts a lethal explosion as EXPLOSION_HITS', () => {
    const hit = { cause: 'explosion', damage: 0, lethal: true };
    expect(hitsFor(hit, DIFFICULTY.normal.hitDamage)).toBe(EXPLOSION_HITS);
  });

  it('counts a lethal ability as ABILITY_HITS', () => {
    const hit = { cause: 'ability', damage: 0, lethal: true };
    expect(hitsFor(hit, DIFFICULTY.normal.hitDamage)).toBe(ABILITY_HITS);
  });

  it('counts a zero-damage ability hit as 0', () => {
    const hit = { cause: 'ability', damage: 0, stripArmor: true };
    expect(hitsFor(hit, DIFFICULTY.normal.hitDamage)).toBe(0);
  });
});

describe('BossState', () => {
  it('starts in fight at phase 0 with a full pool', () => {
    const s = fight();
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(0);
    expect(s.pool).toBe(12);
    expect(s.poolMax).toBe(12);
    expect(s.progress).toBe(0);
  });

  it('lowers the pool by the hits dealt', () => {
    const s = fight();
    expect(s.damage(1)).toEqual([]);
    expect(s.pool).toBe(11);
    expect(s.damage(2.5)).toEqual([]);
    expect(s.pool).toBe(8.5);
    expect(s.phase).toBe(0);
    expect(s.damage(0)).toEqual([]);
    expect(s.pool).toBe(8.5);
  });

  it('moves to the next phase with a full pool on overkill and emits one phase event', () => {
    const s = fight();
    s.damage(5);
    expect(s.damage(100)).toEqual([{ type: 'phase', phase: 1 }]);
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(1);
    expect(s.pool).toBe(8);
    expect(s.poolMax).toBe(8);
  });

  it('reaches finale when the last pool empties and emits one step event', () => {
    const s = fight();
    s.damage(12);
    s.damage(8);
    expect(s.phase).toBe(2);
    expect(s.damage(19)).toEqual([]);
    expect(s.step).toBe('fight');
    expect(s.damage(1)).toEqual([{ type: 'step', step: 'finale' }]);
    expect(s.step).toBe('finale');
    expect(s.phase).toBe(2);
    expect(s.pool).toBe(0);
  });

  it('ignores damage in finale', () => {
    const s = fight({ phase: 2 });
    s.damage(999);
    expect(s.step).toBe('finale');
    expect(s.damage(5)).toEqual([]);
    expect(s.step).toBe('finale');
    expect(s.phase).toBe(2);
    expect(s.pool).toBe(0);
    expect(s.progress).toBe(1);
  });

  it('never lets progress decrease, and ends it at 1', () => {
    const s = fight();
    let last = s.progress;
    // 7 never lands on a pool boundary here, so every phase change is an overkill.
    for (let i = 0; i < 12 && s.step === 'fight'; i++) {
      s.damage(7);
      expect(s.progress).toBeGreaterThanOrEqual(last);
      last = s.progress;
    }
    expect(s.step).toBe('finale');
    expect(s.progress).toBe(1);
  });

  it("makes Hard's pool larger than Normal's and Easy's smaller for the same spec", () => {
    const pool = (id: (typeof DIFFICULTIES)[number]) => new BossState(spec, BOSS_TUNING[id]).pool;
    expect(pool('hard')).toBeGreaterThan(pool('normal'));
    expect(pool('easy')).toBeLessThan(pool('normal'));
    expect(pool('normal')).toBe(12);
  });

  it('starts at opts.phase with progress already counting the skipped pools', () => {
    const s = fight({ phase: 2 });
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(2);
    expect(s.pool).toBe(20);
    expect(s.progress).toBeCloseTo((12 + 8) / (12 + 8 + 20));
    expect(fight({ phase: 1 }).progress).toBeCloseTo(12 / 40);
    // A phase past the end is the last one.
    expect(fight({ phase: 9 }).phase).toBe(2);
  });
});

const ENTRANCE_MS = 1800;
const ENTER_MS = 1200;
const DEATH_MS = 2200;
/** The same pools with every scene a boss can have: an entrance, an entry to phase 2, a death. */
const staged: BossSpec = {
  phases: [{ hits: 12 }, { hits: 8, enterMs: ENTER_MS }, { hits: 20 }],
  entranceMs: ENTRANCE_MS,
  deathMs: DEATH_MS,
};
const intro = (s: BossSpec = staged) => new BossState(s, BOSS_TUNING.normal, { intro: true });
const live = (phase = 0) => new BossState(staged, BOSS_TUNING.normal, { phase });
const step = (to: BossStep): BossEvent => ({ type: 'step', step: to });

describe('BossState flow', () => {
  it('starts in hush with an intro and in fight without one', () => {
    expect(intro().step).toBe('hush');
    expect(intro().stepMs).toBe(0);
    expect(live().step).toBe('fight');
    expect(live(1).step).toBe('fight');
    expect(new BossState(staged, BOSS_TUNING.normal, { intro: false }).step).toBe('fight');
  });

  it('runs the intro to the millisecond', () => {
    const s = intro();
    expect(s.tick(HUSH_MS - 1, false)).toEqual([]);
    expect(s.step).toBe('hush');
    expect(s.stepMs).toBe(HUSH_MS - 1);
    expect(s.tick(1, false)).toEqual([step('entrance')]);
    expect(s.step).toBe('entrance');
    expect(s.stepMs).toBe(0);
    expect(s.tick(ENTRANCE_MS - 1, false)).toEqual([]);
    expect(s.step).toBe('entrance');
    expect(s.tick(1, false)).toEqual([step('reveal')]);
    expect(s.step).toBe('reveal');
    expect(s.tick(REVEAL_MS - 1, false)).toEqual([]);
    expect(s.step).toBe('reveal');
    expect(s.tick(1, false)).toEqual([step('fight')]);
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(0);
    expect(s.pool).toBe(12);
  });

  it('carries the time left over into the next step', () => {
    const s = intro();
    expect(s.tick(HUSH_MS + 250, false)).toEqual([step('entrance')]);
    expect(s.stepMs).toBe(250);
    expect(s.tick(ENTRANCE_MS - 250 + 40, false)).toEqual([step('reveal')]);
    expect(s.stepMs).toBe(40);
    // One long frame walks through every step it covers, in order.
    const t = intro();
    expect(t.tick(HUSH_MS + ENTRANCE_MS + REVEAL_MS + 5, false)).toEqual([
      step('entrance'),
      step('reveal'),
      step('fight'),
    ]);
    expect(t.stepMs).toBe(5);
  });

  it('enters and leaves a zero-length entrance in one tick', () => {
    const s = intro({ phases: [{ hits: 12 }] });
    expect(s.tick(HUSH_MS - 1, false)).toEqual([]);
    expect(s.tick(1, false)).toEqual([step('entrance'), step('reveal')]);
    expect(s.step).toBe('reveal');
    expect(s.stepMs).toBe(0);
  });

  it('ignores damage during the intro', () => {
    const s = intro();
    for (const [ms, at] of [
      [0, 'hush'],
      [HUSH_MS, 'entrance'],
      [ENTRANCE_MS, 'reveal'],
    ] as const) {
      s.tick(ms, false);
      expect(s.step).toBe(at);
      expect(s.damage(999), at).toEqual([]);
      expect(s.step, at).toBe(at);
      expect(s.phase, at).toBe(0);
      expect(s.pool, at).toBe(12);
    }
  });

  it('ignores a skip until the guard has passed, then jumps to the fight', () => {
    const s = intro();
    expect(s.skip()).toEqual([]);
    s.tick(SKIP_GUARD_MS - 1, false);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('hush');
    s.tick(1, false);
    expect(s.skip()).toEqual([step('fight')]);
    expect(s.step).toBe('fight');
    expect(s.stepMs).toBe(0);
    expect(s.phase).toBe(0);
    expect(s.pool).toBe(12);
    // Nothing of the intro is left to run.
    expect(s.tick(HUSH_MS + ENTRANCE_MS + REVEAL_MS, true)).toEqual([]);
    expect(s.step).toBe('fight');
  });

  it('skips from the entrance and from the reveal as well', () => {
    for (const ms of [HUSH_MS, HUSH_MS + ENTRANCE_MS]) {
      const s = intro();
      s.tick(ms, false);
      expect(s.skip(), `${ms} ms`).toEqual([step('fight')]);
      expect(s.step, `${ms} ms`).toBe('fight');
    }
  });

  it('stops for a phase with an entry scene, then fights on with its full pool', () => {
    const s = live();
    expect(s.damage(100)).toEqual([{ type: 'phase', phase: 1 }, step('transition')]);
    expect(s.step).toBe('transition');
    expect(s.stepMs).toBe(0);
    expect(s.phase).toBe(1);
    expect(s.pool).toBe(8);
    // Nothing lands while the scene plays.
    expect(s.damage(5)).toEqual([]);
    expect(s.pool).toBe(8);
    expect(s.tick(ENTER_MS - 1, true)).toEqual([]);
    expect(s.step).toBe('transition');
    expect(s.tick(1, true)).toEqual([step('fight')]);
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(1);
    expect(s.pool).toBe(8);
    expect(s.poolMax).toBe(8);
    // The third phase has no entry scene, so the fight carries straight on.
    expect(s.damage(8)).toEqual([{ type: 'phase', phase: 2 }]);
    expect(s.step).toBe('fight');
    expect(s.pool).toBe(20);
  });

  it('skips a phase scene once the guard has passed in that step', () => {
    const s = live();
    // A long fight first: the guard counts from the start of the scene, not of the fight.
    s.tick(60_000, true);
    s.damage(12);
    expect(s.step).toBe('transition');
    expect(s.skip()).toEqual([]);
    s.tick(SKIP_GUARD_MS - 1, true);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('transition');
    s.tick(1, true);
    expect(s.skip()).toEqual([step('fight')]);
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(1);
    expect(s.pool).toBe(8);
  });

  it('cannot skip the fight, the finale, the aftermath or the end', () => {
    const s = live(2);
    s.tick(2 * SKIP_GUARD_MS, true);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('fight');
    s.damage(20);
    s.tick(2 * SKIP_GUARD_MS, true);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('finale');
    s.tick(DEATH_MS, true);
    expect(s.step).toBe('aftermath');
    expect(s.stepMs).toBe(2 * SKIP_GUARD_MS);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('aftermath');
    s.tick(AFTERMATH_MS, true);
    expect(s.skip()).toEqual([]);
    expect(s.step).toBe('done');
  });

  it('runs the finale, the aftermath and the end to the millisecond', () => {
    const s = live(2);
    expect(s.damage(20)).toEqual([step('finale')]);
    expect(s.stepMs).toBe(0);
    expect(s.tick(DEATH_MS - 1, false)).toEqual([]);
    expect(s.step).toBe('finale');
    expect(s.tick(1, false)).toEqual([step('aftermath')]);
    expect(s.step).toBe('aftermath');
    expect(s.tick(AFTERMATH_MS - 1, false)).toEqual([]);
    expect(s.step).toBe('aftermath');
    expect(s.tick(1, false)).toEqual([step('done')]);
    expect(s.step).toBe('done');
    expect(s.progress).toBe(1);
    expect(s.tick(60_000, false)).toEqual([]);
    expect(s.step).toBe('done');
  });

  it('leaves a finale without a death scene on the next tick', () => {
    const s = fight({ phase: 2 });
    expect(s.damage(20)).toEqual([step('finale')]);
    expect(s.step).toBe('finale');
    expect(s.tick(0, false)).toEqual([step('aftermath')]);
  });

  it('changes nothing on a tick during the fight', () => {
    const s = live();
    s.damage(3);
    expect(s.tick(60_000, true)).toEqual([]);
    expect(s.tick(60_000, false)).toEqual([]);
    expect(s.step).toBe('fight');
    expect(s.phase).toBe(0);
    expect(s.pool).toBe(9);
  });
});

describe('sway', () => {
  const AMPLITUDE = 90;
  const PERIOD_MS = 3600;
  const motion = sway(AMPLITUDE, PERIOD_MS);

  it('rests at time 0 and never leaves the horizontal', () => {
    expect(motion(0)).toEqual({ x: 0, y: 0 });
    for (let t = 0; t <= PERIOD_MS; t += 50) expect(motion(t).y, `${t} ms`).toBe(0);
  });

  it('never goes further than its amplitude, and reaches it at each quarter', () => {
    for (let t = 0; t <= 3 * PERIOD_MS; t += 7) {
      expect(Math.abs(motion(t).x), `${t} ms`).toBeLessThanOrEqual(AMPLITUDE);
    }
    expect(motion(PERIOD_MS / 4).x).toBeCloseTo(AMPLITUDE);
    expect(motion((3 * PERIOD_MS) / 4).x).toBeCloseTo(-AMPLITUDE);
  });

  it('repeats after one period', () => {
    for (const t of [0, 1, 250, 900, 1234.5, 3599]) {
      expect(motion(t + PERIOD_MS).x, `${t} ms`).toBeCloseTo(motion(t).x);
      expect(motion(t + 4 * PERIOD_MS).x, `${t} ms`).toBeCloseTo(motion(t).x);
    }
    // Half a period on it is the mirror image, so a period is not shorter than it says.
    expect(motion(900 + PERIOD_MS / 2).x).toBeCloseTo(-motion(900).x);
  });
});
