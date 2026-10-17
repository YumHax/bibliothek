/*
 * A long press (docs/ui.md "Long press"): what is done for good in a conversation (a promise, a game given away, coins,
 * an insult) is never a plain click. The row's ring fills while it is held (`--social-hold`, social.css), and it is
 * done when the ring is full; let go before, nothing happens. The mouse, a key (Enter, Space, its digit) and the
 * controller's A all hold the same way.
 */

/** How long a press is held (ms): `--social-hold` in social.css says the same for the ring. */
export const HOLD_MS = 600;

export class HoldPress {
  private timer = 0;
  private poll = 0;
  private key: string | null = null;
  private el: HTMLElement | null = null;

  /** The row held now, or null. */
  get holding(): string | null {
    return this.key;
  }

  /**
   * Starts holding the row `key` (its element `el`): `done` runs once it was held `HOLD_MS`; `stillDown`, when given,
   * is asked each frame (the controller's A: let go, it stops).
   */
  start(key: string, el: HTMLElement, done: () => void, stillDown?: () => boolean): void {
    if (this.key === key) return;
    this.cancel();
    this.key = key;
    this.el = el;
    el.classList.add('social-held');
    this.timer = window.setTimeout(() => {
      this.clear();
      done();
    }, HOLD_MS);
    if (stillDown) {
      const check = (): void => {
        if (this.key !== key) return;
        if (!stillDown()) {
          this.cancel();
          return;
        }
        this.poll = requestAnimationFrame(check);
      };
      this.poll = requestAnimationFrame(check);
    }
  }

  /** Let go of `key` (or of whatever is held): unless it was held long enough, nothing happens. */
  release(key?: string): void {
    if (key === undefined || key === this.key) this.cancel();
  }

  cancel(): void {
    this.clear();
  }

  private clear(): void {
    window.clearTimeout(this.timer);
    cancelAnimationFrame(this.poll);
    this.el?.classList.remove('social-held');
    this.key = null;
    this.el = null;
  }
}
