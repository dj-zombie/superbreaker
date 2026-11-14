import type Phaser from 'phaser';
import { sceneryLight, type WorldMood } from '../art/lighting';
import { LIGHT_TEX } from '../art/lightTextures';
import { HEIGHT, HUD_HEIGHT, PADDLE_Y, WIDTH } from '../config';
import { MAX_FLASH_HZ, noise1, sputter, type Blink } from '../core/Lighting';
import { audio } from './AudioSystem';
import type { Light, LightingSystem } from './LightingSystem';
import type { ParallaxBackdrop } from './ParallaxBackdrop';

/** World ambience layered over the light map. */
export interface MoodFx {
  update(dt: number, clock: number): void;
  onHit?(): void;
  destroy(): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Crypt storms strike about this often (seconds) when the level doesn't set its own lightning. */
const STORM_LIGHTNING = 14;
/** Lights out: the room lights sputter about this often (seconds). */
const SPUTTER_INTERVAL = 11;
/** A sputter never starts this soon (seconds) after another flash, such as a lightning strike. */
const SPUTTER_QUIET = 1.5;

export function createMood(
  sys: LightingSystem,
  scene: Phaser.Scene,
  mood: WorldMood,
  scenery?: ParallaxBackdrop,
): MoodFx | undefined {
  const keyed = new KeyLight(sys);
  let fx: MoodFx | undefined;
  if (mood === 'forge') fx = new Forge(sys, scene);
  else if (mood === 'storm') fx = new Storm(sys);
  else if (mood === 'beat') fx = new Beat(sys);
  // Lights-out levels only get lightning when the map asks; storms skip it with reduced motion.
  const stormy = mood === 'storm' && !sys.look.lightsOut && !sys.calm;
  const interval = sys.look.lightning ?? (stormy ? STORM_LIGHTNING : undefined);
  const failing = sys.look.lightsOut && sys.look.sputter ? new FailingLights(sys) : undefined;
  const lightning = interval
    ? new Lightning(sys, interval, scenery, () => failing?.active ?? false)
    : undefined;
  return {
    update: (dt, clock) => {
      sys.ambientScale = 1;
      sys.roomFlicker = 0;
      keyed.update(clock);
      fx?.update(dt, clock);
      lightning?.update(clock);
      failing?.update(clock);
    },
    onHit: () => fx?.onHit?.(),
    destroy: () => fx?.destroy(),
  };
}

/** The world's big slow scene light (lava glow, moonlight, server glow), swaying gently. */
class KeyLight {
  private light?: Light;

  constructor(private sys: LightingSystem) {
    const k = sys.look.key;
    if (!k) return;
    this.light = sys.addLight({
      x: WIDTH * k.x,
      y: HEIGHT * k.y,
      radius: HEIGHT * k.radius,
      color: k.color,
      intensity: k.intensity * sceneryLight(sys.look),
      priority: 7,
    });
  }

  update(clock: number): void {
    const k = this.sys.look.key;
    if (!this.light || !k) return;
    const sway = this.sys.calm ? 0 : Math.sin(clock * 0.15) * k.sweep;
    this.light.x = WIDTH * (k.x + sway);
    this.light.y = HEIGHT * k.y;
    this.light.radius = HEIGHT * k.radius;
  }
}

// ---------------------------------------------------------------- Hell

/** A breathing furnace: the ambient swells, embers rise with their own light, heat shimmers. */
class Forge implements MoodFx {
  private embers: Array<{ light: Light; vy: number; wobble: number }> = [];
  private haze?: Phaser.Textures.DynamicTexture;

  constructor(
    private sys: LightingSystem,
    private scene: Phaser.Scene,
  ) {
    if (sys.budgetInfo.moodLights) {
      for (let i = 0; i < 5; i++) {
        const light = sys.addLight({
          x: rand(30, WIDTH - 30),
          y: rand(HUD_HEIGHT, HEIGHT),
          radius: 56,
          color: 0xff7a2a,
          intensity: 0.3 * sceneryLight(sys.look),
          flicker: 'candle',
          phase: i * 1.7,
          halo: 7,
          haloAlpha: 0.45,
          haloDepth: -3,
          affects: 'backdrop',
          priority: 1,
        });
        this.embers.push({ light, vy: rand(22, 48), wobble: rand(0, Math.PI * 2) });
      }
    }
    if (sys.budgetInfo.extras && !sys.calm) {
      if (scene.textures.exists('lm_haze')) scene.textures.remove('lm_haze');
      this.haze = scene.textures.addDynamicTexture('lm_haze', 64, 64) ?? undefined;
      if (this.haze) sys.addHaze('lm_haze', 0.0035);
    }
  }

  update(dt: number, clock: number): void {
    if (!this.sys.calm && !this.sys.look.lightsOut) {
      this.sys.ambientScale = 0.95 + 0.07 * noise1(clock * 0.45);
    }
    for (const e of this.embers) {
      const l = e.light;
      l.y -= e.vy * dt;
      l.x += Math.sin(clock * 1.3 + e.wobble) * 14 * dt;
      if (l.y < HUD_HEIGHT - 30) {
        l.y = HEIGHT + 30;
        l.x = rand(30, WIDTH - 30);
      }
    }
    if (this.haze) {
      // Scroll the noise upward so the shimmer rises with the heat.
      const off = (clock * 18) % 64;
      this.haze.stamp(LIGHT_TEX.noise, undefined, 0, -off, { originX: 0, originY: 0 });
      this.haze.stamp(LIGHT_TEX.noise, undefined, 0, 64 - off, { originX: 0, originY: 0 });
      this.haze.render();
    }
  }

  destroy(): void {
    for (const e of this.embers) e.light.kill();
    if (this.haze && this.scene.textures.exists('lm_haze')) this.scene.textures.remove('lm_haze');
  }
}

// ---------------------------------------------------------------- Crypt

/** Moonlight through stained glass and drifting wisps. The storm's lightning is `Lightning`. */
class Storm implements MoodFx {
  private windows: Array<{ light: Light; base: number }> = [];
  private wisps: Light[] = [];

  constructor(private sys: LightingSystem) {
    if (!sys.budgetInfo.moodLights) return;
    const top = HUD_HEIGHT - 6;
    for (const [fx, deg] of [
      [0.16, -14],
      [0.6, 11],
    ] as const) {
      const light = sys.addLight({
        x: WIDTH * fx,
        y: top,
        area: {
          width: 120,
          height: HEIGHT * 0.62,
          rotation: (deg * Math.PI) / 180,
          cookie: 'stained',
        },
        color: 0xfff1dc,
        intensity: 0.3 * sceneryLight(sys.look),
        affects: 'backdrop',
        priority: 2,
      });
      this.windows.push({ light, base: (deg * Math.PI) / 180 });
    }
    for (let i = 0; i < 2; i++) {
      this.wisps.push(
        sys.addLight({
          radius: 72,
          color: 0x7fe8ff,
          intensity: 0.3 * sceneryLight(sys.look),
          flicker: 'breathe',
          phase: i * 3,
          halo: 10,
          haloAlpha: 0.4,
          haloDepth: -3,
          // In the dark they would show the bricks they drift past.
          affects: sys.look.lightsOut ? 'backdrop' : 'both',
          priority: 1,
        }),
      );
    }
  }

  update(_dt: number, clock: number): void {
    for (const [i, w] of this.windows.entries()) {
      w.light.area!.rotation = w.base + (this.sys.calm ? 0 : Math.sin(clock * 0.22 + i * 2) * 0.04);
    }
    for (const [i, l] of this.wisps.entries()) {
      l.x = WIDTH * (0.5 + 0.4 * Math.sin(clock * 0.11 * (i + 1) + i * 2.1));
      l.y = HUD_HEIGHT + (PADDLE_Y - HUD_HEIGHT) * (0.5 + 0.32 * Math.sin(clock * 0.17 + i * 1.3));
    }
  }

  destroy(): void {
    for (const w of this.windows) w.light.kill();
    for (const l of this.wisps) l.kill();
  }
}

/**
 * Lightning: one or two flashes per strike, then thunder. Strikes come seconds apart and every
 * flash must pass flashAmbient's MAX_FLASH_HZ limit, well under the three-per-second
 * photosensitivity guideline. On lights-out levels a strike shows the layout for a moment.
 * With reduced motion a strike is one slow swell with no strike light.
 */
class Lightning {
  private nextStrike: number;
  private flashes: number[] = [];
  private thunderAt = -1;

  constructor(
    private sys: LightingSystem,
    private interval: number,
    private scenery?: ParallaxBackdrop,
    /** True while the room lights sputter; a strike then waits so its flash isn't dropped. */
    private busy: () => boolean = () => false,
  ) {
    // Not during a lights-out level's preview, while the layout is still lit.
    this.nextStrike = (sys.look.preview ?? 0) + 1 + interval * rand(0.3, 0.6);
  }

  update(clock: number): void {
    if (clock >= this.nextStrike && this.busy()) this.nextStrike = clock + 1;
    if (clock >= this.nextStrike) {
      this.nextStrike = clock + this.interval * rand(0.6, 1.4);
      this.flashes = [clock];
      // Two flashes 0.2 s apart stay within MAX_FLASH_HZ.
      if (!this.sys.calm && Math.random() < 0.55) {
        this.flashes.push(clock + Math.max(0.2, 1 / MAX_FLASH_HZ / 2));
      }
      this.thunderAt = clock + rand(0.5, 1.3);
    }
    while (this.flashes.length && clock >= this.flashes[0]!) {
      this.flashes.shift();
      this.strike();
    }
    if (this.thunderAt >= 0 && clock >= this.thunderAt) {
      this.thunderAt = -1;
      audio.thunder(rand(0.3, 0.5));
    }
  }

  private strike(): void {
    const dark = this.sys.look.lightsOut;
    if (!this.sys.flashAmbient(0xc8d4ff, dark ? 0.15 : 0.3)) return;
    this.sys.revealLevel(0.8);
    if (this.sys.calm) return;
    this.sys.addLight({
      x: rand(80, WIDTH - 80),
      y: HUD_HEIGHT - 40,
      radius: HEIGHT * 0.9,
      color: 0xbfd0ff,
      intensity: 0.6,
      lifeMs: 420,
      priority: 9,
    });
    this.scenery?.flash(0.2);
  }
}

/**
 * Lights out: now and then the dead room lights sputter back on, buzzing, and die again. Each
 * blink shows the layout for a moment and books its flash with the lighting system, which
 * shares the MAX_FLASH_HZ limit with lightning. With reduced motion a sputter is one faint,
 * slow swell.
 */
class FailingLights {
  private nextAt: number;
  private blinks: Blink[] = [];
  /** Blinks that lost the flash limit to something else; they stay dark. */
  private dropped = new Set<Blink>();
  private start = 0;
  private due = 0;

  constructor(private sys: LightingSystem) {
    this.nextAt = (sys.look.preview ?? 0) + rand(2.5, 5);
  }

  get active(): boolean {
    return this.blinks.length > 0;
  }

  update(clock: number): void {
    if (!this.active) {
      if (clock < this.nextAt || this.sys.relit) return;
      if (this.sys.sinceFlash < SPUTTER_QUIET) {
        this.nextAt = clock + SPUTTER_QUIET;
        return;
      }
      this.blinks = this.sys.calm ? [{ at: 0, hold: 2.4, level: 0.3 }] : sputter();
      this.dropped.clear();
      this.start = clock;
      this.due = 0;
    }
    const t = clock - this.start;
    while (this.due < this.blinks.length && t >= this.blinks[this.due]!.at) {
      const b = this.blinks[this.due++]!;
      if (this.sys.claimFlash()) audio.buzz(b.hold, this.sys.calm ? 0.08 : 0.2);
      else this.dropped.add(b);
    }
    for (const b of this.blinks) {
      const u = t - b.at;
      if (u < 0 || u >= b.hold || this.dropped.has(b)) continue;
      let level = b.level;
      // A long hold never settles: the tube hums and wavers before it gives out.
      if (this.sys.calm) level *= Math.sin((Math.PI * u) / b.hold);
      else if (b.hold > 0.3) level *= 0.7 + 0.3 * noise1(clock * 13);
      this.sys.roomFlicker = Math.max(this.sys.roomFlicker, level);
    }
    const last = this.blinks[this.blinks.length - 1]!;
    if (t >= last.at + last.hold) {
      this.blinks = [];
      this.nextAt = clock + SPUTTER_INTERVAL * rand(0.6, 1.4);
    }
  }
}

// ---------------------------------------------------------------- Mainframe

/** Lights pulse with the music's bass, scanners sweep, data packets race along traces. */
class Beat implements MoodFx {
  private avg = 0;
  private env = 0;
  private lastGlitch = -1;
  private clock = 0;
  private scanners: Array<{ light: Light; px: number; base: number; dir: number }> = [];
  private nextPacket = 1.5;

  constructor(private sys: LightingSystem) {
    if (!sys.budgetInfo.moodLights) return;
    const colors = [0x22d3ff, 0xff3ad6];
    for (const [i, px] of [0.12, 0.88].entries()) {
      const light = sys.addLight({
        area: { width: 80, height: HEIGHT * 0.85, cookie: 'shaft' },
        color: colors[i]!,
        intensity: 0.2 * sceneryLight(sys.look),
        affects: 'backdrop',
        priority: 2,
      });
      this.scanners.push({ light, px, base: i === 0 ? -0.35 : 0.35, dir: i === 0 ? 1 : -1 });
    }
  }

  update(dt: number, clock: number): void {
    this.clock = clock;
    const level = audio.musicLevel();
    let beat: number;
    if (level === undefined) {
      // No analyser (muted, Canvas audio): a steady 120 BPM pulse.
      beat = Math.max(0, 1 - ((clock * 2) % 1) * 5);
    } else {
      this.avg += (level - this.avg) * Math.min(1, dt * 1.5);
      beat = Math.min(1, Math.max(0, (level - this.avg) * 5));
    }
    this.env = Math.max(beat, this.env * Math.exp(-dt * 7));
    const env = this.sys.calm ? this.env * 0.3 : this.env;
    // A blackout stays black: the bass pulse only lifts the room as much as `darkness` allows.
    const room = sceneryLight(this.sys.look);
    this.sys.ambientScale = 1 - (1 - (0.93 + 0.14 * env)) * room;

    for (const s of this.scanners) {
      const swing = this.sys.calm ? 0 : Math.sin(clock * 0.45) * 0.3 * s.dir;
      const rot = s.base + swing;
      const area = s.light.area!;
      area.rotation = rot;
      // Pivot at the top center of the beam, not its corner.
      s.light.x = WIDTH * s.px - Math.cos(rot) * (area.width / 2);
      s.light.y = HUD_HEIGHT - 10 - Math.sin(rot) * (area.width / 2);
      s.light.gain = 0.7 + 0.6 * env;
    }

    if (this.sys.budgetInfo.moodLights && clock >= this.nextPacket) {
      this.nextPacket = clock + rand(1.2, 3);
      this.packet();
    }
  }

  /** A pulse racing along an L-shaped trace across the backdrop. */
  private packet(): void {
    const y0 = rand(HUD_HEIGHT + 20, PADDLE_Y - 60);
    const x0 = Math.random() < 0.5 ? -20 : WIDTH + 20;
    const xm = rand(WIDTH * 0.25, WIDTH * 0.75);
    const y1 = y0 + (Math.random() < 0.5 ? -1 : 1) * rand(60, 160);
    const points = [
      { x: x0, y: y0 },
      { x: xm, y: y0 },
      { x: xm, y: y1 },
    ];
    const speed = 420;
    const length = Math.abs(xm - x0) + Math.abs(y1 - y0);
    this.sys.addLight({
      radius: 44,
      color: Math.random() < 0.7 ? 0x22d3ff : 0xff3ad6,
      intensity: 0.4 * sceneryLight(this.sys.look),
      halo: 6,
      haloAlpha: 0.45,
      haloDepth: -3,
      affects: 'backdrop',
      priority: 1,
      path: { points, pingpong: false, speed },
      lifeMs: (length / speed) * 1000,
    });
  }

  onHit(): void {
    if (this.sys.calm || this.clock - this.lastGlitch < 0.4 || Math.random() > 0.3) return;
    this.lastGlitch = this.clock;
    this.sys.dip(0.4);
  }

  destroy(): void {
    for (const s of this.scanners) s.light.kill();
  }
}
