import Phaser from 'phaser';
import { gradeMatrix, gradeTint, isNeutralColor, type Grade } from '../../core/cutscene';
import { viewRect } from '../../ui/cutscene/LetterboxView';
import { LIGHTING_BUDGETS, lightingTier } from '../Quality';

type Filters = Phaser.GameObjects.Components.FilterList;
type Controller = Phaser.Filters.Controller;

/** Vignette textures are baked per radius step, so a grade easing its radius reuses a few. */
const VIGNETTE_STEPS = 40;
const VIGNETTE_SIZE = 256;

const WHITE = 0xffffff;

/** Full-screen filter passes are a High-tier extra, like the game's other filters. */
function filtersAllowed(): boolean {
  return LIGHTING_BUDGETS[lightingTier()].extras;
}

/**
 * A grade on a camera: a color matrix, a two-color map and a soft blur as filters on the world
 * camera, and the vignette as one image over the picture. Each filter stays in its place in the
 * chain and is switched off while it does nothing. The tier is checked every frame: below High
 * there are no filters, and `fallback` gets the multiply tint the grade comes nearest to, for the
 * backdrop and the actors. The vignette shows on every tier.
 */
export class GradeFx {
  private matrix?: Phaser.Filters.ColorMatrix;
  private duo?: Phaser.Filters.GradientMap;
  private duoKey = -1;
  private blur?: Phaser.Filters.Blur;
  private readonly vignette: Phaser.GameObjects.Image;
  private vignetteStep = -1;
  private lastTint = -1;

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly ui: Phaser.Cameras.Scene2D.Camera,
    depth: number,
    private readonly fallback: (tint: number) => void,
  ) {
    this.vignette = cam.scene.add
      .image(0, 0, '__WHITE')
      .setOrigin(0)
      .setDepth(depth)
      .setVisible(false);
  }

  private get filters(): Filters {
    return this.cam.filters.external;
  }

  apply(g: Grade): void {
    this.applyVignette(g);
    if (!filtersAllowed()) {
      this.filtersOff();
      this.setTint(gradeTint(g));
      return;
    }
    this.setTint(WHITE);
    const neutral = isNeutralColor({ ...g, duotone: 0 });
    if (!neutral && !this.matrix) this.matrix = this.filters.addColorMatrix();
    if (this.matrix) {
      this.matrix.active = !neutral;
      if (!neutral) this.matrix.colorMatrix.set(gradeMatrix(g));
    }

    this.applyDuotone(g);

    if (g.soften > 0.01 && !this.blur) {
      this.blur = this.filters.addBlur(0, 2, 2, 0);
    }
    if (this.blur) {
      this.blur.active = g.soften > 0.01;
      this.blur.strength = g.soften * 1.2;
    }
  }

  private setTint(tint: number): void {
    if (tint === this.lastTint) return;
    this.lastTint = tint;
    this.fallback(tint);
  }

  private filtersOff(): void {
    for (const c of [this.matrix, this.duo, this.blur]) if (c) c.active = false;
  }

  private applyVignette(g: Grade): void {
    const v = this.vignette;
    if (g.vignette <= 0.002) {
      v.setVisible(false);
      return;
    }
    const step = Math.round(Phaser.Math.Clamp(g.vignetteRadius, 0, 1) * VIGNETTE_STEPS);
    if (step !== this.vignetteStep) {
      this.vignetteStep = step;
      v.setTexture(this.vignetteTexture(step));
    }
    const r = viewRect(this.ui);
    v.setPosition(r.left, r.top)
      .setDisplaySize(r.width, r.height)
      .setTint(g.vignetteColor)
      .setAlpha(Math.min(1, g.vignette))
      .setVisible(true);
  }

  /** A white ring on clear, clear inside `radius` of the half-diagonal and solid at the corners. */
  private vignetteTexture(step: number): string {
    const key = `cs_vignette_${step}`;
    const textures = this.cam.scene.textures;
    if (textures.exists(key)) return key;
    const size = VIGNETTE_SIZE;
    const canvas = textures.createCanvas(key, size, size);
    if (!canvas) return '__WHITE';
    const ctx = canvas.getContext();
    const half = size / 2;
    const outer = Math.hypot(half, half);
    const inner = outer * Phaser.Math.Clamp(step / VIGNETTE_STEPS, 0.05, 0.95);
    const grad = ctx.createRadialGradient(half, half, inner, half, half, outer);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
    return key;
  }

  private applyDuotone(g: Grade): void {
    if (g.duotone <= 0.002) {
      if (this.duo) this.duo.active = false;
      return;
    }
    const key = (g.duoShadow * 31) ^ g.duoLight;
    if (!this.duo || key !== this.duoKey) {
      // The ramp is baked for the GPU when made, so a new pair of colors needs a new map. It goes
      // in right after the matrix, so the colors map before the blur.
      const f = this.filters;
      if (this.duo) f.remove(this.duo as Controller);
      this.duo = new Phaser.Filters.GradientMap(this.cam, {
        ramp: { colorStart: g.duoShadow, colorEnd: g.duoLight },
      });
      const at = this.matrix ? f.list.indexOf(this.matrix as Controller) + 1 : 0;
      f.add(this.duo as Controller, at);
      this.duoKey = key;
    }
    this.duo.active = true;
    this.duo.alpha = g.duotone;
  }

  destroy(): void {
    const f = this.filters;
    for (const c of [this.matrix, this.duo, this.blur]) {
      if (c) f.remove(c as Controller);
    }
    this.matrix = this.duo = this.blur = undefined;
    this.vignette.destroy();
  }
}
