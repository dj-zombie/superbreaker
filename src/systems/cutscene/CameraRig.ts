import Phaser from 'phaser';
import { HEIGHT, RENDER_ZOOM, WIDTH } from '../../config';
import type { CameraPose } from '../../core/cutscene';
import { save } from '../../services';
import { calm } from '../../ui/theme';
import { fxTier } from '../Quality';

/** Smooth noise in -1..1 from a few sines that never line up. */
function wobble(t: number): number {
  return (Math.sin(t * 1.7) + 0.6 * Math.sin(t * 2.9 + 1.3) + 0.3 * Math.sin(t * 4.3 + 2.1)) / 1.9;
}

/** How much a rolled view must zoom so its corners stay on the picture. */
function rollCover(rad: number, w: number, h: number): number {
  const a = Math.abs(rad);
  return Math.cos(a) + Math.max(w / h, h / w) * Math.sin(a);
}

/**
 * Points a camera where a cutscene's camera track says, on top of the scene's render zoom. The
 * pose's zoom is relative to the whole board (1), and its center is a board fraction. It adds the
 * noise for handheld and drift, the one-shot punch and whip, and the depth-of-field blur, then
 * keeps the view on the stage so its edges never show.
 */
export class CameraRig {
  private clock = 0;
  private punchLeft = 0;
  private punchMs = 1;
  private punchAmount = 0;
  private whipLeft = 0;
  private whipMs = 1;
  private blur?: Phaser.Filters.Blur;
  private readonly sharp: boolean;

  constructor(private readonly cam: Phaser.Cameras.Scene2D.Camera) {
    this.sharp = fxTier() !== 'high';
  }

  /** A snap zoom on an impact that springs back: `amount` of extra zoom at its peak. */
  punch(amount: number, ms: number): void {
    if (calm()) return;
    this.punchAmount = amount;
    this.punchMs = this.punchLeft = Math.max(1, ms);
  }

  /** The smear of a whip pan, on the high tier. The move itself is on the camera track. */
  whip(ms: number): void {
    if (calm() || this.sharp) return;
    this.whipMs = this.whipLeft = Math.max(1, ms);
  }

  shake(ms: number, intensity: number): void {
    if (calm() || !save.state.settings.screenShake) return;
    this.cam.shake(ms, intensity);
  }

  apply(p: CameraPose, dtMs: number): void {
    this.clock += dtMs / 1000;
    const t = this.clock;
    const cam = this.cam;
    let x = p.x * WIDTH;
    let y = p.y * HEIGHT;
    let zoom = p.zoom;
    let angle = p.angle;
    if (p.sway > 0) {
      x += wobble(t * 1.3) * p.sway * 7;
      y += wobble(t * 1.1 + 7) * p.sway * 5;
      angle += wobble(t * 0.9 + 3) * p.sway * 0.8;
    }
    if (p.drift > 0) {
      x += Math.sin(t * 0.37) * p.drift * 9;
      y += Math.sin(t * 0.29 + 1) * p.drift * 6;
      zoom *= 1 + Math.sin(t * 0.21) * p.drift * 0.012;
    }
    if (this.punchLeft > 0) {
      this.punchLeft = Math.max(0, this.punchLeft - dtMs);
      const k = 1 - this.punchLeft / this.punchMs;
      const env =
        k < 0.18
          ? Phaser.Math.Easing.Cubic.Out(k / 0.18)
          : 1 - Phaser.Math.Easing.Sine.InOut((k - 0.18) / 0.82);
      zoom *= 1 + this.punchAmount * env;
    }

    const rad = Phaser.Math.DegToRad(angle);
    const z = RENDER_ZOOM * Math.max(1, zoom) * rollCover(rad, cam.width, cam.height);
    cam.setZoom(z).setRotation(rad);
    // The view at the scene's own zoom is the whole picture: stay inside it.
    const fullW = cam.width / RENDER_ZOOM;
    const fullH = cam.height / RENDER_ZOOM;
    const viewW = cam.width / z;
    const viewH = cam.height / z;
    const cx = Phaser.Math.Clamp(
      x,
      WIDTH / 2 - (fullW - viewW) / 2,
      WIDTH / 2 + (fullW - viewW) / 2,
    );
    const cy = Phaser.Math.Clamp(
      y,
      HEIGHT / 2 - (fullH - viewH) / 2,
      HEIGHT / 2 + (fullH - viewH) / 2,
    );
    cam.centerOn(cx, cy);

    this.applyBlur(p.blur, dtMs);
  }

  /** Rack focus and whip share one blur: the whip smears sideways, focus softens both ways. */
  private applyBlur(focus: number, dtMs: number): void {
    if (this.sharp) return;
    let whip = 0;
    if (this.whipLeft > 0) {
      this.whipLeft = Math.max(0, this.whipLeft - dtMs);
      whip = Math.sin(Math.PI * (1 - this.whipLeft / this.whipMs));
    }
    const strength = Math.max(focus * 1.4, whip * 1.8);
    if (strength < 0.01) {
      if (this.blur) this.blur.active = false;
      return;
    }
    this.blur ??= this.cam.filters.external.addBlur(0, 2, 2, 0);
    this.blur.active = true;
    this.blur.strength = strength;
    this.blur.x = 2;
    this.blur.y = whip > focus ? 0.25 : 2;
  }

  /** Back to the scene's own framing, for leaving. */
  reset(): void {
    this.cam
      .setZoom(RENDER_ZOOM)
      .setRotation(0)
      .centerOn(WIDTH / 2, HEIGHT / 2);
    if (this.blur) this.blur.active = false;
    this.punchLeft = this.whipLeft = 0;
  }

  destroy(): void {
    if (this.blur) this.cam.filters.external.remove(this.blur);
    this.blur = undefined;
  }
}
