/**
 * Delayed calls on the game's time instead of the wall clock's (`setTimeout`): an owner ticks it
 * from its own `update(dt)` and clears it in its `dispose()`, so a delay pauses with its zone (not
 * ticked while dormant, slowed while culled, never fired after an unload) and nothing outlives it.
 */
export class Timers {
  private pending: { at: number; fn: () => void }[] = [];
  private now = 0;

  /** Calls `fn` once `seconds` of the owner's ticks have passed. */
  after(seconds: number, fn: () => void): void {
    this.pending.push({ at: this.now + seconds, fn });
  }

  update(dt: number): void {
    this.now += dt;
    if (!this.pending.length) return;
    const due = this.pending.filter((t) => t.at <= this.now);
    if (!due.length) return;
    this.pending = this.pending.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }

  /** Drops every call still waiting. */
  clear(): void {
    this.pending = [];
  }
}
