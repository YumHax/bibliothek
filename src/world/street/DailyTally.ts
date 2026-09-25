import { PersistedStore } from '@/persistence';
import { dayKey, fromUnpaddedDayKey } from '@/economy/calendar';

interface Tally {
  /** The local day counted (`dayKey`). */
  day: string;
  count: number;
}

/**
 * A count that starts again every real (local) day: the scratch cards bought, the busker's tips.
 * Saved under `key` as `{ day, [field]: n }`: data version 2 has `day` as a `dayKey` (YYYY-MM-DD);
 * version 1 wrote it unpadded (`2026-9-5`), read as the same day so today's count carries on.
 */
export class DailyTally {
  private readonly store: PersistedStore<Tally>;

  constructor(key: string, field: string) {
    this.store = new PersistedStore<Tally>({
      key,
      version: 2,
      defaults: () => ({ day: '', count: 0 }),
      read: (data) => {
        if (typeof data !== 'object' || data === null) return null;
        const o = data as Record<string, unknown>;
        const count = o[field];
        return typeof o.day === 'string' && typeof count === 'number' && Number.isFinite(count) ? { day: o.day, count } : null;
      },
      write: ({ day, count }) => ({ day, [field]: count }),
      migrate: { 1: (data) => withDay(data, fromUnpaddedDayKey) },
    });
  }

  /** Today's count (0 on a new day). */
  today(): number {
    const saved = this.store.load();
    return saved.day === dayKey() ? saved.count : 0;
  }

  /** One more today. */
  add(): void {
    this.store.save({ day: dayKey(), count: this.today() + 1 });
  }
}

/** `data` with its `day` field (when it has one) mapped by `f`: for a migration step. */
export function withDay(data: unknown, f: (day: string) => string): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const o = data as Record<string, unknown>;
  return typeof o.day === 'string' ? { ...o, day: f(o.day) } : data;
}
