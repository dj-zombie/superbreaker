import Phaser from 'phaser';
import { AUDIO_ASSETS, HEIGHT, IMAGE_ASSETS, SCENES, WIDTH } from '../config';
import { buildUiFonts } from '../art/fonts';
import {
  attachNormalMaps,
  isForegroundKey,
  loadForeground,
  rebuildMissingForeground,
} from '../art/foreground';
import { ensureProceduralTextures } from '../art/procedural';
import { calm, menuWorld, useWorld } from '../ui/theme';
import { label } from '../ui/type';
import { Meter } from '../ui/widgets';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../core/LevelParser';
import { validStops, type BossStop, type CampaignStep } from '../core/Campaign';
import { randomSeed } from '../core/Rng';
import { GOAL_KINDS, RUN_LOOPS, goalFor, type RunConfig } from '../core/Run';
import type { LevelSpec } from '../core/types';
import { loadingStop, reportProgress } from '../platform/crazygames';
import { save } from '../services';
import { lightingTier } from '../systems/Quality';
import { transitioning } from '../ui/fx/transitions';
import { installBack } from '../ui/nav';
import { BaseScene } from './BaseScene';

const LEVEL_INDEX = 'levels-index';

/** `levels/index.json`: the campaign's levels in order, and the boss and bonus stops between them. */
interface LevelIndex {
  levels: string[];
  bosses?: unknown;
}
const TILESET = 'tileset-bricks';
const TEMPLATE_INDEX = 'templates-index';

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Dev only: `?map=12.tmj` (or a full path, as Tiled's command passes it) opens that map. */
function devMap(): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  const map = new URLSearchParams(location.search).get('map');
  return map ? basename(map) : undefined;
}

/** Dev only: `?level=N` or `?map=` skips the menus and starts that level. */
function devLevel(levels: LevelSpec[]): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const map = devMap();
  if (map) {
    const i = levels.findIndex((l) => l.id === map.replace(/\.tmj$/, ''));
    return i >= 0 ? i + 1 : undefined;
  }
  const n = Number(new URLSearchParams(location.search).get('level'));
  return Number.isInteger(n) && n >= 1 && n <= levels.length ? n : undefined;
}

/** Dev only: `?stop=5` starts the boss stop after level 5, and `?stop=5b` the bonus stage after it. */
function devStop(stops: BossStop[]): CampaignStep | undefined {
  if (!import.meta.env.DEV) return undefined;
  const m = /^(\d+)(b?)$/.exec(new URLSearchParams(location.search).get('stop') ?? '');
  const stop = stops.find((s) => s.after === Number(m?.[1]));
  if (!m || !stop) return undefined;
  if (!m[2]) return { index: stop.after, stop: 'boss' };
  return stop.bonus ? { index: stop.after, stop: 'bonus' } : undefined;
}

/**
 * Dev only: `?arcade=waves|descent`, optionally with `&goal=rounds|timed` and `&seed=1K9ZQ2`.
 * The seed is read in base 36, as Results shows it.
 */
function devRun(): RunConfig | undefined {
  if (!import.meta.env.DEV) return undefined;
  const q = new URLSearchParams(location.search);
  const loop = RUN_LOOPS.find((l) => l === q.get('arcade'));
  if (!loop) return undefined;
  const goal = GOAL_KINDS.find((g) => g === q.get('goal')) ?? 'endless';
  const seed = parseInt(q.get('seed') ?? '', 36);
  return {
    loop,
    goal: goalFor(goal),
    seed: Number.isFinite(seed) ? seed >>> 0 : randomSeed(),
  };
}

/** Dev only: `?ui=gallery` opens the UI component gallery. */
function devGallery(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).get('ui') === 'gallery';
}

export class Preload extends BaseScene {
  private failed = new Set<string>();

  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    this.setupCamera();
    this.drawProgress();
    this.load.setPath('assets/');
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.add(file.key);
    });

    for (const a of IMAGE_ASSETS) {
      if (a.key !== 'logo' || !this.textures.exists('logo')) this.load.image(a.key, a.path);
    }
    const relief = this.game.renderer.type === Phaser.WEBGL && lightingTier() === 'high';
    loadForeground(this.load, relief);
    this.load.spritesheet('coin', 'images/powerups/coins.png', { frameWidth: 25, frameHeight: 25 });
    for (const a of AUDIO_ASSETS) this.load.audio(a.key, a.path);
    this.load.json(TILESET, 'tilesets/bricks.tsj');
    this.load.json(TEMPLATE_INDEX, 'templates/index.json');
    this.load.json(LEVEL_INDEX, 'levels/index.json');
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      if (key === TEMPLATE_INDEX) {
        const index = this.cache.json.get(TEMPLATE_INDEX) as { templates: string[] };
        for (const file of index.templates) this.load.json(`template:${file}`, `templates/${file}`);
        return;
      }
      if (key !== LEVEL_INDEX) return;
      const index = this.cache.json.get(LEVEL_INDEX) as LevelIndex;
      const entries = validStops(index.bosses, index.levels.length);
      const stops = entries.map((s) => s.map);
      const bonuses = entries.flatMap((s) => (s.bonus ? [s.bonus] : []));
      // A map opened from Tiled that isn't in the campaign yet is played as an extra level.
      const map = devMap();
      if (map && !index.levels.includes(map) && !stops.includes(map)) index.levels.push(map);
      for (const file of new Set([...index.levels, ...stops, ...bonuses])) {
        this.load.json(`level:${file}`, `levels/${file}`);
      }
    });
  }

  create(): void {
    if (this.failed.has('logo') && this.textures.exists('logo')) this.failed.delete('logo');
    for (const key of this.failed) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    const shared = [...this.failed].filter((key) => !isForegroundKey(key));
    ensureProceduralTextures(this, [...shared, ...this.missingImages()]);
    rebuildMissingForeground(this);
    attachNormalMaps(this);
    buildUiFonts(this);
    if (!this.anims.exists('coin-spin') && this.textures.exists('coin')) {
      this.anims.create({
        key: 'coin-spin',
        frames: this.anims.generateFrameNumbers('coin'),
        frameRate: 10,
        repeat: -1,
      });
    }
    const levels = this.parseLevels();
    this.registry.set('levels', levels);
    const stops = this.parseStops(levels.length);
    this.registry.set('bossStops', stops);
    loadingStop();
    // Reported on every load, not just on a clear: added levels lower a finished player's share.
    reportProgress((save.clearedCount() / Math.max(1, levels.length)) * 100);
    installBack(() => transitioning(this));
    const jump = devLevel(levels);
    const stop = devStop(stops);
    const run = devRun();
    if (run) this.scene.start(SCENES.play, { run });
    else if (stop) this.scene.start(SCENES.play, stop);
    else if (jump) this.scene.start(SCENES.play, { index: jump });
    else if (devGallery()) this.scene.start(SCENES.gallery);
    // A new player lands in level 1 with no clicks, and the tutorial runs over real play.
    else if (save.isNewPlayer()) this.scene.start(SCENES.play, { index: 1 });
    else this.scene.start(SCENES.title);
  }

  private missingImages(): string[] {
    return IMAGE_ASSETS.map((a) => a.key).filter((k) => !this.textures.exists(k));
  }

  private parseLevels(): LevelSpec[] {
    const index = this.cache.json.get(LEVEL_INDEX) as LevelIndex | undefined;
    const levels: LevelSpec[] = [];
    for (const file of index?.levels ?? []) {
      const level = this.parseMap(file);
      if (level) levels.push(level);
    }
    return levels;
  }

  /**
   * The boss stops between levels. A stop whose map is missing or names no boss is left out, and
   * a bonus map that names no bonus stage is dropped from its stop.
   */
  private parseStops(levelCount: number): BossStop[] {
    const index = this.cache.json.get(LEVEL_INDEX) as LevelIndex | undefined;
    const stops: BossStop[] = [];
    for (const { after, map, bonus } of validStops(index?.bosses, levelCount)) {
      const level = this.parseMap(map);
      if (!level?.boss) {
        if (level) console.warn(`[levels] boss stop ${map} names no boss`);
        continue;
      }
      const stage = bonus ? this.parseMap(bonus) : undefined;
      if (stage && !stage.bonus) console.warn(`[levels] bonus stop ${bonus} names no bonus stage`);
      stops.push(stage?.bonus ? { after, level, bonus: stage } : { after, level });
    }
    return stops;
  }

  private parseMap(file: string): LevelSpec | undefined {
    const tileset = this.cache.json.get(TILESET) as TiledTileset | undefined;
    const resolveTileset = (src: string) => (src.endsWith('bricks.tsj') ? tileset : undefined);
    const resolveTemplate = (path: string) =>
      this.cache.json.get(`template:${basename(path)}`) as TiledTemplate | undefined;
    const map = this.cache.json.get(`level:${file}`) as TiledMap | undefined;
    if (!map) {
      console.warn(`[levels] failed to load ${file}`);
      return undefined;
    }
    const { level, warnings } = parseLevel(map, file.replace(/\.tmj$/, ''), resolveTileset, resolveTemplate);
    if (import.meta.env.DEV) {
      for (const w of [...warnings, ...validateLevel(level)]) console.warn(`[${level.id}] ${w}`);
    }
    return level;
  }

  /** The launch logo breathing over its glow, and a themed meter filling underneath. */
  private drawProgress(): void {
    const t = useWorld(menuWorld());
    this.cameras.main.setBackgroundColor(t.palette.base);
    const y = HEIGHT * 0.38;
    if (this.textures.exists('logo')) {
      const logo = this.add.image(WIDTH / 2, y, 'logo');
      const scale = Math.min(1, 480 / logo.width);
      logo.setScale(scale);
      if (this.textures.exists('logo_glow')) {
        const glow = this.add
          .image(WIDTH / 2, y, 'logo_glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.5);
        glow.setScale((logo.width * scale) / glow.width);
        if (!calm()) {
          this.tweens.add({ targets: glow, alpha: 0.9, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
      }
    }
    const meterY = HEIGHT * 0.62;
    const meter = new Meter(this, WIDTH / 2, meterY, 360, 12, 0, t.palette.accent);
    const pct = label(this, WIDTH / 2, meterY + 30, 'Loading  0%', 12, { t, color: t.palette.textDim });
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      meter.set(v, false);
      pct.setText(`Loading  ${Math.round(v * 100)}%`);
    });
  }
}
