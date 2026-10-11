import { KEYS, PersistedStore } from '@/persistence';
import { oncePerDay } from '@/time/OncePerDay';

/*
 * What the player has done in the park's gardens (docs/zones.md "The street", the park): the ducks fed on the pond's
 * near bank (once a game day counts), the wishes made with a coin tossed towards the fountain (one a game day), and the
 * old arcade token that turns up in the shallows once enough wishes have been made. Kept across reloads.
 */

/** Wishes made (on as many game days) before the token glints in the shallows. */
const WISHES_FOR_TOKEN = 7;

/** The once-a-day marker of the ducks fed (`time/OncePerDay`). */
const FED = 'parkDucksFed';

interface ParkState {
  /** Game days a wish was made on (the last few are enough to count them). */
  wishDays: number[];
  /** The arcade token found in the pond. */
  token: boolean;
}

const store = new PersistedStore<ParkState>({
  key: KEYS.parkVisits,
  version: 1,
  defaults: () => ({ wishDays: [], token: false }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as Partial<ParkState>;
    return {
      wishDays: Array.isArray(o.wishDays) ? o.wishDays.filter((d): d is number => typeof d === 'number').slice(-WISHES_FOR_TOKEN * 2) : [],
      token: o.token === true,
    };
  },
});

let state = store.load();

function commit(next: ParkState): void {
  state = next;
  store.save(state);
}

export const parkVisits = {
  /** The ducks were fed today already. */
  fedToday(day: number): boolean {
    return oncePerDay.done(FED, day);
  },
  feed(day: number): void {
    oncePerDay.mark(FED, day);
  },
  /** A wish was made today already. */
  wishedToday(day: number): boolean {
    return state.wishDays.includes(day);
  },
  /** Counts today's wish; true when this one brings the token up (once, ever). */
  wish(day: number): boolean {
    const wishDays = [...state.wishDays.filter((d) => d !== day), day].slice(-WISHES_FOR_TOKEN * 2);
    const found = !state.token && wishDays.length >= WISHES_FOR_TOKEN;
    commit({ ...state, wishDays, token: state.token || found });
    return found;
  },
};
