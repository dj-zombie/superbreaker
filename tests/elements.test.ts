import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepsFrom, touches, type Rect } from '../src/core/bricks/cells';
import { FUSE_STEP_MS, fuseSchedule } from '../src/core/bricks/fuse';
import { SWITCH_COOLDOWN_MS, Switchboard, asChannel } from '../src/core/bricks/gates';
import {
  PHANTOM_GHOST_ALPHA,
  PHANTOM_MAX_PERIOD,
  PHANTOM_MIN_PERIOD,
  PHANTOM_WARN_MS,
  phantomAt,
  phantomPeriod,
} from '../src/core/bricks/phantom';
import { asLink, insidePortal, portalExit, portalIssues } from '../src/core/bricks/portal';
import { ELEMENT_IDS, ELEMENT_INFO, elementsOf } from '../src/core/bricks/rules';
import {
  PURGE_MAX,
  PURGE_MIN,
  VIRUS_ARMOR,
  VIRUS_CORE_HEALTH,
  VIRUS_MIN_SPREAD_MS,
  purgeBonus,
  spreadCandidates,
  spreadInterval,
} from '../src/core/bricks/virus';
import {
  isBreakable,
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledObject,
  type TiledTileset,
} from '../src/core/LevelParser';

const cell = (col: number, row: number): Rect => ({
  x: col * 30,
  y: row * 16,
  width: 30,
  height: 16,
});

describe('touching bricks', () => {
  it('joins edge neighbors, and corner neighbors only when diagonal', () => {
    expect(touches(cell(0, 0), cell(1, 0), false)).toBe(true);
    expect(touches(cell(0, 0), cell(0, 1), false)).toBe(true);
    expect(touches(cell(0, 0), cell(1, 1), false)).toBe(false);
    expect(touches(cell(0, 0), cell(1, 1), true)).toBe(true);
    expect(touches(cell(0, 0), cell(2, 0), true)).toBe(false);
  });

  it('counts steps breadth first', () => {
    const boxes = [cell(0, 0), cell(1, 0), cell(2, 1), cell(5, 5)];
    expect(stepsFrom(boxes, 0, true)).toEqual([0, 1, 2, -1]);
    expect(stepsFrom(boxes, 0, false)).toEqual([0, 1, -1, -1]);
  });
});

describe('fuse', () => {
  it('burns one brick per step along the cord, corners included', () => {
    const cord = [cell(0, 0), cell(1, 0), cell(2, 1), cell(3, 2), cell(9, 9)];
    expect(fuseSchedule(cord, 0)).toEqual([
      0,
      FUSE_STEP_MS,
      FUSE_STEP_MS * 2,
      FUSE_STEP_MS * 3,
      -1,
    ]);
    expect(fuseSchedule(cord, 2)[0]).toBe(FUSE_STEP_MS * 2);
  });
});

describe('phantom', () => {
  const period = 3.2;
  const ms = (u: number) => u * period * 1000;

  it('is solid for most of the cycle and a ghost for the rest', () => {
    expect(phantomAt(ms(0.1), period)).toMatchObject({ solid: true, alpha: 1 });
    const ghost = phantomAt(ms(0.8), period);
    expect(ghost.solid).toBe(false);
    expect(ghost.alpha).toBeCloseTo(PHANTOM_GHOST_ALPHA);
  });

  it('flickers just before it turns solid, and only then', () => {
    const solidAt = 0.94;
    expect(phantomAt(ms(solidAt) - PHANTOM_WARN_MS / 2, period).warning).toBe(true);
    expect(phantomAt(ms(solidAt) - PHANTOM_WARN_MS * 2, period).warning).toBe(false);
    expect(phantomAt(ms(solidAt) + 20, period)).toMatchObject({ solid: true, warning: false });
  });

  it('offsets by phase and clamps the period', () => {
    expect(phantomAt(0, period, 0.8).solid).toBe(false);
    expect(phantomPeriod(0.2)).toBe(PHANTOM_MIN_PERIOD);
    expect(phantomPeriod(99)).toBe(PHANTOM_MAX_PERIOD);
    expect(phantomPeriod(undefined)).toBe(3.2);
  });
});

describe('switches', () => {
  it('flips a channel once per cooldown, each channel on its own', () => {
    const board = new Switchboard();
    expect(board.tryFlip(1, 0)).toBe(true);
    expect(board.tryFlip(1, SWITCH_COOLDOWN_MS - 1)).toBe(false);
    expect(board.tryFlip(2, 10)).toBe(true);
    expect(board.tryFlip(1, SWITCH_COOLDOWN_MS)).toBe(true);
  });

  it('reads unknown channels as channel 1', () => {
    expect(asChannel(3)).toBe(3);
    expect(asChannel(7)).toBe(1);
    expect(asChannel(undefined)).toBe(1);
  });
});

describe('portals', () => {
  const twin = { x: 300, y: 200, width: 30, height: 32 };

  it('takes the ball once its center is inside', () => {
    expect(insidePortal(twin, 300, 200)).toBe(true);
    expect(insidePortal(twin, 316, 200)).toBe(false);
  });

  it('lets the ball out just clear of the twin, along its heading', () => {
    const up = portalExit(twin, 0, -400, 7);
    expect(up.x).toBe(300);
    expect(up.y).toBe(200 - 16 - 7 - 2);
    const out = portalExit(twin, 300, -300, 7);
    expect(Math.abs(out.x - 300) > 15 || Math.abs(out.y - 200) > 16).toBe(true);
    expect(out.x - 300).toBeCloseTo(200 - out.y);
  });

  it('wants exactly two ends per link', () => {
    expect(
      portalIssues([
        { id: 1, link: 1 },
        { id: 2, link: 1 },
      ]),
    ).toEqual([]);
    expect(portalIssues([{ id: 1, link: 2 }])).toHaveLength(1);
    expect(
      portalIssues([
        { id: 1, link: 3 },
        { id: 2, link: 3 },
        { id: 3, link: 3 },
      ]),
    ).toHaveLength(1);
    expect(asLink(9)).toBe(1);
  });
});

describe('virus', () => {
  it('spreads only across edges, to eligible bricks', () => {
    const colony = [cell(5, 5)];
    const others = [
      { ...cell(6, 5), ok: true },
      { ...cell(6, 6), ok: true },
      { ...cell(5, 4), ok: false },
    ];
    expect(spreadCandidates(colony, others, (b) => b.ok)).toEqual([others[0]]);
  });

  it('pays more for a quick purge, never less than the floor', () => {
    expect(purgeBonus(0)).toBe(PURGE_MAX);
    expect(purgeBonus(3)).toBeLessThan(purgeBonus(1));
    expect(purgeBonus(100)).toBe(PURGE_MIN);
  });

  it('never spreads faster than the minimum', () => {
    expect(spreadInterval(100)).toBe(VIRUS_MIN_SPREAD_MS);
  });
});

const ASSETS = join(__dirname, '..', 'public', 'assets');
const tileset = JSON.parse(
  readFileSync(join(ASSETS, 'tilesets', 'bricks.tsj'), 'utf8'),
) as TiledTileset;
const resolve = () => tileset;

/** Tile ids in bricks.tsj. */
const TILE = {
  red: 8,
  fuse: 20,
  phantom: 21,
  switch1: 22,
  gate1: 25,
  portal1: 28,
  portal2: 29,
  core: 31,
  virus: 32,
};

let nextId = 1;
function obj(
  tile: number,
  col: number,
  row: number,
  extra: Partial<TiledObject> = {},
): TiledObject {
  const height = tile >= TILE.portal1 && tile <= TILE.portal1 + 2 ? 32 : 16;
  return {
    id: nextId++,
    gid: tile + 1,
    x: col * 30,
    y: row * 16 + height,
    width: 30,
    height,
    ...extra,
  } as TiledObject;
}

function level(objects: TiledObject[]) {
  const map = {
    type: 'map',
    width: 20,
    height: 50,
    tilewidth: 30,
    tileheight: 16,
    tilesets: [{ firstgid: 1, source: '../tilesets/bricks.tsj' }],
    layers: [{ type: 'objectgroup', name: 'Bricks', objects }],
  } as unknown as TiledMap;
  return parseLevel(map, 'test', resolve);
}

describe('element parsing', () => {
  it('reads kinds, props and textures from the tileset', () => {
    const { level: l, warnings } = level([
      obj(TILE.fuse, 0, 2),
      obj(TILE.phantom, 1, 2),
      obj(TILE.switch1 + 1, 2, 2),
      obj(TILE.gate1 + 1, 3, 2),
      obj(TILE.portal2, 4, 2),
      obj(TILE.portal2, 8, 2),
      obj(TILE.core, 5, 6),
      obj(TILE.virus, 6, 6),
      obj(TILE.red, 7, 6),
    ]);
    expect(warnings).toEqual([]);
    const [fuse, phantom, sw, gate, portal, , core, infected] = l.bricks;
    expect(fuse).toMatchObject({ kind: 'fuse', texture: 'brick_fuse' });
    expect(phantom).toMatchObject({ kind: 'phantom', texture: 'brick_phantom' });
    expect(sw).toMatchObject({ kind: 'switch', texture: 'brick_switch2', props: { channel: 2 } });
    expect(gate).toMatchObject({
      kind: 'gate',
      texture: 'brick_gate2',
      props: { channel: 2, open: false },
    });
    expect(portal).toMatchObject({
      kind: 'portal',
      texture: 'brick_portal2',
      height: 32,
      props: { link: 2 },
    });
    expect(core).toMatchObject({
      kind: 'virus',
      texture: 'brick_virus_core',
      health: VIRUS_CORE_HEALTH,
    });
    expect(core!.props?.source).toBe(true);
    expect(infected).toMatchObject({ kind: 'virus', texture: 'brick_virus', armor: VIRUS_ARMOR });
    expect(validateLevel(l)).toEqual([]);
  });

  it('counts only breakable elements as targets', () => {
    expect(isBreakable({ kind: 'fuse' })).toBe(true);
    expect(isBreakable({ kind: 'phantom' })).toBe(true);
    expect(isBreakable({ kind: 'virus' })).toBe(true);
    expect(isBreakable({ kind: 'switch' })).toBe(false);
    expect(isBreakable({ kind: 'gate' })).toBe(false);
    expect(isBreakable({ kind: 'portal' })).toBe(false);
  });

  it('flags broken element setups', () => {
    const { level: l } = level([
      obj(TILE.red, 0, 2),
      obj(TILE.portal1, 4, 2),
      obj(TILE.gate1 + 2, 6, 2),
      obj(TILE.switch1 + 1, 8, 2),
      obj(TILE.phantom, 10, 2, {
        properties: [{ name: 'period', type: 'float', value: 20 }],
      } as Partial<TiledObject>),
    ]);
    const issues = validateLevel(l).join('\n');
    expect(issues).toMatch(/Portal link 1 has 1 ends/);
    expect(issues).toMatch(/Gates on channel 3 have no switch/);
    expect(issues).toMatch(/Switches on channel 2 have no gate/);
    expect(issues).toMatch(/Phantom .*period/);
  });
});

describe('bricklab dev map', () => {
  it('parses and passes the authoring checks', () => {
    const map = JSON.parse(
      readFileSync(join(ASSETS, 'levels', 'bricklab.tmj'), 'utf8'),
    ) as TiledMap;
    const { level: l, warnings } = parseLevel(map, 'bricklab', resolve);
    expect(warnings).toEqual([]);
    expect(validateLevel(l)).toEqual([]);
  });
});

describe('element rules', () => {
  it('teaches gates with their switch, in teaching order', () => {
    expect(elementsOf(['normal', 'virus', 'gate', 'fuse'])).toEqual(['fuse', 'switch', 'virus']);
    expect(elementsOf(['normal', 'steel'])).toEqual([]);
  });

  it('has a short rule for every element', () => {
    for (const id of ELEMENT_IDS) expect(ELEMENT_INFO[id].rule.length).toBeLessThanOrEqual(60);
  });
});
