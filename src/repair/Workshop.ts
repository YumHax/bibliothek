import { PLATFORMS } from '@/catalog/platforms';
import { KEYS, PersistedStore, batch, safeStorage } from '@/persistence';
import { FAULTS, resaleOf, type BrokenConsole, type FaultId } from './consoles';

/** A console at home: bought broken, mended or not yet. */
export interface HomeConsole extends BrokenConsole {
  fixed: boolean;
}

interface WorkshopState {
  consoles: HomeConsole[];
  /** Consoles mended so far, and sold on (the journal's and the job cards' count). */
  repaired: number;
  sold: number;
  /** Game days TV REPAIR's crate console was bought on (one a day at most). */
  crateDays: number[];
}

const defaults = (): WorkshopState => ({ consoles: [], repaired: 0, sold: 0, crateDays: [] });

/**
 * The consoles the player bought broken to mend at the kitchen table (docs/household.md "Repairing a console"): what
 * is wrong with each (`consoles.FAULTS`), mended or not, until TV REPAIR on Park Street buys a working one back. Only a
 * plus: a broken console waits as long as it likes. Persisted (`KEYS.workshop`); `subscribe` for changes.
 */
export class Workshop {
  private state: WorkshopState;
  private readonly store: PersistedStore<WorkshopState>;
  private readonly listeners = new Set<() => void>();
  private count = 0;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<WorkshopState>({ key: KEYS.workshop, version: 1, storage, defaults, read: readState });
    this.state = this.store.load();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get consoles(): readonly HomeConsole[] {
    return this.state.consoles;
  }

  /** The next console to open up: the first broken one. */
  get nextBroken(): HomeConsole | null {
    return this.state.consoles.find((c) => !c.fixed) ?? null;
  }

  /** Mended consoles waiting to be sold. */
  get working(): readonly HomeConsole[] {
    return this.state.consoles.filter((c) => c.fixed);
  }

  get repaired(): number {
    return this.state.repaired;
  }

  /** A broken console paid for: it goes home (the kitchen chair). */
  add(console: Omit<BrokenConsole, 'id'>): HomeConsole {
    const item: HomeConsole = { ...console, id: `${Date.now().toString(36)}-${(this.count++).toString(36)}`, fixed: false };
    this.commit({ consoles: [...this.state.consoles, item] });
    return item;
  }

  /** The repair worked: the console is a working one. */
  fix(id: string): void {
    const consoles = this.state.consoles.map((c) => (c.id === id ? { ...c, fixed: true } : c));
    if (consoles.every((c, i) => c === this.state.consoles[i])) return;
    this.commit({ consoles, repaired: this.state.repaired + 1 });
  }

  /** Whether TV REPAIR's crate console was bought on game `day`. */
  crateBought(day: number): boolean {
    return this.state.crateDays.includes(day);
  }

  markCrate(day: number): void {
    if (!this.crateBought(day)) this.commit({ crateDays: [...this.state.crateDays.filter((d) => d > day - 7), day] });
  }

  /**
   * TV REPAIR buys the working console `id`: the coins in `wallet`, the console gone, saved as one. The coins paid, or
   * null when it is not a working console of the player's.
   */
  sell(id: string, wallet: { earnCoins(coins: number): void }): number | null {
    const item = this.state.consoles.find((c) => c.id === id && c.fixed);
    if (!item) return null;
    const coins = resaleOf(item.platform);
    batch(() => {
      wallet.earnCoins(coins);
      this.commit({ consoles: this.state.consoles.filter((c) => c.id !== id), sold: this.state.sold + 1 });
    });
    return coins;
  }

  private commit(patch: Partial<WorkshopState>): void {
    this.state = { ...this.state, ...patch };
    this.store.save(this.state);
    for (const cb of [...this.listeners]) cb();
  }
}

function readState(data: unknown): WorkshopState | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Partial<Record<keyof WorkshopState, unknown>>;
  const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const consoles = Array.isArray(raw.consoles) ? raw.consoles.filter(isConsole) : [];
  return {
    consoles,
    repaired: isCount(raw.repaired) ? raw.repaired : 0,
    sold: isCount(raw.sold) ? raw.sold : 0,
    crateDays: Array.isArray(raw.crateDays) ? raw.crateDays.filter(isCount) : [],
  };
}

function isConsole(v: unknown): v is HomeConsole {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<HomeConsole>;
  return typeof c.id === 'string' && typeof c.platform === 'string' && c.platform in PLATFORMS && typeof c.fault === 'string' && (c.fault as FaultId) in FAULTS
    && typeof c.paid === 'number' && typeof c.from === 'string' && typeof c.fixed === 'boolean';
}

