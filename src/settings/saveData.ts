import { PROGRESS_MARKERS, safeStorage, saveKeys } from '@/persistence';

/*
 * The save as a whole, for the title screen. Which keys are progress (and which are preferences,
 * caches or the `?debug` save, left alone) is the persistence registry's business (`src/persistence/keys.ts`).
 */

/** True when a game is under way (the title screen then offers Continue and New game). */
export function hasProgress(): boolean {
  try {
    const storage = safeStorage();
    return PROGRESS_MARKERS.some((key) => storage?.getItem(key) != null);
  } catch {
    return false;
  }
}

/**
 * Wipes the progress (wallet, collection, arcade, market, the flat) and reloads, so every store
 * starts fresh. The settings, the graphics level and the cat stay (so do the caches and any save set aside as unreadable).
 */
export function eraseProgress(): void {
  const storage = safeStorage();
  for (const key of saveKeys(storage)) {
    try {
      storage?.removeItem(key);
    } catch {
      // Private mode: nothing was kept anyway.
    }
  }
  // Reload at once: the stores in memory still hold the old state and would write it back on their next change.
  location.reload();
}
