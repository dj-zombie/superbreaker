import type Phaser from 'phaser';
import { SCENES } from '../../config';
import type { Transition } from '../../scenes/Transition';

export interface TransitionOptions {
  /** Other scenes to stop once the screen is covered. */
  stop?: string[];
}

function layer(scene: Phaser.Scene): Transition | undefined {
  const tr = scene.scene.get(SCENES.transition) as Transition | null;
  return tr?.sys.isActive() ? tr : undefined;
}

/** Leaves `scene` for `key` behind the current world's transition. */
export function transitionTo(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  opts: TransitionOptions = {},
): void {
  const tr = layer(scene);
  if (!tr) {
    for (const k of opts.stop ?? []) scene.scene.stop(k);
    scene.scene.start(key, data);
    return;
  }
  tr.go({ from: scene, key, data, stop: opts.stop });
}

/** True while a transition is covering or revealing; screens ignore input meanwhile. */
export function transitioning(scene: Phaser.Scene): boolean {
  return layer(scene)?.running ?? false;
}
