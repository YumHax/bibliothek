import { KEYS, PersistedStore } from '@/persistence';

/*
 * How the concierge knows the player: whether they have met, the errand she asked (checking the
 * timer buttons floor by floor) and how far it went, and the tips in her Christmas box. One store
 * for the page, made on first use (`stairwell/Concierge` reads and writes it).
 */

interface ConciergeSaved {
  met: boolean;
  /** `asked`: she wants the timer buttons of the 1st to the 4th floor tried; `tried`: all four were (the sticky one found); `done`: she was told, the key given. */
  errand: 'none' | 'asked' | 'tried' | 'done';
  /** The floors (landing `k`) whose button the player pressed since she asked. */
  pressed: number[];
  /** Coins put in her Christmas box, all told. */
  tips: number;
}

let store: PersistedStore<ConciergeSaved> | null = null;
let state: ConciergeSaved | null = null;

function fresh(): ConciergeSaved {
  return { met: false, errand: 'none', pressed: [], tips: 0 };
}

function readSaved(data: unknown): ConciergeSaved | null {
  if (!data || typeof data !== 'object') return null;
  const d = { ...fresh(), ...(data as Partial<ConciergeSaved>) };
  if (!['none', 'asked', 'tried', 'done'].includes(d.errand)) d.errand = 'none';
  d.pressed = Array.isArray(d.pressed) ? d.pressed.filter((k) => Number.isInteger(k)) : [];
  return d;
}

/** The concierge's state (live: change it, then `saveConcierge`). */
export function conciergeState(): ConciergeSaved {
  if (state) return state;
  store = new PersistedStore<ConciergeSaved>({ key: KEYS.concierge, version: 1, defaults: fresh, read: readSaved });
  state = store.load();
  return state;
}

export function saveConcierge(): void {
  store?.save(conciergeState());
}
