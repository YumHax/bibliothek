/**
 * Delayed calls on the game's time instead of the wall clock's (`setTimeout`): an owner ticks it
 * from its own `update(dt)` and clears it in its `dispose()`, so a delay pauses with its zone (not
 * ticked while dormant, slowed while culled, never fired after an unload) and nothing outlives it.
 */
export class Timers {
  private readonly pending: { at: number; fn: () => void }[] = [];
  /** Reused each tick (no garbage): the calls due now, in the order they were asked for. */
  private readonly due: { at: number; fn: () => void }[] = [];
  private now = 0;

  /** Calls `fn` once `seconds` of the owner's ticks have passed. */
  after(seconds: number, fn: () => void): void {
    this.pending.push({ at: this.now + seconds, fn });
  }

  update(dt: number): void {
    this.now += dt;
    const { pending, due } = this;
    let any = false;
    for (let i = 0; i < pending.length && !any; i++) any = pending[i]!.at <= this.now;
    if (!any) return;
    // In place: the due ones move out, the rest close up in their order.
    let kept = 0;
    for (let i = 0; i < pending.length; i++) {
      const t = pending[i]!;
      if (t.at <= this.now) due.push(t);
      else pending[kept++] = t;
    }
    pending.length = kept;
    // A call may ask for another (`after`) or clear the rest: both only touch `pending`.
    for (let i = 0; i < due.length; i++) due[i]!.fn();
    due.length = 0;
  }

  /** Drops every call still waiting. */
  clear(): void {
    this.pending.length = 0;
  }
}
