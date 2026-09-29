import type { Game } from '@/catalog/types';
import { regionOf } from '@/catalog/media';
import { BrowserCache } from '@/persistence/BrowserCache';
import { KEYS } from '@/persistence/keys';
import type { BoxArtKind, BoxArtUrls, CoverArtProvider } from './CoverArtProvider';

/** Same-origin API (server/launchbox.ts): the game's scans on LaunchBox, as addresses on our image proxy. */
const API = '/api/launchbox';
const HIT_TTL_MS = 30 * 24 * 3600 * 1000;
/** No game matched: asked again after a few days (the database grows). */
const MISS_TTL_MS = 3 * 24 * 3600 * 1000;
const KINDS: readonly BoxArtKind[] = ['back', 'spine', 'cart', 'disc'];

/**
 * Backs, spines, cartridges and discs from the LaunchBox Games Database, through our API. What it
 * answers is kept in the browser for a month (a no-match for three days), concurrent asks for one
 * game share a request, and a failing or resting API (503) is not asked again until it says so:
 * meanwhile the boxes keep their generated faces. Slow by nature (the server asks LaunchBox a
 * second apart), so only asked for what can wait: the spines after every front, the rest in hand.
 */
export class LaunchBoxProvider implements CoverArtProvider {
  readonly id = 'launchbox';
  private readonly cache = new BrowserCache<BoxArtUrls>({ key: KEYS.scanCache, maxEntries: 2000, ttlMs: HIT_TTL_MS, valid: isUrls });
  private readonly inflight = new Map<string, Promise<BoxArtUrls | null>>();
  private restingUntil = 0;
  private warned = false;

  getBoxArt(game: Game): Promise<BoxArtUrls | null> {
    const name = game.externalIds?.libretroName ?? game.title;
    const region = regionOf(game);
    const key = `${game.platform}/${name}/${region}`;
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    if (Date.now() < this.restingUntil) return Promise.resolve(null);
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.ask(key, `${API}/${game.platform}/${encodeURIComponent(name)}?region=${region}`).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async ask(key: string, url: string): Promise<BoxArtUrls | null> {
    try {
      const response = await fetch(url);
      if (response.status === 503) {
        const after = Number(response.headers.get('retry-after'));
        this.restingUntil = Date.now() + (after > 0 ? after * 1000 : 60_000);
        return null;
      }
      if (!response.ok) throw new Error(`${response.status}`);
      const manifest = (await response.json()) as Record<string, unknown>;
      const urls: BoxArtUrls = {};
      for (const kind of KINDS) {
        const value = manifest[kind];
        if (typeof value === 'string' && value.startsWith('/api/scan/')) urls[kind] = value;
      }
      this.cache.set(key, urls, manifest.id === null ? MISS_TTL_MS : HIT_TTL_MS);
      return urls;
    } catch (err) {
      // Not cached: asked again next time. Said once, a dead API would otherwise say it per box.
      if (!this.warned) console.warn('[covers] LaunchBox scans unavailable (is the dev server running?)', err);
      this.warned = true;
      return null;
    }
  }
}

function isUrls(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.values(value).every((v) => typeof v === 'string');
}
