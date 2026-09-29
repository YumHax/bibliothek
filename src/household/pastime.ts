import { duckScene } from '@/audio/audioContext';
import { HOUSEHOLD } from './rules';

/** A full-screen curtain (the teleport's `Fader`): `out()` covers the view, `in()` reveals it. */
export interface PastimeCurtain {
  out(ms?: number): Promise<void>;
  in(ms?: number): Promise<void>;
}

/** The game's clock, wound forward by what the thing took (`DayNight`). */
export interface PastimeClock {
  readonly state: { readonly hours: number };
  advanceTo(hours: number): void;
}

/**
 * Something that takes a while at home, told in a beat instead of lived through: a fade to black
 * with its sounds, the change made in the dark, the clock wound on by `minutes`, the view back.
 * `start` plays as the view goes, `dark` once it is black, `end` as it comes back (ms: the fades).
 */
export interface Pastime {
  minutes: number;
  outMs: number;
  darkMs: number;
  inMs: number;
  start?: () => void;
  dark?: () => void;
  end?: () => void;
}

/**
 * Runs the household's pastimes (docs/household.md: cleaning a box, peeling a sticker, baking, a
 * soak) one at a time, the way `Sleep` runs a night: `run` fades out, does the change, advances
 * the clock, fades back and resolves with the change's result. Without a curtain (a test page), the
 * change is made at once and the clock still moves.
 */
export class Pastimes {
  private busy = false;

  constructor(
    private readonly curtain: PastimeCurtain | null,
    private readonly clock: PastimeClock | null,
    /** Holds the player still for the beat (`Session.setFrozen`): no walking, no clicks, no panels in the dark. */
    private readonly hold: ((busy: boolean) => void) | null = null,
  ) {}

  /** A pastime is playing out: another click waits for it. */
  get isBusy(): boolean {
    return this.busy;
  }

  async run<T>(pastime: Pastime, change: () => T): Promise<T | null> {
    if (this.busy) return null;
    if (pastime.minutes > HOUSEHOLD.pastimeMaxMinutes) console.error(`[household] a ${pastime.minutes} min pastime reads as a night to the cat: keep beats under ${HOUSEHOLD.pastimeMaxMinutes} min (rules.ts)`);
    this.busy = true;
    this.hold?.(true);
    let dark = false;
    try {
      pastime.start?.();
      dark = true;
      // The room's sound goes with the view; the job's own sounds are on the UI bus and carry on.
      duckScene(0, pastime.outMs / 1000);
      await this.curtain?.out(pastime.outMs);
      const result = change();
      pastime.dark?.();
      if (this.clock && pastime.minutes > 0) this.clock.advanceTo(this.clock.state.hours + pastime.minutes / 60);
      await new Promise((resolve) => window.setTimeout(resolve, pastime.darkMs));
      pastime.end?.();
      dark = false;
      duckScene(1, pastime.inMs / 1000);
      await this.curtain?.in(pastime.inMs);
      return result;
    } finally {
      // A change that threw never leaves the view black.
      if (dark) {
        duckScene(1, pastime.inMs / 1000);
        void this.curtain?.in(pastime.inMs);
      }
      this.busy = false;
      this.hold?.(false);
    }
  }
}
