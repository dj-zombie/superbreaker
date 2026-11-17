/** A script of timed cues on a clock its owner hands in: a cutscene's timing, without the engine. */
export class CueSheet<C extends { at: number }> {
  private readonly cues: C[];
  private next = 0;
  private elapsed = 0;
  private ended = false;

  constructor(
    cues: readonly C[],
    private readonly lengthMs: number,
  ) {
    // The sort is stable, so cues at the same moment keep the order they were written in.
    this.cues = [...cues].sort((a, b) => a.at - b.at);
  }

  /** True once `lengthMs` has passed or `skip()` was called. */
  get done(): boolean {
    return this.ended;
  }

  /** Advances the sheet and returns the cues that came due, in `at` order. */
  tick(dt: number): C[] {
    if (this.ended) return [];
    // Written this way round so a NaN leaves the clock alone.
    if (dt > 0) this.elapsed += dt;
    // A cue written past the end never fires, however far one long frame overshoots.
    const until = Math.min(this.elapsed, this.lengthMs);
    const due: C[] = [];
    while (this.next < this.cues.length && this.cues[this.next]!.at <= until) {
      due.push(this.cues[this.next++]!);
    }
    if (this.elapsed >= this.lengthMs) this.ended = true;
    return due;
  }

  /** Ends the sheet now. Cues that were not due never fire. */
  skip(): void {
    this.ended = true;
  }
}
