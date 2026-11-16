import type { PowerupId } from './types';

/**
 * The first-play tutorial, run over level 1: move the paddle, launch the ball, catch a powerup.
 * Each step ends by doing it, and launching early skips the move step. Skip ends it at any point.
 */
export type OnboardingStep = 'move' | 'launch' | 'catch' | 'done';

/** Paddle travel, in playfield units, that shows the player has found the controls. */
export const MOVE_TRAVEL = 200;

/** Not worth pointing at: coins are everywhere, and the Smaller pickup hurts. */
const UNHELPFUL: readonly PowerupId[] = ['coin', 'smaller'];

export function helpfulPickup(kind: PowerupId): boolean {
  return !UNHELPFUL.includes(kind);
}

export class Onboarding {
  step: OnboardingStep = 'move';
  private travel = 0;
  private watching = false;

  get done(): boolean {
    return this.step === 'done';
  }

  /** The serve waits for the player while the move step is up. */
  get holdServe(): boolean {
    return this.step === 'move';
  }

  /** How far through the move step the player is, 0..1. */
  get moveProgress(): number {
    return this.step === 'move' ? Math.min(1, this.travel / MOVE_TRAVEL) : 1;
  }

  /** The paddle moved by `dx`. Returns true when this finished the move step. */
  moved(dx: number): boolean {
    if (this.step !== 'move') return false;
    this.travel += Math.abs(dx);
    if (this.travel < MOVE_TRAVEL) return false;
    this.step = 'launch';
    return true;
  }

  /** The held ball launched. Returns true when this changed the step. */
  launched(): boolean {
    if (this.step !== 'move' && this.step !== 'launch') return false;
    this.step = 'catch';
    return true;
  }

  /** A pickup started falling. Returns true when the catch step should point at this one. */
  pickupSpawned(kind: PowerupId): boolean {
    if (this.step !== 'catch' || this.watching || !helpfulPickup(kind)) return false;
    this.watching = true;
    return true;
  }

  /** A pickup reached the paddle. Returns true when this finished the tutorial. */
  pickupCaught(kind: PowerupId): boolean {
    if (this.step !== 'catch' || !helpfulPickup(kind)) return false;
    this.step = 'done';
    return true;
  }

  /** The pickup being pointed at fell past the paddle. It has been shown, so the tutorial ends. */
  pickupMissed(): boolean {
    if (this.step !== 'catch' || !this.watching) return false;
    this.step = 'done';
    return true;
  }

  skip(): void {
    this.step = 'done';
  }
}
