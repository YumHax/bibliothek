import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/*
 * THE MEMORIES' STILLS IN MÉMÉ'S ALBUM (docs/story.md "Mémé"): the frame a memory left the first time it played
 * (`MemoryFilm.takeStill`), kept so its print in the album is that frame after a reload, not the drawn sepia stand-in
 * (`ui/memories/albumPhotos`). Small JPEG data URLs, one per memory (seven at most, a few dozen kB together): the
 * still is shrunk and recompressed before it is kept. Saved as `bibliothek.memoryStills.v1`.
 */

/** The kept still's size and quality: a print in the album is drawn smaller than this. */
const KEPT = { width: 320, height: 240, quality: 0.72 } as const;
/** A still longer than this (a data URL's characters) is not kept. */
const MAX_IMAGE = 90_000;

interface StillsState {
  stills: Record<string, string>;
}

export class MemoryStills {
  private state: StillsState;
  private readonly store: PersistedStore<StillsState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<StillsState>({ key: KEYS.memoryStills, version: 1, storage, defaults: () => ({ stills: {} }), read: readState });
    this.state = this.store.load();
  }

  /** The still kept for memory `id`, or null. */
  get(id: string): string | null {
    return this.state.stills[id] ?? null;
  }

  /** Keeps `url` (a frame's JPEG data URL) as memory `id`'s still, shrunk first; one already kept is replaced. */
  keep(id: string, url: string): void {
    void shrink(url).then((small) => {
      if (!small || small.length > MAX_IMAGE) return;
      this.state = { stills: { ...this.state.stills, [id]: small } };
      this.store.save(this.state);
    });
  }
}

/** `url` drawn at the kept size and recompressed; null where the browser cannot decode or draw it. */
function shrink(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = KEPT.width;
      canvas.height = KEPT.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(image, 0, 0, KEPT.width, KEPT.height);
      try {
        resolve(canvas.toDataURL('image/jpeg', KEPT.quality));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function readState(data: unknown): StillsState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = (data as { stills?: unknown }).stills;
  if (typeof raw !== 'object' || raw === null) return { stills: {} };
  const stills: Record<string, string> = {};
  for (const [id, url] of Object.entries(raw)) if (typeof url === 'string' && url.startsWith('data:image/')) stills[id] = url;
  return { stills };
}
