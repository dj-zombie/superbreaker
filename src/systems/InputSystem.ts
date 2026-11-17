import Phaser from 'phaser';
import {
  HUD_HEIGHT,
  SKILL_RADIUS,
  SLOT_RADIUS,
  STOCK_RADIUS,
  WIDE,
  WIDTH,
  skillPositions,
  slotPositions,
  stockPositions,
} from '../config';
import { PadButton, onPadButton, padHeld, padStick } from '../platform/gamepad';
import { KeyBindings } from '../platform/keyboard';
import { save } from '../services';
import type { Paddle } from '../entities/Paddle';

/** Pointers that start on the pause button, a slot or a skill belong to the HUD, not the paddle. */
function onHudControl(x: number, y: number): boolean {
  // The wide stage keeps its HUD in the wing plates, off the board.
  if (WIDE) return x < 0 || x > WIDTH;
  if (y < HUD_HEIGHT + 6 && x < 56) return true;
  if (slotPositions().some((p) => Math.hypot(p.x - x, p.y - y) < SLOT_RADIUS + 8)) return true;
  if (skillPositions().some((p) => Math.hypot(p.x - x, p.y - y) < SKILL_RADIUS + 8)) return true;
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
 * never covers the ball. A short tap (or Space/Up) launches. Keys are matched by position, so
 * the A/D/W cluster is Q/D/Z on AZERTY. Gamepad: stick or d-pad steers, south launches, Start
 * pauses.
 */
export class InputSystem {
  /** The scene's game keys; Play adds the ability and stock keys to them. */
  readonly keys: KeyBindings;
  /** On-screen controls owned by others, such as the tutorial's Skip button. */
  private blockers = new Set<(x: number, y: number) => boolean>();
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
    /** False while a boss scene has the field, so a tap there skips instead of hitting a hidden button. */
    private hudLive: () => boolean = () => true,
  ) {
    this.keys = new KeyBindings(scene)
      .on('launch', () => this.enabled && this.onLaunch())
      .on('pause', onPause);

    const offPad = onPadButton((button, down) => {
      if (!down || !scene.scene.isActive()) return;
      if (button === PadButton.south && this.enabled) this.onLaunch();
      else if (button === PadButton.start) onPause();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, offPad);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
  }

  update(dtMs: number): void {
    if (!this.enabled) return;
    const digital =
      (this.keys.held('right') || padHeld(PadButton.right) ? 1 : 0) -
      (this.keys.held('left') || padHeld(PadButton.left) ? 1 : 0);
    // Keys and the d-pad steer at full speed; the stick scales with its deflection.
    const dir = digital !== 0 ? digital : padStick().x;
    if (dir !== 0) this.paddle.targetX = this.paddle.x + dir * KEY_SPEED * (dtMs / 1000) * 2;
  }

  /** Pointers that start where `test` is true are left alone. Returns a removal function. */
  addBlocker(test: (x: number, y: number) => boolean): () => void {
    this.blockers.add(test);
    return () => this.blockers.delete(test);
  }

  private handleDown(p: Phaser.Input.Pointer): void {
    this.downAt = p.downTime;
    this.downX = p.worldX;
    this.downY = p.worldY;
    this.lastTouchX = p.worldX;
    this.moved = false;
    this.onHud =
      this.hudLive() &&
      (onHudControl(p.worldX, p.worldY) ||
        [...this.blockers].some((test) => test(p.worldX, p.worldY)));
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
