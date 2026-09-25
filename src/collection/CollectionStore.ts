import type { Game, GameStatus } from '@/catalog/types';
import { PLATFORMS } from '@/catalog/platforms';
import type { GameSource } from './GameSource';

export const COLLECTION_STORAGE_KEY = 'bibliothek.collection.v1';

const FORMAT_VERSION = 1;

interface CollectionFile {
  version: number;
  exportedAt?: string;
  games: Game[];
}

/**
 * The user's collection. Starts from the seed list; once the user changes anything the whole
 * list is persisted to localStorage and the seed is no longer consulted (except via `resetToSeed`).
 */
export class CollectionStore implements GameSource {
  private list: Game[];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly seed: readonly Game[],
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = COLLECTION_STORAGE_KEY,
  ) {
    this.list = this.load() ?? seed.map(withDefaults);
  }

  get games(): readonly Game[] {
    return this.list;
  }

  /** True when the collection has been saved by the user (i.e. no longer mirrors the seed). */
  get isPersisted(): boolean {
    return this.storage?.getItem(this.key) != null;
  }

  has(id: string): boolean {
    return this.list.some((g) => g.id === id);
  }

  /** True when a copy is the player's (owned or lent out); a wishlist entry is not. */
  owns(id: string): boolean {
    const game = this.find(id);
    return game !== undefined && game.status !== 'wishlist';
  }

  find(id: string): Game | undefined {
    return this.list.find((g) => g.id === id);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Adds a game; a game with the same id is replaced in place. */
  add(game: Game): void {
    const complete = withDefaults(game);
    const i = this.list.findIndex((g) => g.id === game.id);
    if (i === -1) this.list = [...this.list, complete];
    else this.list = this.list.map((g, j) => (j === i ? complete : g));
    this.commit();
  }

  remove(id: string): void {
    const next = this.list.filter((g) => g.id !== id);
    if (next.length === this.list.length) return;
    this.list = next;
    this.commit();
  }

  update(id: string, patch: Partial<Omit<Game, 'id'>>): void {
    let changed = false;
    this.list = this.list.map((g) => {
      if (g.id !== id) return g;
      changed = true;
      return { ...g, ...patch, id };
    });
    if (changed) this.commit();
  }

  setStatus(id: string, status: GameStatus): void {
    this.update(id, { status });
  }

  /** Drops the saved collection and goes back to the built-in seed list. */
  resetToSeed(): void {
    this.list = this.seed.map(withDefaults);
    this.storage?.removeItem(this.key);
    this.notify();
  }

  exportJson(): string {
    const file: CollectionFile = { version: FORMAT_VERSION, exportedAt: new Date().toISOString(), games: this.list };
    return JSON.stringify(file, null, 2);
  }

  /**
   * Replaces the collection with the content of an exported file (or a bare JSON array of games).
   * Throws with a readable message when the text is not a valid collection.
   */
  importJson(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Not a JSON file.');
    }
    const raw = Array.isArray(parsed) ? parsed : (parsed as Partial<CollectionFile> | null)?.games;
    if (!Array.isArray(raw)) throw new Error('Expected a JSON array of games or an object with a "games" array.');
    const games = raw.map((g, i) => {
      if (!isGame(g)) throw new Error(`Entry ${i + 1} is not a valid game (needs id, title and a known platform).`);
      return withDefaults(g);
    });
    const ids = new Set<string>();
    for (const g of games) {
      if (ids.has(g.id)) throw new Error(`Duplicate id "${g.id}".`);
      ids.add(g.id);
    }
    this.list = games;
    this.commit();
  }

  private commit(): void {
    this.save();
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  private load(): Game[] | null {
    const text = this.storage?.getItem(this.key);
    if (!text) return null;
    try {
      const file = JSON.parse(text) as Partial<CollectionFile>;
      if (!Array.isArray(file.games)) return null;
      return file.games.filter(isGame).map(withDefaults);
    } catch {
      return null;
    }
  }

  private save(): void {
    if (!this.storage) return;
    const file: CollectionFile = { version: FORMAT_VERSION, games: this.list };
    try {
      this.storage.setItem(this.key, JSON.stringify(file));
    } catch (err) {
      console.warn('[collection] could not persist collection', err);
    }
  }
}

function withDefaults(game: Game): Game {
  return { ...game, status: game.status ?? 'owned', addedAt: game.addedAt ?? new Date().toISOString() };
}

function isGame(value: unknown): value is Game {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === 'string' && g.id.length > 0 && typeof g.title === 'string' && typeof g.platform === 'string'
    && g.platform in PLATFORMS;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
