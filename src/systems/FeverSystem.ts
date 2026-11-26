import Phaser from 'phaser';
import type { SceneryId } from '../art/backdrops';
import { ARENA_MID, HEIGHT, WIDTH, stageRect } from '../config';
import { FeverMeter } from '../core/Pacing';
import type { FxEngine, FxHandle } from '../fx';
import { lerpColor } from '../fx/math';
import { FX_PALETTES, type FxPalette } from '../fx/palettes';
import { haptic } from '../platform/haptics';
import { save } from '../services';
import { css } from '../ui/theme';
import { audio } from './AudioSystem';
import type { Backdrop } from './Backdrop';
import type { JuiceSystem } from './JuiceSystem';
import type { Followable, Light, LightingSystem } from './LightingSystem';

const GLOW_WIDTH = 46;
/** Fever's last stretch, in ms, when the edge glows start to gutter. */
const WARN_MS = 1_500;
/** Beat length when no music is playing to keep time with: 120 BPM. */
const IDLE_BEAT_MS = 500;
/** Where the beat pulse holds under reduced motion. */
const CALM_PULSE = 0.3;
/** Width of the band under each wall that the speed lines rise from. */
const RUSH_BAND = 70;

/** 1 on each beat, falling away well before the next. */
export function feverPulse(beat: number): number {
  return Math.exp(-5 * (beat - Math.floor(beat)));
}

/** Fever's color for a pulse: the world's accent, flaring toward its hot tone on the beat. */
export function feverColor(pal: FxPalette, pulse: number): number {
  return lerpColor(pal.accent, pal.hot, Math.min(1, Math.max(0, pulse)));
}

export interface FeverHost {
  juice: JuiceSystem;
  backdrop: Backdrop;
  fx: FxEngine;
  lighting: LightingSystem;
  paddle: Followable;
  /** The scenery on screen, whose palette Fever burns in. */
  world(): SceneryId;
  onChange(active: boolean): void;
}

/**
 * Fever mode: fireball balls and double score. It burns in the world's own palette, in time with
 * the music: a cast over the backdrop, edge glows and a paddle light that swell on the beat, heat
 * rising off the floor and the paddle, and sparks on every break.
 */
export class FeverSystem {
  readonly meter = new FeverMeter();
  /** This frame's color, for ball lights, trails and the laser. */
  color = FX_PALETTES.hell.accent;
  /** This frame's beat pulse, 0..1. */
  pulse = 0;
  private glow?: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private runs: FxHandle[] = [];
  private light?: Light;

  constructor(
    private scene: Phaser.Scene,
    private host: FeverHost,
    /** Edge glow brightness; lights-out levels keep it low so the walls don't light up. */
    public edgeAlpha = 1,
  ) {}

  get active(): boolean {
    return this.meter.active;
  }

  get scoreMultiplier(): number {
    return this.active ? 2 : 1;
  }

  get palette(): FxPalette {
    return FX_PALETTES[this.host.world()] ?? FX_PALETTES.hell;
  }

  onBreak(combo: number, balls: number): void {
    if (this.meter.onBreak(combo, balls)) this.start();
  }

  boost(amount: number): void {
    if (this.meter.boost(amount)) this.start();
  }

  /** A brick broke at (x, y): while Fever runs, a few hot sparks join its shatter. */
  sparkAt(x: number, y: number): void {
    if (!this.active) return;
    this.host.fx.play('fever.break', x, y, { world: this.host.world(), bare: true });
  }

  update(dtMs: number): void {
    if (this.meter.update(dtMs) === 'end') {
      const p = this.host.paddle;
      this.host.fx.play('fever.end', p.x, p.y, { world: this.host.world(), quiet: true });
      this.stop();
      audio.sfx('fever_end', 0.45);
    }
    if (!this.active) return;
    const calm = save.state.settings.reducedMotion;
    const beat = audio.musicBeat() ?? this.scene.time.now / IDLE_BEAT_MS;
    this.pulse = calm ? CALM_PULSE : feverPulse(beat);
    this.color = feverColor(this.palette, this.pulse);
    if (this.light) {
      this.light.color = this.color;
      this.light.intensity = 0.45 + 0.35 * this.pulse;
    }
    if (!this.glow) return;
    const left = this.meter.remainingMs;
    const gutter = !calm && left < WARN_MS && Math.floor(left / 120) % 2 === 0;
    const alpha = (0.4 + 0.35 * this.pulse) * this.edgeAlpha * (gutter ? 0.35 : 1);
    const width = GLOW_WIDTH * (1 + 0.4 * this.pulse);
    for (const g of this.glow) {
      g.setTint(this.color).setAlpha(alpha).setDisplaySize(width, HEIGHT).setY(HEIGHT / 2);
    }
  }

  reset(): void {
    if (this.active) this.stop();
    this.meter.reset();
  }

  private start(): void {
    const pal = this.palette;
    const world = this.host.world();
    const calm = save.state.settings.reducedMotion;
    this.color = pal.accent;
    const { juice, fx } = this.host;
    juice.popText(WIDTH / 2, ARENA_MID - 40, 'FEVER!', css(pal.accent), 44);
    juice.flash(200, (pal.accent >> 16) & 0xff, (pal.accent >> 8) & 0xff, pal.accent & 0xff);
    juice.shake(300, 0.008);
    fx.play('fanfare.fever', WIDTH / 2, ARENA_MID, { tint: pal.hot, world, quiet: true });
    audio.sfx('fever_start', 0.5);
    // Light and short: the music cuts to the Fever drop on the next beat.
    audio.duck(0.6, 150);
    haptic('heavy');
    this.host.backdrop.setHue(pal.accent);
    if (!calm && !this.glow) {
      const edge = (x: number, flip: boolean) =>
        this.scene.add
          .image(x, HEIGHT / 2, 'edge_glow')
          .setOrigin(flip ? 1 : 0, 0.5)
          .setFlipX(flip)
          .setDisplaySize(GLOW_WIDTH, HEIGHT)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(pal.accent)
          .setDepth(3);
      this.glow = [edge(0, false), edge(WIDTH, true)];
    }
    this.startFx(world, calm);
    this.host.onChange(true);
  }

  private startFx(world: SceneryId, calm: boolean): void {
    const { fx, lighting, paddle } = this.host;
    const dark = lighting.look.lightsOut;
    // A lights-out room stays dark: the heat is fainter and the paddle casts no light on the bricks.
    const opts = { world, intensity: dark ? 0.4 : 1 };
    const stage = stageRect();
    this.runs.push(
      fx.field('fever.updraft', { x: stage.x, y: HEIGHT - 10, width: stage.width, height: 30 }, opts),
      fx.attach('fever.heat', paddle, opts),
    );
    if (!calm) {
      this.runs.push(
        fx.field('fever.rush', { x: 0, y: HEIGHT, width: RUSH_BAND, height: 20 }, opts),
        fx.field('fever.rush', { x: WIDTH - RUSH_BAND, y: HEIGHT, width: RUSH_BAND, height: 20 }, opts),
      );
    }
    if (!dark) {
      this.light = lighting.addLight({
        follow: paddle,
        color: this.color,
        radius: 170,
        intensity: 0.45,
        priority: 9,
      });
    }
  }

  private stop(): void {
    if (this.glow) {
      const glow = this.glow;
      this.glow = undefined;
      this.scene.tweens.add({
        targets: glow,
        alpha: 0,
        duration: 400,
        onComplete: () => glow.forEach((g) => g.destroy()),
      });
    }
    this.host.backdrop.setHue(undefined);
    for (const r of this.runs) r.stop();
    this.runs.length = 0;
    this.light?.kill();
    this.light = undefined;
    this.pulse = 0;
    this.host.onChange(false);
  }
}
