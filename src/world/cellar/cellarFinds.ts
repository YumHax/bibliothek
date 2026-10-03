import { KEYS, PersistedStore } from '@/persistence';

/*
 * What the player has done in the cellars, saved: the storage boxes opened (ours, once the padlock is undone) and
 * the cartons emptied (each box's one game, taken once for good).
 */

interface CellarState {
  opened: number[];
  taken: number[];
}

const store = new PersistedStore<CellarState>({
  key: KEYS.cellar,
  version: 1,
  defaults: () => ({ opened: [], taken: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const { opened, taken } = data as Partial<CellarState>;
    const numbers = (list: unknown): number[] => (Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number') : []);
    return { opened: numbers(opened), taken: numbers(taken) };
  },
});

let state: CellarState | null = null;

function load(): CellarState {
  return (state ??= store.load());
}

/** Whether storage box `n` was opened by the player. */
export function isOpened(n: number): boolean {
  return load().opened.includes(n);
}

export function markOpened(n: number): void {
  const s = load();
  if (s.opened.includes(n)) return;
  s.opened.push(n);
  store.save(s);
}

/** Whether box `n`'s game was taken. */
export function isTaken(n: number): boolean {
  return load().taken.includes(n);
}

export function markTaken(n: number): void {
  const s = load();
  if (s.taken.includes(n)) return;
  s.taken.push(n);
  store.save(s);
}

/** Taken back (the purchase undone: `ForSaleBox.restock`): the game is in its carton again. */
export function unmarkTaken(n: number): void {
  const s = load();
  s.taken = s.taken.filter((t) => t !== n);
  store.save(s);
}
