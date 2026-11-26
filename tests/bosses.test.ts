import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses';
import { AUDIO_ASSETS } from '../src/config';
import {
  BOSS_ANIMS,
  BOSS_IDS,
  BOSS_STINGER,
  BOSS_TUNING,
  HABIT_BINS,
  MIN_WINDUP_MS,
  SAFE_GAP,
  SHOT_RADIUS,
  habitBin,
  planProblems,
  safeGap,
  type AttackDef,
  type BossView,
  type HazardSpec,
} from '../src/core/Boss';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTileset,
} from '../src/core/LevelParser';
import { MAX_FLASH_HZ } from '../src/core/Lighting';
import { Rng } from '../src/core/Rng';
import { BH, BW, COLS } from '../src/core/procgen/grid';
import { FIELD_WIDTH, LEVEL_MAX_Y } from '../src/core/types';
import type { BossDef, BossStage, Cutscene } from '../src/systems/BossDirector';
import { crossing } from '../src/bosses/overseer';
import { sheetFrames } from './sheets';

const ASSETS = join(__dirname, '..', 'public', 'assets');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const tileset = readJson<TiledTileset>(join(ASSETS, 'tilesets', 'bricks.tsj'));
const resolve = (source: string) => (source.endsWith('bricks.tsj') ? tileset : undefined);

/** The paddle's ordinary width, in px. PADDLE_BASE_WIDTH sits beside Phaser, out of a node test's reach. */
const PADDLE_WIDTH = 104;
/** Paddle centres to plan against: hard against each wall, a quarter in from each, and the middle. */
const PADDLE_XS = [PADDLE_WIDTH / 2, 150, 300, 450, FIELD_WIDTH - PADDLE_WIDTH / 2];
const PROGRESS = [0, 0.5, 1];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
/** What the boss may have learned of the player: nothing yet, a player who stays put, one who stood elsewhere. */
const HABIT_KINDS = ['even', 'here', 'far'] as const;

/** Habit shares for a paddle at `x`: even, nearly all under it, or nearly all at the far wall. */
function habitsOf(kind: (typeof HABIT_KINDS)[number], x: number): number[] {
  const even = Array.from({ length: HABIT_BINS }, () => 1 / HABIT_BINS);
  if (kind === 'even') return even;
  const at = kind === 'here' ? habitBin(x) : habitBin(x) < HABIT_BINS / 2 ? HABIT_BINS - 1 : 0;
  return even.map((_, i) => (i === at ? 0.9 : 0.1 / (HABIT_BINS - 1)));
}

/** Every attack a boss can play, once each however many decks it is in. */
function attacksOf(def: BossDef): AttackDef[] {
  return [...new Set(def.phases.flatMap((phase) => phase.deck ?? []))];
}

/** The field as a wind-up would find it: the parts at rest, one ball on its way up. */
function viewOf(
  def: BossDef,
  x: number,
  phaseProgress: number,
  seed: number,
  habits = habitsOf('even', x),
): BossView {
  const parts: BossView['parts'] = {};
  for (const p of def.parts) {
    parts[p.id] = {
      x: (p.col + p.cols / 2) * BW,
      y: (p.row + p.rows / 2) * BH,
      width: p.cols * BW,
      height: p.rows * BH,
    };
  }
  return {
    rng: new Rng(seed),
    phaseProgress,
    paddle: { x, width: PADDLE_WIDTH },
    balls: [{ x: 300, y: 500, vx: 120, vy: -320 }],
    parts,
    habits,
  };
}

/** Calls `check` with a fresh view for every paddle position, pool level, seed and habit. */
function everyView(def: BossDef, check: (view: () => BossView, at: string) => void): void {
  for (const x of PADDLE_XS) {
    for (const progress of PROGRESS) {
      for (const seed of SEEDS) {
        for (const kind of HABIT_KINDS) {
          const at = `paddle ${x}, pool ${progress}, seed ${seed}, habits ${kind}`;
          check(() => viewOf(def, x, progress, seed, habitsOf(kind, x)), at);
        }
      }
    }
  }
}

/** Every cutscene a boss has, named by where it plays. */
function cutscenes(def: BossDef): Array<[string, Cutscene]> {
  const found: Array<[string, Cutscene]> = [];
  if (def.entrance) found.push(['entrance', def.entrance]);
  for (const phase of def.phases) if (phase.enter) found.push([`enter ${phase.id}`, phase.enter]);
  if (def.death) found.push(['death', def.death]);
  return found;
}

/** A stage that answers every call with more of itself, at (0, 0), and counts whole-screen flashes. */
function countingStage(flash: () => void): BossStage {
  const handler: ProxyHandler<() => unknown> = {
    get: (_target, prop) => {
      if (prop === 'x' || prop === 'y') return 0;
      if (prop === 'impact' || prop === 'glimpse') return flash;
      return stage;
    },
    apply: () => stage,
  };
  const stage: unknown = new Proxy(() => undefined, handler);
  return stage as BossStage;
}

/** When, in ms into a scene, its cues flash the whole screen: once for each `impact` or `glimpse`. */
function flashTimes(scene: Cutscene): number[] {
  const times: number[] = [];
  for (const cue of scene.cues) cue.run(countingStage(() => times.push(cue.at)));
  return times.sort((a, b) => a - b);
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

  it('never asks for more whole-screen flashes in one second than the limiter lets through', () => {
    const allowed = Math.floor(MAX_FLASH_HZ);
    for (const [name, scene] of cutscenes(def)) {
      const times = flashTimes(scene);
      // The framework's own blow on the final hit opens the death scene.
      if (name === 'death') times.unshift(0);
      for (let i = allowed; i < times.length; i++) {
        expect(
          times[i]! - times[i - allowed]!,
          `${name}: the flash at ${times[i]} ms`,
        ).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it('gives every attack its own id', () => {
    const ids = attacksOf(def).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every plan of every attack fair', () => {
    const parts = def.parts.map((p) => p.id);
    for (const attack of attacksOf(def)) {
      everyView(def, (view, at) => {
        expect(planProblems(attack.plan(view()), attack, parts), `${attack.id}: ${at}`).toEqual([]);
      });
    }
  });

  it('plans the same attack twice from the same seed and view', () => {
    for (const attack of attacksOf(def)) {
      everyView(def, (view, at) => {
        expect(attack.plan(view()), `${attack.id}: ${at}`).toEqual(attack.plan(view()));
      });
    }
  });

  it('warns for at least MIN_WINDUP_MS before every attack, on Hard too', () => {
    for (const attack of attacksOf(def)) {
      // The scaled time itself, not what the floor would make of it.
      expect(attack.windupMs * BOSS_TUNING.hard.windup, attack.id).toBeGreaterThanOrEqual(
        MIN_WINDUP_MS,
      );
    }
  });

  it('opens only into a pose and onto a part that exist', () => {
    const parts = new Set(def.parts.map((p) => p.id));
    for (const attack of attacksOf(def)) {
      const { pose, lock } = attack.opening ?? {};
      if (pose !== undefined) expect(def.poses?.[pose], `${attack.id}: ${pose}`).toBeDefined();
      if (lock !== undefined) expect(parts.has(lock), `${attack.id}: ${lock}`).toBe(true);
    }
  });

  it('tells its attacks only with sounds the game loads', () => {
    const keys = new Set<string>(AUDIO_ASSETS.map((a) => a.key));
    for (const attack of attacksOf(def)) {
      const sfx = attack.tell?.sfx;
      if (sfx !== undefined) expect(keys.has(sfx), `${attack.id}: ${sfx}`).toBe(true);
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
      const sheet = sprite.path.endsWith('.json') ? [] : [sprite.frameWidth, sprite.frameHeight];
      for (const px of [...sheet, sprite.width, sprite.height]) {
        expect(px).toBeGreaterThan(0);
      }
    });

    it('plays only frames that are on its sheet', () => {
      const frames = sheetFrames(sprite.path, sprite.frameWidth, sprite.frameHeight);
      for (const name of BOSS_ANIMS) {
        for (const frame of sprite.anims[name].frames) {
          expect(frames.has(String(frame)), `${name}: ${frame}`).toBe(true);
        }
      }
    });
  });
});

describe('boss sounds', () => {
  const keys = new Map<string, string>(AUDIO_ASSETS.map((a) => [a.key, a.path]));
  const SRC = join(__dirname, '..', 'src');
  // Everything that plays a sound in a fight: the framework's files and every boss's own.
  const files = [
    join(SRC, 'systems', 'BossDirector.ts'),
    join(SRC, 'systems', 'HazardSystem.ts'),
    ...readdirSync(join(SRC, 'bosses')).map((name) => join(SRC, 'bosses', name)),
  ];

  it('plays only sounds the game loads: a key it does not load would throw in the fight', () => {
    let found = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // A sound named where it plays, a sound named by a constant, and an attack's tell.
      const named = /(?:\.sfx\(\s*|_SFX = |\bsfx: )'([^']+)'/g;
      for (const [, key] of source.matchAll(named)) {
        found++;
        expect(keys.has(key!), `${file}: ${key}`).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(20);
    expect(keys.has(BOSS_STINGER), BOSS_STINGER).toBe(true);
  });

  it('has a file on disk behind every boss sound', () => {
    const boss = [...keys].filter(([, path]) => path.startsWith('audio/boss/'));
    expect(boss.length).toBe(65);
    for (const [key, path] of boss) {
      const file = join(ASSETS, path);
      expect(existsSync(file), `${key}: ${path}`).toBe(true);
      expect(statSync(file).size, key).toBeGreaterThan(1000);
    }
  });
});

describe('the Warden attacks', () => {
  const def = BOSSES.warden;
  const [guardUp, coreExposed, lastStand] = def.phases;
  const named = (id: string): AttackDef => attacksOf(def).find((a) => a.id === id)!;
  const kinds = (hazards: readonly HazardSpec[], kind: HazardSpec['kind']) => {
    return hazards.filter((h) => h.kind === kind);
  };

  it('adds an attack with every phase: the volley, then the sweep, then the reaper', () => {
    expect(def.phases).toHaveLength(3);
    expect(guardUp!.deck?.map((a) => a.id)).toEqual(['volley']);
    expect(guardUp!.pose).toBeUndefined();
    expect(coreExposed!.deck?.map((a) => a.id)).toEqual(['sweep', 'volley']);
    expect(coreExposed!.pose).toBe('open');
    expect(lastStand!.deck?.map((a) => a.id)).toEqual(['reaper', 'sweep', 'volley']);
    expect(lastStand!.pose).toBe('open');
  });

  it('keeps the skull, the one thing that takes a life, for its last phase', () => {
    const skulls = (phase: (typeof def.phases)[number]): number => {
      let n = 0;
      for (const attack of phase.deck ?? []) {
        const view = viewOf(def, FIELD_WIDTH / 2, 0.5, 1);
        n += kinds(attack.plan(view).hazards, 'skull').length;
      }
      return n;
    };
    expect(skulls(guardUp!)).toBe(0);
    expect(skulls(coreExposed!)).toBe(0);
    expect(skulls(lastStand!)).toBeGreaterThan(0);
  });

  it('presses harder with every phase, and the music climbs with it', () => {
    const [full2, empty2] = coreExposed!.gapMs!;
    const [full3, empty3] = lastStand!.gapMs!;
    expect(guardUp!.gapMs).toBeUndefined();
    expect(full2).toBeLessThan(2600);
    expect(empty2).toBeLessThan(1600);
    expect(empty2).toBeLessThan(full2);
    expect(full3).toBeLessThan(full2);
    expect(empty3).toBeLessThan(empty2);
    expect(empty3).toBeLessThan(full3);
    expect(def.phases.map((p) => p.intensity)).toEqual(['low', 'mid', 'high']);
  });

  it('leaves a keepsake with a name', () => {
    expect(def.trophy).toBe("Warden's Eye");
  });

  it('lifts the guard off the core after every attack, and marks the core', () => {
    const all = attacksOf(def);
    expect(all).toHaveLength(3);
    for (const attack of all) {
      expect(attack.opening, attack.id).toEqual({ pose: 'open', lock: 'core' });
      expect(attack.recoverMs, attack.id).toBeGreaterThan(0);
    }
  });

  it('uses every hazard and every effect between its attacks', () => {
    const hazards = attacksOf(def).flatMap((a) => a.plan(viewOf(def, 300, 0.5, 1)).hazards);
    for (const kind of ['shot', 'beam', 'skull'] as const) {
      expect(kinds(hazards, kind).length, kind).toBeGreaterThan(0);
    }
    const effects = hazards.flatMap((h) => ('onPaddle' in h ? [h.onPaddle.kind] : []));
    expect(new Set(effects)).toEqual(new Set(['jam', 'shrink']));
  });

  it('rakes three to five jamming shots across where the paddle stood', () => {
    const volley = named('volley');
    const count = (progress: number) => volley.plan(viewOf(def, 300, progress, 1)).hazards.length;
    expect(count(0)).toBe(3);
    expect(count(1)).toBe(5);
    everyView(def, (view, at) => {
      const v = view();
      const { hazards } = volley.plan(v);
      expect(hazards.length, at).toBeGreaterThanOrEqual(3);
      expect(hazards.length, at).toBeLessThanOrEqual(5);
      const xs: number[] = [];
      for (const h of hazards) {
        expect(h, at).toMatchObject({
          kind: 'shot',
          from: 'body',
          onPaddle: { kind: 'jam', ms: 600 },
        });
        xs.push(h.x);
      }
      // The paddle is under the rake, and a whole side of the rake is free.
      expect(Math.min(...xs), at).toBeLessThanOrEqual(v.paddle.x);
      expect(Math.max(...xs), at).toBeGreaterThanOrEqual(v.paddle.x);
      const left = Math.min(...xs) - SHOT_RADIUS;
      const right = FIELD_WIDTH - Math.max(...xs) - SHOT_RADIUS;
      expect(Math.max(left, right), at).toBeGreaterThanOrEqual(SAFE_GAP);
    });
  });

  it('burns two shrinking beams and leaves the middle or one side free', () => {
    const sweep = named('sweep');
    const free = new Set<string>();
    everyView(def, (view, at) => {
      const { hazards } = sweep.plan(view());
      expect(hazards, at).toHaveLength(2);
      for (const h of hazards) {
        expect(h, at).toMatchObject({ kind: 'beam', onPaddle: { kind: 'shrink', factor: 0.8 } });
      }
      const xs = hazards.map((h) => h.x).sort((a, b) => a - b);
      const third = FIELD_WIDTH / 3;
      free.add(xs[0]! > third ? 'left' : xs[1]! < 2 * third ? 'right' : 'middle');
      // With both beams lit at once there is still room to stand.
      const together = hazards.map((h): HazardSpec => ({ ...h, at: 0 }));
      expect(safeGap({ hazards: together }), at).toBeGreaterThanOrEqual(SAFE_GAP);
    });
    // Chance picks the free lane, and over these seeds it picks each of them.
    expect([...free].sort()).toEqual(['left', 'middle', 'right']);
  });

  it('sends one slow skull at where the paddle stood, with two shrinking shots elsewhere', () => {
    const reaper = named('reaper');
    everyView(def, (view, at) => {
      const v = view();
      const { hazards } = reaper.plan(v);
      const skulls = kinds(hazards, 'skull');
      const shots = kinds(hazards, 'shot');
      expect(hazards, at).toHaveLength(3);
      expect(skulls, at).toHaveLength(1);
      expect(shots, at).toHaveLength(2);
      expect(skulls[0], at).toMatchObject({ flightMs: 1800 });
      // The paddle is under the skull as the warning goes up.
      expect(Math.abs(skulls[0]!.x - v.paddle.x), at).toBeLessThanOrEqual(PADDLE_WIDTH / 2);
      for (const h of shots) {
        expect(h, at).toMatchObject({ onPaddle: { kind: 'shrink' } });
        // Elsewhere: a paddle that stays under the skull is not under a shot as well.
        expect(Math.abs(h.x - skulls[0]!.x), at).toBeGreaterThan(PADDLE_WIDTH / 2 + SHOT_RADIUS);
      }
    });
  });
});

describe('the Overseer attacks', () => {
  const def = BOSSES.overseer;
  const named = (id: string): AttackDef => attacksOf(def).find((a) => a.id === id)!;
  const mirror = def.parts.find((p) => p.id === 'mirror')!;
  const eye = def.parts.find((p) => p.id === 'eye')!;

  it('forecasts where a rising ball meets the rail, off the walls, and nothing for a falling one', () => {
    expect(crossing(300, 0, -400, 200)).toBe(300);
    expect(crossing(300, 300, -300, 100)).toBe(400);
    // 400 px right of 500 is 311 past the right wall's reach of 589: it comes back to 278.
    expect(crossing(500, 400, -400, 400)).toBeCloseTo(278);
    expect(crossing(300, 100, 400, 200)).toBeNull();
  });

  it('rebuilds a past row only between the Mirror and the paddle, leaving the way to the eye open', () => {
    const below = (mirror.row + mirror.rows) * BH;
    const eyeLo = eye.col * BW;
    const eyeHi = (eye.col + eye.cols) * BW;
    everyView(def, (view, at) => {
      const bricks = named('overwrite').plan(view()).bricks ?? [];
      expect(bricks.length, at).toBeGreaterThan(0);
      for (const b of bricks) {
        expect(b.y, at).toBeGreaterThanOrEqual(below);
        expect(b.y + b.height, at).toBeLessThanOrEqual(LEVEL_MAX_Y);
        expect(b.x + b.width <= eyeLo || b.x >= eyeHi, at).toBe(true);
        expect(b.kind, at).toBe('normal');
      }
    });
  });

  it('scans its way onto where the paddle stands most', () => {
    for (const x of PADDLE_XS) {
      const hazards = named('scan').plan(viewOf(def, x, 1, 1, habitsOf('here', x))).hazards;
      const last = hazards[hazards.length - 1]!;
      expect(last.kind).toBe('beam');
      if (last.kind !== 'beam') continue;
      expect(Math.abs(last.x - x), `paddle ${x}`).toBeLessThan(last.width / 2 + PADDLE_WIDTH / 2);
    }
  });

  it('purges every lane but the ones the paddle stands in least', () => {
    for (const x of PADDLE_XS) {
      const habits = habitsOf('here', x);
      const hazards = named('purge').plan(viewOf(def, x, 1, 1, habits)).hazards;
      expect(hazards.every((h) => h.kind === 'beam')).toBe(true);
      const burned = new Set(hazards.map((h) => habitBin(h.x)));
      const clear = habits.map((_, i) => i).filter((i) => !burned.has(i));
      expect(clear, `paddle ${x}`).toHaveLength(2);
      for (const i of clear) expect(habits[i], `paddle ${x}`).toBe(Math.min(...habits));
      expect(burned.has(habitBin(x)), `paddle ${x}`).toBe(true);
    }
  });

  it('starts each fight copying the paddle, however the last one ended', () => {
    const fight = () => {
      const steered = new Set<string>();
      const stage = {
        paddle: { x: 200, resetSize: () => {} },
        habits: Array.from({ length: HABIT_BINS }, () => 1 / HABIT_BINS),
        balls: () => [],
        part: (id: string) => {
          const p = def.parts.find((q) => q.id === id)!;
          return { x: (p.col + p.cols / 2) * BW, y: (p.row + p.rows / 2) * BH };
        },
        sinceReturn: () => Infinity,
        steer: (id: string) => steered.add(id),
        scenery: { fall: () => {} },
      };
      return { stage: stage as unknown as BossStage, steered };
    };
    // A fight that got as far as the last phase, where both Mirrors are steered.
    const last = fight();
    for (const phase of def.phases) phase.setup?.(last.stage);
    def.tick!(last.stage, 16);
    expect([...last.steered].sort()).toEqual(['mirror', 'mirror2']);
    // The next fight's entrance ticks before any phase is set up: the second Mirror stays stowed.
    const next = fight();
    def.tick!(next.stage, 16);
    expect([...next.steered]).toEqual(['mirror']);
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
