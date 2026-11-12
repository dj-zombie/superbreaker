import Phaser from 'phaser';
import { HUD_HEIGHT, SLOT_RADIUS, STOCK_RADIUS, slotPositions, stockPositions } from '../config';
import { save } from '../services';
import type { Paddle } from '../entities/Paddle';

/** Pointers that start on the pause button or an ability slot belong to the HUD, not the paddle. */
function onHudControl(x: number, y: number): boolean {
  if (y < HUD_HEIGHT + 6 && x < 56) return true;
  if (slotPositions().some((p) => Math.hypot(p.x - x, p.y - y) < SLOT_RADIUS + 8)) return true;
  return stockPositions(save.state.stock.powerups.length).some(
    (p) => Math.hypot(p.x - x, p.y - y) < STOCK_RADIUS + 8,
  );
}

const KEY_SPEED = 900;
const TAP_SLOP_PX = 14;
const TAP_MAX_MS = 350;
/** Finger travel is amplified so a short thumb swipe crosses the whole field. */
const TOUCH_GAIN = 1.6;

/**
 * Mouse: paddle follows the cursor. Touch: relative drag anywhere on screen, so the finger
 * never covers the ball. A short tap (or Space/Up) launches.
 */
export class InputSystem {
  private keys: {
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    launch: Phaser.Input.Keyboard.Key[];
  };
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private lastTouchX = 0;
  private moved = false;
  private onHud = false;
  enabled = true;

  constructor(
    private scene: Phaser.Scene,
    private paddle: Paddle,
    private onLaunch: () => void,
    onPause: () => void,
  ) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: [kb.addKey(K.LEFT), kb.addKey(K.A)],
      right: [kb.addKey(K.RIGHT), kb.addKey(K.D)],
      launch: [kb.addKey(K.SPACE), kb.addKey(K.UP), kb.addKey(K.W)],
    };
    for (const k of this.keys.launch) k.on('down', () => this.enabled && this.onLaunch());
    kb.addKey(K.ESC).on('down', onPause);
    kb.addKey(K.P).on('down', onPause);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
  }

  update(dtMs: number): void {
    if (!this.enabled) return;
    const dir =
      (this.keys.right.some((k) => k.isDown) ? 1 : 0) -
      (this.keys.left.some((k) => k.isDown) ? 1 : 0);
    if (dir !== 0) this.paddle.targetX = this.paddle.x + dir * KEY_SPEED * (dtMs / 1000) * 2;
  }

  private handleDown(p: Phaser.Input.Pointer): void {
    this.downAt = p.downTime;
    this.downX = p.worldX;
    this.downY = p.worldY;
    this.lastTouchX = p.worldX;
    this.moved = false;
    this.onHud = onHudControl(p.worldX, p.worldY);
  }

  private handleMove(p: Phaser.Input.Pointer): void {
    if (!this.enabled || (this.onHud && p.isDown)) return;
    if (p.wasTouch) {
      if (!p.isDown) return;
      this.paddle.targetX += (p.worldX - this.lastTouchX) * TOUCH_GAIN;
      this.lastTouchX = p.worldX;
    } else {
      this.paddle.targetX = p.worldX;
    }
    if (Math.hypot(p.worldX - this.downX, p.worldY - this.downY) > TAP_SLOP_PX) this.moved = true;
  }

  private handleUp(p: Phaser.Input.Pointer): void {
    if (this.onHud) {
      this.onHud = false;
      return;
    }
    if (!this.enabled) return;
    const quick = p.upTime - this.downAt < TAP_MAX_MS;
    // Mouse clicks always launch; touches launch only on a tap, not at the end of a drag.
    if (!p.wasTouch || (quick && !this.moved)) this.onLaunch();
  }
}
