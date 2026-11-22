import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TiledMap, TiledTemplate, TiledTile, TiledTileset } from '../src/core/LevelParser';
import type { LevelSpec } from '../src/core/types';
import { campaignIndexOf, editorLevelId, levelFromPayload, type CachedResolvers } from '../src/editor/payload';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const tileset = readJson<TiledTileset & { tiles: TiledTile[] }>(join(ASSETS, 'tilesets', 'bricks.tsj'));
const templates = new Map(
  readJson<{ templates: string[] }>(join(ASSETS, 'templates', 'index.json')).templates.map(
    (file) => [file, readJson<TiledTemplate>(join(ASSETS, 'templates', file))],
  ),
);
const cached: CachedResolvers = {
  tileset: (source) => (source.endsWith('bricks.tsj') ? tileset : undefined),
  template: (path) => templates.get(path.split('/').pop()!),
};
const level01 = () => readJson<TiledMap>(join(ASSETS, 'levels', 'level01.tmj'));

describe('a map pushed from Tiled', () => {
  it('parses like the saved file, named after it', () => {
    const { level, warnings } = levelFromPayload({ map: level01(), file: 'level01.tmj' }, cached);
    expect(level.id).toBe('level01');
    expect(level.bricks.length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });

  it('takes the tileset Tiled has open over the one on disk', () => {
    const map = level01();
    const source = map.tilesets[0]!.source!;
    const first = map.layers.flatMap((l) => l.objects ?? []).find((o) => o.gid)!;
    const tileId = first.gid! - map.tilesets[0]!.firstgid;
    const edited: TiledTileset = {
      ...tileset,
      tiles: tileset.tiles.map((t) =>
        t.id === tileId ? { ...t, properties: [{ name: 'kind', type: 'string', value: 'steel' }] } : t,
      ),
    };
    const before = levelFromPayload({ map, file: 'level01.tmj' }, cached).level;
    const after = levelFromPayload({ map, file: 'level01.tmj', tilesets: { [source]: edited } }, cached).level;
    const brick = (l: LevelSpec) => l.bricks.find((b) => b.id === first.id)!;
    expect(brick(before).kind).not.toBe('steel');
    expect(brick(after).kind).toBe('steel');
  });

  it("reports what validateLevel finds, such as two bricks in one place", () => {
    const map = level01();
    const layer = map.layers.find((l) => l.objects?.some((o) => o.gid))!;
    const copy = { ...layer.objects!.find((o) => o.gid)!, id: 9999 };
    layer.objects!.push(copy);
    const { warnings } = levelFromPayload({ map, file: 'level01.tmj' }, cached);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('names an unsaved map, and strips folders and the extension', () => {
    expect(editorLevelId('')).toBe('untitled');
    expect(editorLevelId('/maps/level02.tmj')).toBe('level02');
    expect(editorLevelId('C:\\maps\\boss05.tmj')).toBe('boss05');
  });
});

describe('where a previewed map sits in the campaign', () => {
  const spec = (id: string) => ({ id }) as LevelSpec;
  const levels = [spec('level01'), spec('level02')];
  const stops = [{ after: 2, level: spec('boss02'), bonus: spec('gallery') }];

  it('is its level number, the level a stop follows, or nowhere', () => {
    expect(campaignIndexOf('level02', levels, stops)).toBe(2);
    expect(campaignIndexOf('boss02', levels, stops)).toBe(2);
    expect(campaignIndexOf('gallery', levels, stops)).toBe(2);
    expect(campaignIndexOf('sketch', levels, stops)).toBeUndefined();
  });
});
