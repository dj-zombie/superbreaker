/** How a rail gun cycles: one heavy slug, a recharge, and a moment in it that rewards a press. */
export interface RailSpec {
  /** A shot's recharge, in ms: a held trigger fires this often. */
  cycleMs: number;
  /**
   * The perfect reload, in ms after a shot: a fresh press in here fires at once, overcharged.
   * A press anywhere else in the recharge jams it.
   */
  sweetSpot: readonly [number, number];
  /** A jam adds this much to the recharge it happened in, in ms. */
  jamMs: number;
  /** Half the beam's width, in px, and how much wider an overcharged one is. */
  halfWidth: number;
  overWidth: number;
  /** Hit points a slug takes, and an overcharged one. */
  damage: number;
  overDamage: number;
}

/** A shot a little over twice a second held, about three and a half with every reload perfect. */
export const DEFAULT_RAIL: RailSpec = {
  cycleMs: 450,
  sweetSpot: [240, 320],
  jamMs: 200,
  halfWidth: 12,
  overWidth: 1.8,
  damage: 10,
  overDamage: 20,
};

/** What one update of the gun did. */
export type RailEvent = { kind: 'fire'; overcharged: boolean } | { kind: 'jam' };

/**
 * A rail gun under a trigger. Holding it fires whenever the capacitor is full and never jams.
 * Pressing it fresh mid-recharge is a gamble on the timing: inside the sweet spot the slug goes
 * at once and overcharged, outside it the gun jams for a while.
 */
export class RailGun {
  /** Ms since the last shot. Far past any recharge until the first one, so it starts ready. */
  sinceMs = Number.POSITIVE_INFINITY;
  /** How long this recharge takes, in ms: the cycle, plus the jam if there was one. */
  rechargeMs = 0;
  /** This recharge jammed: its sweet spot is gone, and it takes the longer. */
  jammed = false;
  /** The last shot was overcharged. */
  overcharged = false;
  private wasHeld = false;

  constructor(readonly spec: RailSpec = DEFAULT_RAIL) {}

  get ready(): boolean {
    return this.sinceMs >= this.rechargeMs;
  }

  /** How far the capacitor has filled, 0..1. */
  get charge(): number {
    if (this.ready || this.rechargeMs <= 0) return 1;
    return Math.min(1, this.sinceMs / this.rechargeMs);
  }

  /** A press now would be a perfect reload. */
  get inSweetSpot(): boolean {
    const [from, to] = this.spec.sweetSpot;
    return !this.ready && !this.jammed && this.sinceMs >= from && this.sinceMs <= to;
  }

  /** The beam's half width for the next slug, or the one just fired when `overcharged`. */
  halfWidth(overcharged: boolean): number {
    return this.spec.halfWidth * (overcharged ? this.spec.overWidth : 1);
  }

  damage(overcharged: boolean): number {
    return overcharged ? this.spec.overDamage : this.spec.damage;
  }

  /**
   * Runs `dtMs` with the trigger held or not. `tapped` is a press without a hold, as a touch tap
   * is. At most one thing happens per update.
   */
  update(dtMs: number, held: boolean, tapped = false): RailEvent | null {
    this.sinceMs += Math.max(0, dtMs);
    const pressed = (held && !this.wasHeld) || tapped;
    this.wasHeld = held;
    if (this.ready) return held || pressed ? this.fire(false) : null;
    if (!pressed) return null;
    if (this.inSweetSpot) return this.fire(true);
    if (this.jammed) return null;
    this.jammed = true;
    this.rechargeMs += this.spec.jamMs;
    return { kind: 'jam' };
  }

  reset(): void {
    this.sinceMs = Number.POSITIVE_INFINITY;
    this.rechargeMs = 0;
    this.jammed = false;
    this.overcharged = false;
    this.wasHeld = false;
  }

  private fire(overcharged: boolean): RailEvent {
    this.sinceMs = 0;
    this.rechargeMs = this.spec.cycleMs;
    this.jammed = false;
    this.overcharged = overcharged;
    return { kind: 'fire', overcharged };
  }
}

/** Something a beam can pass through: its center and half its width, in px. */
export interface ColumnBox {
  x: number;
  halfW: number;
}

/** Everything a beam of half width `halfWidth` going straight up from `x` passes through. */
export function inColumn<T extends ColumnBox>(boxes: readonly T[], x: number, halfWidth: number): T[] {
  return boxes.filter((b) => Math.abs(b.x - x) <= b.halfW + halfWidth);
}
