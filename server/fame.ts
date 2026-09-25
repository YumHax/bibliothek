import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ApiRequest, type ApiResponse, errorMessage, json } from './http';

/*
 * How famous is a game? Wikipedia knows, without a key: the English article's monthly page views
 * (Wikimedia's pageviews REST API). Ocarina of Time draws tens of thousands a month, an obscure
 * Game Boy puzzle a few hundred, and most catalogue filler has no article at all. The market prices
 * games from this (see src/economy/pricing.ts).
 *
 * Lookup: one Wikipedia search ("<title> <platform> video game") whose top hits come back with
 * their Wikidata short description; the first hit that reads like a video game and whose title
 * shares the game's words is the article (a second search on the main title, before the colon,
 * catches "Solstice: The Quest for..." filed as "Solstice (video game)"). Then one pageviews call
 * for the last full months. Wikimedia asks for serial requests: everything goes through one queue
 * with a small gap, and a 429 waits and retries. Matching a free-text title to an article is the
 * fragile part; it all lives in this file.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
/** Wikimedia asks for an identifying User-Agent and refuses the browser-ish defaults. */
const USER_AGENT = 'bibliothek (game collection room; dev server)';
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Pause between two Wikimedia requests, and the retry schedule when they answer 429 anyway. */
const REQUEST_GAP_MS = 150;
const RETRY_DELAYS_MS = [1000, 3000, 8000];
/**
 * All the time one lookup may take, queue, retries and timeouts included: under the serverless
 * function's `maxDuration` (20 s in vercel.json) with room for a cold start. Out of time, the lookup
 * fails (not cached): the client prices the game as ordinary and asks again later.
 */
const LOOKUP_BUDGET_MS = 14_000;
/** A request is not started with less time than this left. */
const MIN_REQUEST_MS = 1500;
/** Months of page views averaged; a spike (a remake announcement) then moves a price gently. */
const MONTHS = 6;
/** Fame moves slowly: a month on disk, a week on the CDN. */
const TTL_MS = 30 * 24 * 3600 * 1000;
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';
const MAX_MEMORY_ENTRIES = 2000;

/** What the API answers: `views` is the average monthly page views of `article`, null when Wikipedia has no article. */
export interface Fame {
  views: number | null;
  article?: string;
}

interface SearchPage {
  title: string;
  index?: number;
  description?: string;
}

interface CachedFame extends Fame {
  fetchedAt: number;
}

/**
 * Looks games up on Wikipedia and remembers the answer: on disk under `<dir>/<key>.json` for a
 * month (a game's fame barely moves), in memory meanwhile, and concurrent identical lookups share
 * the in-flight promise. Failures are not cached: the client prices the game as ordinary and asks again next time.
 */
export class FameIndex {
  private readonly memory = new Map<string, CachedFame>();
  private readonly inflight = new Map<string, Promise<Fame>>();

  constructor(private readonly dir: string) {}

  get(title: string, platform: string): Promise<Fame> {
    const key = cacheKey(title, platform);
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.resolve(key, title, platform).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async resolve(key: string, title: string, platform: string): Promise<Fame> {
    const cached = this.memory.get(key) ?? (await this.readDisk(key));
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) return strip(cached);

    const fame = await lookupFame(title, platform, Date.now() + LOOKUP_BUDGET_MS);
    const entry: CachedFame = { ...fame, fetchedAt: Date.now() };
    this.remember(key, entry);
    await this.writeDisk(key, entry);
    return fame;
  }

  private remember(key: string, entry: CachedFame): void {
    this.memory.set(key, entry);
    if (this.memory.size > MAX_MEMORY_ENTRIES) this.memory.delete(this.memory.keys().next().value as string);
  }

  private async readDisk(key: string): Promise<CachedFame | null> {
    try {
      const parsed = JSON.parse(await readFile(join(this.dir, `${key}.json`), 'utf8')) as Partial<CachedFame>;
      if (typeof parsed.fetchedAt !== 'number') return null;
      if (parsed.views !== null && typeof parsed.views !== 'number') return null;
      const entry: CachedFame = { views: parsed.views, fetchedAt: parsed.fetchedAt };
      if (typeof parsed.article === 'string') entry.article = parsed.article;
      this.remember(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private async writeDisk(key: string, entry: CachedFame): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      const file = join(this.dir, `${key}.json`);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, file);
    } catch (err) {
      console.warn(`[fame] could not cache ${key}: ${String(err)}`); // serverless: /tmp may be read-only or full
    }
  }
}

/**
 * GET /api/fame?title=<game title>&platform=<platform name> as a pure handler. Answers a `Fame`,
 * or `{ error }` with 502 when Wikipedia could not be read.
 */
export async function handleFame(index: FameIndex, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
  const title = req.url.searchParams.get('title')?.trim();
  const platform = req.url.searchParams.get('platform')?.trim() ?? '';
  if (!title) return json(400, { error: 'missing title' });
  if (title.length > 200 || platform.length > 60) return json(400, { error: 'title or platform too long' });
  try {
    const fame = await index.get(title, platform);
    return json(200, fame, { 'Cache-Control': CACHE_CONTROL });
  } catch (err) {
    return json(502, { error: `fame lookup failed: ${errorMessage(err)}` }, { 'Cache-Control': 'no-store' });
  }
}

/** `deadline` (epoch ms) bounds every Wikimedia call the lookup makes. */
async function lookupFame(title: string, platform: string, deadline: number): Promise<Fame> {
  const article = (await findArticle(title, platform, deadline)) ?? (await findArticle(mainTitle(title), platform, deadline, title));
  if (!article) return { views: null };
  return { views: await monthlyViews(article, deadline), article };
}

/** The article for `title`, or null. `unless` is a title already searched: the same query is not run twice. */
async function findArticle(title: string, platform: string, deadline: number, unless?: string): Promise<string | null> {
  if (!title || title === unless) return null;
  return pickArticle(title, await searchWikipedia(`${title} ${platform} video game`, deadline));
}

/** "Solstice: The Quest for the Staff of Demnos" -> "Solstice"; a title without a subtitle stays as is. */
function mainTitle(title: string): string {
  return title.split(/[:\u2013\u2014-]\s/, 1)[0]!.trim();
}

/** Descriptions of things that are about games without being one: "video game character", "video game series"... */
const NOT_A_GAME = /\b(character|series|franchise|developer|publisher|company|console|genre|engine|list|magazine|film|episode)\b/i;
/** Tokens that tell sequels apart: digits and roman numerals. A candidate must carry every one the title has. */
const NUMERAL = /^(\d+|i{1,3}|iv|vi{0,3}|ix|x{1,2})$/;

/**
 * The search hit that is this game's article. Candidates are described as a game (Wikidata's
 * "1998 video game", "platform game"...), neither a list nor a character or a series, and carry
 * most of the game's own words in their title, all of its numerals included (so a sequel or a
 * predecessor never stands in). Among them the closest title wins, not the search rank: Wikipedia
 * ranks "Super Mario 64 DS" above "Super Mario 64", and words the game does not have cost points.
 */
export function pickArticle(title: string, hits: SearchPage[]): string | null {
  const wanted = significantTokens(title);
  if (wanted.length === 0) return null;
  const numerals = wanted.filter((t) => NUMERAL.test(t));
  let best: { title: string; score: number } | null = null;
  for (const hit of [...hits].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    if (/^list of /i.test(hit.title)) continue;
    const description = hit.description ?? '';
    if (!/\bgames?\b/i.test(description) || NOT_A_GAME.test(description)) continue;
    const have = new Set(significantTokens(hit.title.replace(/\s*\([^)]*\)\s*$/, '')));
    if (!numerals.every((n) => have.has(n))) continue;
    const found = wanted.filter((t) => have.has(t)).length / wanted.length;
    if (found < 0.6) continue;
    const extra = [...have].filter((t) => !wanted.includes(t)).length / have.size;
    const score = found - 0.5 * extra;
    if (!best || score > best.score) best = { title: hit.title, score };
  }
  return best?.title ?? null;
}

async function searchWikipedia(query: string, deadline: number): Promise<SearchPage[]> {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '6',
    gsrnamespace: '0',
    prop: 'description',
    format: 'json',
    formatversion: '2',
  }).toString();
  const data = (await wikimedia(url, deadline)) as { query?: { pages?: SearchPage[] } };
  return data.query?.pages ?? [];
}

/** Average monthly views over the last `MONTHS` full months (0 when the API has none, e.g. a brand-new article). */
async function monthlyViews(article: string, deadline: number): Promise<number> {
  const { start, end } = lastFullMonths(new Date(), MONTHS);
  const url = `${PAGEVIEWS_API}/${encodeURIComponent(article.replace(/ /g, '_'))}/monthly/${start}/${end}`;
  let data: { items?: { views: number }[] };
  try {
    data = (await wikimedia(new URL(url), deadline)) as typeof data;
  } catch (err) {
    if (/ 404 /.test(errorMessage(err))) return 0; // no views recorded for this title
    throw err;
  }
  const items = data.items ?? [];
  if (items.length === 0) return 0;
  return Math.round(items.reduce((sum, i) => sum + i.views, 0) / items.length);
}

/** `YYYYMM01` bounds of the `count` complete months before the current one. */
export function lastFullMonths(now: Date, count: number): { start: string; end: string } {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const stamp = (d: Date): string => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
  return { start: stamp(first), end: stamp(last) };
}

/** Requests to Wikimedia run one at a time, `REQUEST_GAP_MS` apart, whatever the number of games being priced. */
let queue: Promise<unknown> = Promise.resolve();

/** A Wikimedia call through the queue, given up (and skipped when its turn comes) once `deadline` is past. */
function wikimedia(url: URL, deadline: number): Promise<unknown> {
  const turn = queue.then(() => {
    if (deadline - Date.now() < MIN_REQUEST_MS) throw outOfTime();
    return fetchWikimedia(url, deadline);
  });
  queue = turn.then(
    () => sleep(REQUEST_GAP_MS),
    () => sleep(REQUEST_GAP_MS),
  );
  // Waiting in the queue counts too: the caller is answered in time even when the queue is long.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(outOfTime()), Math.max(0, deadline - Date.now()));
  });
  return Promise.race([turn, late]).finally(() => clearTimeout(timer));
}

async function fetchWikimedia(url: URL, deadline: number): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1, Math.min(UPSTREAM_TIMEOUT_MS, deadline - Date.now()))),
    });
    if (res.ok) return res.json();
    const retry = RETRY_DELAYS_MS[attempt];
    if (res.status !== 429 || retry === undefined) throw new Error(`Wikimedia ${res.status} for ${url.pathname}`);
    const after = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(after) && after > 0 ? after * 1000 : retry;
    // A retry that could not finish in time is not worth waiting for.
    if (deadline - Date.now() - wait < MIN_REQUEST_MS) throw new Error(`Wikimedia 429 for ${url.pathname} (no time left to retry)`);
    await sleep(wait);
  }
}

function outOfTime(): Error {
  return new Error('Wikimedia lookup out of time');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'le', 'la', 'les', 'der', 'die', 'das']);

function significantTokens(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

/** File-name-safe cache key: lower-case ASCII words of the title and platform, hyphenated. */
function cacheKey(title: string, platform: string): string {
  const slug = significantTokens(`${platform} ${title}`).join('-');
  return (slug || 'untitled').slice(0, 150);
}

function strip(entry: CachedFame): Fame {
  const fame: Fame = { views: entry.views };
  if (entry.article !== undefined) fame.article = entry.article;
  return fame;
}
