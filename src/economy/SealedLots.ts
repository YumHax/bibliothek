import { KEYS, PersistedStore } from '@/persistence';
import { readSealedLot, type CartonItem, type SealedLot } from './boxLots';

/** A carton bought, at home: what it was, where it came from, how many things are out of it already. */
export interface CartonAtHome {
  lot: SealedLot;
  /** Where it was bought (the receipts of its games): "the flea market", "the Sunday saleroom". */
  where: string;
  /** What was paid for it (an auction's hammer price, the market's tag): its games' receipts share it. */
  paid: number;
  /** The market day it was bought. */
  day: number;
  /** Things taken out of it so far (they come out in order). */
  opened: number;
}

interface SealedFile {
  cartons: CartonAtHome[];
  /** The market days whose carton by the job lot was bought (only the last few are kept). */
  marketSold: number[];
}

/**
 * The sealed cartons the player bought (`economy/boxLots.ts`), waiting at home until every thing is out of them,
 * and which market days' carton is gone from the flea market's corner. `bibliothek.sealedLots.v1`. The money side is
 * `Transactions.buySealedLot` / `unpackCarton`, which write it in the same batch as the wallet and the collection.
 */
export class SealedLots {
  private state: SealedFile;
  private readonly store: PersistedStore<SealedFile>;
  private readonly listeners = new Set<() => void>();

  constructor(storage?: Storage | null) {
    this.store = new PersistedStore<SealedFile>({ key: KEYS.sealedLots, version: 1, defaults: () => ({ cartons: [], marketSold: [] }), read: readFile, ...(storage !== undefined ? { storage } : {}) });
    this.state = this.store.load();
  }

  /** The cartons at home with something still in them, oldest first. */
  get waiting(): readonly CartonAtHome[] {
    return this.state.cartons.filter((c) => c.opened < c.lot.items.length);
  }

  /** The carton being unpacked (the oldest), or null. */
  get current(): CartonAtHome | null {
    return this.waiting[0] ?? null;
  }

  /** Whether market day `day`'s carton has been bought already. */
  marketSoldOn(day: number): boolean {
    return this.state.marketSold.includes(day);
  }

  /** A carton bought: home with the player (the parcel's way: it waits in the hallway). */
  add(lot: SealedLot, where: string, paid: number, day: number, fromMarket = false): void {
    if (this.state.cartons.some((c) => c.lot.id === lot.id)) return;
    this.state = {
      cartons: [...this.state.cartons, { lot, where, paid, day, opened: 0 }],
      marketSold: fromMarket ? [...this.state.marketSold, day].slice(-7) : this.state.marketSold,
    };
    this.save();
  }

  /** The next thing out of the current carton (taken out: it does not come again), or null when it is empty. */
  takeNext(): { item: CartonItem; carton: CartonAtHome; left: number } | null {
    const carton = this.current;
    if (!carton) return null;
    const item = carton.lot.items[carton.opened];
    if (!item) return null;
    const opened = carton.opened + 1;
    // Empty cartons go (flattened for the recycling).
    this.state = { ...this.state, cartons: this.state.cartons.map((c) => (c === carton ? { ...c, opened } : c)).filter((c) => c.opened < c.lot.items.length) };
    this.save();
    return { item, carton: { ...carton, opened }, left: carton.lot.items.length - opened };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private save(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

function readFile(data: unknown): SealedFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof SealedFile, unknown>>;
  const cartons: CartonAtHome[] = [];
  if (Array.isArray(d.cartons)) {
    for (const value of d.cartons) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;
      const lot = readSealedLot(v.lot);
      if (!lot || typeof v.where !== 'string' || typeof v.paid !== 'number' || typeof v.day !== 'number') continue;
      const opened = typeof v.opened === 'number' && v.opened >= 0 ? Math.floor(v.opened) : 0;
      if (opened < lot.items.length) cartons.push({ lot, where: v.where, paid: v.paid, day: v.day, opened });
    }
  }
  const marketSold = Array.isArray(d.marketSold) ? d.marketSold.filter((n): n is number => typeof n === 'number') : [];
  return { cartons, marketSold };
}
