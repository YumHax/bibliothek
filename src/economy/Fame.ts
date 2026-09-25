import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { BrowserCache, KEYS } from '@/persistence';

/** Page views move slowly: an answer is good for a month ("no article" for a week: one may be written). */
const VIEWS_TTL_MS = 30 * 86_400_000;
const NO_ARTICLE_TTL_MS = 7 * 86_400_000;
/** About a dozen games a market day, a few more for the notice board and the catalogue. */
const MAX_CACHED = 2000;

/**
 * How well known a game is: the average monthly page views of its English Wikipedia article,
 * `null` when it has none, `undefined` while unknown (not asked yet, or Wikipedia unreachable).
 */
export type Views = number | null | undefined;

/**
 * Client for `/api/fame?title=...&platform=...` (see server/fame.ts). Answers are kept in the
 * browser (`bibliothek.cache.fame.v1`, a month each), so a reload asks nothing it knew; `peek`
 * reads the answer synchronously once it is in, so a price shown and a price paid agree.
 */
export class Fame {
  private readonly known: BrowserCache<number | null>;
  private readonly pending = new Map<string, Promise<Views>>();

  constructor(private readonly endpoint = '/api/fame', storage?: Storage | null) {
    this.known = new BrowserCache<number | null>({
      key: KEYS.fameCache,
      maxEntries: MAX_CACHED,
      ttlMs: VIEWS_TTL_MS,
      valid: (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
      storage,
    });
  }

  /** The views if already looked up (including "no article" as null), else undefined. */
  peek(game: Pick<Game, 'id'>): Views {
    return this.known.get(game.id);
  }

  /** Looks the game up; resolves to undefined (never rejects) when the server or Wikipedia is unavailable. */
  lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> {
    const cached = this.known.get(game.id);
    if (cached !== undefined) return Promise.resolve(cached);
    let pending = this.pending.get(game.id);
    if (!pending) {
      pending = this.fetch(game).finally(() => this.pending.delete(game.id));
      this.pending.set(game.id, pending);
    }
    return pending;
  }

  private async fetch(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> {
    try {
      const params = new URLSearchParams({ title: game.title, platform: getPlatform(game.platform).name });
      const res = await window.fetch(`${this.endpoint}?${params}`);
      if (!res.ok) return undefined;
      const body = (await res.json()) as { views?: unknown };
      const views: Views = body.views === null ? null : typeof body.views === 'number' ? body.views : undefined;
      if (views !== undefined) this.known.set(game.id, views, views === null ? NO_ARTICLE_TTL_MS : VIEWS_TTL_MS);
      return views;
    } catch (err) {
      console.warn(`[fame] lookup failed for "${game.title}"`, err);
      return undefined;
    }
  }
}
