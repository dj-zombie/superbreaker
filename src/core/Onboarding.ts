import type { PowerupId } from './types';

/**
 * The first-play tutorial, run over level 1: move the paddle, launch the ball, keep a ball above
 * the line, catch a powerup, fire an ability. The serve waits for the first two. The last three
 * each freeze the game at the right moment and wait for the player to do the thing. Launching
 * early skips the move step, and Skip ends it at any point.
 */
export type OnboardingStep = 'move' | 'launch' | 'guard' | 'catch' | 'ability' | 'done';

/** Paddle travel, in playfield units, that shows the player has found the controls. */
export const MOVE_TRAVEL = 200;

/** A freeze stays up at least this long, so its words can be read before play goes on. */
export const MIN_READ_MS = 1_200;

/** Play time the catch step waits for a useful pickup before it moves on without one. */
export const CATCH_WAIT_MS = 20_000;

/** Not worth pointing at: coins are everywhere, and the Smaller pickup hurts. */
const UNHELPFUL: readonly PowerupId[] = ['coin', 'smaller'];

export function helpfulPickup(kind: PowerupId): boolean {
  return !UNHELPFUL.includes(kind);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The path of a ball moving at (vx, vy) down to `lineY`, bouncing off side walls at `minX` and
 * `maxX`: its start, each wall bounce, and where it meets the line. Null unless it is heading down
 * to the line.
 */
export function pathToLine(
  from: Point,
  vx: number,
  vy: number,
  lineY: number,
  minX: number,
  maxX: number,
): Point[] | null {
  if (vy <= 0 || from.y >= lineY) return null;
  let x = Math.min(maxX, Math.max(minX, from.x));
  let y = from.y;
  let dx = vx;
  const points: Point[] = [{ x, y }];
  // A near-flat ball can bounce many times on the way; past this the last wall is close enough.
  for (let i = 0; i < 16; i++) {
    const toLine = (lineY - y) / vy;
    const wall = dx > 0 ? maxX : minX;
    const toWall = dx === 0 ? Infinity : (wall - x) / dx;
    if (toLine <= toWall) {
      points.push({ x: x + dx * toLine, y: lineY });
      return points;
    }
    x = wall;
    y += vy * toWall;
    dx = -dx;
    points.push({ x, y });
  }
  points.push({ x, y: lineY });
  return points;
}

export class Onboarding {
  step: OnboardingStep = 'move';
  private travel = 0;
  /** How long the current freeze has been up, or null when play is running. */
  private frozenMs: number | null = null;
  private pointed = false;
  private waited = 0;

  get done(): boolean {
    return this.step === 'done';
  }

  /** The serve waits for the player while they are shown how to move and launch. */
  get holdServe(): boolean {
    return this.step === 'move' || this.step === 'launch';
  }

  /** Play is stopped while the tutorial points something out. */
  get frozen(): boolean {
    return this.frozenMs !== null;
  }

  /** The current step has frozen play to point its thing out, and may still be frozen. */
  get shown(): boolean {
    return this.pointed;
  }

  /** How far through the move step the player is, 0..1. */
  get moveProgress(): number {
    return this.step === 'move' ? Math.min(1, this.travel / MOVE_TRAVEL) : 1;
  }

  /** Advances the freeze's reading time, and the catch step's wait. Returns true when the step changed. */
  tick(dtMs: number): boolean {
    if (this.frozenMs !== null) {
      this.frozenMs += dtMs;
      return false;
    }
    if (this.step !== 'catch' || this.pointed) return false;
    this.waited += dtMs;
    if (this.waited < CATCH_WAIT_MS) return false;
    this.next('ability');
    return true;
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
    if (!this.holdServe) return false;
    this.next('guard');
    return true;
  }

  /** A ball is heading down toward the paddle. Returns true when this froze play to point at it. */
  ballFalling(): boolean {
    if (this.step !== 'guard' || this.pointed) return false;
    this.freeze();
    return true;
  }

  /** The player did what the freeze asked. Returns true when this let play go on. */
  release(): boolean {
    if (this.frozenMs === null || this.frozenMs < MIN_READ_MS) return false;
    this.frozenMs = null;
    return true;
  }

  /** The ball pointed at came back to the paddle, or was lost. Returns true when this finished the step. */
  ballReturned(): boolean {
    if (this.step !== 'guard' || !this.pointed || this.frozen) return false;
    this.next('catch');
    return true;
  }

  /** A pickup is falling. Returns true when this froze play to point at it. */
  pickupSpotted(kind: PowerupId): boolean {
    if (this.step !== 'catch' || this.pointed || !helpfulPickup(kind)) return false;
    this.freeze();
    return true;
  }

  /** A pickup reached the paddle. Returns true when this finished the catch step. */
  pickupCaught(kind: PowerupId): boolean {
    if (this.step !== 'catch' || !helpfulPickup(kind)) return false;
    this.next('ability');
    return true;
  }

  /** The pickup pointed at fell past the paddle. It has been shown, so the step is over. */
  pickupMissed(): boolean {
    if (this.step !== 'catch' || !this.pointed || this.frozen) return false;
    this.next('ability');
    return true;
  }

  /** A slot holds an ability and the ball is safe. Returns true when this froze play to point at it. */
  abilityReady(): boolean {
    if (this.step !== 'ability' || this.pointed) return false;
    this.freeze();
    return true;
  }

  /** An ability fired, pointed at or not. Returns true when this finished the tutorial. */
  abilityFired(): boolean {
    if (this.step !== 'ability') return false;
    this.next('done');
    return true;
  }

  skip(): void {
    this.next('done');
  }

  private freeze(): void {
    this.pointed = true;
    this.frozenMs = 0;
  }

  private next(step: OnboardingStep): void {
    this.step = step;
    this.pointed = false;
    this.frozenMs = null;
    this.waited = 0;
  }
}
