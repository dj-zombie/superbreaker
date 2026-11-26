import type Phaser from 'phaser';
import { HEIGHT, RENDER_ZOOM, WIDTH } from '../../config';
import type { CompiledPlate, PlateFrame } from '../../core/cutscene';

/**
 * Full-screen illustrations with a slow pan and zoom. A plate's frame is a focus point in the
 * picture (fractions of its width and height) and a zoom over the size that just covers the
 * view; the picture never shows an edge.
 */
export class PlateLayer {
  private shown = new Map<CompiledPlate, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly depth: (plate: CompiledPlate) => number,
  ) {}

  objects(): Phaser.GameObjects.GameObject[] {
    return [...this.shown.values()];
  }

  apply(frames: readonly PlateFrame[]): void {
    const live = new Set<CompiledPlate>();
    for (const f of frames) {
      live.add(f.plate);
      let img = this.shown.get(f.plate);
      if (!img) {
        if (!this.scene.textures.exists(f.plate.image)) continue;
        img = this.scene.add
          .image(0, 0, f.plate.image)
          .setDepth(this.depth(f.plate) + this.shown.size * 0.01);
        this.shown.set(f.plate, img);
      }
      // The whole picture at the scene's own zoom, whatever the cutscene camera is doing.
      const viewW = this.cam.width / RENDER_ZOOM;
      const viewH = this.cam.height / RENDER_ZOOM;
      const iw = img.frame.width;
      const ih = img.frame.height;
      const scale = Math.max(viewW / iw, viewH / ih) * Math.max(1, f.frame.zoom);
      const w = iw * scale;
      const h = ih * scale;
      const slackX = (w - viewW) / 2;
      const slackY = (h - viewH) / 2;
      const dx = Math.max(-slackX, Math.min(slackX, (0.5 - f.frame.x) * w));
      const dy = Math.max(-slackY, Math.min(slackY, (0.5 - f.frame.y) * h));
      img
        .setScale(scale)
        .setPosition(WIDTH / 2 + dx, HEIGHT / 2 + dy)
        .setAlpha(f.alpha);
    }
    for (const [plate, img] of this.shown) {
      if (live.has(plate)) continue;
      img.destroy();
      this.shown.delete(plate);
    }
  }

  destroy(): void {
    for (const img of this.shown.values()) img.destroy();
    this.shown.clear();
  }
}
