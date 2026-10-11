import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { FELIX_LOTS } from '@/economy/felixLots';
import { KEEPSAKES, type KeepsakeId } from './keepsakeLines';

/*
 * WHAT MÉMÉ GAVE THE PLAYER TO TAKE HOME (docs/grandma.md "What the memories leave behind"): a keepsake per memory seen,
 * in the order given (the flat stands them on Félix's shelf, `world/keepsakes/`), and the lots of Félix's she was told
 * are home (the last keepsake, his stickers, once every lot is). Saved as `bibliothek.keepsakes.v1`.
 */

interface KeepsakesState {
  /** Given, in order. */
  given: KeepsakeId[];
  /** The lot numbers she was told are home. */
  told: number[];
}

const IDS: ReadonlySet<string> = new Set(KEEPSAKES.map((k) => k.id));
const fresh = (): KeepsakesState => ({ given: [], told: [] });

export class Keepsakes {
  private state: KeepsakesState;
  private readonly store: PersistedStore<KeepsakesState>;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<KeepsakesState>({ key: KEYS.keepsakes, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  /** What she has given, in order. */
  get given(): readonly KeepsakeId[] {
    return this.state.given;
  }

  has(id: KeepsakeId): boolean {
    return this.state.given.includes(id);
  }

  /** `id` handed over (once). */
  give(id: KeepsakeId): void {
    if (this.has(id)) return;
    this.commit({ ...this.state, given: [...this.state.given, id] });
  }

  /** The first keepsake owed for the memories `seen` (in the order seen) and not given yet, or null. */
  owed(seen: readonly string[]): KeepsakeId | null {
    for (const memory of seen) {
      const keepsake = KEEPSAKES.find((k) => k.memory === memory);
      if (keepsake && !this.has(keepsake.id)) return keepsake.id;
    }
    return null;
  }

  /** The lowest lot of `home` she has not been told of, or null. */
  untold(home: ReadonlySet<number>): number | null {
    const lots = [...home].filter((lot) => !this.state.told.includes(lot)).sort((a, b) => a - b);
    return lots[0] ?? null;
  }

  /** She was told lot `lot` is home. */
  tell(lot: number): void {
    if (this.state.told.includes(lot)) return;
    this.commit({ ...this.state, told: [...this.state.told, lot] });
  }

  /** Every lot of the catalogue told home (the stickers are owed). */
  get allTold(): boolean {
    return FELIX_LOTS.every((lot) => this.state.told.includes(lot.lot));
  }

  /** Hears a keepsake given. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `?debug`: every keepsake of the memories given (the stickers wait for the lots). */
  debugGiveAll(): void {
    this.commit({ ...this.state, given: KEEPSAKES.filter((k) => k.memory).map((k) => k.id) });
  }

  /** `?debug`: every lot told home but the first (the next told brings the stickers); told already, none again. */
  debugTold(): void {
    this.commit({ ...this.state, told: this.state.told.length ? [] : FELIX_LOTS.slice(1).map((lot) => lot.lot) });
  }

  private commit(state: KeepsakesState): void {
    this.state = state;
    this.store.save(state);
    for (const listener of [...this.listeners]) listener();
  }
}

function readState(data: unknown): KeepsakesState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof KeepsakesState, unknown>>;
  return {
    given: Array.isArray(raw.given) ? raw.given.filter((id): id is KeepsakeId => typeof id === 'string' && IDS.has(id)) : [],
    told: Array.isArray(raw.told) ? raw.told.filter((lot): lot is number => typeof lot === 'number' && Number.isFinite(lot)) : [],
  };
}
