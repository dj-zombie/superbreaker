import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { audio } from '../systems/AudioSystem';
import { framePanel } from './frames';
import { calm, richFx, theme, type UiTheme } from './theme';

export interface SheetOptions {
  height: number;
  t?: UiTheme;
  /** Scene whose camera is blurred behind the sheet on Medium and High. */
  blur?: Phaser.Scene;
  /** Tapping the shade closes the sheet and calls this. */
  onDismiss?: () => void;
  dim?: number;
}

/** Hidden below the screen edge so the sheet's bottom corners never show. */
const TUCK = 28;
const SHEET_DEPTH = 1000;

/** A panel that springs up from the bottom over a dimmed, blurred backdrop. */
export class Sheet {
  readonly root: Phaser.GameObjects.Container;
  /** Local y of the panel's top edge inside `root`. */
  readonly top: number;
  private shade: Phaser.GameObjects.Rectangle;
  private blur?: { cam: Phaser.Cameras.Scene2D.Camera; fx: Phaser.Filters.Blur };
  private closing = false;

  constructor(
    private scene: Phaser.Scene,
    private opts: SheetOptions,
  ) {
    const t = opts.t ?? theme();
    const h = opts.height + TUCK;
    this.top = -h / 2;
    this.shade = scene.add
      .rectangle(WIDTH / 2, HEIGHT / 2, WIDTH * 2, HEIGHT * 2, t.palette.base, opts.dim ?? 0.55)
      .setInteractive()
      .setAlpha(0)
      .setDepth(SHEET_DEPTH);
    this.shade.on('pointerup', () => this.dismiss());
    const y = HEIGHT - h / 2 + TUCK;
    this.root = scene.add.container(WIDTH / 2, y).setDepth(SHEET_DEPTH + 1);
    const panel = framePanel(scene, 0, 0, WIDTH - 16, h, t, { variant: 'solid', ornament: true });
    const grab = scene.add.rectangle(0, this.top + 16, 46, 4, t.palette.edge, 0.9);
    const hit = scene.add.zone(0, 0, WIDTH - 16, h).setInteractive();
    this.root.add([hit, panel, grab]);

    scene.tweens.add({ targets: this.shade, alpha: 1, duration: 200 });
    if (calm()) {
      this.root.setAlpha(0);
      scene.tweens.add({ targets: this.root, alpha: 1, duration: 180 });
    } else {
      this.root.setY(y + h);
      scene.tweens.add({ targets: this.root, y, duration: 440, ease: 'Back.Out', easeParams: [1.1] });
    }
    audio.whoosh(0.12);

    if (opts.blur && richFx()) {
      const cam = opts.blur.cameras.main;
      const fx = cam.filters.external.addBlur(0, 2, 2, 0);
      this.blur = { cam, fx };
      scene.tweens.add({ targets: fx, strength: 1, duration: 260 });
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dropBlur());
  }

  private dismiss(): void {
    if (this.closing) return;
    this.close(this.opts.onDismiss);
  }

  close(done?: () => void): void {
    if (this.closing) return;
    this.closing = true;
    const s = this.scene;
    s.tweens.add({ targets: this.shade, alpha: 0, duration: 200 });
    if (this.blur) s.tweens.add({ targets: this.blur.fx, strength: 0, duration: 200 });
    s.tweens.add({
      targets: this.root,
      y: this.root.y + (calm() ? 0 : this.opts.height + TUCK),
      alpha: calm() ? 0 : 1,
      duration: 240,
      ease: 'Cubic.In',
      onComplete: () => {
        this.dropBlur();
        done?.();
      },
    });
  }

  private dropBlur(): void {
    if (!this.blur) return;
    this.blur.cam.filters.external.remove(this.blur.fx);
    this.blur = undefined;
  }
}
