import { type ApiRequest, type ApiResponse, errorMessage, json } from './http';
import { searchYouTube, type VideoResult } from './youtubeSearch';

/** A search hit with the ranking score attached, best first. */
export interface RankedVideo extends VideoResult {
  score: number;
}

export interface LongplayHints {
  /** Game title, used to check the video is about the right game. */
  title?: string;
  /** Platform short name such as "NES" or "SNES". */
  platform?: string;
}

const RESULT_TTL_MS = 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
/** Longplays shorter than this are probably a level or a demo, not the whole game. */
const SHORT_SECONDS = 10 * 60;

const GOOD_WORDS = /\blongplay\b/i;
const OK_WORDS = /\b(full ?game|full ?playthrough|walkthrough|playthrough|100%|no commentary|complete)\b/i;
const BAD_WORDS = /\b(trailer|review|reaction|unboxing|top ?\d+|tier ?list|shorts?|teaser|analysis|retrospective|comparison|remix|ost|soundtrack)\b/i;
const MEH_WORDS = /\b(speedrun|tas|glitch|ep(isode)?\.? ?\d+|part ?\d+|#\d+)\b/i;

/**
 * Scores search results for "is this a full longplay of that game on that platform".
 * Titles saying "longplay" and naming the platform win; long videos win; trailers and
 * reviews lose. Pure, so it can be unit-tested against real titles.
 */
export function rankLongplays(results: VideoResult[], hints: LongplayHints = {}): RankedVideo[] {
  const titleTokens = significantTokens(hints.title ?? '');
  const platform = hints.platform ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(hints.platform)}([^a-z0-9]|$)`, 'i') : null;

  return results
    .map((video) => {
      const t = video.title;
      let score = 0;
      if (GOOD_WORDS.test(t)) score += 5;
      else if (OK_WORDS.test(t)) score += 2;
      if (BAD_WORDS.test(t)) score -= 6;
      if (MEH_WORDS.test(t)) score -= 3;
      if (platform?.test(t)) score += 3;
      if (titleTokens.length) {
        const haystack = normalise(t);
        const found = titleTokens.filter((token) => haystack.includes(token)).length;
        score += 3 * (found / titleTokens.length);
      }
      // Up to +3 for three hours; below ten minutes it is not a longplay whatever the title says.
      score += Math.min(3, video.durationSeconds / 3600);
      if (video.durationSeconds < SHORT_SECONDS) score -= 4;
      return { ...video, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
}

interface CacheEntry {
  expires: number;
  value: Promise<RankedVideo[]>;
}

/**
 * Tiny TTL cache on top of `searchYouTube`: one query = one scrape per hour per process, and
 * concurrent identical requests share the same in-flight promise. Failures are remembered for a
 * minute so a flapping YouTube does not get hammered, then retried.
 */
export class LongplaySearch {
  private readonly cache = new Map<string, CacheEntry>();

  async search(query: string, hints: LongplayHints): Promise<RankedVideo[]> {
    const key = JSON.stringify([query, hints.title ?? '', hints.platform ?? '']);
    const now = Date.now();
    const entry = this.cache.get(key);
    if (entry && entry.expires > now) return entry.value;

    const value = searchYouTube(query).then(
      (results) => rankLongplays(results, hints),
      (err: unknown) => {
        this.cache.set(key, { expires: Date.now() + ERROR_TTL_MS, value });
        throw err;
      },
    );
    this.cache.set(key, { expires: now + RESULT_TTL_MS, value });
    if (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }
}

/**
 * GET /api/youtube/search?q=<query>&title=<game title>&platform=<short name> as a pure handler.
 * Answers `{ results: RankedVideo[] }`, or `{ error }` with 502 when YouTube could not be read.
 */
export async function handleLongplaySearch(search: LongplaySearch, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
  const q = req.url.searchParams.get('q')?.trim();
  if (!q) return json(400, { error: 'missing q' });
  const hints: LongplayHints = {
    title: req.url.searchParams.get('title')?.trim() || undefined,
    platform: req.url.searchParams.get('platform')?.trim() || undefined,
  };
  try {
    const results = await search.search(q, hints);
    // Short CDN cache: results move slowly and the client keeps its own localStorage copy.
    return json(200, { results }, { 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
  } catch (err) {
    return json(502, { error: `video search failed: ${errorMessage(err)}` }, { 'Cache-Control': 'no-store' });
  }
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'ii', 'iii', 'iv']);

function significantTokens(title: string): string[] {
  return normalise(title)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
