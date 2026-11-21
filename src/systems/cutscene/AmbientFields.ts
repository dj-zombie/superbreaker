import type Phaser from 'phaser';
import { HEIGHT, RENDER_ZOOM, WIDTH } from '../../config';
import type { AmbientDepth, AmbientFrame, CompiledAmbient } from '../../core/cutscene';
import type { FxEngine, FxHandle } from '../../fx/FxEngine';
import type { BackdropBand } from '../ParallaxBackdrop';

/** Over the actors and every board effect; the cutscene's text is on a camera of its own. */
const FRONT_DEPTH = 20;

/**
 * The script's running fields (clouds, fog, sparks...) kept in step with the sampled frame: a
 * field starts when it first appears, follows its sampled intensity as it fades, and stops when
 * it leaves the frame. Live particles finish their lives, so nothing pops.
 */
export class AmbientFields {
  private running = new Map<CompiledAmbient, FxHandle>();

  constructor(
    private readonly fx: FxEngine,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly band: (b: BackdropBand) => number,
  ) {}

  apply(frames: readonly AmbientFrame[]): void {
    const live = new Set<CompiledAmbient>();
    for (const f of frames) {
      live.add(f.ambient);
      let h = this.running.get(f.ambient);
      if (!h) {
        h = this.fx.weather(f.ambient.fx, this.area(f.ambient), {
          intensity: Math.max(0.001, f.intensity),
          depth: this.depthOf(f.ambient.depth),
          quiet: true,
        });
        this.running.set(f.ambient, h);
      } else {
        h.set({ intensity: f.intensity });
      }
    }
    for (const [a, h] of this.running) {
      if (live.has(a)) continue;
      h.stop();
      this.running.delete(a);
    }
  }

  /** `front` is over the whole picture, actors included; `board` keeps each layer's own channel. */
  private depthOf(d: AmbientDepth): number | undefined {
    if (d === 'board') return undefined;
    if (d === 'front') return FRONT_DEPTH;
    return this.band(d);
  }

  /** The area as board fractions, or everything the camera can see at the scene's own zoom. */
  private area(a: CompiledAmbient): { x: number; y: number; width: number; height: number } {
    const viewW = this.cam.width / RENDER_ZOOM;
    const viewH = this.cam.height / RENDER_ZOOM;
    const left = WIDTH / 2 - viewW / 2;
    const top = HEIGHT / 2 - viewH / 2;
    if (!a.area) return { x: left, y: top, width: viewW, height: viewH };
    const [x, y, w, h] = a.area;
    return { x: x * WIDTH, y: y * HEIGHT, width: w * WIDTH, height: h * HEIGHT };
  }

  /** Stops every field at once, for a skip to the end. */
  stopAll(): void {
    for (const h of this.running.values()) h.stop();
    this.running.clear();
  }
}
