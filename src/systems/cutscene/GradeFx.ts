import Phaser from 'phaser';
import { gradeMatrix, gradeTint, isNeutralColor, type Grade } from '../../core/cutscene';
import { richFx } from '../../ui/theme';

type Filters = Phaser.GameObjects.Components.FilterList;
type Controller = Phaser.Filters.Controller;

/**
 * A grade on a camera: a color matrix, a two-color map, a vignette and a soft blur, in that
 * order. Each filter stays in its place in the chain and is switched off while it does nothing.
 * Without rich effects there are no filters: `fallback` gets the multiply tint the grade comes
 * nearest to, for the backdrop and the actors.
 */
export class GradeFx {
  private matrix?: Phaser.Filters.ColorMatrix;
  private duo?: Phaser.Filters.GradientMap;
  private duoKey = -1;
  private vignette?: Phaser.Filters.Vignette;
  private blur?: Phaser.Filters.Blur;
  private readonly rich: boolean;
  private lastTint = -1;

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly fallback: (tint: number) => void,
  ) {
    this.rich = richFx();
    if (!this.rich) return;
    const f = this.filters;
    this.matrix = f.addColorMatrix();
    this.vignette = f.addVignette(0.5, 0.5, 0.8, 0, 0x000000);
    this.matrix.active = false;
    this.vignette.active = false;
  }

  private get filters(): Filters {
    return this.cam.filters.external;
  }

  apply(g: Grade): void {
    if (!this.rich) {
      const tint = gradeTint(g);
      if (tint !== this.lastTint) {
        this.lastTint = tint;
        this.fallback(tint);
      }
      return;
    }
    const m = this.matrix!;
    const neutral = isNeutralColor({ ...g, duotone: 0 });
    m.active = !neutral;
    if (!neutral) m.colorMatrix.set(gradeMatrix(g));

    this.applyDuotone(g);

    const v = this.vignette!;
    v.active = g.vignette > 0.002;
    if (v.active) {
      v.strength = g.vignette;
      v.radius = g.vignetteRadius;
      v.setColor(g.vignetteColor);
    }

    if (g.soften > 0.01 && !this.blur) {
      this.blur = this.filters.addBlur(0, 2, 2, 0);
    }
    if (this.blur) {
      this.blur.active = g.soften > 0.01;
      this.blur.strength = g.soften * 1.2;
    }
  }

  private applyDuotone(g: Grade): void {
    if (g.duotone <= 0.002) {
      if (this.duo) this.duo.active = false;
      return;
    }
    const key = (g.duoShadow * 31) ^ g.duoLight;
    if (!this.duo || key !== this.duoKey) {
      // The ramp is baked for the GPU when made, so a new pair of colors needs a new map. It goes
      // in right after the matrix, ahead of the vignette, so the corners keep their own color.
      const f = this.filters;
      if (this.duo) f.remove(this.duo as Controller);
      this.duo = new Phaser.Filters.GradientMap(this.cam, {
        ramp: { colorStart: g.duoShadow, colorEnd: g.duoLight },
      });
      f.add(this.duo as Controller, f.list.indexOf(this.matrix as Controller) + 1);
      this.duoKey = key;
    }
    this.duo.active = true;
    this.duo.alpha = g.duotone;
  }

  destroy(): void {
    const f = this.filters;
    for (const c of [this.matrix, this.duo, this.vignette, this.blur]) {
      if (c) f.remove(c as Controller);
    }
    this.matrix = this.duo = this.vignette = this.blur = undefined;
  }
}
