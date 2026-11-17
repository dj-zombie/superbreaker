import { describe, expect, it } from 'vitest';
import {
  ABILITY_HITS,
  AFTERMATH_MS,
  BOSS_TUNING,
  BossState,
  DEFAULT_GAP_MS,
  EXPLOSION_HITS,
  HUSH_MS,
  LAND_MS,
  MAX_HAZARDS,
  MAX_JAM_MS,
  MAX_SKULLS,
  MIN_FLIGHT_MS,
  MIN_SKULL_FLIGHT_MS,
  MIN_WINDUP_MS,
  REGROUP_MS,
  REVEAL_MS,
  SAFE_GAP,
  SHOT_RADIUS,
  SKIP_GUARD_MS,
  SKULL_RADIUS,
  hitsFor,
  planProblems,
  safeGap,
  sway,
  windupFor,
  type AttackPlan,
  type AttackWindow,
  type BossEvent,
  type BossSpec,
  type BossStep,
  type HazardSpec,
  type PaddleEffect,
} from '../src/core/Boss';
import { DIFFICULTY, FIREBALL_DAMAGE } from '../src/core/Difficulty';
import { DIFFICULTIES, FIELD_WIDTH } from '../src/core/types';

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

const jab = { id: 'jab', windupMs: 1000, liveMs: 800, recoverMs: 1500 };
const slam = { id: 'slam', windupMs: 600, liveMs: 400, recoverMs: 900 };
/** Both attacks from start to finish, without the gaps around them. */
const JAB_MS = jab.windupMs + jab.liveMs + jab.recoverMs;
const SLAM_MS = slam.windupMs + slam.liveMs + slam.recoverMs;
const [GAP_FULL, GAP_EMPTY] = DEFAULT_GAP_MS;
/** A boss that attacks in its first and last phase, with a quiet phase between. */
const armed: BossSpec = {
  phases: [
    { hits: 12, deck: [jab, slam] },
    { hits: 8 },
    { hits: 20, deck: [jab, slam], gapMs: [1000, 400] },
  ],
};
const attacking = (phase = 0, tuning = BOSS_TUNING.normal) =>
  new BossState(armed, tuning, { phase });
const win = (window: AttackWindow, attack: string | null = null): BossEvent => {
  return { type: 'window', window, attack };
};

describe('BossState attack cycle', () => {
  it('starts calm, with no attack', () => {
    const s = attacking();
    expect(s.window).toBe('gap');
    expect(s.attack).toBeNull();
  });

  it('visits the four windows in order, each for its own length', () => {
    const s = attacking();
    expect(s.tick(GAP_FULL - 1, true)).toEqual([]);
    expect(s.window).toBe('gap');
    expect(s.tick(1, true)).toEqual([win('windup', 'jab')]);
    expect(s.window).toBe('windup');
    expect(s.attack).toBe('jab');
    expect(s.tick(jab.windupMs - 1, true)).toEqual([]);
    expect(s.window).toBe('windup');
    expect(s.tick(1, true)).toEqual([win('live', 'jab')]);
    expect(s.window).toBe('live');
    expect(s.attack).toBe('jab');
    expect(s.tick(jab.liveMs - 1, true)).toEqual([]);
    expect(s.window).toBe('live');
    expect(s.tick(1, true)).toEqual([win('recover', 'jab')]);
    expect(s.window).toBe('recover');
    expect(s.attack).toBe('jab');
    expect(s.tick(jab.recoverMs - 1, true)).toEqual([]);
    expect(s.window).toBe('recover');
    expect(s.tick(1, true)).toEqual([win('gap')]);
    expect(s.window).toBe('gap');
    expect(s.attack).toBeNull();
    // The cycle is no step of the flow: the fight goes on all the while.
    expect(s.step).toBe('fight');
  });

  it('plays the deck in order and wraps', () => {
    const s = attacking();
    // One long frame walks through every window it covers, in order.
    expect(s.tick(GAP_FULL + JAB_MS, true)).toEqual([
      win('windup', 'jab'),
      win('live', 'jab'),
      win('recover', 'jab'),
      win('gap'),
    ]);
    expect(s.tick(GAP_FULL + SLAM_MS, true)).toEqual([
      win('windup', 'slam'),
      win('live', 'slam'),
      win('recover', 'slam'),
      win('gap'),
    ]);
    expect(s.tick(GAP_FULL, true)).toEqual([win('windup', 'jab')]);
    expect(s.tick(JAB_MS + GAP_FULL, true).at(-1)).toEqual(win('windup', 'slam'));
  });

  it('carries the time left over into the next window', () => {
    const s = attacking();
    expect(s.tick(GAP_FULL + 250, true)).toEqual([win('windup', 'jab')]);
    expect(s.tick(jab.windupMs - 250 - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('live', 'jab')]);
  });

  it('stands still while no ball is in play', () => {
    const s = attacking();
    expect(s.tick(60_000, false)).toEqual([]);
    expect(s.window).toBe('gap');
    // The gap has not begun to run down either.
    expect(s.tick(GAP_FULL - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('windup', 'jab')]);
    s.tick(300, true);
    expect(s.tick(60_000, false)).toEqual([]);
    expect(s.window).toBe('windup');
    expect(s.attack).toBe('jab');
    expect(s.tick(jab.windupMs - 300 - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('live', 'jab')]);
  });

  it('never attacks in a phase without a deck', () => {
    const s = attacking(1);
    expect(s.tick(60_000, true)).toEqual([]);
    expect(s.window).toBe('gap');
    expect(s.attack).toBeNull();
    expect(s.onLifeLost()).toEqual([]);
    expect(s.tick(60_000, true)).toEqual([]);
  });

  it('does not attack before the fight', () => {
    const s = new BossState({ ...armed, entranceMs: ENTRANCE_MS }, BOSS_TUNING.normal, {
      intro: true,
    });
    // The whole intro and what is left of the tick after it, with a ball in play throughout.
    const events = s.tick(HUSH_MS + ENTRANCE_MS + REVEAL_MS + GAP_FULL - 1, true);
    expect(events).toEqual([step('entrance'), step('reveal'), step('fight')]);
    expect(s.window).toBe('gap');
    // Only the time spent in the fight counts toward the first attack.
    expect(s.tick(1, true)).toEqual([win('windup', 'jab')]);
  });

  it("scales the wind-up by difficulty: Hard's is shorter than Normal's, Easy's longer", () => {
    for (const id of DIFFICULTIES) {
      const tuning = BOSS_TUNING[id];
      const s = attacking(0, tuning);
      expect(s.tick(GAP_FULL * tuning.gap, true), id).toEqual([win('windup', 'jab')]);
      const windup = jab.windupMs * tuning.windup;
      expect(s.tick(windup - 1, true), id).toEqual([]);
      expect(s.tick(1, true), id).toEqual([win('live', 'jab')]);
      // The attack itself and the opening are the same length for everyone.
      expect(s.tick(jab.liveMs - 1, true), id).toEqual([]);
      expect(s.tick(1, true), id).toEqual([win('recover', 'jab')]);
      expect(s.tick(jab.recoverMs - 1, true), id).toEqual([]);
      expect(s.tick(1, true), id).toEqual([win('gap')]);
    }
    expect(jab.windupMs * BOSS_TUNING.hard.windup).toBeLessThan(jab.windupMs);
    expect(jab.windupMs * BOSS_TUNING.easy.windup).toBeGreaterThan(jab.windupMs);
  });

  it('never lets a wind-up fall under MIN_WINDUP_MS', () => {
    const quick = { ...jab, id: 'quick', windupMs: MIN_WINDUP_MS + 20 };
    // On Hard the scaled time would be under the floor.
    expect(quick.windupMs * BOSS_TUNING.hard.windup).toBeLessThan(MIN_WINDUP_MS);
    const hard = new BossState({ phases: [{ hits: 12, deck: [quick] }] }, BOSS_TUNING.hard);
    hard.tick(GAP_FULL * BOSS_TUNING.hard.gap, true);
    expect(hard.window).toBe('windup');
    expect(hard.tick(MIN_WINDUP_MS - 1, true)).toEqual([]);
    expect(hard.tick(1, true)).toEqual([win('live', 'quick')]);
    // On Normal it is above the floor and plays as written.
    const normal = new BossState({ phases: [{ hits: 12, deck: [quick] }] }, BOSS_TUNING.normal);
    normal.tick(GAP_FULL, true);
    expect(normal.tick(quick.windupMs - 1, true)).toEqual([]);
    expect(normal.tick(1, true)).toEqual([win('live', 'quick')]);
    expect(windupFor(quick, BOSS_TUNING.hard)).toBe(MIN_WINDUP_MS);
    expect(windupFor(quick, BOSS_TUNING.normal)).toBe(quick.windupMs);
    expect(windupFor(jab, BOSS_TUNING.hard)).toBeLessThan(windupFor(jab, BOSS_TUNING.normal));
  });

  it('shortens the gap as the pool empties', () => {
    // Half the pool gone: half-way between the two.
    const s = attacking();
    s.damage(6);
    const half = (GAP_FULL + GAP_EMPTY) / 2;
    expect(half).toBeLessThan(GAP_FULL);
    expect(s.tick(half - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('windup', 'jab')]);
    // A phase's own gap, measured the same way.
    const t = attacking(2);
    expect(t.tick(1000 - 1, true)).toEqual([]);
    expect(t.tick(1, true)).toEqual([win('windup', 'jab')]);
    t.tick(JAB_MS, true);
    expect(t.window).toBe('gap');
    t.damage(10);
    expect(t.tick(700 - 1, true)).toEqual([]);
    expect(t.tick(1, true)).toEqual([win('windup', 'slam')]);
  });

  it('returns to the gap when the phase changes mid-attack', () => {
    for (const [ms, window] of [
      [GAP_FULL + 100, 'windup'],
      [GAP_FULL + jab.windupMs + 100, 'live'],
      [GAP_FULL + jab.windupMs + jab.liveMs + 100, 'recover'],
    ] as const) {
      const s = attacking();
      s.tick(ms, true);
      expect(s.window).toBe(window);
      expect(s.damage(12), window).toEqual([win('gap'), { type: 'phase', phase: 1 }]);
      expect(s.window, window).toBe('gap');
      expect(s.attack, window).toBeNull();
    }
    // From the gap there is nothing to report but the phase.
    const calm = attacking();
    calm.tick(GAP_FULL - 100, true);
    expect(calm.damage(12)).toEqual([{ type: 'phase', phase: 1 }]);
  });

  it('starts a new phase at the top of its deck, after a whole gap', () => {
    const spec: BossSpec = {
      phases: [
        { hits: 12, deck: [jab, slam] },
        { hits: 8, deck: [jab, slam] },
      ],
    };
    const s = new BossState(spec, BOSS_TUNING.normal);
    // The first phase has played its first attack and is well into the gap before its second.
    s.tick(GAP_FULL + JAB_MS + GAP_FULL - 100, true);
    expect(s.window).toBe('gap');
    expect(s.damage(12)).toEqual([{ type: 'phase', phase: 1 }]);
    expect(s.tick(GAP_FULL - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('windup', 'jab')]);
  });

  it('returns to the gap when the fight stops for a scene or for the end', () => {
    const scened: BossSpec = {
      phases: [
        { hits: 12, deck: [jab] },
        { hits: 8, enterMs: ENTER_MS, deck: [slam] },
      ],
      deathMs: DEATH_MS,
    };
    const s = new BossState(scened, BOSS_TUNING.normal);
    s.tick(GAP_FULL + jab.windupMs + 100, true);
    expect(s.window).toBe('live');
    expect(s.damage(12)).toEqual([win('gap'), { type: 'phase', phase: 1 }, step('transition')]);
    expect(s.window).toBe('gap');
    // Nothing attacks during the scene, and the gap starts over after it.
    expect(s.tick(ENTER_MS - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([step('fight')]);
    expect(s.tick(GAP_FULL - 1, true)).toEqual([]);
    expect(s.tick(1, true)).toEqual([win('windup', 'slam')]);
    expect(s.damage(8)).toEqual([win('gap'), step('finale')]);
    expect(s.window).toBe('gap');
    expect(s.attack).toBeNull();
    expect(s.tick(DEATH_MS + AFTERMATH_MS, true)).toEqual([step('aftermath'), step('done')]);
    expect(s.window).toBe('gap');
  });

  it('ends the attack on a lost life, and plays the next one after REGROUP_MS', () => {
    for (const [ms, window] of [
      [GAP_FULL + 100, 'windup'],
      [GAP_FULL + jab.windupMs + 100, 'live'],
      [GAP_FULL + jab.windupMs + jab.liveMs + 100, 'recover'],
    ] as const) {
      const s = attacking();
      s.tick(ms, true);
      expect(s.window).toBe(window);
      expect(s.onLifeLost(), window).toEqual([win('gap')]);
      expect(s.window, window).toBe('gap');
      expect(s.attack, window).toBeNull();
      // The breather is time with a ball in play.
      expect(s.tick(60_000, false), window).toEqual([]);
      expect(s.tick(REGROUP_MS - 1, true), window).toEqual([]);
      // The attack that was cut short is not played again.
      expect(s.tick(1, true), window).toEqual([win('windup', 'slam')]);
    }
  });

  it('keeps a gap going for at least REGROUP_MS after a lost life', () => {
    // Late in the gap: the wind-up waits for the breather.
    const late = attacking();
    late.tick(GAP_FULL - 200, true);
    expect(late.onLifeLost()).toEqual([]);
    expect(late.window).toBe('gap');
    expect(late.tick(REGROUP_MS - 1, true)).toEqual([]);
    expect(late.tick(1, true)).toEqual([win('windup', 'jab')]);
    // Early in the gap: it ends when it would have anyway, no sooner.
    const early = attacking();
    early.tick(300, true);
    expect(early.onLifeLost()).toEqual([]);
    expect(early.tick(GAP_FULL - 300 - 1, true)).toEqual([]);
    expect(early.tick(1, true)).toEqual([win('windup', 'jab')]);
    // The gap after the next attack is an ordinary one again.
    early.tick(JAB_MS, true);
    expect(early.window).toBe('gap');
    expect(early.tick(GAP_FULL - 1, true)).toEqual([]);
    expect(early.tick(1, true)).toEqual([win('windup', 'slam')]);
  });

  it('ignores a lost life outside the fight', () => {
    const s = new BossState(armed, BOSS_TUNING.normal, { intro: true });
    expect(s.onLifeLost()).toEqual([]);
    const dead = attacking(2);
    dead.damage(20);
    expect(dead.step).toBe('finale');
    expect(dead.onLifeLost()).toEqual([]);
    expect(dead.window).toBe('gap');
  });
});

const SHRINK: PaddleEffect = { kind: 'shrink', factor: 0.8 };
const JAM: PaddleEffect = { kind: 'jam', ms: 600 };
const beam = (x: number, width: number, at: number, liveMs: number): HazardSpec => {
  return { kind: 'beam', x, width, at, liveMs, onPaddle: SHRINK };
};
const shot = (
  x: number,
  at: number,
  onPaddle: PaddleEffect = SHRINK,
  flightMs = MIN_FLIGHT_MS,
  from = 'body',
): HazardSpec => {
  return { kind: 'shot', from, x, at, flightMs, onPaddle };
};
const skull = (x: number, at: number, flightMs = MIN_SKULL_FLIGHT_MS): HazardSpec => {
  return { kind: 'skull', from: 'core', x, at, flightMs };
};
const plan = (...hazards: HazardSpec[]): AttackPlan => ({ hazards });
const MID = FIELD_WIDTH / 2;

describe('safeGap', () => {
  it('is the whole field for an empty plan', () => {
    expect(safeGap(plan())).toBe(FIELD_WIDTH);
    expect(FIELD_WIDTH).toBe(600);
  });

  it('is the wider side of a single beam', () => {
    expect(safeGap(plan(beam(300, 100, 0, 500)))).toBe(250);
    expect(safeGap(plan(beam(150, 100, 0, 500)))).toBe(400);
    // A beam against the wall leaves everything beyond it.
    expect(safeGap(plan(beam(0, 100, 0, 500)))).toBe(550);
    expect(safeGap(plan(beam(MID, FIELD_WIDTH, 0, 500)))).toBe(0);
  });

  it('counts two beams together while both burn, and apart when they do not', () => {
    // Together they leave 0..100, 200..400 and 500..600.
    expect(safeGap(plan(beam(150, 100, 0, 500), beam(450, 100, 200, 500)))).toBe(200);
    // One after the other, each leaves 400 on its far side.
    expect(safeGap(plan(beam(150, 100, 0, 500), beam(450, 100, 600, 300)))).toBe(400);
    // The order they are written in does not matter.
    expect(safeGap(plan(beam(450, 100, 200, 500), beam(150, 100, 0, 500)))).toBe(200);
  });

  it('counts a shot only within LAND_MS of its landing', () => {
    const lands = 200 + MIN_FLIGHT_MS;
    const falling = shot(150, 200);
    // Alone the shot leaves 440 and the beam 300.
    expect(safeGap(plan(falling))).toBe(FIELD_WIDTH - 150 - SHOT_RADIUS);
    // A beam over 300..600 that is out before the shot comes down, or lit after it is gone.
    expect(safeGap(plan(falling, beam(450, 300, 0, lands - LAND_MS - 1)))).toBe(300);
    expect(safeGap(plan(falling, beam(450, 300, lands + LAND_MS + 1, 300)))).toBe(300);
    // The same beam still burning as the shot lands: only 0..140 and 160..300 are left.
    expect(safeGap(plan(falling, beam(450, 300, 0, lands - LAND_MS)))).toBe(140);
    expect(safeGap(plan(falling, beam(450, 300, lands + LAND_MS, 300)))).toBe(140);
    expect(safeGap(plan(falling, beam(450, 300, lands, 10)))).toBe(140);
  });

  it('gives a skull SKULL_RADIUS and a shot SHOT_RADIUS', () => {
    expect(safeGap(plan(skull(MID, 0)))).toBe(MID - SKULL_RADIUS);
    expect(safeGap(plan(shot(MID, 0)))).toBe(MID - SHOT_RADIUS);
    expect(SKULL_RADIUS).toBeGreaterThan(SHOT_RADIUS);
  });
});

describe('planProblems', () => {
  const PARTS = ['body', 'core'];
  const attack = { liveMs: 2000 };
  const problems = (p: AttackPlan, liveMs = attack.liveMs) => planProblems(p, { liveMs }, PARTS);

  it('passes a fair plan', () => {
    // A skull with shrinking shots and a beam, none on the line at the same time.
    expect(
      problems(plan(skull(300, 0), shot(100, 0), shot(500, 300), beam(450, 200, 0, 400))),
    ).toEqual([]);
    // A row of jamming shots with one side left free.
    const row = [0, 1, 2, 3, 4].map((i) => shot(200 + 40 * i, 70 * i, JAM));
    expect(problems(plan(...row))).toEqual([]);
    expect(problems(plan())).toEqual([]);
  });

  it('reports more hazards than MAX_HAZARDS', () => {
    const many = (n: number) => plan(...Array.from({ length: n }, (_, i) => shot(300, 10 * i)));
    expect(problems(many(MAX_HAZARDS))).toEqual([]);
    expect(problems(many(MAX_HAZARDS + 1))).toHaveLength(1);
  });

  it('reports a hazard that starts before the attack is live', () => {
    expect(problems(plan(shot(300, -1)))).toHaveLength(1);
    expect(problems(plan(beam(300, 100, -1, 400)))).toHaveLength(1);
    expect(problems(plan(skull(300, -1)))).toHaveLength(1);
  });

  it('reports a hazard that ends after the attack does', () => {
    const { liveMs } = attack;
    expect(problems(plan(shot(300, liveMs - MIN_FLIGHT_MS)))).toEqual([]);
    expect(problems(plan(shot(300, liveMs - MIN_FLIGHT_MS + 1)))).toHaveLength(1);
    expect(problems(plan(beam(300, 100, liveMs - 400, 400)))).toEqual([]);
    expect(problems(plan(beam(300, 100, liveMs - 400, 401)))).toHaveLength(1);
    expect(problems(plan(skull(300, liveMs - MIN_SKULL_FLIGHT_MS)))).toEqual([]);
    expect(problems(plan(skull(300, liveMs - MIN_SKULL_FLIGHT_MS + 1)))).toHaveLength(1);
  });

  it('reports a shot that flies less than MIN_FLIGHT_MS', () => {
    expect(problems(plan(shot(300, 0, SHRINK, MIN_FLIGHT_MS)))).toEqual([]);
    expect(problems(plan(shot(300, 0, SHRINK, MIN_FLIGHT_MS - 1)))).toHaveLength(1);
  });

  it('reports a skull that flies less than MIN_SKULL_FLIGHT_MS', () => {
    expect(problems(plan(skull(300, 0, MIN_SKULL_FLIGHT_MS)))).toEqual([]);
    expect(problems(plan(skull(300, 0, MIN_SKULL_FLIGHT_MS - 1)))).toHaveLength(1);
    // A shot's floor is not enough for a skull.
    expect(MIN_SKULL_FLIGHT_MS).toBeGreaterThan(MIN_FLIGHT_MS);
  });

  it('reports more skulls than MAX_SKULLS', () => {
    // Far enough apart in time that each has the line to itself.
    const skulls = (n: number) => plan(...Array.from({ length: n }, (_, i) => skull(300, 400 * i)));
    const liveMs = MIN_SKULL_FLIGHT_MS + 400 * MAX_SKULLS;
    expect(problems(skulls(MAX_SKULLS), liveMs)).toEqual([]);
    expect(problems(skulls(MAX_SKULLS + 1), liveMs)).toHaveLength(1);
  });

  it('reports a skull together with a jam', () => {
    expect(problems(plan(skull(300, 0), shot(100, 0, SHRINK)))).toEqual([]);
    expect(problems(plan(skull(300, 0), shot(100, 0, JAM)))).toHaveLength(1);
    const jamming: HazardSpec = {
      kind: 'beam',
      x: 100,
      width: 100,
      at: 0,
      liveMs: 400,
      onPaddle: JAM,
    };
    expect(problems(plan(skull(300, 0), jamming))).toHaveLength(1);
  });

  it('reports a jam longer than MAX_JAM_MS', () => {
    expect(problems(plan(shot(300, 0, { kind: 'jam', ms: MAX_JAM_MS })))).toEqual([]);
    expect(problems(plan(shot(300, 0, { kind: 'jam', ms: MAX_JAM_MS + 1 })))).toHaveLength(1);
  });

  it('reports a shrink outside 0.6 to 1', () => {
    for (const factor of [0.6, 0.8, 1]) {
      expect(problems(plan(shot(300, 0, { kind: 'shrink', factor }))), `${factor}`).toEqual([]);
    }
    for (const factor of [0.59, 1.01, 0, -1]) {
      expect(problems(plan(shot(300, 0, { kind: 'shrink', factor }))), `${factor}`).toHaveLength(1);
    }
  });

  it('reports an x off the field', () => {
    for (const x of [0, FIELD_WIDTH]) expect(problems(plan(shot(x, 0))), `${x}`).toEqual([]);
    for (const x of [-1, FIELD_WIDTH + 1]) {
      expect(problems(plan(shot(x, 0))), `${x}`).toHaveLength(1);
      expect(problems(plan(skull(x, 0))), `${x}`).toHaveLength(1);
      expect(problems(plan(beam(x, 100, 0, 400))), `${x}`).toHaveLength(1);
    }
  });

  it('reports a hazard from something that is not a part', () => {
    const stray = shot(300, 0, SHRINK, MIN_FLIGHT_MS, 'tail');
    expect(problems(plan(stray))).toHaveLength(1);
    expect(planProblems(plan(stray), attack, [...PARTS, 'tail'])).toEqual([]);
    expect(planProblems(plan(skull(300, 0)), attack, ['body'])).toHaveLength(1);
  });

  it('reports a plan that leaves less than SAFE_GAP free', () => {
    // Two beams with exactly the gap between them, then one px less.
    const left = beam(100, 200, 0, 400);
    expect(safeGap(plan(left, beam(500, 200, 0, 400)))).toBe(SAFE_GAP);
    expect(problems(plan(left, beam(500, 200, 0, 400)))).toEqual([]);
    expect(problems(plan(left, beam(499, 200, 0, 400)))).toHaveLength(1);
    // The same two beams one after the other are fair.
    expect(problems(plan(left, beam(499, 200, 500, 400)))).toEqual([]);
  });

  it('reports every rule a plan breaks, not just the first', () => {
    const bad = plan(
      skull(300, 0, MIN_SKULL_FLIGHT_MS - 1),
      shot(-5, 0, { kind: 'jam', ms: 5000 }),
    );
    // The skull's flight, the shot's x, the jam's length, and a skull with a jam.
    expect(problems(bad)).toHaveLength(4);
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
