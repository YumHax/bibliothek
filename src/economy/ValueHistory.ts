import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { dayKey } from './calendar';

/** One day's estimate of the collection: the last one made that day. */
export interface ValuePoint {
  /** `dayKey` of the local date. */
  day: string;
  value: number;
}

/** A year of days is plenty for the book's chart. */
const MAX_POINTS = 365;

/**
 * The collection's estimated value, one point per real day (local time, `dayKey`), persisted:
 * `record` overwrites today's point, so the chart shows how the collection stood at the end of each
 * day the game was played. Consumers `subscribe`.
 */
export class ValueHistory {
  private points: ValuePoint[];
  private readonly store: PersistedStore<ValuePoint[]>;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.valueHistory) {
    // Version 1: the points, oldest first.
    this.store = new PersistedStore<ValuePoint[]>({ key, version: 1, storage, defaults: () => [], read: readPoints });
    this.points = this.store.load();
  }

  get all(): readonly ValuePoint[] {
    return this.points;
  }

  /** Today's estimate is `value` (nothing is written when it did not change). */
  record(value: number, now: Date = new Date()): void {
    const day = dayKey(now);
    const last = this.points[this.points.length - 1];
    if (last?.day === day && last.value === value) return;
    const kept = last?.day === day ? this.points.slice(0, -1) : this.points;
    this.points = [...kept, { day, value }].slice(-MAX_POINTS);
    this.store.save(this.points);
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function readPoints(data: unknown): ValuePoint[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .filter((p): p is ValuePoint => typeof p === 'object' && p !== null && typeof (p as ValuePoint).day === 'string' && Number.isFinite((p as ValuePoint).value))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-MAX_POINTS);
}
