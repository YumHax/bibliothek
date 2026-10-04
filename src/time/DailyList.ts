import { PersistedStore } from '@/persistence';
import { dayKey } from '@/economy/calendar';

/** How a `DailyList` is saved: its key and format version, the field its items go under, and the upgrades of older saves. */
interface DailyListSpec<T> {
  key: string;
  version: number;
  /** The saved object's field holding the items (`{ day, [field]: T[] }`). */
  field: string;
  /** Whether a saved entry is a valid item (the others are dropped). */
  isItem: (value: unknown) => value is T;
  migrate?: Readonly<Record<number, (data: unknown) => unknown>>;
}

/**
 * A list that starts empty every real (local) day and survives reloads within it: the coins picked
 * up, the games bought off a garage sale's table. Saved as `{ day, [field]: T[] }` (`day` a
 * `dayKey`), the format each of them used on its own.
 */
export class DailyList<T> {
  private readonly store: PersistedStore<{ day: string; items: T[] }>;

  constructor(spec: DailyListSpec<T>) {
    const { key, version, field, isItem, migrate } = spec;
    this.store = new PersistedStore<{ day: string; items: T[] }>({
      key,
      version,
      defaults: () => ({ day: '', items: [] }),
      read: (data) => {
        if (typeof data !== 'object' || data === null) return null;
        const o = data as Record<string, unknown>;
        const items = o[field];
        return typeof o.day === 'string' && Array.isArray(items) ? { day: o.day, items: items.filter(isItem) } : null;
      },
      write: ({ day, items }) => ({ day, [field]: items }),
      ...(migrate ? { migrate } : {}),
    });
  }

  /** Today's items (none on a new day). */
  today(): T[] {
    const saved = this.store.load();
    return saved.day === dayKey() ? saved.items : [];
  }

  has(item: T): boolean {
    return this.today().includes(item);
  }

  add(item: T): void {
    this.store.save({ day: dayKey(), items: [...this.today().filter((other) => other !== item), item] });
  }

  remove(item: T): void {
    this.store.save({ day: dayKey(), items: this.today().filter((other) => other !== item) });
  }
}
