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
