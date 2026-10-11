import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/*
 * THE PLAYER'S PRINTS IN MÉMÉ'S ALBUM (docs/grandma.md "The album's other photos"): the photos the player gave her,
 * glued in after Félix's pages, and the epilogue's photo of the two of them (id `epilogue`, the album's very last
 * slot). Small JPEG data URLs, a handful at most so the save stays small: past `ROOM` the oldest goes to her drawer
 * (out of the save). Saved as `bibliothek.albumPrints.v1`.
 */

export interface AlbumPrint {
  id: string;
  /** Her caption under it. */
  caption: string;
  /** A small JPEG (data URL). */
  image: string;
  /** The game day it was glued in. */
  day: number;
}

/** The epilogue's print: kept apart, in the last slot, never pushed out. */
export const EPILOGUE_PRINT = 'epilogue';
/** The player's prints the album has room for (the present's spread less the epilogue's slot). */
export const PRINT_ROOM = 7;
/** A print's data URL longer than this is not kept (about 150 kB: a print is meant to be a few dozen). */
const MAX_IMAGE = 200_000;

interface PrintsState {
  prints: AlbumPrint[];
}

export class AlbumPrints {
  private state: PrintsState;
  private readonly store: PersistedStore<PrintsState>;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<PrintsState>({ key: KEYS.albumPrints, version: 1, storage, defaults: () => ({ prints: [] }), read: readState });
    this.state = this.store.load();
  }

  /** Glues `print` in (one of the same id replaced); past the room the player's oldest goes to the drawer. */
  add(print: AlbumPrint): void {
    if (!print.image.startsWith('data:image/') || print.image.length > MAX_IMAGE) return;
    let prints = [...this.state.prints.filter((p) => p.id !== print.id), print];
    const players = prints.filter((p) => p.id !== EPILOGUE_PRINT);
    if (players.length > PRINT_ROOM) {
      const out = new Set(players.slice(0, players.length - PRINT_ROOM).map((p) => p.id));
      prints = prints.filter((p) => !out.has(p.id));
    }
    this.state = { prints };
    this.store.save(this.state);
    for (const listener of [...this.listeners]) listener();
  }

  /** The prints glued in, oldest first (the epilogue's among them once there). */
  list(): readonly AlbumPrint[] {
    return this.state.prints;
  }

  has(id: string): boolean {
    return this.state.prints.some((p) => p.id === id);
  }

  /** Hears a print glued in. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function readState(data: unknown): PrintsState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = (data as { prints?: unknown }).prints;
  if (!Array.isArray(raw)) return { prints: [] };
  const prints = raw.flatMap((p): AlbumPrint[] => {
    if (typeof p !== 'object' || p === null) return [];
    const { id, caption, image, day } = p as Partial<Record<keyof AlbumPrint, unknown>>;
    if (typeof id !== 'string' || typeof caption !== 'string' || typeof image !== 'string' || !image.startsWith('data:image/')) return [];
    return [{ id, caption, image, day: typeof day === 'number' && Number.isFinite(day) ? day : 0 }];
  });
  return { prints };
}
