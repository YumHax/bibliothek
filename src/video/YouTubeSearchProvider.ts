import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { canonicalGameId } from '@/catalog';
import { BrowserCache, KEYS, safeStorage, storageKeys } from '@/persistence';
import type { VideoInfo, VideoProvider } from './VideoProvider';

const MIN_LONGPLAY_SECONDS = 15 * 60;
const REQUEST_TIMEOUT_MS = 20_000;
/** A "nothing found" answer is retried after a day; a found video is kept half a year (videos do get taken down). */
const MISS_TTL_MS = 24 * 3600 * 1000;
const HIT_TTL_MS = 180 * 24 * 3600 * 1000;
/** Far more games than a collection holds. */
const MAX_CACHED = 600;
/** Where each game's answer used to be kept, one key per game: moved into the cache once, then removed. */
const LEGACY_PREFIX = 'bibliothek:longplay:';

/** What the endpoint returns: search hits already ranked best-first (see server/longplaySearch.ts). */
interface RankedVideo extends VideoInfo {
  score: number;
}

interface CacheRecord {
  info: VideoInfo | null;
  at: number;
}

/** A search's answer: the video, or null for "no longplay found". */
type Answer = VideoInfo | null;

/**
 * Uses the same-origin endpoint /api/youtube/search (Vite middleware in dev, serverless function
 * in production; see server/longplaySearch.ts), which scrapes YouTube's public results page and
 * ranks the hits: no API key involved. Results are cached in localStorage so a game is only
 * searched once per browser. Any failure throws with a readable message so the TV can show it.
 */
export class YouTubeSearchProvider implements VideoProvider {
  readonly id = 'youtube-search';

  private readonly cache: BrowserCache<Answer>;

  constructor(private readonly endpoint = '/api/youtube/search', storage: Storage | null = safeStorage()) {
    this.cache = new BrowserCache<Answer>({ key: KEYS.longplayCache, maxEntries: MAX_CACHED, ttlMs: HIT_TTL_MS, valid: isAnswer, storage });
    this.adoptLegacy(storage);
  }

  async findLongplay(game: Game): Promise<VideoInfo | null> {
    const cached = this.readCache(game.id);
    if (cached !== undefined) return cached;

    const platform = getPlatform(game.platform).shortName;
    const params = new URLSearchParams({ q: `${game.title} ${platform} longplay`, title: game.title, platform });

    let res: Response;
    try {
      res = await fetch(`${this.endpoint}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`video search unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    const payload = (await res.json().catch(() => ({}))) as { results?: RankedVideo[]; error?: string };
    if (!res.ok || !Array.isArray(payload.results)) {
      throw new Error(payload.error ?? `video search failed (${res.status})`);
    }

    const best = pickBest(payload.results);
    this.writeCache(game.id, best);
    return best;
  }

  private readCache(gameId: string): Answer | undefined {
    return this.cache.get(gameId);
  }

  private writeCache(gameId: string, info: Answer): void {
    this.cache.set(gameId, info, info ? HIT_TTL_MS : MISS_TTL_MS);
  }

  /** Moves the old one-key-per-game answers (`bibliothek:longplay:<id>`) into the cache, under canonical ids, and removes them. */
  private adoptLegacy(storage: Storage | null): void {
    const keys = storageKeys(storage).filter((key) => key.startsWith(LEGACY_PREFIX));
    for (const key of keys) {
      try {
        const parsed = JSON.parse(storage?.getItem(key) ?? 'null') as CacheRecord | VideoInfo | null;
        const id = canonicalGameId(key.slice(LEGACY_PREFIX.length));
        // A "null" entry means search again; an entry without a timestamp is a found video.
        if (parsed && 'videoId' in parsed && isAnswer(parsed)) this.cache.set(id, parsed, HIT_TTL_MS);
        else if (parsed && 'info' in parsed && typeof parsed.at === 'number' && isAnswer(parsed.info)) {
          if (parsed.info) this.cache.set(id, parsed.info, HIT_TTL_MS, parsed.at);
          else if (Date.now() - parsed.at < MISS_TTL_MS) this.cache.set(id, null, MISS_TTL_MS, parsed.at);
        }
      } catch {
        // unreadable: searched again when needed
      }
      try {
        storage?.removeItem(key);
      } catch {
        // storage blocked: nothing to tidy
      }
    }
    if (keys.length) this.cache.flush();
  }
}

function isAnswer(value: unknown): value is Answer {
  if (value === null) return true;
  const v = value as Partial<VideoInfo> | undefined;
  return typeof v === 'object' && typeof v.videoId === 'string' && typeof v.title === 'string' && typeof v.durationSeconds === 'number';
}

/**
 * The server already sorted by relevance; take the best hit that is long enough to be a whole
 * game, otherwise the best positively-scored one. Nothing plausible means "no longplay".
 */
function pickBest(results: RankedVideo[]): VideoInfo | null {
  const chosen = results.find((r) => r.durationSeconds >= MIN_LONGPLAY_SECONDS) ?? results.find((r) => r.score > 0) ?? null;
  if (!chosen) return null;
  return { videoId: chosen.videoId, title: chosen.title, durationSeconds: chosen.durationSeconds };
}
