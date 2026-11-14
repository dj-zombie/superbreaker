import Phaser from 'phaser';
import { softDiscTexture } from '../frames';
import { calm, richFx } from '../theme';

type Filterable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Filters &
  Phaser.GameObjects.Components.Transform;

export interface GlowHandle {
  /** 0..1 multiplier on the glow, for pulses. */
  set(level: number): void;
  destroy(): void;
}

/**
 * Glow around a hero element. Medium and High get the live Glow filter, which follows the
 * silhouette; Low and battery saver get a soft disc behind it.
 */
export function heroGlow(
  scene: Phaser.Scene,
  target: Filterable,
  color: number,
  opts: { strength?: number; behind?: { w: number; h: number }; breathe?: boolean } = {},
): GlowHandle {
  const strength = opts.strength ?? 4;
  if (richFx()) {
    target.enableFilters();
    const fx = target.filters!.external.addGlow(color, strength, 0, 1, false, 8, 12);
    let tween: Phaser.Tweens.Tween | undefined;
    if (opts.breathe && !calm()) {
      tween = scene.tweens.add({
        targets: fx,
        outerStrength: { from: strength * 0.6, to: strength * 1.2 },
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    return {
      set: (level) => {
        if (!tween) fx.outerStrength = strength * level;
      },
      destroy: () => {
        tween?.remove();
        target.filters?.external.remove(fx);
      },
    };
  }
  const size = opts.behind ?? { w: 200, h: 120 };
  const disc = scene.add
    .image(target.x, target.y, softDiscTexture(scene))
    .setDisplaySize(size.w * 1.3, size.h * 1.6)
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.5);
  const parent = target.parentContainer;
  if (parent) parent.addAt(disc, parent.getIndex(target));
  else disc.setDepth((target as unknown as { depth: number }).depth - 0.01);
  let tween: Phaser.Tweens.Tween | undefined;
  if (opts.breathe && !calm()) {
    tween = scene.tweens.add({
      targets: disc,
      alpha: { from: 0.3, to: 0.6 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
  return {
    set: (level) => {
      if (!tween) disc.setAlpha(0.5 * level);
    },
    destroy: () => {
      tween?.remove();
      disc.destroy();
    },
  };
}
