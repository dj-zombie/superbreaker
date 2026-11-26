import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The forces extend Phaser's particle processor, and Phaser will not load outside a browser.
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

import { SCENERY_IDS } from '../src/art/backdrops';
import { F, FX_SHEETS, fxFrameNames, packShelves, seq } from '../src/fx/atlas';
import { ABILITY_FX } from '../src/fx/library/abilities';
import { AMBIENT_FX } from '../src/fx/library/ambient';
import { ANGLER_FX } from '../src/fx/library/angler';
import { BOSS_FX } from '../src/fx/library/boss';
import { BRICK_FX } from '../src/fx/library/bricks';
import { ELEMENT_FX } from '../src/fx/library/elements';
import { FANFARE_FX } from '../src/fx/library/fanfare';
import { IMPACT_FX } from '../src/fx/library/impacts';
import { LEVEL_FX } from '../src/fx/library/level';
import { OVERSEER_FX } from '../src/fx/library/overseer';
import { POWERUP_FX } from '../src/fx/library/powerups';
import { SCREEN_FX } from '../src/fx/library/screen';
import { WEAPON_FX } from '../src/fx/library/weapons';
import { WEATHER_FX } from '../src/fx/library/weather';
import {
  clamp01,
  curl,
  fadeCurve,
  lerpColor,
  mulberry32,
  multiplyColor,
  rampColor,
  roll,
  shareBudget,
  sizeCurve,
  tierRank,
  tierScale,
  type Fade,
  type Range,
  type SizeEase,
} from '../src/fx/math';
import { FX_PALETTES, resolveColor, type ColorRef } from '../src/fx/palettes';
import { Attractor, Heat, Turbulence, Vortex, Wind, fxClock } from '../src/fx/processors';
import type { FxDef } from '../src/fx/types';

const GROUPS = {
  ABILITY_FX,
  AMBIENT_FX,
  ANGLER_FX,
  BOSS_FX,
  BRICK_FX,
  LEVEL_FX,
  ELEMENT_FX,
  OVERSEER_FX,
  FANFARE_FX,
  IMPACT_FX,
  POWERUP_FX,
  SCREEN_FX,
  WEAPON_FX,
  WEATHER_FX,
};
const PRESETS: Record<string, FxDef> = Object.assign({}, ...Object.values(GROUPS));
const FRAMES = new Set(fxFrameNames());
const CHANNELS = new Set(['sky', 'low', 'smoke', 'debris', 'glow', 'top', 'front']);
const TIERS = new Set(['low', 'medium', 'high']);
const PALETTE_KEYS = Object.keys(FX_PALETTES.hell).filter((k) => k !== 'party');
const SIZE_EASES: SizeEase[] = ['linear', 'out', 'in', 'expo', 'pop', 'pulse'];
const FADES: Fade[] = ['linear', 'late', 'inOut', 'quick', 'flicker', 'none', 'in'];

function list<T>(v: T | readonly T[] | undefined): readonly T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? (v as readonly T[]) : [v as T];
}

function validColor(ref: ColorRef): boolean {
  if (typeof ref === 'number') return ref >= 0 && ref <= 0xffffff;
  return ref === '@tint' || ref === '@party' || PALETTE_KEYS.includes(ref.slice(1));
}

function validRange(r: Range | undefined): boolean {
  if (r === undefined || typeof r === 'number') return true;
  return r.length === 2 && r[0] <= r[1];
}

/** A fake particle, enough for the forces. */
function particle(x: number, y: number) {
  return { x, y, velocityX: 0, velocityY: 0, lifeCurrent: 1000 } as never as {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    lifeCurrent: number;
  };
}

/** Every `.ts` file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('fx math', () => {
  it('rolls fixed values and ranges', () => {
    expect(roll(undefined, 7)).toBe(7);
    expect(roll(3)).toBe(3);
    expect(roll([10, 20], 0, () => 0)).toBe(10);
    expect(roll([10, 20], 0, () => 0.5)).toBe(15);
  });

  it('keeps every size curve at its ends and every fade inside 0..1', () => {
    for (const ease of SIZE_EASES.filter((e) => e !== 'pulse' && e !== 'pop')) {
      expect(sizeCurve(ease, 0)).toBeCloseTo(0, 5);
      expect(sizeCurve(ease, 1)).toBeCloseTo(1, 2);
    }
    expect(sizeCurve('pop', 0.18)).toBeCloseTo(1.3, 5);
    expect(sizeCurve('pop', 1)).toBeCloseTo(1, 5);
    for (const fade of FADES) {
      for (let t = 0; t <= 1; t += 0.05) {
        const a = fadeCurve(fade, t, 1);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
    expect(fadeCurve('linear', 1)).toBe(0);
    expect(fadeCurve('none', 0.9)).toBe(1);
  });

  it('mixes colors channel by channel', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x7f007f);
    expect(rampColor([], 0.5)).toBe(0xffffff);
    expect(rampColor([0x112233], 0.7)).toBe(0x112233);
    expect(rampColor([0xff0000, 0x00ff00, 0x0000ff], 0.5)).toBe(0x00ff00);
    expect(rampColor([0xff0000, 0x00ff00, 0x0000ff], 2)).toBe(0x0000ff);
    expect(multiplyColor(0xffffff, 0x336699)).toBe(0x336699);
    expect(multiplyColor(0x808080, 0x000000)).toBe(0);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it('resolves palette references, the tint and the party colors', () => {
    const pal = FX_PALETTES.hell;
    expect(resolveColor(0x123456, pal, 0)).toBe(0x123456);
    expect(resolveColor('@tint', pal, 0xabcdef)).toBe(0xabcdef);
    expect(resolveColor('@hot', pal, 0)).toBe(pal.hot);
    expect(pal.party).toContain(resolveColor('@party', pal, 0, () => 0.99));
  });

  it('seeds the same sequence from the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const run = (r: () => number) => Array.from({ length: 8 }, r);
    const first = run(a);
    expect(run(b)).toEqual(first);
    expect(run(c)).not.toEqual(first);
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('packs atlas shelves without overlap inside the width', () => {
    const items = [
      { w: 64, h: 64 },
      { w: 128, h: 32 },
      { w: 40, h: 90 },
      { w: 200, h: 20 },
      { w: 64, h: 64 },
    ];
    const { at: spots, height } = packShelves(items, 256);
    spots.forEach((s, i) => {
      expect(s.x + items[i]!.w).toBeLessThanOrEqual(256);
      expect(s.y + items[i]!.h).toBeLessThanOrEqual(height);
      for (let j = 0; j < i; j++) {
        const o = spots[j]!;
        const apart =
          s.x >= o.x + items[j]!.w ||
          o.x >= s.x + items[i]!.w ||
          s.y >= o.y + items[j]!.h ||
          o.y >= s.y + items[i]!.h;
        expect(apart).toBe(true);
      }
    });
  });
});

describe('fx budget and tiers', () => {
  it('passes a burst through untouched when the budget covers it', () => {
    expect(shareBudget([10, 4, 6], [false, false, false], 100)).toEqual([10, 4, 6]);
  });

  it('scales every layer by the same share when the budget runs short', () => {
    expect(shareBudget([40, 20, 20], [false, false, false], 40)).toEqual([20, 10, 10]);
    expect(shareBudget([10, 10], [false, false], 0)).toEqual([0, 0]);
  });

  it('keeps one particle of an essential layer however little is left', () => {
    expect(shareBudget([30, 30], [true, false], 0)).toEqual([1, 0]);
    expect(shareBudget([30, 1], [false, true], -50)).toEqual([0, 1]);
    // An essential layer that asked for nothing still gets nothing.
    expect(shareBudget([0, 5], [true, false], 0)).toEqual([0, 0]);
  });

  it('never hands out more than was asked for', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const wants = Array.from({ length: 4 }, () => Math.floor(r() * 40));
      const essential = wants.map(() => r() < 0.3);
      const got = shareBudget(wants, essential, Math.floor(r() * 120) - 20);
      got.forEach((n, j) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(Math.max(wants[j]!, essential[j] && wants[j]! > 0 ? 1 : 0));
      });
    }
  });

  it('orders the tiers, with fewer particles on lower ones', () => {
    expect(tierRank('low')).toBeLessThan(tierRank('medium'));
    expect(tierRank('medium')).toBeLessThan(tierRank('high'));
    expect(tierScale('high')).toBe(1);
    expect(tierScale('low')).toBeLessThan(tierScale('medium'));
    expect(tierScale('medium')).toBeLessThan(tierScale('high'));
  });
});

describe('fx forces', () => {
  it('curls without sources or sinks, and stays bounded', () => {
    const at = { x: 0, y: 0 };
    const h = 0.01;
    const r = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const x = r() * 600;
      const y = r() * 1200;
      const t = r() * 10;
      curl(x + h, y, t, at);
      const ax = at.x;
      curl(x - h, y, t, at);
      const bx = at.x;
      curl(x, y + h, t, at);
      const ay = at.y;
      curl(x, y - h, t, at);
      const by = at.y;
      const divergence = (ax - bx) / (2 * h) + (ay - by) / (2 * h);
      expect(Math.abs(divergence)).toBeLessThan(1e-4);
      curl(x, y, t, at);
      expect(Math.hypot(at.x, at.y)).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    }
  });

  it('gives the same push for the same particle and clock', () => {
    const forces = () => [
      new Turbulence(80, 1.2),
      new Vortex(300, 400),
      new Attractor(100, 100),
      new Wind(),
      new Heat(),
    ];
    const run = () => {
      fxClock.t = 1.75;
      const p = particle(240, 520);
      for (let i = 0; i < 30; i++)
        for (const f of forces()) f.update(p as never, 16, 0.016, i / 30);
      return [p.velocityX, p.velocityY];
    };
    expect(run()).toEqual(run());
  });

  it('swallows what crosses a vortex horizon and pulls the rest in', () => {
    const v = new Vortex(0, 0, 0, 300, 200, 10);
    const inside = particle(3, 4);
    v.update(inside as never, 16, 0.016);
    expect(inside.lifeCurrent).toBe(0);
    const outside = particle(100, 0);
    v.update(outside as never, 16, 0.016);
    expect(outside.lifeCurrent).toBe(1000);
    expect(outside.velocityX).toBeLessThan(0);
  });

  it('steers toward an attractor and catches on arrival', () => {
    const a = new Attractor(0, 0, 600, 5, 10);
    const p = particle(200, 0);
    a.update(p as never, 16, 0.016);
    expect(p.velocityX).toBeLessThan(0);
    const near = particle(4, 0);
    a.update(near as never, 16, 0.016);
    expect(near.lifeCurrent).toBe(0);
  });

  it('lifts hardest at the start of a life', () => {
    const heat = new Heat(200);
    const young = particle(0, 0);
    const old = particle(0, 0);
    heat.update(young as never, 16, 0.016, 0);
    heat.update(old as never, 16, 0.016, 0.9);
    expect(young.velocityY).toBeLessThan(old.velocityY);
    expect(old.velocityY).toBeLessThan(0);
  });
});

describe('fx presets', () => {
  it('gives every preset one id across all groups', () => {
    const seen = new Map<string, string>();
    for (const [group, defs] of Object.entries(GROUPS)) {
      for (const id of Object.keys(defs)) {
        expect(seen.get(id), `${id} is in ${seen.get(id)} and ${group}`).toBeUndefined();
        seen.set(id, group);
      }
    }
    expect(seen.size).toBeGreaterThan(80);
  });

  it('names ids as group.name', () => {
    for (const id of Object.keys(PRESETS)) expect(id).toMatch(/^[a-z]+\.[a-z0-9_]+$/);
  });

  it('defines every flipbook sheet in the frame list', () => {
    for (const [sheet, n] of Object.entries(FX_SHEETS)) {
      for (const f of seq(sheet, n)) expect(FRAMES.has(f), f).toBe(true);
    }
    for (const frames of Object.values(F))
      for (const f of frames) expect(FRAMES.has(f), f).toBe(true);
  });

  it('gives every world a full palette', () => {
    for (const id of SCENERY_IDS) {
      const pal = FX_PALETTES[id];
      expect(pal, id).toBeDefined();
      for (const key of PALETTE_KEYS)
        expect(typeof pal[key as keyof typeof pal], `${id}.${key}`).toBe('number');
      expect(pal.party.length, id).toBeGreaterThan(0);
    }
  });

  for (const [id, def] of Object.entries(PRESETS)) {
    it(`${id} is well formed`, () => {
      const parts =
        (def.layers?.length ?? 0) + (def.sprites?.length ?? 0) + (def.then?.length ?? 0);
      expect(parts + (def.ribbon ? 1 : 0), 'draws nothing').toBeGreaterThan(0);
      for (const [i, l] of (def.layers ?? []).entries()) {
        const at = `${id} layer ${i}`;
        expect(CHANNELS.has(l.channel), `${at} channel ${l.channel}`).toBe(true);
        for (const f of [...list(l.frames), ...(l.anim?.frames ?? [])])
          expect(FRAMES.has(f), `${at} frame ${f}`).toBe(true);
        expect(l.count !== undefined || l.rate !== undefined, `${at} has no count or rate`).toBe(
          true,
        );
        if (l.rate !== undefined) expect(l.rate, at).toBeGreaterThan(0);
        for (const r of [
          l.count,
          l.life,
          l.delay,
          l.speed,
          l.angle,
          l.size,
          l.rotate,
          l.spin,
          l.alpha,
        ]) {
          expect(validRange(r), `${at} range ${JSON.stringify(r)}`).toBe(true);
        }
        expect(typeof l.life === 'number' ? l.life : l.life[0], `${at} life`).toBeGreaterThan(0);
        expect(typeof l.size === 'number' ? l.size : l.size[0], `${at} size`).toBeGreaterThan(0);
        for (const c of [...list(l.color), ...(l.pick ?? [])])
          expect(validColor(c), `${at} color ${c}`).toBe(true);
        if (l.minTier) expect(TIERS.has(l.minTier), at).toBe(true);
        for (const w of l.only ?? []) expect(SCENERY_IDS as readonly string[], at).toContain(w);
        if (l.sizeEase) expect(SIZE_EASES, at).toContain(l.sizeEase);
        if (l.fade) expect(FADES, at).toContain(l.fade);
        if (l.onDeath) expect(PRESETS[l.onDeath], `${at} onDeath ${l.onDeath}`).toBeDefined();
        if (l.deathChance !== undefined) {
          expect(l.deathChance).toBeGreaterThan(0);
          expect(l.deathChance).toBeLessThanOrEqual(1);
        }
      }
      for (const [i, s] of (def.sprites ?? []).entries()) {
        const at = `${id} sprite ${i}`;
        expect(FRAMES.has(s.frame), `${at} frame ${s.frame}`).toBe(true);
        expect(s.life, at).toBeGreaterThan(0);
        for (const r of [s.from, s.to, s.rotate, s.spin, s.dx, s.dy])
          expect(validRange(r), at).toBe(true);
        for (const c of list(s.color)) expect(validColor(c), `${at} color ${c}`).toBe(true);
        if (s.minTier) expect(TIERS.has(s.minTier), at).toBe(true);
        for (const w of s.only ?? []) expect(SCENERY_IDS as readonly string[], at).toContain(w);
      }
      for (const step of def.then ?? []) {
        expect(PRESETS[step.fx], `${id} then ${step.fx}`).toBeDefined();
        expect(step.fx, `${id} plays itself`).not.toBe(id);
        expect(step.at).toBeGreaterThanOrEqual(0);
      }
      if (def.light) expect(validColor(def.light.color), `${id} light`).toBe(true);
      if (def.ribbon) {
        expect(validColor(def.ribbon.color), `${id} ribbon`).toBe(true);
        if (def.ribbon.tail) expect(validColor(def.ribbon.tail), `${id} ribbon tail`).toBe(true);
        expect(def.ribbon.width).toBeGreaterThan(0);
        expect(def.ribbon.life).toBeGreaterThan(0);
      }
    });
  }

  it('has a preset for every id the game asks for', () => {
    const groups = [...new Set(Object.keys(PRESETS).map((id) => id.split('.')[0]))].join('|');
    const pattern = new RegExp(`'((?:${groups})\\.[a-z0-9_]+)'`, 'g');
    const missing: string[] = [];
    for (const file of sources('src')) {
      if (file.includes(join('src', 'fx', 'library'))) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(pattern)) {
        if (!PRESETS[m[1]!]) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
