import { describe, expect, it } from 'vitest';
import {
  ABILITY_HITS,
  BOSS_TUNING,
  BossState,
  EXPLOSION_HITS,
  hitsFor,
  type BossSpec,
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
