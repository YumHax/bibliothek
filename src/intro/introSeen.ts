import { KEYS, safeStorage } from '@/persistence';

/** Whether the opening was seen on this save (it plays once: `KEYS.intro`). */
export function introSeen(): boolean {
  try {
    return safeStorage()?.getItem(KEYS.intro) != null;
  } catch {
    return false;
  }
}

/** The opening was seen: it will not play again on this save (`?intro` still plays it). */
export function markIntroSeen(): void {
  try {
    safeStorage()?.setItem(KEYS.intro, '1');
  } catch {
    // A save that cannot be written (a private window): it would play again on the next visit, which is harmless.
  }
}
