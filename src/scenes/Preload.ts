import Phaser from 'phaser';
import { AUDIO_ASSETS, COLORS, HEIGHT, IMAGE_ASSETS, SCENES, WIDTH } from '../config';
import { buildUiFonts } from '../art/fonts';
import {
  attachNormalMaps,
  isForegroundKey,
  loadForeground,
  rebuildMissingForeground,
} from '../art/foreground';
import { ensureProceduralTextures } from '../art/procedural';
import {
  parseLevel,
  validateLevel,
  type TiledMap,
  type TiledTemplate,
  type TiledTileset,
} from '../core/LevelParser';
import type { LevelSpec } from '../core/types';
import { lightingTier } from '../systems/Quality';
import { BaseScene } from './BaseScene';

const LEVEL_INDEX = 'levels-index';
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
      const index = this.cache.json.get(LEVEL_INDEX) as { levels: string[] };
      // A map opened from Tiled that isn't in the campaign yet is played as an extra level.
      const map = devMap();
      if (map && !index.levels.includes(map)) index.levels.push(map);
      for (const file of index.levels) this.load.json(`level:${file}`, `levels/${file}`);
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
    const jump = devLevel(levels);
    if (jump) this.scene.start(SCENES.play, { index: jump });
    else this.scene.start(SCENES.title);
  }

  private missingImages(): string[] {
    return IMAGE_ASSETS.map((a) => a.key).filter((k) => !this.textures.exists(k));
  }

  private parseLevels(): LevelSpec[] {
    const index = this.cache.json.get(LEVEL_INDEX) as { levels: string[] } | undefined;
    const tileset = this.cache.json.get(TILESET) as TiledTileset | undefined;
    const resolveTileset = (src: string) => (src.endsWith('bricks.tsj') ? tileset : undefined);
    const resolveTemplate = (path: string) =>
      this.cache.json.get(`template:${basename(path)}`) as TiledTemplate | undefined;
    const levels: LevelSpec[] = [];
    for (const file of index?.levels ?? []) {
      const map = this.cache.json.get(`level:${file}`) as TiledMap | undefined;
      if (!map) {
        console.warn(`[levels] failed to load ${file}`);
        continue;
      }
      const { level, warnings } = parseLevel(
        map,
        file.replace(/\.tmj$/, ''),
        resolveTileset,
        resolveTemplate,
      );
      if (import.meta.env.DEV) {
        for (const w of [...warnings, ...validateLevel(level)]) console.warn(`[${level.id}] ${w}`);
      }
      levels.push(level);
    }
    return levels;
  }

  private drawProgress(): void {
    const w = 360;
    const h = 18;
    if (this.textures.exists('logo')) {
      const logo = this.add.image(WIDTH / 2, HEIGHT * 0.36, 'logo');
      logo.setScale(Math.min(1, 480 / logo.width));
    }
    const frame = this.add.graphics();
    frame.lineStyle(3, COLORS.panelEdge, 1);
    frame.strokeRoundedRect(WIDTH / 2 - w / 2, HEIGHT * 0.62, w, h, h / 2);
    const bar = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.clear();
      bar.fillStyle(COLORS.accent, 1);
      bar.fillRoundedRect(
        WIDTH / 2 - w / 2 + 4,
        HEIGHT * 0.62 + 4,
        (w - 8) * p,
        h - 8,
        (h - 8) / 2,
      );
    });
  }
}
