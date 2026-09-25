/** The browser's localStorage, or null where there is none or it is blocked (private mode, a sandboxed frame). */
export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Every key in `storage` (none when it cannot be listed). */
export function storageKeys(storage: Storage | null = safeStorage()): string[] {
  if (!storage) return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}
