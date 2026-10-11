import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { SeasonName } from '@/time/season';
import type { GrandmaVisits } from './GrandmaVisits';
import { SNAPSHOTS, type Snapshot, type SnapshotFacts } from './snapshots';

/*
 * THE SNAPSHOTS MÉMÉ FINDS (docs/grandma.md "The album's other photos"): which of `SNAPSHOTS` have turned up in her
 * album, which the player has looked at since, and what brought them back (the games shown her, the flowers and the
 * cake given). Saved as `bibliothek.albumFinds.v1`. Looked for on the way in, when something is given and when a memory
 * is seen (her visits' events), and when the album opens.
 */

interface FindsState {
  /** The snapshots found, in the order they turned up. */
  found: string[];
  /** Those found and not looked at yet (slipping out of the pages). */
  fresh: string[];
  /** The games shown to her (ids). */
  shown: string[];
  /** What she has been given at least once. */
  given: ('flowers' | 'cake')[];
}

/** What the finding reads besides her visits. */
interface FindsWorld {
  /** How close she is: 1 Friendly, 2 Friend (where she starts), 3 Close. */
  closeness(): number;
  season(): SeasonName;
}

const fresh = (): FindsState => ({ found: [], fresh: [], shown: [], given: [] });
const SNAPSHOT_IDS = new Set(SNAPSHOTS.map((s) => s.id));

export class AlbumFinds {
  private state: FindsState;
  private readonly store: PersistedStore<FindsState>;

  constructor(
    private readonly visits: GrandmaVisits,
    private readonly world: FindsWorld,
    storage: Storage | null = safeStorage(),
  ) {
    this.store = new PersistedStore<FindsState>({ key: KEYS.albumFinds, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
    visits.subscribe((event) => {
      if (event.kind === 'gift') {
        if (event.gift === 'game' && event.game && !this.state.shown.includes(event.game)) this.commit({ ...this.state, shown: [...this.state.shown, event.game] });
        else if (event.gift !== 'game' && !this.state.given.includes(event.gift)) this.commit({ ...this.state, given: [...this.state.given, event.gift] });
      }
      this.look();
    });
  }

  /** Looks for the snapshots whose time has come; returns those just found. */
  look(): Snapshot[] {
    const facts = this.facts();
    const found = SNAPSHOTS.filter((s) => !this.state.found.includes(s.id) && s.found(facts));
    if (!found.length) return found;
    const ids = found.map((s) => s.id);
    this.commit({ ...this.state, found: [...this.state.found, ...ids], fresh: [...this.state.fresh, ...ids] });
    return found;
  }

  /** Whether snapshot `id` is in the album. */
  has(id: string): boolean {
    return this.state.found.includes(id);
  }

  /** Whether snapshot `id` is in it and not looked at yet. */
  isFresh(id: string): boolean {
    return this.state.fresh.includes(id);
  }

  /** Any snapshot not looked at yet. */
  get anyFresh(): boolean {
    return this.state.fresh.length > 0;
  }

  /** Snapshot `id` looked at in the album. */
  looked(id: string): void {
    if (this.state.fresh.includes(id)) this.commit({ ...this.state, fresh: this.state.fresh.filter((f) => f !== id) });
  }

  /** `?debug`: every snapshot found, fresh. */
  debugFindAll(): void {
    const ids = SNAPSHOTS.map((s) => s.id);
    this.commit({ ...this.state, found: ids, fresh: ids.filter((id) => !this.state.found.includes(id) || this.state.fresh.includes(id)) });
  }

  /** `?debug`: none found, nothing shown or given. */
  debugReset(): void {
    this.commit(fresh());
  }

  private facts(): SnapshotFacts {
    const { visits, world, state } = this;
    return {
      visits: visits.facts().visits,
      seen: (id) => visits.hasSeen(id),
      closeness: world.closeness(),
      shown: (id) => state.shown.includes(id),
      given: (gift) => state.given.includes(gift),
      season: world.season(),
    };
  }

  private commit(state: FindsState): void {
    this.state = state;
    this.store.save(state);
  }
}

function readState(data: unknown): FindsState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof FindsState, unknown>>;
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : []);
  const found = ids(raw.found).filter((id) => SNAPSHOT_IDS.has(id));
  return {
    found,
    fresh: ids(raw.fresh).filter((id) => found.includes(id)),
    shown: ids(raw.shown),
    given: ids(raw.given).filter((g): g is 'flowers' | 'cake' => g === 'flowers' || g === 'cake'),
  };
}
