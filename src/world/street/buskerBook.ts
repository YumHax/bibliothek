import { KEYS, PersistedStore } from '@/persistence';

/*
 * What the busker remembers of the player (docs/social.md "Front Street and the arcade"): how often each tune of his
 * book was asked for (the most asked is the player's favourite, struck up when a friend comes by), and whether his
 * record was given. Saved under `KEYS.buskerRequests`.
 */

interface BuskerBookState {
  /** Requests by tune (`Busker`'s `REQUESTS` index). */
  asked: number[];
  /** His record was given (once). */
  tape: boolean;
}

const store = new PersistedStore<BuskerBookState>({
  key: KEYS.buskerRequests,
  version: 1,
  defaults: () => ({ asked: [], tape: false }),
  read: (data) => {
    if (!data || typeof data !== 'object') return null;
    const o = data as Partial<BuskerBookState>;
    const asked = Array.isArray(o.asked) ? o.asked.map((n) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)) : [];
    return { asked, tape: o.tape === true };
  },
});

let state = store.load();

/** Tune `index` was asked for once more. */
export function noteRequest(index: number): void {
  const asked = [...state.asked];
  while (asked.length <= index) asked.push(0);
  asked[index]! += 1;
  state = { ...state, asked };
  store.save(state);
}

/** The tune asked for most (at least twice), or null. */
export function favouriteRequest(): number | null {
  let best = -1;
  state.asked.forEach((n, i) => {
    if (n >= 2 && (best < 0 || n > state.asked[best]!)) best = i;
  });
  return best < 0 ? null : best;
}

/** Whether his record was given already. */
export function tapeGiven(): boolean {
  return state.tape;
}

/** His record was given. */
export function giveTape(): void {
  state = { ...state, tape: true };
  store.save(state);
}
