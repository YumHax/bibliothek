import { KEYS, PersistedStore } from '@/persistence';
import { PROGRESSIONS, type DebugSubjects } from './progressions';

/*
 * `?debug` starts with every progression done (`PROGRESSIONS`): at each start-up, whatever does not hold yet is done
 * through the game's own stores, unless the debug panel switched it off (kept here, in the debug save only: `KEYS`
 * prefixes it `bibliothek.debug.`). The player's real save is never read or written.
 */

const store = new PersistedStore<string[]>({
  key: KEYS.debugProgress,
  version: 1,
  defaults: () => [],
  read: (data) => (Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : null),
});

let declined: Set<string> | null = null;

function switchedOff(): Set<string> {
  return (declined ??= new Set(store.load()));
}

/** Whether progression `id` is wanted done in the debug save (not switched off in the panel). */
export function debugWants(id: string): boolean {
  return !switchedOff().has(id);
}

/** Start-up, under `?debug`: every progression not switched off is done now if it is not yet. Returns those it did. */
export function unlockDebugProgress(subjects: DebugSubjects): string[] {
  const done: string[] = [];
  for (const p of PROGRESSIONS) {
    if (!debugWants(p.id) || p.on(subjects)) continue;
    try {
      p.unlock(subjects);
      done.push(p.id);
    } catch (error) {
      console.warn(`[debug] could not unlock ${p.id}`, error);
    }
  }
  if (done.length) console.info(`[debug] unlocked: ${done.join(', ')}`);
  return done;
}

/**
 * The panel's changes: each progression switched on is done, each switched off undone and remembered as off. The
 * caller reloads the page after (the world is built from the stores once).
 */
export function applyDebugProgress(subjects: DebugSubjects, wanted: ReadonlyMap<string, boolean>): void {
  const off = switchedOff();
  for (const [id, on] of wanted) {
    const p = PROGRESSIONS.find((q) => q.id === id);
    if (!p) continue;
    if (on) {
      off.delete(id);
      if (!p.on(subjects)) p.unlock(subjects);
    } else {
      off.add(id);
      p.lock(subjects);
    }
  }
  store.save([...off]);
}
