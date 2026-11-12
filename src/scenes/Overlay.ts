import { HEIGHT, WIDTH } from '../config';
import { BaseScene } from './BaseScene';

export interface OverlayData {
  /** Scene that launched this overlay and should resume when it closes. */
  from: string;
}

/** Modal scene drawn over a paused scene. */
export abstract class Overlay extends BaseScene {
  protected from = '';

  init(data: OverlayData): void {
    this.from = data.from;
  }

  protected openOverlay(dim = 0.6): void {
    this.setupCamera();
    this.input.enabled = true;
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH * 2, HEIGHT * 2, 0x05030f, dim);
    shade.setInteractive();
    shade.setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 180 });
  }

  /** Pops a game object in with a springy scale. */
  protected popIn(target: Phaser.GameObjects.Container): void {
    target.setScale(0.7);
    this.tweens.add({ targets: target, scale: 1, duration: 320, ease: 'Back.Out' });
  }

  protected close(): void {
    this.scene.resume(this.from);
    this.scene.stop();
  }

  /** Opens another overlay on top of this one; this one resumes when it closes. */
  protected openChild(key: string): void {
    this.scene.launch(key, { from: this.scene.key });
    this.scene.pause();
  }
}
