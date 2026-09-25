import { CORRUPT_PREFIX, ROOT_PREFIX } from './keys';
import { emitCorruptSave, emitWriteFailure } from './events';
import { safeStorage } from './storage';

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
  const writes = [...pending];
  pending.clear();
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
      emitWriteFailure({ key, keys: writes.map(([k]) => k), error });
      return;
    }
  }
}

/**
 * One store's state in localStorage, versioned: written as `{ version, data }`, read back through
 * the store's migrations and validation. Unreadable data is never silently lost: the raw text is
 * copied to `bibliothek.corrupt.<key>.<timestamp>` (and `onCorruptSave` told) before the store
 * starts from its defaults. A failed write is reported through `onWriteFailure`. Inside `batch`
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
        this.setAside(text, version > this.spec.version ? `saved by a newer version (${version})` : 'not a valid save');
        return null;
      }
      // Saved by a newer build: keep a copy, since this one may drop what it does not know.
      if (version > this.spec.version) this.setAside(text, `saved by a newer version (${version})`, false);
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
    if (depth > 0) {
      pending.set(this.key, { storage, text });
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
    // A write waiting in a batch is what the store holds now.
    const waiting = pending.get(this.key);
    if (waiting) return waiting.text;
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  /** Copies the raw text aside; once copied, an unusable original is dropped so the next load does not copy it again. */
  private setAside(text: string, reason: string, drop = true): void {
    const name = this.key.startsWith(ROOT_PREFIX) ? this.key.slice(ROOT_PREFIX.length) : this.key;
    let backup: string | null = `${CORRUPT_PREFIX}${name}.${Date.now()}`;
    try {
      this.storage?.setItem(backup, text);
      if (drop && !pending.has(this.key)) this.storage?.removeItem(this.key);
    } catch {
      backup = null;
    }
    emitCorruptSave({ key: this.key, backup, reason });
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
