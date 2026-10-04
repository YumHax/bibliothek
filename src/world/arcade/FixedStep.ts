/**
 * Advances a simulation in fixed steps of `step` seconds, whatever the frame rate: `run(dt, fn)`
 * calls `fn(step)` as many times as `dt` holds, keeps the remainder for the next frame, and never
 * simulates more than `maxCatchUp` seconds in one frame (a tab that slept does not fast-forward).
 * Fixed steps are what make a play replay exactly from its inputs (`replay/Replay`) and what make
 * the balance script (`npm run balance`, playing at the same step) measure what the player gets.
 * `fn` may return true to stop early (the play is over); `run` says whether it did.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxCatchUp = 0.1,
  ) {}

  run(dt: number, fn: (step: number) => boolean | void): boolean {
    this.accumulator = Math.min(this.accumulator + dt, this.maxCatchUp);
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      if (fn(this.step) === true) return true;
    }
    return false;
  }

  /** Drops the time kept from the last frame (a fresh play starts on a whole step). */
  reset(): void {
    this.accumulator = 0;
  }
}
