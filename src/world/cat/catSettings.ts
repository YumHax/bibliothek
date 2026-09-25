import { KEYS, PersistedStore } from '@/persistence';
import { COATS, DEFAULT_CAT_SETTINGS, type CatSettings, type CoatKind } from './types';

export const CAT_STORAGE_KEY = KEYS.cat;
const NAME_MAX = 24;

/**
 * The cat's name and coat, persisted (`KEYS.cat`, a preference: a new game keeps it). Listeners
 * are told of every change so the cat in the room and the settings form stay in step.
 */
export class CatSettingsStore {
  private current: CatSettings;
  private readonly listeners = new Set<(settings: CatSettings) => void>();
  private readonly store: PersistedStore<CatSettings>;

  constructor(key: string = CAT_STORAGE_KEY) {
    // Version 1: `{ name, coat }` (bare JSON before versions were kept); a missing or unknown field takes its default.
    this.store = new PersistedStore<CatSettings>({ key, version: 1, defaults: () => ({ ...DEFAULT_CAT_SETTINGS }), read: readCatSettings });
    this.current = this.store.load();
  }

  get settings(): CatSettings {
    return this.current;
  }

  subscribe(cb: (settings: CatSettings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  update(patch: Partial<CatSettings>): void {
    const next = sanitize({ ...this.current, ...patch });
    if (next.name === this.current.name && next.coat === this.current.coat) return;
    this.current = next;
    this.save();
    for (const cb of this.listeners) cb(next);
  }

  private save(): void {
    this.store.save(this.current);
  }
}

/** The saved name and coat over the defaults; null when what was saved is not an object at all. */
function readCatSettings(data: unknown): CatSettings | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return sanitize({ ...DEFAULT_CAT_SETTINGS, ...(data as Partial<CatSettings>) });
}

function sanitize(settings: CatSettings): CatSettings {
  const name = String(settings.name ?? '').trim().slice(0, NAME_MAX) || DEFAULT_CAT_SETTINGS.name;
  const coat: CoatKind = COATS.includes(settings.coat) ? settings.coat : DEFAULT_CAT_SETTINGS.coat;
  return { name, coat };
}
