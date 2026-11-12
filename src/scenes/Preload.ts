import Phaser from 'phaser';
import { AUDIO_ASSETS, COLORS, HEIGHT, IMAGE_ASSETS, SCENES, WIDTH } from '../config';
import { buildUiFonts } from '../art/fonts';
import { ensureProceduralTextures } from '../art/procedural';
import { parseLevel, validateLevel, type TiledMap, type TiledTileset } from '../core/LevelParser';
import type { LevelSpec } from '../core/types';
import { BaseScene } from './BaseScene';

const LEVEL_INDEX = 'levels-index';
const TILESET = 'tileset-bricks';

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
    this.load.spritesheet('coin', 'images/powerups/coins.png', { frameWidth: 25, frameHeight: 25 });
    for (const a of AUDIO_ASSETS) this.load.audio(a.key, a.path);
    this.load.json(TILESET, 'tilesets/bricks.tsj');
    this.load.json(LEVEL_INDEX, 'levels/index.json');
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      if (key !== LEVEL_INDEX) return;
      const index = this.cache.json.get(LEVEL_INDEX) as { levels: string[] };
      for (const file of index.levels) this.load.json(`level:${file}`, `levels/${file}`);
    });
  }

  create(): void {
    if (this.failed.has('logo') && this.textures.exists('logo')) this.failed.delete('logo');
    for (const key of this.failed) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    ensureProceduralTextures(this, [...this.failed, ...this.missingImages()]);
    buildUiFonts(this);
    if (!this.anims.exists('coin-spin') && this.textures.exists('coin')) {
      this.anims.create({
        key: 'coin-spin',
        frames: this.anims.generateFrameNumbers('coin'),
        frameRate: 10,
        repeat: -1,
      });
    }
    this.registry.set('levels', this.parseLevels());
    this.scene.start(SCENES.title);
  }

  private missingImages(): string[] {
    return IMAGE_ASSETS.map((a) => a.key).filter((k) => !this.textures.exists(k));
  }

  private parseLevels(): LevelSpec[] {
    const index = this.cache.json.get(LEVEL_INDEX) as { levels: string[] } | undefined;
    const tileset = this.cache.json.get(TILESET) as TiledTileset | undefined;
    const levels: LevelSpec[] = [];
    for (const file of index?.levels ?? []) {
      const map = this.cache.json.get(`level:${file}`) as TiledMap | undefined;
      if (!map) {
        console.warn(`[levels] failed to load ${file}`);
        continue;
      }
      const { level, warnings } = parseLevel(map, file.replace(/\.tmj$/, ''), (src) =>
        src.endsWith('bricks.tsj') ? tileset : undefined,
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
