import { useVerbCap } from './verb';

/** A deliberate second press: a first press arms a sale, a seal, a walk-away for this long (ms), the second within it goes through. */
export const CONFIRM_MS = 4000;

/**
 * "Press twice to confirm", the one way: an irreversible action (spending coins, parting with a game, breaking a
 * seal, walking away from a paid play) is armed by a first press and done by a second one within the window
 * (`CONFIRM_MS` unless the owner has a reason for another: walking away 1.5 s). The armed thing says what the second
 * press does, and reads as before once the time is up (`onChange` repaints). One `Arming` per owner, keyed by
 * what is armed (a row's id, an action name): arming one thing disarms the other.
 *
 *   if (!this.arming.press(id)) return;   // first press: armed, repainted, nothing else happens
 *   ...do it...                           // second press within the time
 *
 * The window runs on the wall clock and repaints itself when it lapses. A thing of the world that is ticked by its
 * zone hands in its own `clock` (ms that pass only while it is ticked, so a pause keeps the arming) and asks
 * `expire()` from its update: nothing is scheduled then.
 */
export class Arming<K extends string = string> {
  private armed: { key: K; until: number } | null = null;
  private timer: number | undefined;
  private readonly clock: () => number;
  /** On the wall clock the lapse repaints by timer; on an owner's clock the owner asks `expire()`. */
  private readonly scheduled: boolean;

  constructor(
    private readonly onChange: () => void,
    private readonly ms = CONFIRM_MS,
    clock?: () => number,
  ) {
    this.clock = clock ?? (() => performance.now());
    this.scheduled = clock === undefined;
  }

  /** The key armed now, if still within the time. */
  get key(): K | null {
    return this.armed && this.clock() <= this.armed.until ? this.armed.key : null;
  }

  isArmed(key: K): boolean {
    return this.key === key;
  }

  /** Arms `key` (repainting) and returns false; or, `key` being armed, disarms it and returns true: do it. */
  press(key: K): boolean {
    if (this.isArmed(key)) {
      this.disarm();
      return true;
    }
    this.armed = { key, until: this.clock() + this.ms };
    window.clearTimeout(this.timer);
    if (this.scheduled) {
      this.timer = window.setTimeout(() => {
        if (this.armed?.key === key) this.disarm();
      }, this.ms + 50);
    }
    this.onChange();
    return false;
  }

  /**
   * Whether `key` was pressed within the window of the press before; the window restarts at this press either way
   * (a run of quick presses: every press within the window of the last counts as "again").
   */
  again(key: K): boolean {
    const again = this.isArmed(key);
    this.armed = null;
    this.press(key);
    return again;
  }

  /** Reads the armed button as before (nothing armed). */
  disarm(): void {
    window.clearTimeout(this.timer);
    if (!this.armed) return;
    this.armed = null;
    this.onChange();
  }

  /** An arming whose time is up is forgotten and repainted; true when there was one (an owner on its own clock asks from its update). */
  expire(): boolean {
    if (!this.armed || this.clock() <= this.armed.until) return false;
    this.disarm();
    return true;
  }

  /** Forgets what was armed without repainting (the panel is closing, or repaints anyway). */
  reset(): void {
    window.clearTimeout(this.timer);
    this.armed = null;
  }
}

/** The status line under an armed button: "Click again to buy." (the verb follows the device in hand). */
export function armedLine(doing: string): string {
  return `${useVerbCap()} again to ${doing}.`;
}
