import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Bytes of one cached image plus the type they were re-encoded to. */
export interface StoredArt {
  body: Buffer;
  contentType: string;
}

/**
 * Where the art proxy keeps what it fetched. Keys are `repo/folder/file.png`; a hit is the
 * (possibly re-encoded) image, a miss is a marker with a timestamp so it can expire.
 */
export interface ArtStore {
  read(key: string): Promise<StoredArt | null>;
  write(key: string, art: StoredArt): Promise<void>;
  /** Milliseconds since the miss was recorded, or null when there is no marker. */
  missAge(key: string): Promise<number | null>;
  markMissing(key: string): Promise<void>;
}

const EXTENSION_BY_TYPE: Record<string, string> = { 'image/webp': '.webp', 'image/png': '.png' };
const TYPE_BY_EXTENSION: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png' };

/**
 * Files under `dir`, mirroring the libretro path. A processed image is stored with its own
 * extension (`Game.webp`) next to where the original would go, so older `.png` entries stay valid.
 */
export class DiskArtStore implements ArtStore {
  constructor(private readonly dir: string) {}

  async read(key: string): Promise<StoredArt | null> {
    for (const ext of ['.webp', '.png']) {
      const body = await readIfExists(this.path(key, ext));
      if (body) return { body, contentType: TYPE_BY_EXTENSION[ext] };
    }
    return null;
  }

  async write(key: string, art: StoredArt): Promise<void> {
    const file = this.path(key, EXTENSION_BY_TYPE[art.contentType] ?? '.png');
    await mkdir(dirname(file), { recursive: true });
    // Write to a temp name then rename so a crash never leaves a truncated image behind.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, art.body);
    await rename(tmp, file);
    await unlink(this.marker(key)).catch(() => undefined);
    // Drop other encodings of the same image (e.g. the full-size PNG a WebP just replaced).
    for (const ext of Object.keys(TYPE_BY_EXTENSION)) {
      const other = this.path(key, ext);
      if (other !== file) await unlink(other).catch(() => undefined);
    }
  }

  async missAge(key: string): Promise<number | null> {
    try {
      return Date.now() - (await stat(this.marker(key))).mtimeMs;
    } catch {
      return null;
    }
  }

  async markMissing(key: string): Promise<void> {
    const marker = this.marker(key);
    await mkdir(dirname(marker), { recursive: true });
    await writeFile(marker, '');
  }

  private path(key: string, ext: string): string {
    return join(this.dir, key.replace(/\.png$/i, ext));
  }

  private marker(key: string): string {
    return join(this.dir, key) + '.missing';
  }
}

/**
 * Bounded in-memory store for serverless instances, where the disk is ephemeral. It only
 * absorbs repeats within one warm instance; the CDN (long `Cache-Control`) does the real caching.
 */
export class MemoryArtStore implements ArtStore {
  private readonly hits = new Map<string, StoredArt>();
  private readonly misses = new Map<string, number>();
  private bytes = 0;

  constructor(private readonly maxBytes = 48 * 1024 * 1024) {}

  async read(key: string): Promise<StoredArt | null> {
    const art = this.hits.get(key);
    if (!art) return null;
    this.hits.delete(key); // re-insert so Map order doubles as LRU order
    this.hits.set(key, art);
    return art;
  }

  async write(key: string, art: StoredArt): Promise<void> {
    this.misses.delete(key);
    const previous = this.hits.get(key);
    if (previous) this.bytes -= previous.body.length;
    this.hits.set(key, art);
    this.bytes += art.body.length;
    for (const [oldest, old] of this.hits) {
      if (this.bytes <= this.maxBytes) break;
      this.hits.delete(oldest);
      this.bytes -= old.body.length;
    }
  }

  async missAge(key: string): Promise<number | null> {
    const at = this.misses.get(key);
    return at === undefined ? null : Date.now() - at;
  }

  async markMissing(key: string): Promise<void> {
    this.misses.set(key, Date.now());
    if (this.misses.size > 5000) this.misses.delete(this.misses.keys().next().value as string);
  }
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
