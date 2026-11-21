import type { Cue, HoldPoint, Timeline } from './types';

/**
 * The cutscene's clock. It runs on the time its owner hands in, stops at holds until released,
 * and returns the cues it passes. Seeking and skipping move the clock without firing anything, so
 * the scene only ever shows what the sampled frame says.
 */
export class Playhead {
  private t = 0;
  private nextCue = 0;
  private nextHold = 0;
  private holding: HoldPoint | null = null;
  private ended = false;

  constructor(private readonly tl: Pick<Timeline, 'lengthMs' | 'cues' | 'holds'>) {}

  /** Script time, in ms. */
  get time(): number {
    return this.t;
  }

  get length(): number {
    return this.tl.lengthMs;
  }

  /** The hold the clock is stopped at, if any. */
  get held(): HoldPoint | null {
    return this.holding;
  }

  get done(): boolean {
    return this.ended;
  }

  /** Advances by `dt` ms, stopping at the next hold, and returns the cues that came due. */
  tick(dt: number): Cue[] {
    return dt > 0 ? this.advanceTo(this.t + dt) : this.advanceTo(this.t);
  }

  /**
   * Moves forward to `target`, firing the cues on the way and stopping at a hold in between. A
   * tap that hurries a line along uses this, so the sounds it skips past still play.
   */
  advanceTo(target: number): Cue[] {
    if (this.ended || this.holding) return [];
    let until = Math.min(Math.max(target, this.t), this.tl.lengthMs);
    const hold = this.tl.holds[this.nextHold];
    const stops = hold !== undefined && hold.at <= until;
    if (stops) until = hold.at;
    const due: Cue[] = [];
    const cues = this.tl.cues;
    while (this.nextCue < cues.length && cues[this.nextCue]!.at <= until)
      due.push(cues[this.nextCue++]!);
    this.t = until;
    if (stops) {
      this.holding = hold;
      this.nextHold++;
    } else if (this.t >= this.tl.lengthMs) this.ended = true;
    return due;
  }

  /** Lets the clock go on from a hold. */
  release(): void {
    if (!this.holding) return;
    this.holding = null;
    if (this.t >= this.tl.lengthMs && this.nextHold >= this.tl.holds.length) this.ended = true;
  }

  /** Jumps to `t` without firing the cues or stopping at the holds before it. */
  seek(t: number): void {
    const to = Math.min(Math.max(0, t), this.tl.lengthMs);
    this.t = to;
    this.holding = null;
    this.ended = false;
    const cues = this.tl.cues;
    const holds = this.tl.holds;
    this.nextCue = 0;
    while (this.nextCue < cues.length && cues[this.nextCue]!.at < to) this.nextCue++;
    this.nextHold = 0;
    while (this.nextHold < holds.length && holds[this.nextHold]!.at < to) this.nextHold++;
  }

  /** Ends the scene: the clock sits at the end, and nothing left in it fires. */
  skip(): void {
    this.t = this.tl.lengthMs;
    this.nextCue = this.tl.cues.length;
    this.nextHold = this.tl.holds.length;
    this.holding = null;
    this.ended = true;
  }
}
