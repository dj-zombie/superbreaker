import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses';
import { BOSS_ANIMS, BOSS_IDS } from '../src/core/Boss';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTileset,
} from '../src/core/LevelParser';
import { BH, BW, COLS } from '../src/core/procgen/grid';
import { LEVEL_MAX_Y } from '../src/core/types';
import type { BossDef, Cutscene } from '../src/systems/BossDirector';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const tileset = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
const resolve = (source: string) => (source.endsWith('bricks.tsj') ? tileset : undefined);

/** Every cutscene a boss has, named by where it plays. */
function cutscenes(def: BossDef): Array<[string, Cutscene]> {
  const found: Array<[string, Cutscene]> = [];
  if (def.entrance) found.push(['entrance', def.entrance]);
  for (const phase of def.phases) if (phase.enter) found.push([`enter ${phase.id}`, phase.enter]);
  if (def.death) found.push(['death', def.death]);
  return found;
}

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

  it('names only its own parts in its poses', () => {
    const ids = new Set(def.parts.map((p) => p.id));
    for (const [name, pose] of Object.entries(def.poses ?? {})) {
      for (const id of Object.keys(pose)) expect(ids.has(id), `${name}: ${id}`).toBe(true);
    }
  });

  it('gives a phase only a pose that exists', () => {
    for (const phase of def.phases) {
      if (phase.pose === undefined) continue;
      expect(def.poses?.[phase.pose], `${phase.id}: ${phase.pose}`).toBeDefined();
    }
  });

  it('keeps every part of every pose inside the arena and out of the top two rows', () => {
    for (const [name, pose] of Object.entries(def.poses ?? {})) {
      for (const part of def.parts) {
        const at = `${name}: ${part.id}`;
        const left = part.col * BW + (pose[part.id]?.dx ?? 0);
        const top = part.row * BH + (pose[part.id]?.dy ?? 0);
        expect(left, at).toBeGreaterThanOrEqual(0);
        expect(left + part.cols * BW, at).toBeLessThanOrEqual(COLS * BW);
        expect(top, at).toBeGreaterThanOrEqual(2 * BH);
        expect(top + part.rows * BH, at).toBeLessThanOrEqual(LEVEL_MAX_Y);
      }
    }
  });

  it('has no entry scene on its first phase: the entrance opens that one', () => {
    expect(def.phases[0]!.enter).toBeUndefined();
  });

  it('gives every cutscene a positive length', () => {
    for (const [name, scene] of cutscenes(def)) expect(scene.lengthMs, name).toBeGreaterThan(0);
  });

  it('keeps every cue inside its cutscene', () => {
    for (const [name, scene] of cutscenes(def)) {
      for (const cue of scene.cues) {
        expect(cue.at, name).toBeGreaterThanOrEqual(0);
        expect(cue.at, name).toBeLessThanOrEqual(scene.lengthMs);
      }
    }
  });

  describe.runIf(def.sprite !== undefined)('sprite', () => {
    const sprite = def.sprite!;

    it('has frames and a speed for all five animations', () => {
      expect(Object.keys(sprite.anims).sort()).toEqual([...BOSS_ANIMS].sort());
      for (const name of BOSS_ANIMS) {
        const anim = sprite.anims[name];
        expect(anim.frames.length, name).toBeGreaterThan(0);
        expect(anim.fps, name).toBeGreaterThan(0);
        for (const frame of anim.frames) {
          expect(Number.isInteger(frame), `${name}: ${frame}`).toBe(true);
          expect(frame, name).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('has a size on the field and in the sheet', () => {
      for (const px of [sprite.frameWidth, sprite.frameHeight, sprite.width, sprite.height]) {
        expect(px).toBeGreaterThan(0);
      }
    });

    it('plays only frames that are on its sheet', () => {
      // A PNG's width and height are the two big-endian words that follow its IHDR tag.
      const png = readFileSync(join(ASSETS, sprite.path));
      expect(png.toString('latin1', 12, 16)).toBe('IHDR');
      const across = png.readUInt32BE(16) / sprite.frameWidth;
      const down = png.readUInt32BE(20) / sprite.frameHeight;
      expect(Number.isInteger(across)).toBe(true);
      expect(Number.isInteger(down)).toBe(true);
      for (const name of BOSS_ANIMS) {
        for (const frame of sprite.anims[name].frames) {
          expect(frame, name).toBeLessThan(across * down);
        }
      }
    });
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
