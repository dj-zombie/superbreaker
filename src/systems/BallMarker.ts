import Phaser from 'phaser';
import { BALL_DEPTH, BALL_SIZE, type Ball } from '../entities/Ball';

/** Painted this many times over, so the rings stay crisp at the render zoom. */
const RES = 3;
const RING_KEY = 'ball_marker_ring';
const TICKS_KEY = 'ball_marker_ticks';
const R = BALL_SIZE / 2;
/** The dark halo fades out this far from the ball's centre, in px. */
const HALO_R = R + 6;
/** The white ring's radius and width, in px. It has a dark edge on both sides. */
const RING_R = R + 3.5;
const RING_W = 2;
/** The four ticks run between these radii, in px. */
const TICK_IN = R + 7;
const TICK_OUT = R + 12;
/** The ring's alpha on a calm field. A busy one takes it to 1 and brings the ticks in. */
const CALM_ALPHA = 0.3;
/** How fast the marker follows the field getting busy and calming down, per second. */
const RISE = 5;
const FALL = 0.7;
/** The ticks turn this fast, in turns a second. */
const SPIN = 0.4;
/** A busy field makes the ring breathe this much, this often, in ms. */
const BREATH = 0.1;
const BREATH_MS = 650;
/** Under this level the ticks are not drawn at all. */
const TICKS_MIN = 0.02;

function paint(
  scene: Phaser.Scene,
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, c: number) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size * RES, size * RES);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(RES, RES);
  draw(ctx, size / 2);
  tex.refresh();
}

/** A dark halo that cuts the ball out of whatever is behind it, and a white ring with dark edges. */
function paintRing(scene: Phaser.Scene): void {
  paint(scene, RING_KEY, Math.ceil(HALO_R * 2 + 2), (ctx, c) => {
    const halo = ctx.createRadialGradient(c, c, R - 1, c, c, HALO_R);
    halo.addColorStop(0, 'rgba(0,0,0,0.75)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c, c, HALO_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, RING_R, 0, Math.PI * 2);
    ctx.lineWidth = RING_W + 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.stroke();
    ctx.lineWidth = RING_W;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
}

/** Four short white bars on the diagonals, dark-edged: a reticle no pickup or shot looks like. */
function paintTicks(scene: Phaser.Scene): void {
  paint(scene, TICKS_KEY, Math.ceil(TICK_OUT * 2 + 4), (ctx, c) => {
    ctx.lineCap = 'round';
    for (const [width, style] of [
      [4.5, 'rgba(0,0,0,0.85)'],
      [2.5, '#ffffff'],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * TICK_IN, c + Math.sin(a) * TICK_IN);
        ctx.lineTo(c + Math.cos(a) * TICK_OUT, c + Math.sin(a) * TICK_OUT);
        ctx.stroke();
      }
    }
  });
}

/**
 * Keeps every ball readable whatever the field is doing. Each ball wears a faint ring that turns
 * solid, breathes, and grows a turning reticle as the field gets busy: pickups, boss shots,
 * particle bursts, multiball, Hyperspeed or Fever. The ball art changes per world and often
 * shares its colors with pickups, so the marker is white and black, which nothing else is.
 *
 * It moves on the scene's POST_UPDATE, after Arcade has copied the bodies onto their sprites, so
 * it never trails a fast ball by a step.
 */
export class BallMarker {
  /** How busy the field is, 0..1. The host sets it every frame. */
  busy = 0;
  private level = 0;
  private clock = 0;
  private live = new Map<
    Ball,
    { ring: Phaser.GameObjects.Image; ticks: Phaser.GameObjects.Image }
  >();
  private seen = new Set<Ball>();

  constructor(
    private scene: Phaser.Scene,
    private balls: () => readonly Ball[],
  ) {
    paintRing(scene);
    paintTicks(scene);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private sync(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const rate = this.busy > this.level ? RISE : FALL;
    this.level += (this.busy - this.level) * Math.min(1, rate * dt);
    this.clock += dt;
    const level = this.level;
    const breath = 1 + BREATH * level * Math.sin((this.clock * 1000 * Math.PI * 2) / BREATH_MS);
    const ringAlpha = CALM_ALPHA + (1 - CALM_ALPHA) * level;
    const spin = this.clock * SPIN * 360;
    const seen = this.seen;
    seen.clear();
    for (const b of this.balls()) {
      if (!b.active) continue;
      seen.add(b);
      let m = this.live.get(b);
      if (!m) {
        m = {
          ring: this.scene.add.image(0, 0, RING_KEY).setDepth(BALL_DEPTH - 0.02),
          ticks: this.scene.add.image(0, 0, TICKS_KEY).setDepth(BALL_DEPTH - 0.01),
        };
        this.live.set(b, m);
      }
      const shown = b.visible && b.alpha > 0;
      m.ring
        .setVisible(shown)
        .setPosition(b.x, b.y)
        .setScale(breath / RES)
        .setAlpha(ringAlpha * b.alpha);
      m.ticks
        .setVisible(shown && level > TICKS_MIN)
        .setPosition(b.x, b.y)
        .setScale((0.85 + 0.15 * level) / RES)
        .setAngle(spin)
        .setAlpha(level * b.alpha);
    }
    for (const [b, m] of this.live) {
      if (seen.has(b)) continue;
      m.ring.destroy();
      m.ticks.destroy();
      this.live.delete(b);
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    for (const m of this.live.values()) {
      m.ring.destroy();
      m.ticks.destroy();
    }
    this.live.clear();
  }
}
