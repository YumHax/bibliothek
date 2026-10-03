import { KEYS, ROOT_PREFIX, SAVE_PREFIX, safeStorage, saveKeys } from '@/persistence';

/*
 * The save as a file the player keeps: every key of this session's save (what "new game" would wipe)
 * and the cat's name and coat, written relative to the save's prefix, so a file made in `?debug` loads
 * in the real save and the other way round. Loading one replaces the save in this browser, then reloads.
 */

/** What tells a save file from any JSON. */
const FORMAT = 'bibliothek-save';
const VERSION = 1;
/** Beyond this, it is not one of ours (localStorage holds about 5 MB). */
const MAX_BYTES = 8 * 1024 * 1024;
/** Preferences that belong with the progress: the cat is the player's. */
const KEPT_PREFERENCES: readonly string[] = [KEYS.cat];

export interface SaveFile {
  format: typeof FORMAT;
  version: number;
  /** ISO time it was written. */
  exportedAt: string;
  /** The game's version that wrote it. */
  gameVersion: string;
  /** Progress keys, without the save's prefix (`collection.v1`), and their stored text. */
  save: Record<string, string>;
  /** Preferences kept with it (the cat), without `bibliothek.`. */
  preferences: Record<string, string>;
}

/** The save as it stands in this browser. */
export function exportSave(gameVersion: string): SaveFile {
  const storage = safeStorage();
  const save: Record<string, string> = {};
  const preferences: Record<string, string> = {};
  for (const key of saveKeys(storage)) {
    const value = read(storage, key);
    if (value !== null) save[key.slice(SAVE_PREFIX.length)] = value;
  }
  for (const key of KEPT_PREFERENCES) {
    const value = read(storage, key);
    if (value !== null) preferences[key.slice(ROOT_PREFIX.length)] = value;
  }
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), gameVersion, save, preferences };
}

/** The file's name: the game and the day it was written. */
export function saveFileName(file: SaveFile): string {
  return `bibliothek-save-${file.exportedAt.slice(0, 10)}.json`;
}

/** A file read back: the save in it, or why it is not one. */
export function readSaveFile(text: string): { ok: true; file: SaveFile; games: number } | { ok: false; reason: string } {
  if (text.length > MAX_BYTES) return { ok: false, reason: 'This file is far too big to be a save.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'This file is not a save: it is not even JSON.' };
  }
  const d = data as Partial<SaveFile> | null;
  if (!d || typeof d !== 'object' || d.format !== FORMAT) return { ok: false, reason: 'This file is not a Bibliothek save.' };
  if (typeof d.version !== 'number' || d.version > VERSION) return { ok: false, reason: 'This save was written by a newer version of the game.' };
  const save = strings(d.save);
  const preferences = strings(d.preferences);
  if (!save || !Object.keys(save).length) return { ok: false, reason: 'This save is empty.' };
  // A key must be a plain name (no prefix games: nothing outside the save is touched).
  if ([...Object.keys(save), ...Object.keys(preferences ?? {})].some((k) => !/^[A-Za-z0-9_.-]{1,80}$/.test(k) || k.startsWith('cache.') || k.startsWith('corrupt.') || k.startsWith('debug.'))) {
    return { ok: false, reason: 'This save has keys the game does not write.' };
  }
  const file: SaveFile = {
    format: FORMAT,
    version: d.version,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : '',
    gameVersion: typeof d.gameVersion === 'string' ? d.gameVersion : '',
    save,
    preferences: preferences ?? {},
  };
  return { ok: true, file, games: gamesIn(save) };
}

/**
 * Replaces this browser's save with `file`'s and reloads. The stores in memory still hold the old save
 * and may flush it as the page goes: the file's keys are written again last thing on `pagehide`.
 */
export function importSave(file: SaveFile): void {
  const storage = safeStorage();
  if (!storage) return;
  const entries = [
    ...Object.entries(file.save).map(([k, v]) => [`${SAVE_PREFIX}${k}`, v] as const),
    ...Object.entries(file.preferences).filter(([k]) => KEPT_PREFERENCES.includes(`${ROOT_PREFIX}${k}`)).map(([k, v]) => [`${ROOT_PREFIX}${k}`, v] as const),
  ];
  const write = (): void => {
    for (const key of saveKeys(storage)) remove(storage, key);
    for (const [key, value] of entries) {
      try {
        storage.setItem(key, value);
      } catch (err) {
        console.warn(`[save] could not write ${key}`, err);
      }
    }
  };
  write();
  window.addEventListener('pagehide', write);
  location.reload();
}

function strings(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** How many games the file's collection holds (for the confirmation), 0 when it cannot tell. */
function gamesIn(save: Record<string, string>): number {
  const raw = save[KEYS.collection.slice(SAVE_PREFIX.length)];
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { data?: unknown } | unknown[];
    const list = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown }).data;
    if (Array.isArray(list)) return list.length;
    const games = (list as { games?: unknown } | undefined)?.games;
    return Array.isArray(games) ? games.length : 0;
  } catch {
    return 0;
  }
}

function read(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function remove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Private mode: nothing was kept anyway.
  }
}
