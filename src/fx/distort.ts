import Phaser from 'phaser';
import { fxTier } from '../systems/Quality';

const MAP = 'fx-distort-map';
const RING = 'fx-distort-ring';
const NOISE = 'fx-distort-noise';
/** Neutral gray. Stamped rather than fill()ed: in WebGL a fill lands on top of later stamps. */
const FLAT = 'fx-distort-flat';
const RING_SIZE = 128;
const NOISE_SIZE = 64;
/** The displacement map is drawn at this fraction of the camera's size; it is smooth, so this is plenty. */
const MAP_SCALE = 0.25;
/** The most any pixel is pushed, in px, when a wave or haze is at full strength. */
export const MAX_PUSH = 24;
let maps = 0;

interface Wave {
  x: number;
  y: number;
  radius: number;
  life: number;
  age: number;
  alpha: number;
}

interface Haze {
  target: { x: number; y: number; active?: boolean };
  w: number;
  h: number;
  dy: number;
  alpha: number;
  phase: number;
  stopped: boolean;
}

/** Red and green encode a push: 0.5 is none, 0 and 1 are a full push left/up and right/down. */
function paint(scene: Phaser.Scene, key: string, size: number, at: (u: number, v: number) => [number, number, number]): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, a] = at(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(Phaser.Math.Clamp(r, 0, 1) * 255);
      img.data[i + 1] = Math.round(Phaser.Math.Clamp(g, 0, 1) * 255);
      img.data[i + 2] = 128;
      img.data[i + 3] = Math.round(Phaser.Math.Clamp(a, 0, 1) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

function bakeMaps(scene: Phaser.Scene): void {
  paint(scene, FLAT, 4, () => [0.5, 0.5, 1]);
  // A refracting ring: pixels push outward on a band near the rim, nothing in the middle.
  paint(scene, RING, RING_SIZE, (u, v) => {
    const r = Math.hypot(u, v);
    if (r >= 1) return [0.5, 0.5, 0];
    const w = Math.exp(-(((r - 0.78) / 0.13) ** 2));
    const nx = r > 0 ? u / r : 0;
    const ny = r > 0 ? v / r : 0;
    return [0.5 + 0.5 * nx * w, 0.5 + 0.5 * ny * w, Math.min(1, (1 - r) * 12)];
  });
  // Heat shimmer: smooth wobble that tiles, strongest in the middle of the patch.
  paint(scene, NOISE, NOISE_SIZE, (u, v) => {
    const r = Math.min(1, Math.hypot(u, v * 0.8));
    const mask = Math.max(0, 1 - r * r);
    const a = u * Math.PI;
    const b = v * Math.PI;
    const n1 = Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * 0.6 + Math.sin(b * 5 + a) * 0.4;
    const n2 = Math.sin(b * 4 + Math.sin(a * 3) * 1.2) * 0.6 + Math.sin(a * 6 - b * 2) * 0.4;
    return [0.5 + 0.5 * n1 * mask, 0.5 + 0.5 * n2 * mask, Math.min(1, mask * 3)];
  });
}

/**
 * Screen distortion on the High tier: shockwave rings and heat haze, drawn into a small
 * displacement map that one camera Displacement filter reads. The filter is switched off whenever
 * nothing is distorting, so it costs nothing at rest.
 */
export class FxDistort {
  private map?: Phaser.Textures.DynamicTexture;
  private filter?: Phaser.Filters.Displacement;
  private waves: Wave[] = [];
  private hazes: Haze[] = [];
  private primed = false;

  constructor(private scene: Phaser.Scene) {}

  private get camera(): Phaser.Cameras.Scene2D.Camera {
    return this.scene.cameras.main;
  }

  /** Whether distortion runs now: WebGL and the High tier. */
  enabled(): boolean {
    return fxTier() === 'high' && this.scene.game.renderer.type === Phaser.WEBGL && !!this.camera?.filters;
  }

  /** Builds the map and filter ahead of time so the first explosion does not compile a shader. */
  prime(): void {
    if (this.enabled()) this.ensure();
  }

  /** A ring that sweeps out from (x, y) to `radius` px over `life` ms, pushing up to `push` px. */
  shock(x: number, y: number, radius: number, life: number, push = 12): void {
    if (!this.enabled()) return;
    this.ensure();
    this.waves.push({ x, y, radius, life, age: 0, alpha: Math.min(1, push / MAX_PUSH) });
  }

  /** Heat shimmer in a `w` x `h` box above a moving target until stopped. */
  haze(target: Haze['target'], w: number, h: number, push = 4, dy = 0): { stop(): void } {
    const haze: Haze = { target, w, h, dy, alpha: Math.min(1, push / MAX_PUSH), phase: Math.random() * 1000, stopped: false };
    if (this.enabled()) {
      this.ensure();
      this.hazes.push(haze);
    }
    return {
      stop: () => {
        haze.stopped = true;
      },
    };
  }

  clear(): void {
    this.waves.length = 0;
    this.hazes.length = 0;
  }

  update(delta: number): void {
    const filter = this.filter;
    const map = this.map;
    if (!filter || !map) return;

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.age += delta;
      if (w.age >= w.life) this.waves.splice(i, 1);
    }
    for (let i = this.hazes.length - 1; i >= 0; i--) {
      const h = this.hazes[i]!;
      h.phase += delta;
      if (h.stopped || h.target.active === false) this.hazes.splice(i, 1);
    }

    const on = this.enabled() && (this.waves.length > 0 || this.hazes.length > 0 || !this.primed);
    filter.active = on;
    if (!on) return;
    this.primed = true;

    const view = this.camera.worldView;
    const sx = map.width / view.width;
    const sy = map.height / view.height;
    this.neutral(map);
    for (const w of this.waves) {
      const t = w.age / w.life;
      const r = w.radius * (1 - (1 - t) ** 3);
      const size = Math.max(2, r * 2);
      map.stamp(RING, undefined, (w.x - view.x) * sx, (w.y - view.y) * sy, {
        scaleX: (size * sx) / RING_SIZE,
        scaleY: (size * sy) / RING_SIZE,
        alpha: w.alpha * (1 - t) ** 1.4,
      });
    }
    for (const h of this.hazes) {
      // Two patches rising and crossfading, so the shimmer never visibly loops.
      for (let j = 0; j < 2; j++) {
        const p = (h.phase / 1400 + j * 0.5) % 1;
        const x = h.target.x + Math.sin(h.phase / 900 + j * 2) * h.w * 0.08;
        const y = h.target.y + h.dy - h.h * 0.5 - p * h.h * 0.4;
        map.stamp(NOISE, undefined, (x - view.x) * sx, (y - view.y) * sy, {
          scaleX: (h.w * sx) / NOISE_SIZE,
          scaleY: (h.h * sy) / NOISE_SIZE,
          rotation: Math.sin(h.phase / 1300 + j) * 0.3,
          alpha: h.alpha * Math.sin(Math.PI * p),
        });
      }
    }
    map.render();
  }

  destroy(): void {
    this.clear();
    if (this.filter) this.camera?.filters?.internal.remove(this.filter);
    this.filter = undefined;
    this.map?.destroy();
    this.map = undefined;
  }

  private neutral(map: Phaser.Textures.DynamicTexture): void {
    map.stamp(FLAT, undefined, 0, 0, { originX: 0, originY: 0, scaleX: map.width / 4, scaleY: map.height / 4 });
  }

  private ensure(): void {
    if (this.filter) return;
    bakeMaps(this.scene);
    const cam = this.camera;
    // Pushes are in world px, and the filter's amount is a fraction of the view. worldView is
    // still empty during create(), so size the view from the zoom.
    const vw = cam.width / cam.zoomX;
    const vh = cam.height / cam.zoomY;
    const key = `${MAP}-${++maps}`;
    const map = this.scene.textures.addDynamicTexture(key, Math.max(8, Math.round(vw * MAP_SCALE)), Math.max(8, Math.round(vh * MAP_SCALE)));
    if (!map) return;
    this.neutral(map);
    map.render();
    this.map = map;
    this.filter = cam.filters!.internal.addDisplacement(key, (2 * MAX_PUSH) / vw, (2 * MAX_PUSH) / vh);
  }
}
