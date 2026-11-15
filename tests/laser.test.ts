import { describe, expect, it } from 'vitest';
import { powerupStats } from '../src/core/Economy';
import {
  ARMOR_CHIP,
  LASER_COOL_MS,
  LASER_MODES,
  LASER_MODE_DEFS,
  LASER_SPIN_UP_MS,
  chipArmor,
  laserCadence,
  laserClearCeiling,
  laserSchedule,
  rollLaserMode,
  volleyGap,
} from '../src/core/Laser';

const stats = (laser: number) => powerupStats({ magnet: 1, fireball: 1, laser });
const TIERS = [1, 2, 3, 4, 5];
/** What the old twin-barrel laser could break per tier: 22 to 46 damage bolts, two at a time. */
const OLD_CEILING = [6, 9, 14, 18, 22];

describe('laser balance', () => {
  for (const mode of LASER_MODES) {
    it(`keeps ${mode} from clearing a small level, even fully upgraded`, () => {
      const tiers = TIERS.map((t) => laserClearCeiling(stats(t), mode));
      expect(tiers[0]).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThan(tiers[i - 1]!);
      expect(tiers[4]).toBeGreaterThan(tiers[0]! * 2);
      expect(tiers[4]).toBeLessThan(30);
    });

    it(`keeps ${mode} within a fifth of the old laser at every tier`, () => {
      TIERS.forEach((t, i) => {
        expect(laserClearCeiling(stats(t), mode)).toBeLessThanOrEqual(
          Math.ceil(OLD_CEILING[i]! * 1.2),
        );
      });
    });

    it(`never lets one ${mode} bolt break a standard brick`, () => {
      for (const t of TIERS) {
        const { damage } = laserSchedule(mode, stats(t));
        expect(damage).toBeGreaterThan(0);
        expect(damage).toBeLessThan(100);
        expect(damage * 4).toBe(Math.round(damage * 4));
      }
    });

    it(`shares the ${mode} budget over every bolt it fires`, () => {
      for (const t of TIERS) {
        const s = stats(t);
        const plan = laserSchedule(mode, s);
        const budget = s.laserBudget * LASER_MODE_DEFS[mode].efficiency;
        expect(Math.abs(plan.bolts * plan.damage - budget)).toBeLessThanOrEqual(plan.bolts * 0.125);
      }
    });
  }

  it('fires more bolts at higher tiers', () => {
    for (const mode of LASER_MODES) {
      expect(laserSchedule(mode, stats(5)).bolts).toBeGreaterThan(
        laserSchedule(mode, stats(1)).bolts,
      );
    }
  });

  it('plans the same pickup the same way every time', () => {
    for (const mode of LASER_MODES) {
      expect(laserSchedule(mode, stats(3))).toEqual(laserSchedule(mode, stats(3)));
    }
  });

  it('fires two bolts per helix volley and a five-way scatter every fourth volley', () => {
    const helix = laserSchedule('helix', stats(1));
    expect(helix.bolts).toBe(helix.volleys * 2);
    const scatter = LASER_MODE_DEFS.scatter;
    expect([0, 1, 2, 3, 4, 7].map((i) => scatter.bolts(i))).toEqual([3, 3, 3, 5, 3, 5]);
  });
});

describe('laserCadence', () => {
  const long = 60_000;

  it('spins up from a third of full speed', () => {
    expect(laserCadence(0, long)).toBeCloseTo(0.35);
    expect(laserCadence(LASER_SPIN_UP_MS / 2, long)).toBeGreaterThan(0.35);
    expect(laserCadence(LASER_SPIN_UP_MS / 2, long)).toBeLessThan(1);
    expect(laserCadence(LASER_SPIN_UP_MS, long)).toBeCloseTo(1);
  });

  it('runs at full speed in the middle and sags as it overheats', () => {
    expect(laserCadence(2_000, long)).toBe(1);
    expect(laserCadence(2_000, LASER_COOL_MS / 2)).toBeLessThan(1);
    expect(laserCadence(2_000, 0)).toBeCloseTo(0.45);
  });

  it('only ever slows the fire rate', () => {
    for (let t = 0; t <= 5_000; t += 100) {
      const c = laserCadence(t, 5_000 - t);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('waits longer between volleys while spinning up', () => {
    const s = stats(1);
    expect(volleyGap('gun', s, 0, long)).toBeGreaterThan(volleyGap('gun', s, 2_000, long));
  });
});

describe('rollLaserMode', () => {
  const sweep = (previous?: (typeof LASER_MODES)[number]) =>
    Array.from({ length: 1000 }, (_, i) => rollLaserMode(() => i / 1000, previous));

  it('reaches every mode', () => {
    expect(new Set(sweep())).toEqual(new Set(LASER_MODES));
  });

  it('never rolls the same mode twice in a row', () => {
    for (const previous of LASER_MODES) {
      const rolls = sweep(previous);
      expect(rolls).not.toContain(previous);
      expect(new Set(rolls).size).toBe(LASER_MODES.length - 1);
    }
  });

  it('rolls the swarm less often, since it hardly misses', () => {
    const rolls = sweep();
    const count = (m: string) => rolls.filter((r) => r === m).length;
    expect(count('swarm')).toBeLessThan(count('gun'));
  });
});

describe('chipArmor', () => {
  it('banks damage until it breaks a point', () => {
    expect(chipArmor(2, 0, ARMOR_CHIP - 1)).toEqual({ armor: 2, banked: ARMOR_CHIP - 1 });
    expect(chipArmor(2, ARMOR_CHIP - 1, 1)).toEqual({ armor: 1, banked: 0 });
  });

  it('can break more than one point with a big hit', () => {
    expect(chipArmor(3, 0, ARMOR_CHIP * 2 + 5)).toEqual({ armor: 1, banked: 5 });
  });

  it('empties the bank once the armor is gone', () => {
    expect(chipArmor(1, 20, ARMOR_CHIP)).toEqual({ armor: 0, banked: 0 });
    expect(chipArmor(0, 0, 10)).toEqual({ armor: 0, banked: 0 });
  });
});
