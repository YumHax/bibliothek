import { KEYS, PersistedStore } from '@/persistence';

/*
 * Halloween on Front Street (docs/zones.md "The street", the holidays): in the evenings of the holiday's days, the
 * residents' doors with a pumpkin on the step answer a knock with a treat, each once a year. What was knocked at this
 * year is kept, so a reload does not fill the pockets twice.
 */

/** The game hours the doors answer in, on a Halloween day of the real calendar. */
export const TRICK_OR_TREAT_HOURS: readonly [number, number] = [17, 21.5];

interface TrickState {
  year: number;
  knocked: string[];
}

const store = new PersistedStore<TrickState>({
  key: KEYS.trickOrTreat,
  version: 1,
  defaults: () => ({ year: 0, knocked: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as Partial<TrickState>;
    return { year: typeof o.year === 'number' ? o.year : 0, knocked: Array.isArray(o.knocked) ? o.knocked.filter((k): k is string => typeof k === 'string') : [] };
  },
});

let state = store.load();

export const trickOrTreat = {
  /** The door `id` answered this year already. */
  knocked(id: string, year: number): boolean {
    return state.year === year && state.knocked.includes(id);
  },
  knock(id: string, year: number): void {
    const knocked = state.year === year ? state.knocked : [];
    state = { year, knocked: [...knocked.filter((k) => k !== id), id] };
    store.save(state);
  },
};
