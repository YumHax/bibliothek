import { createHash } from 'node:crypto';
import { type ApiRequest, type ApiResponse, empty, json } from './http';
import { type ArtStore, type StoredArt } from './artStore';
import { shrinkArt } from './imageProcessing';

const UPSTREAM = 'https://raw.githubusercontent.com/libretro-thumbnails';
const FOLDERS = new Set(['Named_Boxarts', 'Named_Snaps', 'Named_Titles']);
const SEGMENT = /^[A-Za-z0-9_.,'!()+ -]+$/; // No-Intro names after libretro sanitising; no slashes, no "..".
const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
const UPSTREAM_TIMEOUT_MS = 15_000;

/** Immutable art: a year on browsers and on the CDN (`s-maxage`). Misses are re-checked daily. */
const HIT_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';
const MISS_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

export interface ArtRequest {
  repo: string;
  folder: string;
  file: string;
}

export type ArtResult = ({ status: 200; etag: string } & StoredArt) | { status: 404 };

export interface ArtCacheOptions {
  /** Downscale + WebP re-encode before storing (needs `sharp`; falls back to the original bytes). Default true. */
  shrink?: boolean;
}

/**
 * Caching proxy in front of libretro-thumbnails. Every (repo, folder, file) is fetched from
 * GitHub at most once per store: hits are kept (shrunk to 512 px WebP when sharp is available),
 * misses as a marker that expires after a week (the thumbnail repos do gain files over time).
 * The store decides where things live: disk in dev, memory + CDN on serverless.
 */
export class ArtCache {
  private readonly inflight = new Map<string, Promise<ArtResult>>();
  private readonly shrink: boolean;

  constructor(
    private readonly store: ArtStore,
    options: ArtCacheOptions = {},
  ) {
    this.shrink = options.shrink ?? true;
  }

  /** Splits `/repo/folder/file.png` into its parts, or null if it is not a safe libretro path. */
  static parsePath(pathname: string): ArtRequest | null {
    const parts = pathname.split('/').filter(Boolean).map(safeDecode);
    if (parts.length !== 3 || parts.some((p) => p === null)) return null;
    const [repo, folder, file] = parts as string[];
    if (!SEGMENT.test(repo) || repo.includes('..')) return null;
    if (!FOLDERS.has(folder)) return null;
    if (!SEGMENT.test(file) || file.includes('..') || !file.toLowerCase().endsWith('.png')) return null;
    return { repo, folder, file };
  }

  get(req: ArtRequest): Promise<ArtResult> {
    const key = `${req.repo}/${req.folder}/${req.file}`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.resolve(req, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async resolve(req: ArtRequest, key: string): Promise<ArtResult> {
    const cached = await this.store.read(key);
    if (cached) return hit(await this.upgrade(key, cached));

    const missAge = await this.store.missAge(key);
    if (missAge !== null && missAge < MISS_TTL_MS) return { status: 404 };

    const upstream = await fetch(`${UPSTREAM}/${req.repo}/master/${req.folder}/${encodeURIComponent(req.file)}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (upstream.status === 404) {
      await this.store.markMissing(key);
      return { status: 404 };
    }
    if (!upstream.ok) throw new Error(`upstream ${upstream.status} for ${key}`);

    const png = Buffer.from(await upstream.arrayBuffer());
    const art = this.shrink ? await shrinkArt(png) : { body: png, contentType: 'image/png' };
    await this.store.write(key, art);
    return hit(art);
  }

  /** Shrinks a full-size PNG left by an older cache once, so existing `.cache/art` entries catch up. */
  private async upgrade(key: string, cached: StoredArt): Promise<StoredArt> {
    if (!this.shrink || cached.contentType !== 'image/png') return cached;
    const shrunk = await shrinkArt(cached.body);
    if (shrunk.contentType === cached.contentType) return cached; // sharp unavailable: keep serving the PNG
    await this.store.write(key, shrunk);
    return shrunk;
  }
}

/**
 * GET /api/art/<repo>/<folder>/<file>.png as a pure handler. `req.url.pathname` must be the part
 * after `/api/art` (the adapters strip the mount point).
 */
export async function handleArtRequest(cache: ArtCache, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'GET only' }, { Allow: 'GET, HEAD' });
  const parsed = ArtCache.parsePath(req.url.pathname);
  if (!parsed) {
    return json(400, { error: 'expected /api/art/<repo>/<Named_Boxarts|Named_Snaps|Named_Titles>/<file>.png' });
  }
  const art = await cache.get(parsed);
  if (art.status === 404) return empty(404, { 'Cache-Control': MISS_CACHE_CONTROL });

  const headers = { ETag: art.etag, 'Cache-Control': HIT_CACHE_CONTROL, 'Access-Control-Allow-Origin': '*' };
  if (req.headers['if-none-match'] === art.etag) return empty(304, headers);
  return {
    status: 200,
    headers: { ...headers, 'Content-Type': art.contentType },
    body: req.method === 'HEAD' ? undefined : art.body,
  };
}

function hit(art: StoredArt): ArtResult {
  const etag = `"${createHash('sha1').update(art.body).digest('hex')}"`;
  return { status: 200, etag, ...art };
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
