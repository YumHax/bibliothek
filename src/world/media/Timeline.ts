import { easeInOutCubic } from '@/math/easing';

/** One move of a `Timeline`: how long it takes and what it does at each eased point `t` (0..1). */
export interface Step {
  seconds: number;
  run(t: number): void;
  /** Linear instead of eased in and out. */
  linear?: boolean;
}

/**
 * A few moves played one after the other (a cartridge flown to a console, slid in, pressed down),
 * then `onDone`. Pure state: whoever owns it calls `tick`.
 */
export class Timeline {
  private index = 0;
  private time = 0;
  private finished = false;

  constructor(
    private readonly steps: readonly Step[],
    private readonly onDone: () => void = () => undefined,
  ) {}

  get done(): boolean {
    return this.finished;
  }

  /** Advances by `dt` seconds; true while it still runs. */
  tick(dt: number): boolean {
    if (this.finished) return false;
    let left = dt;
    while (this.index < this.steps.length) {
      const step = this.steps[this.index]!;
      this.time += left;
      const t = step.seconds > 0 ? Math.min(1, this.time / step.seconds) : 1;
      step.run(step.linear ? t : easeInOutCubic(t));
      if (t < 1) return true;
      left = this.time - step.seconds;
      this.time = 0;
      this.index++;
    }
    this.finished = true;
    this.onDone();
    return false;
  }

  /** Plays every move to its end at once (the zone is leaving: no half-inserted cartridge left behind). */
  finish(): void {
    while (!this.finished) this.tick(1e3);
  }
}
