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
 * The window runs on the wall clock and repaints itself when it lapses, unless the pointer or the focus is still on the
 * armed control (`stillOn`): reading a long armed line does not lose it. A thing of the world that is ticked by its
 * zone hands in its own `clock` (ms that pass only while it is ticked, so a pause keeps the arming) and asks
 * `expire()` from its update: nothing is scheduled then.
 */
export class Arming<K extends string = string> {
  private armed: { key: K; until: number } | null = null;
  /** The control the arming press was made on, as a selector (it may be repainted): its window holds while it is pointed at or focused. */
  private anchor: string | null = null;
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
      // Only a press made by that click (not a key pressed long after some panel's button was clicked).
      this.anchor = performance.now() - lastPressedAt < PRESS_LINK_MS ? selectorOf(lastPressed) : null;
      this.schedule(key);
    }
    this.onChange();
    return false;
  }

  /**
   * The lapse on the wall clock: the arming goes, unless the pointer still rests on the armed control or the focus is
   * on it (the player is reading what the second press does): then it holds for another window.
   */
  private schedule(key: K): void {
    this.timer = window.setTimeout(() => {
      if (this.armed?.key !== key) return;
      if (stillOn(this.anchor)) {
        this.armed.until = this.clock() + this.ms;
        this.schedule(key);
        return;
      }
      this.disarm();
    }, this.ms + 50);
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
    this.anchor = null;
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

/**
 * The control last pressed (a click, a tap, Enter or Space on it, a controller's A: all arrive as a click, seen here
 * before the panel's own handler): what an arming press was made on.
 */
let lastPressed: HTMLElement | null = null;
/** When it was pressed (`performance.now`), and how soon after it an arming press counts as made on it (ms). */
let lastPressedAt = -Infinity;
const PRESS_LINK_MS = 250;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e) => {
      lastPressed = e.target instanceof Element ? e.target.closest<HTMLElement>('button, [role="button"]') : null;
      lastPressedAt = performance.now();
    },
    true,
  );
}

/** A selector that finds the control again after a repaint: its tag and its `data-*` (the action, the row). */
function selectorOf(el: HTMLElement | null): string | null {
  if (!el) return null;
  const data = Object.entries(el.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v ?? '')}"]`);
  return data.length ? `${el.tagName.toLowerCase()}${data.join('')}` : null;
}

/** True while the control `selector` finds is under the pointer or has the focus. */
function stillOn(selector: string | null): boolean {
  if (!selector) return false;
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && (el.matches(':hover') || el === document.activeElement);
}

/** The status line under an armed button: "Click again to buy." (the verb follows the device in hand). */
export function armedLine(doing: string): string {
  return `${useVerbCap()} again to ${doing}.`;
}
