import { KEYS, PersistedStore, safeStorage } from '@/persistence';

/*
 * THE PHOTO ROLL (docs/grandma.md "The album's other photos"): the photo mode's last shots kept small, besides the PNG
 * the browser saves, so the player has prints to give Mémé on the next visit. A few at most (the newest kept), each a
 * small JPEG; given, they leave the roll. Saved as `bibliothek.photoRoll.v1`.
 */

/** Shots kept at most (the newest). */
const ROLL = 6;
/** A print's width in px (the height follows the frame). */
const PRINT_WIDTH = 320;

export class PhotoRoll {
  private prints: string[];
  private readonly store: PersistedStore<{ prints: string[] }>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<{ prints: string[] }>({ key: KEYS.photoRoll, version: 1, storage, defaults: () => ({ prints: [] }), read: readState });
    this.prints = this.store.load().prints;
  }

  /** Keeps a small print of `canvas` (the shot as saved). */
  keep(canvas: HTMLCanvasElement): void {
    if (!canvas.width || !canvas.height) return;
    const out = document.createElement('canvas');
    out.width = PRINT_WIDTH;
    out.height = Math.max(1, Math.round((canvas.height / canvas.width) * PRINT_WIDTH));
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    let url: string;
    try {
      url = out.toDataURL('image/jpeg', 0.72);
    } catch {
      return;
    }
    if (!url.startsWith('data:image/jpeg')) return;
    this.prints = [...this.prints, url].slice(-ROLL);
    this.store.save({ prints: this.prints });
  }

  /** How many prints are waiting. */
  get count(): number {
    return this.prints.length;
  }

  /** Takes every print off the roll (oldest first). */
  takeAll(): string[] {
    const prints = this.prints;
    this.prints = [];
    this.store.save({ prints: [] });
    return prints;
  }
}

function readState(data: unknown): { prints: string[] } | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = (data as { prints?: unknown }).prints;
  return { prints: Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string' && p.startsWith('data:image/')).slice(-ROLL) : [] };
}
