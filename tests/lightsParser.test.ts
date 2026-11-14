import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../src/core/LevelParser';
import { LIGHT_DEFAULTS, MIN_LIGHTNING_INTERVAL } from '../src/core/Lighting';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const bricks = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
const templateIndex = readJson<{ templates: string[] }>(join(ASSETS, 'templates', 'index.json'));
const templates = new Map(
  templateIndex.templates.map((f) => [f, readJson<TiledTemplate>(join(ASSETS, 'templates', f))]),
);
const resolveTileset = (src: string) => (src.endsWith('bricks.tsj') ? bricks : undefined);
const resolveTemplate = (path: string) => templates.get(path.split('/').pop()!);

function map(
  objects: TiledMap['layers'][number]['objects'],
  extra: Partial<TiledMap> = {},
): TiledMap {
  return {
    tilesets: [{ firstgid: 1, source: '../tilesets/bricks.tsj' }],
    layers: [
      {
        type: 'objectgroup',
        name: 'Bricks',
        objects: [{ id: 1, gid: 1, x: 0, y: 16, width: 30, height: 16 }],
      },
      { type: 'objectgroup', name: 'Lights', objects },
    ],
    ...extra,
  };
}

const parse = (m: TiledMap) => parseLevel(m, 'test', resolveTileset, resolveTemplate);

describe('Lights layer', () => {
  it('reads points with class defaults for every missing member', () => {
    const { level, warnings } = parse(
      map([{ id: 5, x: 40, y: 60, width: 0, height: 0, point: true, type: 'Light' }]),
    );
    expect(warnings).toEqual([]);
    const l = level.lights[0]!;
    expect(l).toMatchObject({
      kind: 'point',
      x: 40,
      y: 60,
      radius: LIGHT_DEFAULTS.radius,
      color: LIGHT_DEFAULTS.color,
      intensity: 0.6,
      flicker: 'steady',
      affects: 'both',
      cookie: 'none',
      relief: false,
    });
    // An unset phase is derived from the id so neighbours don't flicker in step.
    expect(l.phase).toBeGreaterThanOrEqual(0);
    expect(l.phase).toBeLessThan(10);
  });

  it('parses #AARRGGBB colors and enum members', () => {
    const { level, warnings } = parse(
      map([
        {
          id: 2,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          point: true,
          properties: [
            { name: 'color', type: 'color', value: '#ff22d3ff' },
            { name: 'flicker', type: 'string', value: 'torch' },
            { name: 'affects', type: 'string', value: 'bricks' },
            { name: 'phase', type: 'float', value: 0 },
          ],
        },
      ]),
    );
    expect(warnings).toEqual([]);
    expect(level.lights[0]).toMatchObject({
      color: 0x22d3ff,
      flicker: 'torch',
      affects: 'bricks',
      phase: 0,
    });
  });

  it('turns ellipses into radial lights sized by the ellipse', () => {
    const { level } = parse(map([{ id: 3, x: 100, y: 100, width: 80, height: 60, ellipse: true }]));
    expect(level.lights[0]).toMatchObject({ kind: 'point', x: 140, y: 130, radius: 40 });
  });

  it('turns rectangles into rotated area lights pivoting on the top-left corner', () => {
    const { level } = parse(
      map([
        {
          id: 4,
          x: 10,
          y: 20,
          width: 50,
          height: 200,
          rotation: -12,
          properties: { cookie: 'stained' },
        },
      ]),
    );
    expect(level.lights[0]).toMatchObject({
      kind: 'area',
      x: 10,
      y: 20,
      width: 50,
      height: 200,
      rotation: -12,
      cookie: 'stained',
    });
  });

  it('turns polylines into bouncing path lights and polygons into loops', () => {
    const line = {
      id: 6,
      x: 10,
      y: 10,
      width: 0,
      height: 0,
      polyline: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const loop = {
      id: 7,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      polygon: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
    };
    const { level } = parse(map([line, loop]));
    expect(level.lights[0]).toMatchObject({
      kind: 'path',
      pingpong: true,
      path: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
      ],
    });
    expect(level.lights[1]).toMatchObject({ kind: 'path', pingpong: false });
  });

  it('marks relief lights', () => {
    const { level } = parse(
      map([
        {
          id: 8,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          point: true,
          type: 'Light',
          properties: [{ name: 'relief', type: 'bool', value: true }],
        },
      ]),
    );
    expect(level.lights[0]!.relief).toBe(true);
  });

  it('expands templates, keeping instance overrides', () => {
    const { level, warnings } = parse(
      map([
        { id: 9, template: '../templates/warm-light.tj', x: 50, y: 70 } as never,
        {
          id: 11,
          template: '../templates/stained-window.tj',
          x: 20,
          y: 0,
          properties: [{ name: 'intensity', type: 'float', value: 0.3 }],
        } as never,
      ]),
    );
    expect(warnings).toEqual([]);
    expect(level.lights[0]).toMatchObject({ kind: 'point', x: 50, y: 70, flicker: 'candle' });
    expect(level.lights[1]).toMatchObject({
      kind: 'area',
      cookie: 'stained',
      intensity: 0.3,
      rotation: -10,
    });
  });

  it('warns about missing templates, bad values and tiles on the Lights layer', () => {
    const { level, warnings } = parse(
      map([
        { id: 12, template: '../templates/nope.tj', x: 0, y: 0 } as never,
        { id: 13, x: 0, y: 0, width: 0, height: 0, point: true, properties: { flicker: 'disco' } },
        { id: 14, gid: 1, x: 0, y: 16, width: 30, height: 16 },
      ]),
    );
    expect(warnings).toHaveLength(3);
    expect(level.bricks).toHaveLength(1);
    expect(level.lights[0]!.flicker).toBe('steady');
  });
});

describe('bricks and map lighting', () => {
  it('reads emissive brick members', () => {
    const { level } = parse({
      ...map([]),
      layers: [
        {
          type: 'objectgroup',
          name: 'Anything',
          objects: [
            {
              id: 1,
              gid: 1,
              x: 0,
              y: 16,
              width: 30,
              height: 16,
              properties: [
                { name: 'light', type: 'color', value: '#ffff8800' },
                { name: 'lightRadius', type: 'float', value: 120 },
              ],
            },
            { id: 2, gid: 1, x: 30, y: 16, width: 30, height: 16, properties: { light: '' } },
          ],
        },
      ],
    });
    expect(level.bricks[0]!.light).toEqual({ color: 0xff8800, radius: 120, intensity: 0.6 });
    expect(level.bricks[1]!.light).toBeUndefined();
  });

  it('reads LevelLighting with -1 and empty meaning "world default"', () => {
    const { level } = parse(
      map([], {
        properties: [
          { name: 'ambient', type: 'color', value: '#ff404060' },
          { name: 'brickFloor', type: 'float', value: 0.2 },
          { name: 'vignette', type: 'float', value: -1 },
          { name: 'mood', type: 'string', value: 'storm' },
          { name: 'lightsOut', type: 'bool', value: true },
        ],
      }),
    );
    expect(level.lighting).toEqual({
      ambient: 0x404060,
      brickFloor: 0.2,
      mood: 'storm',
      lightsOut: true,
      lightning: false,
      lightningInterval: 10,
    });
  });

  it('reads lights-out darkness and lightning', () => {
    const { level, warnings } = parse(
      map([], {
        properties: [
          { name: 'lightsOut', type: 'bool', value: true },
          { name: 'darkness', type: 'float', value: 1.4 },
          { name: 'lanternRadius', type: 'float', value: 90 },
          { name: 'previewTime', type: 'float', value: 0 },
          { name: 'lightning', type: 'bool', value: true },
          { name: 'lightningInterval', type: 'float', value: 1 },
        ],
      }),
    );
    expect(warnings).toEqual([]);
    expect(level.lighting).toMatchObject({
      darkness: 1,
      lanternRadius: 90,
      previewTime: 0,
      lightning: true,
      lightningInterval: MIN_LIGHTNING_INTERVAL,
    });
  });

  it('defaults to the world look', () => {
    expect(parse(map([])).level.lighting).toEqual({
      mood: 'world',
      lightsOut: false,
      lightning: false,
      lightningInterval: 10,
    });
  });
});

describe('templates on disk', () => {
  it('lists templates that all parse cleanly', () => {
    for (const file of templateIndex.templates) {
      const { warnings } = parse(
        map([{ id: 1, template: `../templates/${file}`, x: 0, y: 0 } as never]),
      );
      expect(warnings, file).toEqual([]);
    }
  });
});
