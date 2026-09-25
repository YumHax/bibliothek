import type { Game } from '@/catalog/types';
import type { GameSource } from './GameSource';

/** A `GameSource` somebody else fills: the games the collection room's shelves had no room for, fed to the next bookcases. */
export class GameList implements GameSource {
  private list: readonly Game[] = [];
  private readonly listeners = new Set<() => void>();

  get games(): readonly Game[] {
    return this.list;
  }

  /** Replaces the list; subscribers hear of it only when the ids or their order changed. */
  set(games: readonly Game[]): void {
    const same = games.length === this.list.length && games.every((g, i) => g === this.list[i]);
    if (same) return;
    this.list = [...games];
    for (const cb of [...this.listeners]) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
