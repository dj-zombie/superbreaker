import Phaser from 'phaser';
import { HEIGHT, RENDER_ZOOM, WIDTH } from '../config';
import type { BossStop } from '../core/Campaign';
import type { LevelSpec } from '../core/types';

/** Every scene works in playfield coordinates regardless of render resolution. */
export abstract class BaseScene extends Phaser.Scene {
  protected setupCamera(): Phaser.Cameras.Scene2D.Camera {
    const cam = this.cameras.main;
    const layout = () => {
      cam.setZoom(RENDER_ZOOM);
      cam.centerOn(WIDTH / 2, HEIGHT / 2);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout, this);
    });
    return cam;
  }

  protected get levels(): LevelSpec[] {
    return (this.registry.get('levels') as LevelSpec[] | undefined) ?? [];
  }

  /** The boss stops on the world map, each after the level it follows. */
  protected get bossStops(): BossStop[] {
    return (this.registry.get('bossStops') as BossStop[] | undefined) ?? [];
  }

  protected stopAfter(index: number): BossStop | undefined {
    return this.bossStops.find((s) => s.after === index);
  }
}
