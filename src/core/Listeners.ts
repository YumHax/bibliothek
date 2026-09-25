/**
 * A list of listeners for one event: `add` subscribes and returns the unsubscribe, `emit` calls
 * every listener in the order they were added. Replaces a single assignable `onX` slot, where a
 * second listener silently overwrote the first.
 */
export class Listeners<Args extends unknown[]> {
  private readonly list = new Set<(...args: Args) => void>();

  add(listener: (...args: Args) => void): () => void {
    this.list.add(listener);
    return () => {
      this.list.delete(listener);
    };
  }

  emit(...args: Args): void {
    // A copy: a listener may unsubscribe (or subscribe another) while being called.
    for (const listener of [...this.list]) listener(...args);
  }
}
