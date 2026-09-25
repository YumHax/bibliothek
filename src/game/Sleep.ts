/** The clock as a night's sleep needs it: wind forward to an hour (days passing on the way). */
export interface SleepClock {
  advanceTo(hours: number): void;
}

/** A full-screen curtain: `out()` covers the view, `in()` reveals it (the teleport's `Fader`). */
export interface SleepCurtain {
  out(ms?: number): Promise<void>;
  in(ms?: number): Promise<void>;
}

/** When the player wakes up. */
const WAKE_HOUR = 7;
/** A slow fade to black, a beat in the dark, a slow fade back: it should feel like a night, not a teleport. */
const FALL_ASLEEP_MS = 1200;
const DARK_MS = 700;
const WAKE_UP_MS = 1500;

/**
 * A night's sleep in the bed: the view fades out, the shared clock winds forward to the next
 * morning (7:00; the market calendar sees the day go by), and the view fades back in with the
 * player still lying in bed. `isAsleep` is true from the first fade to the last.
 */
export class Sleep {
  private asleep = false;

  constructor(
    private readonly clock: SleepClock,
    private readonly curtain: SleepCurtain,
  ) {}

  get isAsleep(): boolean {
    return this.asleep;
  }

  /** Sleeps until morning; resolves once the view is back. Ignored while already asleep. */
  async untilMorning(): Promise<void> {
    if (this.asleep) return;
    this.asleep = true;
    try {
      await this.curtain.out(FALL_ASLEEP_MS);
      this.clock.advanceTo(WAKE_HOUR);
      await new Promise((resolve) => window.setTimeout(resolve, DARK_MS));
      await this.curtain.in(WAKE_UP_MS);
    } finally {
      this.asleep = false;
    }
  }
}
