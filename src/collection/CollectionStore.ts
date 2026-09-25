import type { Game, GameStatus } from '@/catalog/types';
import { canonicalGameId } from '@/catalog';
import { readGame } from '@/catalog/validate';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { GameSource } from './GameSource';

export const COLLECTION_STORAGE_KEY = KEYS.collection;

/** The export file's format version (`exportJson`). */
const FORMAT_VERSION = 1;

interface CollectionFile {
  version: number;
  exportedAt?: string;
  games: Game[];
}

/** What is kept in storage: the games, and (after them, untouched) entries this build cannot read. */
interface Saved {
  games: Game[];
  /** Entries on a platform this build does not know (or otherwise unreadable): kept for a build that does. */
  aside: unknown[];
}

/**
 * The user's collection. Starts from the seed list; once the user changes anything the whole
 * list is persisted to localStorage and the seed is no longer consulted (except via `resetToSeed`).
 */
export class CollectionStore implements GameSource {
  private list: Game[];
  private aside: unknown[] = [];
  private change: 'import' | 'edit' = 'edit';
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<Saved | null>;

  constructor(
    private readonly seed: readonly Game[],
    storage: Storage | null = safeStorage(),
    key: string = COLLECTION_STORAGE_KEY,
  ) {
    // Version 1: `{ version, games }` (bare before the envelope). Old seed ids are mapped on read.
    this.store = new PersistedStore<Saved | null>({
      key,
      version: 1,
      storage,
      defaults: () => null,
      read: readSaved,
      write: (saved) => ({ games: [...(saved?.games ?? []), ...(saved?.aside ?? [])] }),
    });
    const saved = this.store.tryLoad();
    this.list = saved?.games ?? seed.map(withDefaults);
    this.aside = saved?.aside ?? [];
  }

  get games(): readonly Game[] {
    return this.list;
  }

  /** True when the collection has been saved by the user (i.e. no longer mirrors the seed). */
  get isPersisted(): boolean {
    return this.store.exists;
  }

  /** What the last change was (see `GameSource.lastChange`): the parcel only takes purchases. */
  get lastChange(): 'import' | 'edit' {
    return this.change;
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
    this.addMany([game]);
  }

  /** Adds several games in one change (one save, one notification); a game with the same id is replaced in place. */
  addMany(games: readonly Game[]): void {
    if (!games.length) return;
    let list = this.list;
    for (const game of games) {
      const complete = withDefaults(game);
      const i = list.findIndex((g) => g.id === complete.id);
      list = i === -1 ? [...list, complete] : list.map((g, j) => (j === i ? complete : g));
    }
    this.list = list;
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
    this.aside = [];
    this.store.remove();
    this.change = 'import';
    this.notify();
    this.change = 'edit';
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
      const game = readGame(g);
      if (!game) throw new Error(`Entry ${i + 1} is not a valid game (needs id, title and a known platform).`);
      return withDefaults(game);
    });
    const ids = new Set<string>();
    for (const g of games) {
      if (ids.has(g.id)) throw new Error(`Duplicate id "${g.id}".`);
      ids.add(g.id);
    }
    this.list = games;
    this.change = 'import';
    this.commit();
    this.change = 'edit';
  }

  private commit(): void {
    this.store.save({ games: this.list, aside: this.aside });
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

/** A game as the collection keeps it: its canonical id, a status and the date it came in. */
function withDefaults(game: Game): Game {
  return { ...game, id: canonicalGameId(game.id), status: game.status ?? 'owned', addedAt: game.addedAt ?? new Date().toISOString() };
}

/**
 * What was saved, games first: old seed ids mapped to the canonical ones (a game held under both
 * keeps the owned copy), entries this build cannot read kept aside untouched. Null when it is no collection.
 */
function readSaved(data: unknown): Saved | null {
  const file = data as Partial<CollectionFile> | null;
  if (typeof file !== 'object' || file === null || !Array.isArray(file.games)) return null;
  const games: Game[] = [];
  const aside: unknown[] = [];
  for (const entry of file.games) {
    const game = readGame(entry);
    if (!game) {
      if (typeof entry === 'object' && entry !== null) aside.push(entry);
      continue;
    }
    const i = games.findIndex((g) => g.id === game.id);
    if (i === -1) games.push(withDefaults(game));
    else if (games[i]!.status === 'wishlist' && game.status !== 'wishlist') games[i] = withDefaults(game);
  }
  return { games, aside };
}
