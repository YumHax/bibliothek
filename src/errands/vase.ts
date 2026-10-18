import { KEYS, PersistedStore } from '@/persistence';
import type { SeasonName } from '@/time/season';

/** Game days a bunch stays in the vase: fresh, then drooping on the last one, then over. */
const VASE_DAYS = 4;

interface VaseState {
  /** The flowers in it (the season's, when they went in), or none. */
  flowers: SeasonName | null;
  /** The game day they went in. */
  day: number;
}

const store = new PersistedStore<VaseState>({
  key: KEYS.vase,
  version: 1,
  defaults: () => ({ flowers: null, day: 0 }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const { flowers, day } = data as Partial<Record<keyof VaseState, unknown>>;
    const season = flowers === 'spring' || flowers === 'summer' || flowers === 'autumn' || flowers === 'winter' ? flowers : null;
    return { flowers: season, day: typeof day === 'number' && Number.isFinite(day) ? day : 0 };
  },
});

let state: VaseState = store.load();

/**
 * The vase on the kitchen table (docs/economy.md "Front Street's errands"): a bunch from the florist put in it stays
 * `VASE_DAYS` game days, the last one drooping, then goes on the compost. One bunch at a time; a fresh one replaces it.
 */
export const vase = {
  /** What stands in it on `today`: the season's flowers and whether they droop, or null when it is empty. */
  on(today: number): { flowers: SeasonName; drooping: boolean } | null {
    if (!state.flowers) return null;
    const age = today - state.day;
    if (age < 0 || age >= VASE_DAYS) return null;
    return { flowers: state.flowers, drooping: age === VASE_DAYS - 1 };
  },
  fill(flowers: SeasonName, today: number): void {
    state = { flowers, day: today };
    store.save(state);
  },
};
