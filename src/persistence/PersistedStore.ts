import { CORRUPT_PREFIX, ROOT_PREFIX } from './keys';
import { emitCorruptSave, emitWriteFailure } from './events';
import { safeStorage, storageKeys } from './storage';

/** Timestamped copies of a damaged save kept per key: older ones are pruned. */
const MAX_COPIES = 3;

/** How one store is kept: its key, its format version, how to read and upgrade what was saved, and where to start. */
export interface PersistedSpec<T> {
  key: string;
  /**
   * The format version written now. A value saved before versions were kept (bare JSON, no
   * `{ version, data }` envelope) counts as version 1.
   */
  version: number;
  /** A fresh state: nothing saved, or what was saved could not be read. */
  defaults: () => T;
  /**
   * Checks and normalises the saved data (already migrated to `version`). Drops what it cannot use
   * entry by entry; returns null only when nothing of it is usable (the raw text is then set aside).
   */
  read: (data: unknown) => T | null;
  /** `migrate[n]` turns data saved at version n into version n + 1. A missing step is the identity. */
  migrate?: Readonly<Record<number, (data: unknown) => unknown>>;
  /** What is written for a state (default: the state itself). */
  write?: (state: T) => unknown;
  /** Written raw (a bare JSON value, no envelope): for values other code reads as they are. */
  bare?: boolean;
  storage?: Storage | null;
}

interface Envelope {
  version: number;
  data: unknown;
}

/** Writes waiting for the end of a `batch`, by key (null removes). */
const pending = new Map<string, { storage: Storage; text: string | null }>();
/**
 * A batch whose write failed (storage full, blocked): the game plays on with that state in memory, so its writes are
 * kept and tried again, as a whole with the next write any store makes, rather than lost (a later lone write would
 * otherwise save a state the failed ones do not match).
 */
const unsaved = new Map<string, { storage: Storage; text: string | null }>();
let depth = 0;

/**
 * Runs `fn` with every store's writes held back, then writes them together: one purchase touching
 * the wallet, the collection and the ledger lands in storage as a whole or not at all (a failed
 * write puts back what the batch had already written, and `onWriteFailure` hears of it). Nests.
 */
export function batch<R>(fn: () => R): R {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
    if (depth === 0) flush();
  }
}

function flush(): void {
  // What failed before goes first; anything written since for the same key replaces it.
  const merged = new Map(unsaved);
  for (const [key, write] of pending) merged.set(key, write);
  const writes = [...merged];
  pending.clear();
  unsaved.clear();
  const done: { storage: Storage; key: string; previous: string | null }[] = [];
  for (const [key, { storage, text }] of writes) {
    try {
      const previous = storage.getItem(key);
      if (text === null) storage.removeItem(key);
      else storage.setItem(key, text);
      done.push({ storage, key, previous });
    } catch (error) {
      for (const undo of done.reverse()) {
        try {
          if (undo.previous === null) undo.storage.removeItem(undo.key);
          else undo.storage.setItem(undo.key, undo.previous);
        } catch {
          // storage gone altogether: nothing more to do
        }
      }
      for (const [k, write] of writes) unsaved.set(k, write);
      emitWriteFailure({ key, keys: writes.map(([k]) => k), error });
      return;
    }
  }
}

/**
 * One store's state in localStorage, versioned: written as `{ version, data }`, read back through
 * the store's migrations and validation. Unreadable data is never silently lost: the raw text is
 * copied to `bibliothek.corrupt.<key>.<timestamp>` (the last `MAX_COPIES` kept, and `onCorruptSave`
 * told) before the store starts from its defaults; a save from a newer build is copied once per
 * version to `bibliothek.corrupt.<key>.newer-v<n>`. A failed write is reported through `onWriteFailure`. Inside `batch`
 * writes wait for the batch to end.
 */
export class PersistedStore<T> {
  readonly key: string;
  private readonly storage: Storage | null;

  constructor(private readonly spec: PersistedSpec<T>) {
    this.key = spec.key;
    this.storage = spec.storage === undefined ? safeStorage() : spec.storage;
  }

  /** Whether anything is saved under the key. */
  get exists(): boolean {
    return this.raw() !== null;
  }

  /** The saved state, migrated and checked; the defaults when there is none or it cannot be read. */
  load(): T {
    return this.tryLoad() ?? this.spec.defaults();
  }

  /** The saved state, or null when nothing is saved (or it could not be read, which is set aside first). */
  tryLoad(): T | null {
    const text = this.raw();
    if (text === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.setAside(text, 'not JSON');
      return null;
    }
    const { version, data } = unwrap(parsed, this.spec.bare ?? false);
    try {
      let upgraded = data;
      for (let v = version; v < this.spec.version; v++) upgraded = this.spec.migrate?.[v]?.(upgraded) ?? upgraded;
      const state = this.spec.read(upgraded);
      if (state === null) {
        if (version > this.spec.version) this.keepNewer(text, version, true);
        else this.setAside(text, 'not a valid save');
        return null;
      }
      // Saved by a newer build: keep a copy (once per version), since this one may drop what it does not know.
      if (version > this.spec.version) this.keepNewer(text, version, false);
      return state;
    } catch (err) {
      this.setAside(text, `migration failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  save(state: T): void {
    const data = this.spec.write ? this.spec.write(state) : state;
    this.put(JSON.stringify(this.spec.bare ? data : { version: this.spec.version, data } satisfies Envelope));
  }

  /** Forgets the saved state. */
  remove(): void {
    this.put(null);
  }

  private put(text: string | null): void {
    const storage = this.storage;
    if (!storage) return;
    // In a batch it waits for the batch's end; with failed writes still unsaved it goes with them, as one.
    if (depth > 0 || unsaved.size > 0) {
      pending.set(this.key, { storage, text });
      if (depth === 0) flush();
      return;
    }
    try {
      if (text === null) storage.removeItem(this.key);
      else storage.setItem(this.key, text);
    } catch (error) {
      emitWriteFailure({ key: this.key, keys: [this.key], error });
    }
  }

  private raw(): string | null {
    // A write waiting in a batch (or not saved yet after a failure) is what the store holds now.
    const waiting = pending.get(this.key) ?? unsaved.get(this.key);
    if (waiting) return waiting.text;
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  /** Where this key's copies go: `bibliothek.corrupt.<key>.`. */
  private get asidePrefix(): string {
    const name = this.key.startsWith(ROOT_PREFIX) ? this.key.slice(ROOT_PREFIX.length) : this.key;
    return `${CORRUPT_PREFIX}${name}.`;
  }

  /**
   * Copies the raw text aside (keeping the `MAX_COPIES` latest per key); once copied, the unusable
   * original is dropped so the next load does not copy it again.
   */
  private setAside(text: string, reason: string): void {
    let backup: string | null = `${this.asidePrefix}${Date.now()}`;
    try {
      this.storage?.setItem(backup, text);
      if (!pending.has(this.key)) this.storage?.removeItem(this.key);
      this.prune();
    } catch {
      backup = null;
    }
    emitCorruptSave({ key: this.key, backup, reason });
  }

  /**
   * A save from a newer build of the game: one copy per version (`…<key>.newer-v<n>`, made once, never
   * overwritten), and told on every load while this build plays on it, since what is played now writes
   * over the newer save in this build's format (the copy is what the newer build can go back to).
   * `unusable`: this build could read none of it.
   */
  private keepNewer(text: string, version: number, unusable: boolean): void {
    const backup = `${this.asidePrefix}newer-v${version}`;
    let kept: string | null = backup;
    try {
      if (this.storage?.getItem(backup) === null) this.storage?.setItem(backup, text);
      if (unusable && !pending.has(this.key)) this.storage?.removeItem(this.key);
    } catch {
      kept = null;
    }
    emitCorruptSave({ key: this.key, backup: kept, reason: `saved by a newer version (${version}); played on by version ${this.spec.version}`, newer: true });
  }

  /** Drops the oldest timestamped copies of this key past `MAX_COPIES` (the newer-version copies stay). */
  private prune(): void {
    const prefix = this.asidePrefix;
    const stamped = storageKeys(this.storage)
      .filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))
      .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
    for (const key of stamped.slice(0, Math.max(0, stamped.length - MAX_COPIES))) this.storage?.removeItem(key);
  }
}

/** A saved value's version and data: an envelope says; anything else predates versions (version 1). */
function unwrap(parsed: unknown, bare: boolean): Envelope {
  if (!bare && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (typeof o.version === 'number' && 'data' in o && Object.keys(o).length === 2) return { version: o.version, data: o.data };
  }
  return { version: 1, data: parsed };
}
