import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { SORT_MODES, type SortMode } from './sort';

/** One shelving's boxes as the player left them: bookcase by bookcase, row by row (top first), game ids left to right. */
export type ShelvingRows = string[][][];

/** Where a box goes: which shelving (`ShelvingOptions.id`), which of its bookcases, which row (0 = top), before which box. */
export interface ShelfAddress {
  shelving: string;
  bookcase: number;
  row: number;
  /** Among the row's boxes, the box in hand left out. */
  index: number;
}

interface Saved {
  mode: SortMode;
  /** Per shelving id; empty until the player first moves a box. */
  shelves: Record<string, ShelvingRows>;
}

/**
 * The sort the flat's shelves stand in (T), and the player's own arrangement ('custom', "yours"):
 * every box where the player put it. Kept when the shelves are sorted another way, so cycling back
 * to it puts every box back. Rows hold the ids of games that are not on the shelves today too (a
 * stray on the kitchen table, a game lent out): they come back to their place. Persisted.
 */
export class ShelfArrangement {
  private state: Saved;
  private readonly store: PersistedStore<Saved>;
  /** Game id -> the shelving its rows are on, built on first ask after a change. */
  private index: Map<string, string> | null = null;

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.shelves, defaultMode: SortMode = 'platform') {
    this.store = new PersistedStore<Saved>({ key, version: 1, storage, defaults: () => ({ mode: defaultMode, shelves: {} }), read: readSaved });
    this.state = this.store.load();
  }

  get mode(): SortMode {
    return this.state.mode;
  }

  /** Whether the player has arranged the shelves by hand (the 'custom' sort exists). */
  get exists(): boolean {
    return Object.values(this.state.shelves).some((rows) => rows.some((bookcase) => bookcase.some((row) => row.length)));
  }

  /** The rows of shelving `id` (empty when never arranged). */
  rowsOf(id: string): ShelvingRows {
    return this.state.shelves[id] ?? [];
  }

  /** Every shelving's rows. */
  all(): Record<string, ShelvingRows> {
    return this.state.shelves;
  }

  /** The shelving whose rows hold `gameId`, or null. */
  shelvingOf(gameId: string): string | null {
    if (!this.index) {
      this.index = new Map();
      for (const [id, rows] of Object.entries(this.state.shelves)) for (const bookcase of rows) for (const row of bookcase) for (const game of row) this.index.set(game, id);
    }
    return this.index.get(gameId) ?? null;
  }

  setMode(mode: SortMode): void {
    if (mode === this.state.mode) return;
    this.state = { ...this.state, mode };
    this.store.save(this.state);
  }

  /** The player's arrangement, every shelving at once; the sort becomes theirs. */
  setArrangement(shelves: Record<string, ShelvingRows>): void {
    this.state = { mode: 'custom', shelves };
    this.index = null;
    this.store.save(this.state);
  }
}

/**
 * The rows `shown` (what stands on the shelves now) with the box `gameId` moved to `to`, and the ids of `previous`
 * that are not shown anywhere (strays, games lent out) kept after the shown box they followed.
 */
export function arrange(
  shown: Readonly<Record<string, ShelvingRows>>,
  previous: Readonly<Record<string, ShelvingRows>>,
  gameId: string,
  to: ShelfAddress,
): Record<string, ShelvingRows> {
  const visible = new Set<string>();
  for (const rows of Object.values(shown)) for (const bookcase of rows) for (const row of bookcase) for (const id of row) visible.add(id);
  const result: Record<string, ShelvingRows> = {};
  for (const [shelving, rows] of Object.entries(shown)) result[shelving] = rows.map((bookcase) => bookcase.map((row) => row.filter((id) => id !== gameId)));
  const target = (result[to.shelving] ??= []);
  while (target.length <= to.bookcase) target.push([]);
  const bookcase = target[to.bookcase]!;
  while (bookcase.length <= to.row) bookcase.push([]);
  const row = bookcase[to.row]!;
  row.splice(Math.max(0, Math.min(to.index, row.length)), 0, gameId);
  // The hidden ids come back where they were: after the shown box they followed in the old rows.
  for (const [shelving, rows] of Object.entries(previous)) {
    rows.forEach((oldBookcase, b) =>
      oldBookcase.forEach((oldRow, r) => {
        const hidden = oldRow.filter((id) => !visible.has(id) && id !== gameId);
        if (!hidden.length) return;
        const rowsHere = (result[shelving] ??= []);
        while (rowsHere.length <= b) rowsHere.push([]);
        while (rowsHere[b]!.length <= r) rowsHere[b]!.push([]);
        rowsHere[b]![r] = keepHidden(rowsHere[b]![r]!, oldRow, visible);
      }),
    );
  }
  return result;
}

/** `row` with the ids of `old` that are not `visible` put back after the id they followed there (or at the start). */
function keepHidden(row: readonly string[], old: readonly string[], visible: ReadonlySet<string>): string[] {
  const after = new Map<string | null, string[]>();
  let previous: string | null = null;
  for (const id of old) {
    if (visible.has(id)) previous = id;
    else if (!row.includes(id)) {
      const list = after.get(previous) ?? [];
      list.push(id);
      after.set(previous, list);
    }
  }
  const placed = new Set(row);
  const result = [...(after.get(null) ?? [])];
  for (const id of row) result.push(id, ...(after.get(id) ?? []));
  // Hidden ids that followed a box now standing on another row keep to the end of this one.
  for (const [anchor, ids] of after) if (anchor !== null && !placed.has(anchor)) result.push(...ids);
  return result;
}

function readSaved(data: unknown): Saved | null {
  if (typeof data !== 'object' || data === null) return null;
  const { mode, shelves } = data as { mode?: unknown; shelves?: unknown };
  if (typeof mode !== 'string' || !(SORT_MODES as readonly string[]).includes(mode)) return null;
  const clean: Record<string, ShelvingRows> = {};
  if (typeof shelves === 'object' && shelves !== null) {
    for (const [id, rows] of Object.entries(shelves)) {
      if (!Array.isArray(rows)) continue;
      clean[id] = rows.map((bookcase: unknown) =>
        Array.isArray(bookcase) ? bookcase.map((row: unknown) => (Array.isArray(row) ? row.filter((x): x is string => typeof x === 'string') : [])) : [],
      );
    }
  }
  return { mode: mode as SortMode, shelves: clean };
}
