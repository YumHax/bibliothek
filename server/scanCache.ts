import { type ApiRequest, type ApiResponse, json } from './http';
import type { ArtStore } from './artStore';
import { type ArtResult, artResponse, hit, pausedResponse } from './artCache';
import { shrinkArt } from './imageProcessing';
import { PoliteFetcher, UpstreamPaused } from './politeFetch';
import { SCAN_KINDS, type ScanKind } from './launchbox';

/**
 * Caching proxy for the LaunchBox scans a manifest names (`/api/scan/<kind>/<uuid>.<ext>`): each
 * file is fetched once per store, shrunk to WebP (alpha kept, for the cartridges and discs) and
 * served for a year. Only images.launchbox-app.com UUID files are ever fetched.
 */

const UPSTREAM = 'https://images.launchbox-app.com';
const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg)$/;
const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
/** Longest side kept per kind: a back carries small print, a spine is long and thin. */
const MAX_SIDE: Record<ScanKind, number> = { back: 1024, spine: 1024, cart: 512, disc: 512 };

/** The image host is a CDN: two at a time, a short gap, a pause when it keeps failing. */
const IMAGES = new PoliteFetcher({
  gapMs: 250,
  concurrency: 2,
  timeoutMs: 30_000,
  retryDelaysMs: [1000, 4000],
  breakAfter: 5,
  pauseMs: 2 * 60_000,
  userAgent: 'bibliothek (game collection room; box art cache)',
});

export interface ScanRequest {
  kind: ScanKind;
  uuid: string;
  ext: 'png' | 'jpg';
}

export class ScanCache {
  private readonly inflight = new Map<string, Promise<ArtResult>>();

  constructor(private readonly store: ArtStore) {}

  /** `/<kind>/<uuid>.<png|jpg>`, or null for anything else. */
  static parsePath(pathname: string): ScanRequest | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const kind = parts[0] as ScanKind;
    const file = FILE.exec(parts[1]!.toLowerCase());
    if (!SCAN_KINDS.includes(kind) || !file) return null;
    return { kind, uuid: file[1]!, ext: file[2] as 'png' | 'jpg' };
  }

  get(req: ScanRequest): Promise<ArtResult> {
    // Stored under a `.png` name whatever the source: the store puts the encoding's own extension on it.
    const key = `${req.kind}/${req.uuid}.png`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.resolve(req, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async resolve(req: ScanRequest, key: string): Promise<ArtResult> {
    const cached = await this.store.read(key);
    if (cached) return hit(cached);
    const missAge = await this.store.missAge(key);
    if (missAge !== null && missAge < MISS_TTL_MS) return { status: 404 };

    const upstream = await IMAGES.fetch(`${UPSTREAM}/${req.uuid}.${req.ext}`);
    if (upstream.status === 404 || upstream.status === 403) {
      await this.store.markMissing(key);
      return { status: 404 };
    }
    if (!upstream.ok) throw new Error(`upstream ${upstream.status} for ${key}`);
    const art = await shrinkArt(Buffer.from(await upstream.arrayBuffer()), MAX_SIDE[req.kind]);
    await this.store.write(key, art);
    return hit(art);
  }
}

/** GET /api/scan/<kind>/<uuid>.<ext> as a pure handler; `req.url.pathname` is the part after `/api/scan`. */
export async function handleScanRequest(cache: ScanCache, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'GET only' }, { Allow: 'GET, HEAD' });
  const parsed = ScanCache.parsePath(req.url.pathname);
  if (!parsed) return json(400, { error: 'expected /api/scan/<back|spine|cart|disc>/<uuid>.<png|jpg>' });
  try {
    return artResponse(await cache.get(parsed), req);
  } catch (err) {
    if (err instanceof UpstreamPaused) return pausedResponse(err);
    throw err;
  }
}
