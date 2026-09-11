import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { VideoInfo, VideoProvider } from './VideoProvider';

const MIN_LONGPLAY_SECONDS = 15 * 60;
const REQUEST_TIMEOUT_MS = 20_000;
/** A "nothing found" answer is retried after a day; a found video is kept for good. */
const MISS_TTL_MS = 24 * 3600 * 1000;
const STORAGE_PREFIX = 'bibliothek:longplay:';

/** What the endpoint returns: search hits already ranked best-first (see server/longplaySearch.ts). */
interface RankedVideo extends VideoInfo {
  score: number;
}

interface CacheRecord {
  info: VideoInfo | null;
  at: number;
}

/**
 * Uses the same-origin endpoint /api/youtube/search (Vite middleware in dev, serverless function
 * in production; see server/longplaySearch.ts), which scrapes YouTube's public results page and
 * ranks the hits: no API key involved. Results are cached in localStorage so a game is only
 * searched once per browser. Any failure throws with a readable message so the TV can show it.
 */
export class YouTubeSearchProvider implements VideoProvider {
  readonly id = 'youtube-search';

  constructor(private readonly endpoint = '/api/youtube/search') {}

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

  private readCache(gameId: string): VideoInfo | null | undefined {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + gameId);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as CacheRecord | VideoInfo | null;
      if (!parsed) return undefined; // legacy "null" entry: search again
      if ('videoId' in parsed) return parsed; // legacy entry without timestamp
      if (parsed.info) return parsed.info;
      return Date.now() - parsed.at < MISS_TTL_MS ? null : undefined;
    } catch {
      return undefined;
    }
  }

  private writeCache(gameId: string, info: VideoInfo | null): void {
    try {
      const record: CacheRecord = { info, at: Date.now() };
      localStorage.setItem(STORAGE_PREFIX + gameId, JSON.stringify(record));
    } catch {
      /* storage unavailable: fine */
    }
  }
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
