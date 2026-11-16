import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses';
import { BOSS_IDS } from '../src/core/Boss';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTileset,
} from '../src/core/LevelParser';
import { BH, BW, COLS } from '../src/core/procgen/grid';
import { LEVEL_MAX_Y } from '../src/core/types';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const tileset = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
const resolve = (source: string) => (source.endsWith('bricks.tsj') ? tileset : undefined);

describe.each(BOSS_IDS)('boss %s', (id) => {
  const def = BOSSES[id];

  it('is registered under its own id', () => {
    expect(def.id).toBe(id);
  });

  it('has at least one phase, each with a pool to drain', () => {
    expect(def.phases.length).toBeGreaterThan(0);
    for (const phase of def.phases) expect(phase.hits, phase.id).toBeGreaterThan(0);
  });

  it('gives every part its own id', () => {
    const ids = def.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every part inside the arena and out of the top two rows', () => {
    for (const part of def.parts) {
      expect(part.cols, part.id).toBeGreaterThan(0);
      expect(part.rows, part.id).toBeGreaterThan(0);
      expect(part.col, part.id).toBeGreaterThanOrEqual(0);
      expect(part.col + part.cols, part.id).toBeLessThanOrEqual(COLS);
      expect(part.row, part.id).toBeGreaterThanOrEqual(2);
      expect((part.row + part.rows) * BH, part.id).toBeLessThanOrEqual(LEVEL_MAX_Y);
    }
  });

  it('has a part that can be hurt', () => {
    expect(def.parts.some((p) => p.kind !== 'steel' && p.weak !== 0)).toBe(true);
  });
});

describe('bosslab.tmj', () => {
  const map = readJson<TiledMap>(join(ASSETS, 'levels', 'bosslab.tmj'));
  const { level, warnings } = parseLevel(map, 'bosslab', resolve);

  it('parses without warnings and passes the authoring checks', () => {
    expect(warnings).toEqual([]);
    expect(validateLevel(level)).toEqual([]);
  });

  it('names the Warden', () => {
    expect(level.boss).toBe('warden');
  });

  it('keeps its bricks clear of the Warden', () => {
    expect(level.bricks.length).toBeGreaterThan(0);
    for (const brick of level.bricks) {
      for (const part of BOSSES.warden.parts) {
        const apart =
          brick.x + brick.width <= part.col * BW ||
          brick.x >= (part.col + part.cols) * BW ||
          brick.y + brick.height <= part.row * BH ||
          brick.y >= (part.row + part.rows) * BH;
        expect(apart, `brick ${brick.id} and part ${part.id}`).toBe(true);
      }
    }
  });
});
