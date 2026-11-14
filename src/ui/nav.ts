import type Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

interface Entry {
  scene: Phaser.Scene;
  handler: () => void;
}

const stack: Entry[] = [];
let installed = false;
let busy: (() => boolean) | undefined;

/**
 * Pops one screen: calls the newest handler whose scene is running. Paused scenes under an
 * overlay are skipped, so the overlay closes first. Returns false when nothing handled it.
 */
function back(): boolean {
  if (busy?.()) return true;
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i]!;
    if (!e.scene.sys.isActive() || !e.scene.input.enabled) continue;
    e.handler();
    return true;
  }
  return false;
}

/** Wires ESC and the Android back button. `isBusy` swallows presses mid-transition. */
export function installBack(isBusy?: () => boolean): void {
  busy = isBusy;
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    e.preventDefault();
    back();
  });
  if (Capacitor.isNativePlatform()) {
    void App.addListener('backButton', () => {
      if (!back()) void App.exitApp();
    });
  }
}

/** Registers what back does on this screen until it shuts down. */
export function onBack(scene: Phaser.Scene, handler: () => void): void {
  const entry = { scene, handler };
  stack.push(entry);
  scene.events.once('shutdown', () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  });
}
