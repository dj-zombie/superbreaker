/** How a gatling spins up under a held trigger. Spin runs 0..1. */
export interface GatlingSpec {
  /** Held from cold, the barrels reach full spin in this long, in ms. */
  spinUpMs: number;
  /** Let go at full spin, they coast to a stop in this long, in ms: a quick re-grip keeps most of it. */
  spinDownMs: number;
  /** Ms between shots from cold, and at full spin. */
  slowGapMs: number;
  fastGapMs: number;
  /** Spin at which each bolt hits one harder: 2 from the first mark, 3 from the second. */
  damageAt: readonly number[];
}

/** About two and a half seconds to full spin: eight shots a second from cold, thirty at the top. */
export const DEFAULT_GATLING: GatlingSpec = {
  spinUpMs: 2_400,
  spinDownMs: 900,
  slowGapMs: 125,
  fastGapMs: 33,
  damageAt: [0.45, 0.9],
};

/**
 * A gatling under a held trigger: it always fires while held, with no ammo and no heat, and the
 * longer it is held the faster it fires and the harder each bolt hits.
 */
export class Gatling {
  spin = 0;
  /** The trigger is held: the guns are firing. */
  firing = false;

  constructor(readonly spec: GatlingSpec = DEFAULT_GATLING) {}

  /** Each bolt's damage at the current spin: 1, then one more for each mark passed. */
  get damage(): number {
    let d = 1;
    for (const at of this.spec.damageAt) if (this.spin >= at) d++;
    return d;
  }

  /** Ms between shots at the current spin. Eases in, so the top end arrives with a rush. */
  get gapMs(): number {
    const { slowGapMs, fastGapMs } = this.spec;
    const k = this.spin * this.spin;
    return slowGapMs + (fastGapMs - slowGapMs) * k;
  }

  /** Runs `dtMs` with the trigger held or not. Returns the new damage when it has just gone up. */
  update(dtMs: number, held: boolean): number | null {
    const dt = Math.max(0, dtMs);
    const before = this.damage;
    this.firing = held;
    if (held) this.spin = Math.min(1, this.spin + dt / Math.max(1, this.spec.spinUpMs));
    else this.spin = Math.max(0, this.spin - dt / Math.max(1, this.spec.spinDownMs));
    const after = this.damage;
    return after > before ? after : null;
  }

  reset(): void {
    this.spin = 0;
    this.firing = false;
  }
}
