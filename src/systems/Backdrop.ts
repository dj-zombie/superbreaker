/**
 * Multiply tint for the background image. Tinting one sprite is free on the GPU, while a
 * full-screen overlay or camera filter redraws every pixel of a phone-sized canvas again.
 */
export function backdropTint(dim: number, dark = 0, hue?: number): number {
  const k = (1 - dim) * (1 - dark);
  // A slight blue cast stands in for the old purple veil.
  let r = k;
  let g = k * 0.96;
  let b = k * 1.12;
  if (hue !== undefined) {
    r *= 0.55 + (((hue >> 16) & 0xff) / 255) * 0.7;
    g *= 0.55 + (((hue >> 8) & 0xff) / 255) * 0.7;
    b *= 0.55 + ((hue & 0xff) / 255) * 0.7;
  }
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** A plain background image or the lit DepthBackdrop. */
export interface Tintable {
  setTint(color: number): unknown;
}

/**
 * Mood control for the Play background: Fever recolors it, the Black Hole darkens it.
 * With the light map, darkness goes to `onDark` (the ambient) instead of the tint.
 */
export class Backdrop {
  private dark = 0;
  private darkTarget = 0;
  private hue?: number;
  private dirty = true;

  constructor(
    private image: Tintable,
    private dim: number,
    private onDark?: (dark: number) => void,
  ) {}

  setHue(color?: number): void {
    if (color === this.hue) return;
    this.hue = color;
    this.dirty = true;
  }

  /** 0 leaves the art alone, 1 is black. Eased over about a third of a second. */
  setDark(amount: number): void {
    this.darkTarget = amount;
  }

  update(dtMs: number): void {
    if (this.dark !== this.darkTarget) {
      const step = dtMs / 350;
      this.dark =
        this.dark < this.darkTarget
          ? Math.min(this.darkTarget, this.dark + step)
          : Math.max(this.darkTarget, this.dark - step);
      this.dirty = true;
      this.onDark?.(this.dark);
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.image.setTint(backdropTint(this.dim, this.onDark ? 0 : this.dark, this.hue));
  }
}
