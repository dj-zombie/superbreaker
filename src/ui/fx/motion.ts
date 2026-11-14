import Phaser from 'phaser';
import { calm } from '../theme';

export type Movable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.AlphaSingle;

export interface CascadeOptions {
  /** Offset each element starts from. */
  dx?: number;
  dy?: number;
  delay?: number;
  stagger?: number;
  duration?: number;
  ease?: string;
  /** Start scale, for elements that should grow in. */
  scale?: number;
}

/** Brings elements in one after another from an offset. Reduced motion fades them in place. */
export function cascade(
  scene: Phaser.Scene,
  targets: ReadonlyArray<Movable>,
  opts: CascadeOptions = {},
): void {
  const { dx = 0, dy = 26, delay = 0, stagger = 55, duration = 420, ease = 'Back.Out' } = opts;
  const still = calm();
  targets.forEach((t, i) => {
    const x = t.x;
    const y = t.y;
    const alpha = t.alpha;
    const sx = t.scaleX;
    const sy = t.scaleY;
    t.setAlpha(0);
    if (!still) {
      t.setPosition(x + dx, y + dy);
      if (opts.scale !== undefined) t.setScale(sx * opts.scale, sy * opts.scale);
    }
    scene.tweens.add({
      targets: t,
      x,
      y,
      alpha,
      scaleX: sx,
      scaleY: sy,
      delay: delay + i * (still ? stagger * 0.4 : stagger),
      duration: still ? 180 : duration,
      ease: still ? 'Linear' : ease,
    });
  });
}

export interface CountOptions {
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  /** Called whenever the shown number changes, e.g. for tick sounds. */
  onTick?: (n: number) => void;
  onComplete?: () => void;
}

/** Rolls a number in a text object from `from` to `to`. */
export function countUp(
  scene: Phaser.Scene,
  text: { setText(s: string): unknown },
  from: number,
  to: number,
  opts: CountOptions = {},
): Phaser.Tweens.Tween | undefined {
  const format = opts.format ?? ((n: number) => n.toLocaleString());
  if (from === to || calm()) {
    text.setText(format(to));
    opts.onComplete?.();
    return undefined;
  }
  text.setText(format(from));
  let shown = from;
  const counter = { v: from };
  return scene.tweens.add({
    targets: counter,
    v: to,
    delay: opts.delay ?? 0,
    duration: opts.duration ?? Math.min(1200, 300 + Math.abs(to - from) * 4),
    ease: 'Cubic.Out',
    onUpdate: () => {
      const n = Math.round(counter.v);
      if (n === shown) return;
      shown = n;
      text.setText(format(n));
      opts.onTick?.(n);
    },
    onComplete: () => {
      text.setText(format(to));
      opts.onComplete?.();
    },
  });
}

/** A quick scale kick that settles back. */
export function punch(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  amount = 1.18,
  duration = 140,
): void {
  const sx = (target as { baseScale?: number }).baseScale ?? target.scaleX;
  (target as { baseScale?: number }).baseScale = sx;
  scene.tweens.killTweensOf(target);
  target.setScale(sx * amount);
  scene.tweens.add({ targets: target, scale: sx, duration: duration * 2, ease: 'Back.Out' });
}

/** Horizontal shake, for refusals like not enough coins. */
export function shake(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  amp = 7,
): void {
  const x = (target as { homeX?: number }).homeX ?? target.x;
  (target as { homeX?: number }).homeX = x;
  scene.tweens.add({
    targets: target,
    x: { from: x - amp, to: x + amp },
    duration: 45,
    yoyo: true,
    repeat: 3,
    onComplete: () => target.setX(x),
  });
}

/** Gentle idle bob. */
export function float(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
  amp = 4,
  duration = 2400,
): void {
  if (calm()) return;
  scene.tweens.add({
    targets: target,
    y: target.y - amp,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/\\';

/** Decodes text from random glyphs, left to right. The Mainframe's text effect. */
export function scramble(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  final: string,
  duration = 520,
  delay = 0,
): void {
  if (calm()) {
    text.setText(final);
    return;
  }
  const state = { p: 0 };
  text.setText(final.replace(/\S/g, ' '));
  scene.tweens.add({
    targets: state,
    p: 1,
    delay,
    duration,
    onUpdate: () => {
      const shown = Math.floor(state.p * final.length);
      let s = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i] ?? '';
        if (i < shown || ch === ' ') s += ch;
        else if (i < shown + 4) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        else s += ' ';
      }
      text.setText(s);
    },
    onComplete: () => text.setText(final),
  });
}

/** Types text out a few characters per frame. */
export function typewriter(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  final: string,
  cps = 70,
  delay = 0,
): void {
  if (calm()) {
    text.setText(final);
    return;
  }
  const state = { n: 0 };
  text.setText('');
  scene.tweens.add({
    targets: state,
    n: final.length,
    delay,
    duration: (final.length / cps) * 1000,
    onUpdate: () => text.setText(final.slice(0, Math.floor(state.n))),
    onComplete: () => text.setText(final),
  });
}

/** Drops a heading in from large and transparent, landing with a thud. */
export function slam(
  scene: Phaser.Scene,
  target: Movable,
  opts: { delay?: number; from?: number; onLand?: () => void } = {},
): void {
  const s = target.scaleX;
  if (calm()) {
    target.setAlpha(0);
    scene.tweens.add({
      targets: target,
      alpha: 1,
      delay: opts.delay ?? 0,
      duration: 200,
      onComplete: opts.onLand,
    });
    return;
  }
  target.setScale(s * (opts.from ?? 2.4)).setAlpha(0);
  scene.tweens.add({
    targets: target,
    scale: s,
    alpha: 1,
    delay: opts.delay ?? 0,
    duration: 260,
    ease: 'Cubic.In',
    onComplete: () => {
      opts.onLand?.();
      scene.tweens.add({
        targets: target,
        scale: { from: s * 0.94, to: s },
        duration: 280,
        ease: 'Back.Out',
      });
    },
  });
}

/** Repeats `fn` at a jittered interval while the scene lives. */
export function every(
  scene: Phaser.Scene,
  minMs: number,
  maxMs: number,
  fn: () => void,
): { stop(): void } {
  let alive = true;
  let event: Phaser.Time.TimerEvent | undefined;
  const next = () => {
    event = scene.time.delayedCall(Phaser.Math.Between(minMs, maxMs), () => {
      if (!alive) return;
      fn();
      next();
    });
  };
  next();
  return {
    stop: () => {
      alive = false;
      event?.remove();
    },
  };
}
