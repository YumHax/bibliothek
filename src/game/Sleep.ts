import { duckScene } from '@/audio/audioContext';

/** The clock as a night's sleep needs it: the hour now, and wind forward to an hour (days passing on the way). */
interface SleepClock {
  readonly state: { readonly hours: number };
  advanceTo(hours: number): void;
}

/** A full-screen curtain: `out()` covers the view, `in()` reveals it (the teleport's `Fader`). */
interface SleepCurtain {
  out(ms?: number): Promise<void>;
  in(ms?: number): Promise<void>;
}

/** When the player wakes up, unless the alarm clock says otherwise. */
const WAKE_HOUR = 7;
/**
 * The bed only sends the player to sleep in the evening and the small hours (clock hours): a nap at
 * noon would wind the market calendar on a day for nothing but a few seconds of dark.
 */
const SLEEPY = { from: 20, until: 5 };
/** A slow fade to black, a beat in the dark, a slow fade back: it should feel like a night, not a teleport. */
const FALL_ASLEEP_MS = 1200;
const DARK_MS = 700;
const WAKE_UP_MS = 1500;
/** How fast the flat's sound comes back in the morning (s): quicker than the fade, the alarm rings at its start. */
const WAKE_DUCK_S = 0.4;
/** The alarm starts this long after the sound starts coming back (ms): its first beeps are not swallowed by the swell. */
const ALARM_AFTER_DUCK_MS = 350;

/**
 * A night's sleep in the bed: the view fades out, the shared clock winds forward to the next
 * morning (7:00, or the hour the bedside alarm is set to: `wakeHour`; the market calendar sees the
 * day go by), and the view fades back in with the player still lying in bed, to the alarm's ring
 * (`onWake`). `isAsleep` is true
 * from the first fade to the last.
 */
export class Sleep {
  private asleep = false;
  private readonly wakers: (() => void)[] = [];

  constructor(
    private readonly clock: SleepClock,
    private readonly curtain: SleepCurtain,
    private readonly wakeHour: () => number = () => WAKE_HOUR,
  ) {}

  get isAsleep(): boolean {
    return this.asleep;
  }

  /** `cb` runs as the morning's fade-in starts (the bedside alarm rings). Returns the unsubscribe. */
  onWake(cb: () => void): () => void {
    this.wakers.push(cb);
    return () => {
      const i = this.wakers.indexOf(cb);
      if (i >= 0) this.wakers.splice(i, 1);
    };
  }

  /** Whether it is a time to go to sleep (evening or night), and the night would wind the clock on at all. */
  get sleepy(): boolean {
    const h = ((this.clock.state.hours % 24) + 24) % 24;
    return (h >= SLEEPY.from || h < SLEEPY.until) && Math.abs(h - this.wakeHour()) > 0.05;
  }

  /** Sleeps until morning; resolves once the view is back (false at once when not sleepy). Ignored while already asleep. */
  async untilMorning(): Promise<boolean> {
    if (this.asleep) return false;
    if (!this.sleepy) return false;
    this.asleep = true;
    try {
      // The flat's sound fades with the view (the TV, the radio, the street) and comes back with the morning,
      // a little ahead of the fade-in so the alarm's ring is heard whole.
      duckScene(0, FALL_ASLEEP_MS / 1000);
      await this.curtain.out(FALL_ASLEEP_MS);
      this.clock.advanceTo(this.wakeHour());
      await new Promise((resolve) => window.setTimeout(resolve, DARK_MS));
      duckScene(1, WAKE_DUCK_S);
      const wakers = [...this.wakers];
      window.setTimeout(() => {
        for (const cb of wakers) cb();
      }, ALARM_AFTER_DUCK_MS);
      await this.curtain.in(WAKE_UP_MS);
    } finally {
      duckScene(1, WAKE_DUCK_S);
      this.asleep = false;
    }
    return true;
  }
}
