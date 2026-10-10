import { safeStorage } from '@/persistence';

/*
 * Raw edits of the debug save, for undoing a progression whose store has no way back: made just before the page
 * reloads (`debugProgress.apply`), so no store in memory writes over them. Every edit is remembered and made again
 * on `pagehide`, as `settings/saveFile.importSave` does, in case a store flushes its old state as the page goes.
 */

const edits: (() => void)[] = [];
let armed = false;

function remember(edit: () => void): void {
  edit();
  edits.push(edit);
  if (armed || typeof window === 'undefined') return;
  armed = true;
  window.addEventListener('pagehide', () => edits.forEach((e) => e()));
}

/** Drops `key` from storage. */
export function removeSaved(key: string): void {
  remember(() => safeStorage()?.removeItem(key));
}

/**
 * Rewrites the data saved under `key` (inside its `{ version, data }` envelope, kept): `edit` returns the new data, or
 * undefined to drop the key. Nothing saved: nothing to edit.
 */
export function editSaved(key: string, edit: (data: unknown) => unknown): void {
  remember(() => {
    const storage = safeStorage();
    const text = storage?.getItem(key);
    if (!storage || text == null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const enveloped = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'version' in parsed && 'data' in parsed;
    const data = enveloped ? (parsed as { data: unknown }).data : parsed;
    const next = edit(data);
    if (next === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(enveloped ? { ...(parsed as object), data: next } : next));
  });
}
