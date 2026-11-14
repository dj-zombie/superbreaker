import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isBreakable,
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../src/core/LevelParser';
import { BRICK_KINDS, POWERUP_IDS } from '../src/core/types';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const LEVELS_DIR = join(ASSETS, 'levels');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const manifest = readJson<{ levels: string[] }>(join(LEVELS_DIR, 'index.json'));
const tileset = readJson<TiledTileset & { tiles: Array<{ image: string }> }>(
  join(ASSETS, 'tilesets', 'bricks.tsj'),
);
const resolve = (source: string) =>
  source.endsWith('bricks.tsj') ? (tileset as TiledTileset) : undefined;
const templates = new Map(
  readJson<{ templates: string[] }>(join(ASSETS, 'templates', 'index.json')).templates.map(
    (file) => [file, readJson<TiledTemplate>(join(ASSETS, 'templates', file))],
  ),
);
const resolveTemplate = (path: string) => templates.get(path.split('/').pop()!);

describe('brick tileset', () => {
  it('references images that exist', () => {
    for (const t of tileset.tiles) {
      expect(() => readFileSync(join(ASSETS, 'tilesets', t.image))).not.toThrow();
    }
  });
});

describe.each(manifest.levels)('%s', (file) => {
  const map = readJson<TiledMap>(join(LEVELS_DIR, file));
  const { level, warnings } = parseLevel(map, file.replace('.tmj', ''), resolve, resolveTemplate);

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
  });

  it('has bricks with known kinds and powerups', () => {
    expect(level.bricks.length).toBeGreaterThan(0);
    for (const b of level.bricks) {
      expect(BRICK_KINDS).toContain(b.kind);
      if (b.powerup) expect(POWERUP_IDS).toContain(b.powerup);
      expect(b.texture).toMatch(/^brick_/);
    }
  });

  it('passes authoring checks', () => {
    expect(validateLevel(level)).toEqual([]);
    expect(level.bricks.some(isBreakable)).toBe(true);
  });
});

describe('campaign', () => {
  it('is 30 levels with Demolition kept in the 24th slot', () => {
    expect(manifest.levels).toHaveLength(30);
    expect(manifest.levels[23]).toBe('level24.tmj');
    const titles = manifest.levels.map((file) => {
      const map = readJson<TiledMap>(join(LEVELS_DIR, file));
      return parseLevel(map, file.replace('.tmj', ''), resolve, resolveTemplate).level.title;
    });
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles[23]).toBe('Demolition');
    expect(titles[0]).toBe('First Light');
    expect(titles[29]).toBe('Supernova');
  });

  it('has lights-out levels with lightning, whose bricks carry the light', () => {
    const dark = manifest.levels.flatMap((file) => {
      const map = readJson<TiledMap>(join(LEVELS_DIR, file));
      const { level } = parseLevel(map, file.replace('.tmj', ''), resolve, resolveTemplate);
      return level.lighting.lightsOut ? [level] : [];
    });
    expect(dark.map((l) => l.title)).toEqual(['Bullseye', 'Patrol', 'Highway']);
    for (const level of dark) {
      expect(level.bricks.filter((b) => b.light).length).toBeGreaterThanOrEqual(3);
      expect(level.lighting.lightning).toBe(true);
    }
  });
});

describe('level24 Demolition showcase', () => {
  const map = readJson<TiledMap>(join(LEVELS_DIR, 'level24.tmj'));
  const { level } = parseLevel(map, 'level24', resolve, resolveTemplate);

  it('uses every new brick kind and moving bricks', () => {
    const kinds = new Set(level.bricks.map((b) => b.kind));
    for (const k of ['steel', 'explosive', 'armored', 'regen'] as const) expect(kinds).toContain(k);
    expect(level.bricks.some((b) => b.moveX !== 0)).toBe(true);
  });

  it('places the new powerups', () => {
    const drops = new Set(level.bricks.map((b) => b.powerup).filter(Boolean));
    for (const p of ['shield', 'hyper', 'pierce', 'extraLife'] as const) expect(drops).toContain(p);
  });

  it('is titled', () => {
    expect(level.title).toBe('Demolition');
  });
});

describe('legacy property support', () => {
  const legacyMap: TiledMap = {
    tilesets: [
      {
        firstgid: 1,
        tiles: {
          '0': { image: 'bricks/brick_blue.png' },
          '1': { image: 'bricks/brick_white.png' },
        },
        tileproperties: { '1': { breakable: 'false' } },
      },
    ],
    layers: [
      {
        type: 'objectgroup',
        name: 'Object Layer 1',
        objects: [
          { id: 1, gid: 1, x: 0, y: 16, width: 30, height: 16, properties: { healthPts: '1' } },
          {
            id: 2,
            gid: 1,
            x: 30,
            y: 16,
            width: 30,
            height: 16,
            properties: { breakable: 'false' },
          },
          { id: 3, gid: 1, x: 60, y: 16, width: 30, height: 16, type: 'solid' },
          { id: 4, gid: 1, x: 90, y: 16, width: 30, height: 16, properties: { powerup: 'balls' } },
          { id: 5, gid: 1, x: 120, y: 16, width: 30, height: 16, properties: { healthPts: '' } },
          { id: 6, gid: 99, x: 0, y: 900, width: 2000, height: 1000 },
        ],
      },
    ],
  };

  const { level } = parseLevel(legacyMap, 'legacy');

  it('reads dictionary-style properties and bottom-left anchors', () => {
    expect(level.bricks).toHaveLength(5);
    expect(level.bricks[0]).toMatchObject({ x: 0, y: 0, health: 1, texture: 'brick_blue' });
  });

  it('maps breakable=false and type=solid to steel', () => {
    expect(level.bricks[1]!.kind).toBe('steel');
    expect(level.bricks[2]!.kind).toBe('steel');
  });

  it('lets object legacy flags override a tile default kind', () => {
    const { level: lv } = parseLevel(
      {
        tilesets: [{ firstgid: 1, source: 'bricks.tsj' }],
        layers: [
          {
            type: 'objectgroup',
            name: 'Bricks',
            objects: [
              {
                id: 1,
                gid: 1,
                x: 0,
                y: 16,
                width: 30,
                height: 16,
                properties: [{ name: 'breakable', type: 'bool', value: false }],
              },
            ],
          },
        ],
      },
      'precedence',
      resolve,
    );
    expect(lv.bricks[0]).toMatchObject({ kind: 'steel', texture: 'brick_steel' });
  });

  it('keeps powerups and defaults empty health', () => {
    expect(level.bricks[3]!.powerup).toBe('balls');
    expect(level.bricks[4]!.health).toBe(100);
  });
});
