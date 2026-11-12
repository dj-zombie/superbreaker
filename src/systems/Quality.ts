import type Phaser from 'phaser';
import { HEIGHT, MAX_RENDER_ZOOM, RENDER_ZOOM, WIDTH, setRenderZoom } from '../config';
import { save } from '../services';

/** Resolutions the frame monitor walks down through. Fill cost scales with the square. */
const ZOOM_STEPS = [2, 1.5, 1.25];
const SAVER_ZOOM = 1.25;
const SLOW_FRAME_MS = 22;
const SLOW_BUDGET_MS = 3000;
const SETTLE_MS = 2000;
/** Longer gaps are loads, pauses or a backgrounded tab, not rendering cost. */
const OUTLIER_MS = 250;

/** Lowest zoom the monitor has needed this session. */
let autoZoom = MAX_RENDER_ZOOM;

export function targetZoom(): number {
  return save.state.settings.batterySaver ? Math.min(autoZoom, SAVER_ZOOM) : autoZoom;
}

/** Particle multiplier for the juice and ball trail emitters. */
export function particleDensity(): number {
  return save.state.settings.batterySaver ? 0.5 : 1;
}

/** Resizes the canvas to the target zoom. Cameras re-zoom from the scale RESIZE event. */
export function applyQuality(game: Phaser.Game): void {
  const before = RENDER_ZOOM;
  setRenderZoom(targetZoom());
  if (RENDER_ZOOM !== before) game.scale.resize(WIDTH * RENDER_ZOOM, HEIGHT * RENDER_ZOOM);
}

/** Steps the resolution down when frames stay slower than about 45fps for a few seconds. */
export class FrameMonitor {
  private last = 0;
  private slowMs = 0;
  private settleMs = SETTLE_MS;

  constructor(private game: Phaser.Game) {}

  update(): void {
    const now = performance.now();
    const dt = this.last ? now - this.last : 0;
    this.last = now;
    if (dt <= 0 || dt > OUTLIER_MS) return;
    if (this.settleMs > 0) {
      this.settleMs -= dt;
      return;
    }
    // Fast frames drain the budget at half rate, so brief spikes never add up to a step.
    this.slowMs = dt > SLOW_FRAME_MS ? this.slowMs + dt : Math.max(0, this.slowMs - dt / 2);
    if (this.slowMs < SLOW_BUDGET_MS) return;
    this.slowMs = 0;
    const next = ZOOM_STEPS.find((z) => z < Math.min(autoZoom, RENDER_ZOOM) - 0.01);
    if (next === undefined) return;
    autoZoom = next;
    applyQuality(this.game);
    this.settleMs = SETTLE_MS;
  }
}
