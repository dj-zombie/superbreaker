import { describe, expect, it } from 'vitest';
import { LIGHTING_LOOKS, resolveLook, sceneryLight } from '../src/art/lighting';
import {
  FLICKERS,
  LEVEL_LIGHTING_DEFAULTS,
  LIGHTS_OUT_DEFAULTS,
  MAX_FLASH_HZ,
  accumulate,
  falloff,
  flickerAt,
  hash,
  lightWeight,
  mixColor,
  parseColor,
  pointOnPath,
  rgbToColor,
  selectLights,
  red,
  sputter,
  type LevelLightingSpec,
  type SampleLight,
} from '../src/core/Lighting';

describe('parseColor', () => {
  it('reads Tiled #AARRGGBB and #RRGGBB colors', () => {
    expect(parseColor('#ff112233')).toBe(0x112233);
    expect(parseColor('#80ffaa00')).toBe(0xffaa00);
    expect(parseColor('#ffaa00')).toBe(0xffaa00);
    expect(parseColor('#fa0')).toBe(0xffaa00);
    expect(parseColor('0x00ff00')).toBe(0x00ff00);
    expect(parseColor(0x123456)).toBe(0x123456);
  });

  it('treats empty or invalid values as unset', () => {
    expect(parseColor('')).toBeUndefined();
    expect(parseColor('orange')).toBeUndefined();
    expect(parseColor(undefined)).toBeUndefined();
  });
});

describe('falloff', () => {
  it('is 1 at the center, 0 at the radius and decreasing between', () => {
    expect(falloff(0, 100)).toBe(1);
    expect(falloff(100 * 100, 100)).toBe(0);
    expect(falloff(200 * 200, 100)).toBe(0);
    let prev = 1;
    for (let d = 5; d < 100; d += 5) {
      const v = falloff(d * d, 100);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
});

describe('flickerAt', () => {
  it('stays within a sane range for every preset', () => {
    for (const kind of FLICKERS) {
      for (let t = 0; t < 20; t += 0.013) {
        const v = flickerAt(kind, t, 1);
        expect(v).toBeGreaterThanOrEqual(0.1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic', () => {
    expect(flickerAt('candle', 3.21, 1.4)).toBe(flickerAt('candle', 3.21, 1.4));
  });

  it('never strobes faster than the photosensitivity cap, even when asked to', () => {
    let flashes = 0;
    let wasOn = false;
    for (let t = 0; t < 10; t += 0.001) {
      const on = flickerAt('strobe', t, 20) > 0.5;
      if (on && !wasOn) flashes++;
      wasOn = on;
    }
    expect(flashes / 10).toBeLessThanOrEqual(MAX_FLASH_HZ + 0.1);
  });

  it('keeps glitch drop-outs under three in any second', () => {
    const drops: number[] = [];
    let was = false;
    for (let t = 0; t < 120; t += 0.005) {
      const off = flickerAt('glitch', t) < 0.5;
      if (off && !was) drops.push(t);
      was = off;
    }
    expect(drops.length).toBeGreaterThan(0);
    for (let i = 2; i < drops.length; i++) expect(drops[i]! - drops[i - 2]!).toBeGreaterThan(1);
  });

  it('turns strobes and glitches off and calms candles in reduced motion', () => {
    for (let t = 0; t < 5; t += 0.01) {
      expect(flickerAt('strobe', t, 1, true)).toBe(0.8);
      expect(flickerAt('glitch', t, 1, true)).toBe(1);
      expect(flickerAt('candle', t, 1, true)).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe('pointOnPath', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('walks the polyline', () => {
    expect(pointOnPath(path, 50, true)).toEqual({ x: 50, y: 0 });
    expect(pointOnPath(path, 150, true)).toEqual({ x: 100, y: 50 });
  });

  it('bounces back with pingpong', () => {
    expect(pointOnPath(path, 250, true)).toEqual({ x: 100, y: 50 });
    expect(pointOnPath(path, 400, true)).toEqual({ x: 0, y: 0 });
  });

  it('closes the loop without pingpong', () => {
    const p = pointOnPath(path, 200 + Math.SQRT2 * 50, false);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(50);
  });
});

describe('sampling', () => {
  const point: SampleLight = { x: 0, y: 0, radius: 100, r: 1, g: 0.5, b: 0 };

  it('adds colored light into the output buffer', () => {
    const out = new Float32Array(3);
    accumulate([point], 0, 0, out, 0);
    expect(Array.from(out)).toEqual([1, 0.5, 0]);
    accumulate([point], 200, 0, out, 0);
    expect(Array.from(out)).toEqual([1, 0.5, 0]);
  });

  it('lights the inside of a rotated area light only', () => {
    const area: SampleLight = {
      x: 0,
      y: 0,
      radius: 0,
      r: 1,
      g: 1,
      b: 1,
      area: {
        width: 100,
        height: 40,
        cos: Math.cos(Math.PI / 2),
        sin: Math.sin(Math.PI / 2),
        shaft: false,
      },
    };
    // Rotated 90 degrees clockwise, the rectangle hangs below and to the left of the pivot.
    expect(lightWeight(area, -20, 50)).toBeGreaterThan(0.5);
    expect(lightWeight(area, 50, 20)).toBe(0);
  });
});

describe('selectLights', () => {
  const view = { x: 0, y: 0, width: 600, height: 800 };
  const make = (x: number, priority: number, level = 1) => ({
    x,
    y: 100,
    radius: 50,
    priority,
    level,
  });

  it('drops lights outside the view and dark lights', () => {
    const picked = selectLights([make(100, 0), make(-200, 0), make(200, 0, 0)], 10, view);
    expect(picked).toHaveLength(1);
  });

  it('keeps gameplay lights first when over budget', () => {
    const lights = [make(100, 0, 2), make(200, 5, 0.5), make(300, 0, 1)];
    const picked = selectLights(lights, 2, view);
    expect(picked.map((l) => l.x)).toEqual([200, 100]);
  });
});

describe('color helpers', () => {
  it('mixes and clamps', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(rgbToColor(0.5, 0.5, 0.5));
    expect(rgbToColor(2, -1, 0.5)).toBe(0xff0080);
  });
});

describe('resolveLook', () => {
  const lightsOut = (extra: Partial<LevelLightingSpec> = {}) =>
    resolveLook('crypt', { ...LEVEL_LIGHTING_DEFAULTS, lightsOut: true, ...extra });

  it('leaves normal levels on the world look', () => {
    const look = resolveLook('crypt', LEVEL_LIGHTING_DEFAULTS);
    expect(look).toEqual(LIGHTING_LOOKS.crypt);
    expect(look.darkness).toBeUndefined();
    expect(look.lightning).toBeUndefined();
  });

  it('darkens lights-out levels and shrinks the lantern as darkness rises', () => {
    const dim = lightsOut({ darkness: 0.3 });
    const dark = lightsOut({ darkness: 1 });
    expect(red(dark.ambient)).toBeLessThan(red(dim.ambient));
    expect(dark.brickFloor).toBe(0);
    expect(dark.brickFloor).toBeLessThan(dim.brickFloor);
    expect(dark.ball.radius).toBeLessThan(dim.ball.radius);
    // The ball stays the brightest thing on screen.
    expect(dark.ball.intensity).toBeGreaterThan(LIGHTING_LOOKS.crypt.ball.intensity);
  });

  it('uses the lights-out defaults for values the map leaves unset', () => {
    const look = lightsOut();
    expect(look.darkness).toBe(LIGHTS_OUT_DEFAULTS.darkness);
    expect(look.preview).toBe(LIGHTS_OUT_DEFAULTS.previewTime);
    expect(look.sputter).toBe(true);
    // Dark, but not black: the bricks still read as shapes away from the lantern.
    expect(look.brickFloor).toBeGreaterThan(0.06);
    expect(look.brickFloor).toBeLessThan(0.12);
    expect(red(look.ambient)).toBeGreaterThan(0.04);
    expect(red(look.ambient)).toBeLessThan(0.1);
    expect(lightsOut({ lanternRadius: 90, previewTime: 0 })).toMatchObject({
      ball: { radius: 90 },
      preview: 0,
    });
  });

  it('only sets a lightning interval when the level asks for lightning', () => {
    expect(lightsOut().lightning).toBeUndefined();
    expect(lightsOut({ lightning: true, lightningInterval: 6 }).lightning).toBe(6);
  });

  it('lets a lights-out level turn the sputtering room lights off', () => {
    expect(lightsOut({ sputter: false }).sputter).toBe(false);
  });
});

describe('sputter', () => {
  const seeded = (seed: number) => {
    let n = seed;
    return () => hash(n++);
  };

  it('never starts more blinks in a second than the photosensitivity cap allows', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const blinks = sputter(seeded(seed * 97));
      for (let i = 0; i < blinks.length; i++) {
        const inSecond = blinks.filter((b) => b.at >= blinks[i]!.at && b.at < blinks[i]!.at + 1);
        expect(inSecond.length).toBeLessThanOrEqual(Math.floor(MAX_FLASH_HZ));
      }
    }
  });

  it('blinks two to five times, each one dark again before the next', () => {
    for (let seed = 0; seed < 500; seed++) {
      const blinks = sputter(seeded(seed * 31));
      expect(blinks.length).toBeGreaterThanOrEqual(2);
      expect(blinks.length).toBeLessThanOrEqual(5);
      expect(blinks[0]!.at).toBe(0);
      for (const [i, b] of blinks.entries()) {
        expect(b.level).toBeGreaterThan(0);
        expect(b.level).toBeLessThan(1);
        const next = blinks[i + 1];
        if (next) expect(next.at).toBeGreaterThan(b.at + b.hold);
      }
    }
  });
});

describe('sceneryLight', () => {
  it('keeps room-wide light on normal levels', () => {
    expect(sceneryLight(resolveLook('hell', LEVEL_LIGHTING_DEFAULTS))).toBe(1);
  });

  it('all but removes it at the default darkness and fades it as darkness rises', () => {
    const at = (darkness: number) =>
      sceneryLight(resolveLook('hell', { ...LEVEL_LIGHTING_DEFAULTS, lightsOut: true, darkness }));
    // Combo lifts, Fever and the life-lost flush multiply by this, so it must stay small.
    expect(at(LIGHTS_OUT_DEFAULTS.darkness)).toBeLessThan(0.1);
    expect(at(1)).toBe(0);
    expect(at(0.9)).toBeLessThan(at(0.5));
  });
});
