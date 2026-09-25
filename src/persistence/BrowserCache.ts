import { safeStorage } from './storage';

export interface BrowserCacheOptions {
  /** Its one localStorage key (see `KEYS`, under `bibliothek.cache.`). */
  key: string;
  /** Beyond this many entries the least recently used go. */
  maxEntries: number;
  /** How long an entry stays good by default. */
  ttlMs: number;
  /** Whether a value read back is one (anything else is dropped). */
  valid: (value: unknown) => boolean;
  storage?: Storage | null;
}

interface Entry<V> {
  value: V;
  /** When it was stored (ms). */
  at: number;
  /** How long it stays good (ms). */
  ttl: number;
}

const VERSION = 1;
/** Writes are gathered: a page load asks dozens of lookups at once. */
const SAVE_DELAY_MS = 1000;

/**
 * A small key-value cache kept in one localStorage key: entries expire after their TTL, the least
 * recently used go beyond `maxEntries`, and a full storage makes it shed half and try again. Being
 * a cache, anything unreadable is simply dropped. Writes are gathered and made a moment later (and
 * when the page is hidden).
 */
export class BrowserCache<V> {
  private readonly storage: Storage | null;
  /** In least recently used order (a Map keeps insertion order). */
  private entries = new Map<string, Entry<V>>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BrowserCacheOptions) {
    this.storage = options.storage === undefined ? safeStorage() : options.storage;
    this.load();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  /** The value stored under `id`, or undefined when absent or expired. */
  get(id: string): V | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.at > entry.ttl) {
      this.entries.delete(id);
      this.schedule();
      return undefined;
    }
    // Most recently used goes last.
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry.value;
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  set(id: string, value: V, ttlMs = this.options.ttlMs, at = Date.now()): void {
    this.entries.delete(id);
    this.entries.set(id, { value, at, ttl: ttlMs });
    this.trim(this.options.maxEntries);
    this.schedule();
  }

  delete(id: string): void {
    if (this.entries.delete(id)) this.schedule();
  }

  /** Writes now what is waiting. */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.storage) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.storage.setItem(this.options.key, JSON.stringify({ version: VERSION, data: [...this.entries] }));
        return;
      } catch {
        // Storage full: the older half goes, and again.
        this.trim(Math.floor(this.entries.size / 2));
      }
    }
  }

  private schedule(): void {
    if (this.timer !== null || !this.storage) return;
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  private trim(max: number): void {
    for (const id of this.entries.keys()) {
      if (this.entries.size <= max) break;
      this.entries.delete(id);
    }
  }

  private load(): void {
    try {
      const text = this.storage?.getItem(this.options.key);
      if (!text) return;
      const file = JSON.parse(text) as { version?: unknown; data?: unknown };
      if (file.version !== VERSION || !Array.isArray(file.data)) return;
      const now = Date.now();
      for (const row of file.data) {
        if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
        const entry = row[1] as Partial<Entry<V>> | null;
        if (!entry || typeof entry.at !== 'number' || typeof entry.ttl !== 'number' || !('value' in entry)) continue;
        if (now - entry.at > entry.ttl || !this.options.valid(entry.value)) continue;
        this.entries.set(row[0], { value: entry.value as V, at: entry.at, ttl: entry.ttl });
      }
      this.trim(this.options.maxEntries);
    } catch {
      this.entries.clear();
    }
  }
}
