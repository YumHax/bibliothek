/**
 * The old lift's secret: the floors pressed on the car's panel, kept while each press comes within
 * `gap` seconds of the last. `press` says when the last presses spell `code` (then it starts over).
 * Pure: the lift asks it on every panel press, with its own clock.
 */
export class LiftCode {
  private pressed: number[] = [];
  private last = -Infinity;

  constructor(
    private readonly code: readonly number[],
    private readonly gap: number,
  ) {}

  /** Floor `k` pressed at `now` (seconds): true when that completes the code. */
  press(k: number, now: number): boolean {
    if (now - this.last > this.gap) this.pressed = [];
    this.last = now;
    this.pressed.push(k);
    if (this.pressed.length > this.code.length) this.pressed.shift();
    const done = this.code.length > 0 && this.pressed.length === this.code.length && this.pressed.every((p, i) => p === this.code[i]);
    if (done) this.pressed = [];
    return done;
  }
}
