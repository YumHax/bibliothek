import { KEYS, PersistedStore, safeStorage, saveKeys } from '@/persistence';
import { keepOnly } from '../progress/debugProgress';
import type { StartPoint } from './startPoints';

/*
 * Which start point `?debug`'s save was last started from (`startPoints`), kept in the debug save only: whether the
 * opening plays and which collection the save starts with (read by `bootstrap/services` as it makes the stores), and
 * the dials and coins still to set, done once by `bootstrap/debug` when the page is back. Nothing saved: the debug
 * save of before, everything done on the seed collection.
 */

interface StartFile {
  /** The start point's id; null for the debug save of before. */
  point: string | null;
  opening: boolean;
  collection: 'seed' | 'starter';
  /** What to set at the next start, then cleared: the dials' levels by id, the coins. */
  pending: { levels: Record<string, number>; coins?: number } | null;
}

const store = new PersistedStore<StartFile>({
  key: KEYS.debugStart,
  version: 1,
  defaults: () => ({ point: null, opening: false, collection: 'seed', pending: null }),
  read: readStart,
});

let file: StartFile | null = null;

function current(): StartFile {
  return (file ??= store.load());
}

/** How the debug save was started: the start point's id (null: as always), the opening, the collection. */
export function debugStart(): Readonly<Omit<StartFile, 'pending'>> {
  return current();
}

/** The dials and coins the last start point left to set, once (cleared as they are taken). */
export function takePendingStart(): StartFile['pending'] {
  const { pending } = current();
  if (pending) {
    file = { ...current(), pending: null };
    store.save(file);
  }
  return pending;
}

/**
 * Starts the debug save again from `point`: every key of it wiped (the real save untouched), the progressions
 * switched to the point's, its dials left to set, and the page reloaded. The stores in memory may flush their old
 * state as the page goes: the wipe is made again last thing on `pagehide` (as `settings/saveFile.importSave` does).
 */
export function startFrom(point: StartPoint): void {
  const storage = safeStorage();
  if (!storage) return;
  const next: StartFile = {
    point: point.id,
    opening: point.opening,
    collection: point.collection,
    pending: { levels: { ...point.levels }, ...(point.coins !== undefined ? { coins: point.coins } : {}) },
  };
  const write = (): void => {
    for (const key of saveKeys(storage)) {
      try {
        storage.removeItem(key);
      } catch {
        // Private mode: nothing was kept anyway.
      }
    }
    keepOnly(point.done);
    store.save(next);
  };
  write();
  window.addEventListener('pagehide', write);
  location.reload();
}

function readStart(data: unknown): StartFile | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<StartFile>;
  const levels = d.pending && typeof d.pending === 'object' && d.pending.levels && typeof d.pending.levels === 'object'
    ? Object.fromEntries(Object.entries(d.pending.levels).filter((e): e is [string, number] => typeof e[1] === 'number'))
    : null;
  const coins = typeof d.pending?.coins === 'number' ? d.pending.coins : undefined;
  return {
    point: typeof d.point === 'string' ? d.point : null,
    opening: d.opening === true,
    collection: d.collection === 'starter' ? 'starter' : 'seed',
    pending: levels ? { levels, ...(coins !== undefined ? { coins } : {}) } : null,
  };
}
