import { COATS, DEFAULT_CAT_SETTINGS, type CatSettings, type CoatKind } from './types';

export const CAT_STORAGE_KEY = 'bibliothek.cat.v1';
const NAME_MAX = 24;

/**
 * The cat's name and coat, persisted in localStorage next to the collection. Listeners are told
 * of every change so the cat in the room and the settings form stay in step.
 */
export class CatSettingsStore {
  private current: CatSettings;
  private readonly listeners = new Set<(settings: CatSettings) => void>();

  constructor(private readonly key = CAT_STORAGE_KEY) {
    this.current = this.load();
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

  private load(): CatSettings {
    try {
      const raw = this.storage()?.getItem(this.key);
      if (!raw) return { ...DEFAULT_CAT_SETTINGS };
      return sanitize({ ...DEFAULT_CAT_SETTINGS, ...(JSON.parse(raw) as Partial<CatSettings>) });
    } catch {
      return { ...DEFAULT_CAT_SETTINGS };
    }
  }

  private save(): void {
    try {
      this.storage()?.setItem(this.key, JSON.stringify(this.current));
    } catch (err) {
      console.warn('[cat] settings not saved', err);
    }
  }

  private storage(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }
}

function sanitize(settings: CatSettings): CatSettings {
  const name = String(settings.name ?? '').trim().slice(0, NAME_MAX) || DEFAULT_CAT_SETTINGS.name;
  const coat: CoatKind = COATS.includes(settings.coat) ? settings.coat : DEFAULT_CAT_SETTINGS.coat;
  return { name, coat };
}
