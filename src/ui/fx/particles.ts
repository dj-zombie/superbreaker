import Phaser from 'phaser';
import { WIDTH, stageRect } from '../../config';
import { audio } from '../../systems/AudioSystem';
import { particleDensity } from '../../systems/Quality';
import { bitTexture, softDiscTexture } from '../frames';
import { calm, type UiTheme } from '../theme';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

export interface AmbientOptions {
  /** Defaults to the whole view. */
  area?: Phaser.Geom.Rectangle;
  depth?: number;
  /** Multiplier on the particle count. */
  amount?: number;
}

/** The world's atmosphere over menus: rising embers, drifting dust, falling data. */
export function ambient(
  scene: Phaser.Scene,
  t: UiTheme,
  opts: AmbientOptions = {},
): Emitter | undefined {
  if (calm()) return undefined;
  const stage = stageRect();
  const area = opts.area ?? new Phaser.Geom.Rectangle(stage.x, stage.y, stage.width, stage.height);
  // The same density across the wings as over the board.
  const spread = opts.area ? 1 : stage.width / WIDTH;
  const count = Math.max(4, Math.round(26 * particleDensity() * (opts.amount ?? 1) * spread));
  const p = t.palette;
  let emitter: Emitter;
  if (t.ambient === 'embers') {
    const life = 5200;
    emitter = scene.add.particles(0, 0, softDiscTexture(scene), {
      lifespan: { min: life * 0.6, max: life },
      speedY: { min: -70, max: -28 },
      speedX: { min: -14, max: 14 },
      accelerationX: { min: -12, max: 12 },
      scale: { start: 0.11, end: 0.02 },
      alpha: {
        onEmit: () => 0,
        onUpdate: (_p: unknown, _k: string, v: number) => Math.min(1, v * 6) * (1 - v) * 1.1,
      },
      tint: [p.accent, p.accent2, p.accentHi, p.glow],
      blendMode: Phaser.BlendModes.ADD,
      frequency: life / count,
      maxAliveParticles: count,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(area.x, area.bottom - area.height * 0.25, area.width, area.height * 0.3),
        quantity: 1,
      } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    });
    emitter.fastForward(life);
  } else if (t.ambient === 'dust') {
    const life = 8000;
    emitter = scene.add.particles(0, 0, softDiscTexture(scene), {
      lifespan: { min: life * 0.6, max: life },
      speedY: { min: -10, max: 12 },
      speedX: { min: -12, max: 12 },
      scale: { min: 0.03, max: 0.08 },
      alpha: {
        onEmit: () => 0,
        onUpdate: (_p: unknown, _k: string, v: number) => Math.sin(Math.PI * v) * 0.55,
      },
      tint: [0xd8d4ff, p.accent, p.accent2],
      blendMode: Phaser.BlendModes.ADD,
      frequency: life / count,
      maxAliveParticles: count,
      emitZone: {
        type: 'random',
        source: area,
        quantity: 1,
      } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    });
    emitter.fastForward(life);
  } else {
    const life = 4200;
    emitter = scene.add.particles(0, 0, bitTexture(scene), {
      lifespan: { min: life * 0.6, max: life },
      speedY: { min: 30, max: 90 },
      scale: { min: 0.4, max: 1 },
      alpha: {
        onEmit: () => 0,
        onUpdate: (_p: unknown, _k: string, v: number) =>
          (Math.random() < 0.08 ? 0.2 : 1) * Math.sin(Math.PI * v) * 0.7,
      },
      tint: [p.accent, p.accent, p.accent2],
      blendMode: Phaser.BlendModes.ADD,
      frequency: life / count,
      maxAliveParticles: count,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height * 0.6),
        quantity: 1,
      } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    });
    emitter.fastForward(life);
  }
  if (opts.depth !== undefined) emitter.setDepth(opts.depth);
  return emitter;
}

/** One-shot sparks in the theme's colours, e.g. on a button press or a purchase. */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  t: UiTheme,
  opts: { count?: number; speed?: number; color?: number; depth?: number; zone?: Phaser.Geom.Rectangle } = {},
): void {
  if (calm()) return;
  const n = Math.max(3, Math.round((opts.count ?? 14) * particleDensity()));
  const speed = opts.speed ?? 220;
  const p = t.palette;
  const key = t.ambient === 'bits' ? bitTexture(scene) : softDiscTexture(scene);
  const em = scene.add.particles(x, y, key, {
    lifespan: { min: 300, max: 650 },
    speed: { min: speed * 0.35, max: speed },
    angle: { min: 0, max: 360 },
    scale: t.ambient === 'bits' ? { start: 1.1, end: 0 } : { start: 0.14, end: 0 },
    alpha: { start: 1, end: 0 },
    gravityY: t.ambient === 'embers' ? -120 : t.ambient === 'dust' ? 40 : 0,
    tint: opts.color !== undefined ? opts.color : [p.accentHi, p.accent, p.glow],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
    ...(opts.zone
      ? {
          emitZone: {
            type: 'edge',
            source: opts.zone,
            quantity: n,
          } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        }
      : {}),
  });
  if (opts.depth !== undefined) em.setDepth(opts.depth);
  em.explode(n);
  scene.time.delayedCall(800, () => em.destroy());
}

export interface FlyOptions {
  count?: number;
  depth?: number;
  /** Called as each coin lands. */
  onEach?: (i: number) => void;
  onDone?: () => void;
  spread?: number;
}

/** Coins arc from one point to another, e.g. from a purchase card into the balance pill. */
export function flyCoins(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: FlyOptions = {},
): void {
  const count = calm() ? 1 : Math.max(1, opts.count ?? 8);
  const spread = opts.spread ?? 46;
  let landed = 0;
  for (let i = 0; i < count; i++) {
    const coin = scene.add
      .image(from.x, from.y, 'coin_icon')
      .setDepth(opts.depth ?? 50)
      .setAlpha(0);
    const s = 24 / Math.max(1, coin.width);
    coin.setScale(s * 0.4);
    const sx = from.x + Phaser.Math.Between(-spread, spread);
    const sy = from.y + Phaser.Math.Between(-spread, spread * 0.4);
    const path = { t: 0 };
    const cx = (sx + to.x) / 2 + Phaser.Math.Between(-80, 80);
    const cy = Math.min(sy, to.y) - Phaser.Math.Between(40, 120);
    scene.tweens.chain({
      targets: coin,
      tweens: [
        {
          x: sx,
          y: sy,
          alpha: 1,
          scale: s,
          delay: i * 45,
          duration: 220,
          ease: 'Back.Out',
        },
        {
          targets: path,
          t: 1,
          duration: 520 + i * 18,
          ease: 'Cubic.In',
          onUpdate: () => {
            const u = path.t;
            const a = (1 - u) * (1 - u);
            const b = 2 * (1 - u) * u;
            const c = u * u;
            coin.setPosition(a * sx + b * cx + c * to.x, a * sy + b * cy + c * to.y);
            coin.setScale(s * (1 - 0.35 * u));
          },
          onComplete: () => {
            coin.destroy();
            audio.sfx('sfx_coin', 0.22, landed * 60);
            opts.onEach?.(landed);
            landed++;
            if (landed === count) opts.onDone?.();
          },
        },
      ],
    });
  }
}
