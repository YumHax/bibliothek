/** A save that did not reach storage (quota full, storage blocked): the game goes on, but it will not survive a reload. */
export interface WriteFailure {
  /** The key that could not be written (the first one, for a batch). */
  key: string;
  /** Every key the failed write was about (a batch is put back as a whole). */
  keys: readonly string[];
  error: unknown;
}

/** An unreadable save was set aside (copied to `backup`) and its store started afresh. */
export interface CorruptSave {
  key: string;
  /** Where the raw text was copied, or null when even that failed. */
  backup: string | null;
  reason: string;
}

type Listener<T> = (event: T) => void;

const writeFailures = new Set<Listener<WriteFailure>>();
const corruptSaves = new Set<Listener<CorruptSave>>();
/** Stores load before the UI exists: a late listener still hears what was set aside. */
const corruptSoFar: CorruptSave[] = [];

/** Hear about saves that failed (for a toast: "Could not save: storage full"). Returns the unsubscribe. */
export function onWriteFailure(cb: Listener<WriteFailure>): () => void {
  writeFailures.add(cb);
  return () => writeFailures.delete(cb);
}

/** Hear about saves found unreadable and set aside, those already found included. Returns the unsubscribe. */
export function onCorruptSave(cb: Listener<CorruptSave>): () => void {
  for (const event of corruptSoFar) cb(event);
  corruptSaves.add(cb);
  return () => corruptSaves.delete(cb);
}

export function emitWriteFailure(event: WriteFailure): void {
  console.warn(`[save] could not write ${event.keys.join(', ')}`, event.error);
  for (const cb of [...writeFailures]) cb(event);
}

export function emitCorruptSave(event: CorruptSave): void {
  corruptSoFar.push(event);
  console.warn(`[save] ${event.key} was unreadable (${event.reason}); ${event.backup ? `copied to ${event.backup}` : 'no copy could be kept'}, starting afresh`);
  for (const cb of [...corruptSaves]) cb(event);
}
