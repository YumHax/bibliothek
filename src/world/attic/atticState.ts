import { KEYS, PersistedStore } from '@/persistence';

/** What the attic remembers: its code found (the lift took the player up once), the cabinet's prize taken, the chest opened. */
export interface AtticState {
  found: boolean;
  prize: boolean;
  chest: boolean;
}

const store = new PersistedStore<AtticState>({
  key: KEYS.attic,
  version: 1,
  defaults: () => ({ found: false, prize: false, chest: false }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as Partial<Record<keyof AtticState, unknown>>;
    return { found: d.found === true, prize: d.prize === true, chest: d.chest === true };
  },
});

let state: AtticState | null = null;
const listeners = new Set<() => void>();

/** The attic's state (loaded once a page). */
export function atticState(): Readonly<AtticState> {
  return (state ??= store.load());
}

/** Marks `flag` done (saved); the listeners hear it. */
export function markAttic(flag: keyof AtticState): void {
  const now = atticState();
  if (now[flag]) return;
  state = { ...now, [flag]: true };
  store.save(state);
  for (const cb of listeners) cb();
}

/** Calls `cb` whenever something is marked; returns the unsubscribe. */
export function onAtticChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
