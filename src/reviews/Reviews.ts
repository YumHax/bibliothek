import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { isBootlegId } from '@/catalog/bootlegs';
import { BrowserCache, KEYS } from '@/persistence';

/** One score from the article's reviews box ("9/10", "97/100"), and whether it is an aggregate (Metacritic, GameRankings). */
export interface ReviewScore {
  source: string;
  score: string;
  aggregate?: boolean;
}

/** What the press said, as `/api/reviews` answers it (server/reviews.ts); `article` null: Wikipedia has none. */
export interface Reviews {
  article: string | null;
  url?: string;
  scores: ReviewScore[];
  quote?: { text: string; source?: string };
  summary?: string;
  /** Not from Wikipedia: a review the game's own fiction wrote (the prototype's preview). Shown without the licence line. */
  fiction?: { credit: string };
}

/** Old reviews do not change: a month each; "no article" a week (one may be written). */
const TTL_MS = 30 * 86_400_000;
const NO_ARTICLE_TTL_MS = 7 * 86_400_000;
const MAX_CACHED = 600;

/**
 * Client for `/api/reviews?title=&platform=&year=` (server/reviews.ts): the scores and a quoted line from
 * the game's Wikipedia article, kept in the browser a month (`bibliothek.cache.reviews.v1`). `override`
 * answers for a game of the game's own making (the prototype) without asking anyone.
 */
export class ReviewSource {
  private readonly known: BrowserCache<Reviews>;
  private readonly pending = new Map<string, Promise<Reviews | null>>();
  private readonly overrides = new Map<string, Reviews>();

  constructor(private readonly endpoint = '/api/reviews', storage?: Storage | null) {
    this.known = new BrowserCache<Reviews>({ key: KEYS.reviewsCache, maxEntries: MAX_CACHED, ttlMs: TTL_MS, valid: (v) => readReviews(v) !== null, storage });
  }

  /** The reviews of `gameId` are these (no lookup). */
  override(gameId: string, reviews: Reviews): void {
    this.overrides.set(gameId, reviews);
  }

  /** The reviews if already known, else undefined. */
  peek(game: Pick<Game, 'id'>): Reviews | undefined {
    return this.overrides.get(game.id) ?? this.known.get(game.id);
  }

  /** Looks the game up; null (never a rejection) when the server or Wikipedia cannot be reached. */
  lookup(game: Pick<Game, 'id' | 'title' | 'platform' | 'releaseDate'>): Promise<Reviews | null> {
    const known = this.peek(game);
    if (known) return Promise.resolve(known);
    // An unlicensed cartridge (`catalog/bootlegs`) was never reviewed: asking would only find some other game.
    if (isBootlegId(game.id)) return Promise.resolve({ article: null, scores: [] });
    let pending = this.pending.get(game.id);
    if (!pending) {
      pending = this.fetch(game).finally(() => this.pending.delete(game.id));
      this.pending.set(game.id, pending);
    }
    return pending;
  }

  private async fetch(game: Pick<Game, 'id' | 'title' | 'platform' | 'releaseDate'>): Promise<Reviews | null> {
    try {
      const params = new URLSearchParams({ title: game.title, platform: getPlatform(game.platform).name });
      const year = /^\d{4}/.exec(game.releaseDate ?? '')?.[0];
      if (year) params.set('year', year);
      const res = await window.fetch(`${this.endpoint}?${params}`);
      if (!res.ok) return null;
      const reviews = readReviews(await res.json());
      if (reviews) this.known.set(game.id, reviews, reviews.article === null ? NO_ARTICLE_TTL_MS : TTL_MS);
      return reviews;
    } catch (err) {
      console.warn(`[reviews] lookup failed for "${game.title}"`, err);
      return null;
    }
  }
}

/** An answer read back (the API's, or the cache's), or null when it is not one. */
export function readReviews(data: unknown): Reviews | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Reviews>;
  if (d.article !== null && typeof d.article !== 'string') return null;
  const scores = Array.isArray(d.scores)
    ? d.scores
      .filter((s): s is ReviewScore => !!s && typeof s.source === 'string' && typeof s.score === 'string')
      .slice(0, 6)
      .map((s) => ({ source: s.source, score: s.score, ...(s.aggregate ? { aggregate: true } : {}) }))
    : [];
  const reviews: Reviews = { article: d.article, scores };
  if (typeof d.url === 'string' && /^https:\/\/en\.wikipedia\.org\//.test(d.url)) reviews.url = d.url;
  if (d.quote && typeof d.quote.text === 'string') reviews.quote = { text: d.quote.text, ...(typeof d.quote.source === 'string' ? { source: d.quote.source } : {}) };
  if (typeof d.summary === 'string') reviews.summary = d.summary;
  return reviews;
}
