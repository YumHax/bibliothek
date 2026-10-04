import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exactArticle, findGameArticle, wikimedia } from './fame';
import { type ApiRequest, type ApiResponse, errorMessage, json } from './http';

/*
 * What the press said at the time, as the game's English Wikipedia article sums it up, without a key:
 * the article (found as for its fame, server/fame.ts), its wikitext (MediaWiki's parse API), then the
 * `{{Video game reviews}}` box (the aggregates and the magazines' scores) and one short quoted line from
 * the "Reception" section, with whom it quotes. Wikipedia's text is CC BY-SA: only a line is taken, and
 * the client always shows where it comes from, with a link. Parsing wikitext is the fragile part; it all
 * lives in this file.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const ARTICLE_URL = 'https://en.wikipedia.org/wiki/';
/** All the time one lookup may take (under the serverless `maxDuration`, see server/fame.ts). */
const LOOKUP_BUDGET_MS = 14_000;
/** Old reviews do not change: a month on disk, a week on the CDN. */
const TTL_MS = 30 * 24 * 3600 * 1000;
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';
const MAX_MEMORY_ENTRIES = 1000;
/** Scores kept from the box, aggregates first. */
const MAX_SCORES = 6;
/** The quote's length bounds (characters): shorter says nothing, longer is cut at a word. */
const QUOTE = { min: 18, max: 160 };
const SUMMARY_MAX = 240;

/** One score from the reviews box: who gave it, what it reads ("9/10", "97/100", "4/5"), whether it is an aggregate. */
interface ReviewScore {
  source: string;
  score: string;
  aggregate?: boolean;
}

/** What the API answers. `article` null: Wikipedia has no article for the game (nothing else then). */
interface Reviews {
  article: string | null;
  /** The article's address, for the attribution link. */
  url?: string;
  scores: ReviewScore[];
  /** A short line the article quotes from a review, and the publication when the sentence names it. */
  quote?: { text: string; source?: string };
  /** No quote: the reception section's first sentence instead. */
  summary?: string;
}

interface CachedReviews extends Reviews {
  fetchedAt: number;
}

/** The reviews' lookups, remembered like the fame's: on disk a month, in memory, one in flight per game. */
export class ReviewIndex {
  private readonly memory = new Map<string, CachedReviews>();
  private readonly inflight = new Map<string, Promise<Reviews>>();

  constructor(private readonly dir: string) {}

  /** `year`: the release year, when known (it picks the original over a remake of the same name). */
  get(title: string, platform: string, year = ''): Promise<Reviews> {
    const key = cacheKey(title, platform, year);
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.resolve(key, title, platform, year).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async resolve(key: string, title: string, platform: string, year: string): Promise<Reviews> {
    const cached = this.memory.get(key) ?? (await this.readDisk(key));
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) return strip(cached);
    const reviews = await lookupReviews(title, platform, year, Date.now() + LOOKUP_BUDGET_MS);
    const entry: CachedReviews = { ...reviews, fetchedAt: Date.now() };
    this.memory.set(key, entry);
    if (this.memory.size > MAX_MEMORY_ENTRIES) this.memory.delete(this.memory.keys().next().value as string);
    await this.writeDisk(key, entry);
    return reviews;
  }

  private async readDisk(key: string): Promise<CachedReviews | null> {
    try {
      const raw = JSON.parse(await readFile(join(this.dir, `${key}.json`), 'utf8')) as { fetchedAt?: unknown };
      const parsed = readReviews(raw);
      const { fetchedAt } = raw;
      if (!parsed || typeof fetchedAt !== 'number') return null;
      const entry: CachedReviews = { ...parsed, fetchedAt };
      this.memory.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private async writeDisk(key: string, entry: CachedReviews): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      const file = join(this.dir, `${key}.json`);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, file);
    } catch (err) {
      console.warn(`[reviews] could not cache ${key}: ${String(err)}`);
    }
  }
}

/** GET /api/reviews?title=<game title>&platform=<platform name>&year=<YYYY>: a `Reviews`, or `{ error }` with 502. */
export async function handleReviews(index: ReviewIndex, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
  const title = req.url.searchParams.get('title')?.trim();
  const platform = req.url.searchParams.get('platform')?.trim() ?? '';
  const year = /^\d{4}$/.exec(req.url.searchParams.get('year')?.trim() ?? '')?.[0] ?? '';
  if (!title) return json(400, { error: 'missing title' });
  if (title.length > 200 || platform.length > 60) return json(400, { error: 'title or platform too long' });
  try {
    return json(200, await index.get(title, platform, year), { 'Cache-Control': CACHE_CONTROL });
  } catch (err) {
    return json(502, { error: `reviews lookup failed: ${errorMessage(err)}` }, { 'Cache-Control': 'no-store' });
  }
}

async function lookupReviews(title: string, platform: string, year: string, deadline: number): Promise<Reviews> {
  const article = (await exactArticle(title, year, deadline)) ?? (await findGameArticle(title, platform, deadline));
  if (!article) return { article: null, scores: [] };
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ action: 'parse', page: article, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' }).toString();
  const data = (await wikimedia(url, deadline)) as { parse?: { wikitext?: string } };
  return { ...parseReception(data.parse?.wikitext ?? '', article.replace(/\s*\([^)]*\)$/, '')), article, url: `${ARTICLE_URL}${encodeURIComponent(article.replace(/ /g, '_'))}` };
}

/** The scores box and the quote out of an article's wikitext. Exported for a headless check. */
function parseReception(wikitext: string, gameTitle = ''): Omit<Reviews, 'article' | 'url'> {
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  const scores = reviewBox(text);
  const section = receptionSection(text);
  const reviews: Omit<Reviews, 'article' | 'url'> = { scores };
  if (!section) return reviews;
  const sentences = splitSentences(prose(section));
  const quote = findQuote(sentences, gameTitle);
  if (quote) reviews.quote = quote;
  else {
    const first = sentences.map(unmark).find((s) => s.length > 30);
    if (first) reviews.summary = cut(first, SUMMARY_MAX);
  }
  return reviews;
}

// --- the reviews box ---------------------------------------------------------------------------

/** The box's short parameter names (Template:Video game reviews) and who they are. */
const AGGREGATES: Record<string, string> = { MC: 'Metacritic', GR: 'GameRankings', OC: 'OpenCritic', MobyGames: 'MobyGames' };
const REVIEWERS: Record<string, string> = {
  '1UP': '1Up.com', ACE: 'ACE', AllGame: 'AllGame', AMG: 'AllGame', CVG: 'Computer and Video Games', CGW: 'Computer Gaming World',
  Destruct: 'Destructoid', Edge: 'Edge', EGM: 'Electronic Gaming Monthly', EuroG: 'Eurogamer', Fam: 'Famitsu', G4: 'G4',
  GameFan: 'GameFan', GamePro: 'GamePro', GameRev: 'Game Revolution', GB: 'Giant Bomb', GI: 'Game Informer',
  GMaster: 'GamesMaster', GSpot: 'GameSpot', GSpy: 'GameSpy', GT: 'GameTrailers', GameZone: 'GameZone', GTM: 'GamesTM',
  IGN: 'IGN', Joystick: 'Joystiq', MegaFun: 'Mega Fun', MM: 'Mean Machines', N64: 'N64 Magazine', NGC: 'NGC Magazine',
  NLife: 'Nintendo Life', NP: 'Nintendo Power', NW: 'Nintendo World Report', OPM: 'Official PlayStation Magazine',
  OPMUK: 'Official PlayStation Magazine (UK)', OXM: 'Official Xbox Magazine', PCGUK: 'PC Gamer UK', PCGUS: 'PC Gamer US',
  Poly: 'Polygon', RPS: 'Rock Paper Shotgun', Sega: 'Sega Power', SegaPro: 'Sega Pro', TX: 'TeamXbox', VG: 'VideoGamer.com',
  MD: 'Mega Drive Advanced Gaming', Mega: 'Mega', MegaTech: 'MegaTech', Zzap: 'Zzap!64', Crash: 'Crash', CU: 'CU Amiga',
  Amiga: 'Amiga Power', TotalNintendo: 'Total!', USgamer: 'USgamer', HG: 'Hardcore Gamer',
};

/**
 * The `{{Video game reviews ...}}` boxes' scores (an article may have two: contemporary and retrospective),
 * aggregates first, then the magazines in the boxes' order, each source once. A score per platform is
 * written `GR_PS = 92%`: the first platform's counts.
 */
function reviewBox(text: string): ReviewScore[] {
  const params = new Map<string, string>();
  const open = /\{\{\s*(video game reviews|vg reviews|vgreviews)\b/gi;
  for (let match = open.exec(text); match; match = open.exec(text)) {
    const body = balanced(text, match.index);
    if (!body) continue;
    for (const part of splitTopLevel(body.slice(2, -2)).slice(1)) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const raw = part.slice(0, eq).trim();
      const name = AGGREGATES[raw] || REVIEWERS[raw] ? raw : raw.replace(/_[A-Za-z0-9]+$/, '');
      const value = cleanScore(part.slice(eq + 1));
      if (name && value && !params.has(name)) params.set(name, value);
    }
  }
  const aggregates: ReviewScore[] = [];
  const magazines: ReviewScore[] = [];
  for (const [name, score] of params) {
    if (AGGREGATES[name]) aggregates.push({ source: AGGREGATES[name]!, score, aggregate: true });
    else if (REVIEWERS[name]) magazines.push({ source: REVIEWERS[name]!, score });
    else {
      // Free entries: rev1 = Name | rev1Score = 8/10 (and agg1 / agg1Score for aggregates).
      const custom = /^(rev|agg)(\d+)Score$/i.exec(name);
      if (!custom) continue;
      const source = params.get(`${custom[1]}${custom[2]}`);
      if (!source) continue;
      (custom[1]!.toLowerCase() === 'agg' ? aggregates : magazines).push({ source, score, ...(custom[1]!.toLowerCase() === 'agg' ? { aggregate: true } : {}) });
    }
  }
  return [...aggregates, ...magazines].slice(0, MAX_SCORES);
}

/**
 * A score as the box writes it, to plain text: refs and comments out, `{{Rating|4|5}}` as "4/5", the
 * first platform's score when there are several ("N64: 9.9/10<br>GC: 9/10" -> "9.9/10"), links as their text.
 */
function cleanScore(raw: string): string {
  let v = raw
    .replace(/<ref[^>/]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*(?:rating|star rating|stars)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)[^}]*\}\}/gi, '$1/$2')
    .replace(/\{\{\s*(?:nowrap|nobr|small|tooltip|abbr)\s*\|([^{}|]*)[^{}]*\}\}/gi, '$1');
  v = v.split(/<br\s*\/?>|\n|\{\{\s*(?:plainlist|ubl|unbulleted list)/i)[0] ?? '';
  v = links(v).replace(/\{\{[^{}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '');
  v = v.replace(/^\s*[A-Za-z0-9 ]{1,12}:\s*/, '').replace(/\s+/g, ' ').trim();
  // A panel of reviewers ("8/10, 8/10, 9/10, 10/10", EGM's and Famitsu's way) reads as their sum: "35/40".
  const panel = v.split(/\s*,\s*/).map((p) => /^([\d.]+)\/(\d+)$/.exec(p));
  if (panel.length > 1 && panel.every((m) => m && m[2] === panel[0]![2])) {
    const sum = panel.reduce((total, m) => total + Number(m![1]), 0);
    v = `${Math.round(sum * 10) / 10}/${Number(panel[0]![2]) * panel.length}`;
  }
  // A score has a digit or a letter grade; a lone word ("N/A", "Positive") is dropped.
  if (!/\d/.test(v) && !/^[A-F][+-]?$/.test(v)) return '';
  return v.length > 24 ? '' : v;
}

// --- the reception section ---------------------------------------------------------------------

/** The level-2 section whose heading reads like the reception (its subsections included), or null. */
function receptionSection(text: string): string | null {
  const heading = /^==\s*(?:critical\s+)?(?:reception|reviews|critical response|response)(?:\s+and\s+legacy)?\s*==\s*$/gim;
  const match = heading.exec(text);
  if (!match) return null;
  const from = match.index + match[0].length;
  const next = /^==[^=].*==\s*$/gm;
  next.lastIndex = from;
  const end = next.exec(text);
  return text.slice(from, end ? end.index : undefined);
}

/**
 * The section as prose: templates, refs, files, tables, headings and markup out, links as their text,
 * italics kept as ⟨…⟩ (they name the publications: ''Electronic Gaming Monthly'').
 */
function prose(section: string): string {
  let t = section
    .replace(/<ref[^>/]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\|[\s\S]*?\|\}/g, '')
    .replace(/^=+.*=+\s*$/gm, '');
  t = stripTemplates(t);
  t = t.replace(/\[\[(?:file|image|category):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, '');
  t = links(t)
    .replace(/\[https?:[^\s\]]+\s([^\]]+)\]/g, '$1')
    .replace(/\[https?:[^\]]+\]/g, '')
    .replace(/'''/g, '')
    .replace(/''([^']+?)''/g, '⟨$1⟩')
    .replace(/''/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
  return t;
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((para) => para.split(/(?<=[.!?]["”’]?)\s+(?=["“⟨A-Z])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A line quoted from a review at a readable length: the first whose sentence names a publication (an
 * italic name that is not the game's own title, or a known magazine), else the first quote at all. A
 * quoted title ("100 Best Nintendo Games": mostly capitalised words) is not a review's line.
 */
function findQuote(sentences: string[], gameTitle: string): { text: string; source?: string } | null {
  const game = gameTitle.toLowerCase();
  let anonymous: { text: string } | null = null;
  for (const sentence of sentences) {
    for (const quoted of sentence.matchAll(/[“"]([^”"]+)[”"]/g)) {
      const text = unmark(quoted[1]!).trim();
      const words = text.split(/\s+/);
      if (text.length < QUOTE.min || words.length < 5) continue;
      if (words.filter((w) => /^[A-Z0-9]/.test(w)).length / words.length > 0.6) continue;
      const italics = [...sentence.matchAll(/⟨([^⟩]+)⟩/g)].map((m) => m[1]!.trim()).filter((name) => name.toLowerCase() !== game && !game.startsWith(name.toLowerCase()));
      const named = italics[0] ?? Object.values(REVIEWERS).find((name) => sentence.includes(name));
      if (named) return { text: cut(text, QUOTE.max), source: named };
      anonymous ??= { text: cut(text, QUOTE.max) };
    }
  }
  return anonymous;
}

// --- wikitext helpers --------------------------------------------------------------------------

/** The `{{…}}` starting at `start`, braces balanced, or null when it never closes. */
function balanced(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i++;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** `a | b {{c|d}} | [[e|f]]` split on the pipes outside nested templates and links. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (body[i] === '|' && depth === 0) {
      parts.push(body.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(body.slice(from));
  return parts;
}

/** Every template out, nested ones included (innermost first). */
function stripTemplates(text: string): string {
  let t = text;
  for (let guard = 0; guard < 20 && /\{\{[^{}]*\}\}/.test(t); guard++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  return t;
}

/** `[[Target|text]]` -> text, `[[Target]]` -> Target. */
function links(text: string): string {
  return text.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
}

const unmark = (s: string): string => s.replace(/[⟨⟩]/g, '');

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  return `${head.slice(0, Math.max(head.lastIndexOf(' '), max - 20)).replace(/[,;:\s]+$/, '')}…`;
}

// --- cache -------------------------------------------------------------------------------------

function cacheKey(title: string, platform: string, year: string): string {
  const slug = `${platform} ${title} ${year}`.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (slug || 'untitled').slice(0, 150);
}

/** A cached answer read back, or null when it is not one. */
function readReviews(data: unknown): Reviews | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Reviews>;
  if (d.article !== null && typeof d.article !== 'string') return null;
  const scores = Array.isArray(d.scores)
    ? d.scores.filter((s): s is ReviewScore => !!s && typeof s.source === 'string' && typeof s.score === 'string').slice(0, MAX_SCORES).map((s) => ({ source: s.source, score: s.score, ...(s.aggregate ? { aggregate: true } : {}) }))
    : [];
  const reviews: Reviews = { article: d.article, scores };
  if (typeof d.url === 'string') reviews.url = d.url;
  if (d.quote && typeof d.quote.text === 'string') reviews.quote = { text: d.quote.text, ...(typeof d.quote.source === 'string' ? { source: d.quote.source } : {}) };
  if (typeof d.summary === 'string') reviews.summary = d.summary;
  return reviews;
}

function strip(entry: CachedReviews): Reviews {
  return readReviews(entry) ?? { article: entry.article, scores: entry.scores };
}
