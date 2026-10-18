import { KEYS, PersistedStore } from '@/persistence';

/** What the attic remembers: its code found (the lift took the player up once), the cabinet's prize taken, the chest opened. */
interface AtticState {
  found: boolean;
  prize: boolean;
  chest: boolean;
  /** The blank-label Game Boy cart found down the side of the sheeted sofa. */
  sofaCart: boolean;
  /** The service stair's wardrobe opened (its key on the chest's ring). */
  wardrobe: boolean;
}

const store = new PersistedStore<AtticState>({
  key: KEYS.attic,
  version: 1,
  defaults: () => ({ found: false, prize: false, chest: false, sofaCart: false, wardrobe: false }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as Partial<Record<keyof AtticState, unknown>>;
    return { found: d.found === true, prize: d.prize === true, chest: d.chest === true, sofaCart: d.sofaCart === true, wardrobe: d.wardrobe === true };
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
