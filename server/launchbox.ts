import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type ApiRequest, type ApiResponse, json } from './http';
import { PoliteFetcher, UpstreamPaused } from './politeFetch';
import { parseNoIntroName } from '../src/catalog/nointro';

/**
 * The LaunchBox Games Database (public, no key): the one key-less place with scans of box backs,
 * spines, cartridges and discs. It has no API, so a game is found through its search page and
 * its images page, both parsed here; all of that fragile parsing lives in this file. A lookup is
 * two page loads, asked one at a time a second apart (`PoliteFetcher`), and remembered for a month.
 */

const SITE = 'https://gamesdb.launchbox-app.com';
const USER_AGENT = 'bibliothek (game collection room; box art, one request a second)';

/** Our platform ids -> LaunchBox's platform names, as its search cards print them. */
const LAUNCHBOX_PLATFORMS: Record<string, string> = {
  nes: 'Nintendo Entertainment System',
  snes: 'Super Nintendo Entertainment System',
  gb: 'Nintendo Game Boy',
  megadrive: 'Sega Genesis',
  n64: 'Nintendo 64',
  ps1: 'Sony Playstation',
};

export type ScanKind = 'back' | 'spine' | 'cart' | 'disc';
export const SCAN_KINDS: readonly ScanKind[] = ['back', 'spine', 'cart', 'disc'];
type ScanRegion = 'na' | 'eu' | 'jp';

/** One scan on the images page: its kind, the region printed next to it ('' when none), the file. */
interface ScanImage {
  kind: ScanKind;
  region: string;
  uuid: string;
  ext: string;
  width: number;
  height: number;
}

/** What a lookup found: the LaunchBox game (null: none matched) and its scans. */
interface Lookup {
  id: number | null;
  title?: string;
  images: ScanImage[];
}

/** What the client gets: one URL per kind (our `/api/scan` proxy), and the region it was printed for. */
type Manifest = { id: number | null; title?: string } & Partial<Record<ScanKind, string>> & Partial<Record<`${ScanKind}Region`, string>>;

/** The host is shared by everything asking: module-level, so two caches in one process still take turns. */
const SITE_FETCHER = new PoliteFetcher({
  gapMs: 1000,
  concurrency: 1,
  timeoutMs: 20_000,
  retryDelaysMs: [2000, 6000],
  breakAfter: 3,
  pauseMs: 5 * 60_000,
  userAgent: USER_AGENT,
});

const HIT_TTL_MS = 30 * 24 * 3600 * 1000;
const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
/** A lookup gives up past this, queue included: under the serverless function's 20 s. */
const LOOKUP_BUDGET_MS = 14_000;
/** Below this likeness no search result is the game. */
const MATCH_THRESHOLD = 0.6;

const HIT_CACHE_CONTROL = 'public, max-age=86400, s-maxage=2592000';
const MISS_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';

// --- Store -----------------------------------------------------------------------------------

interface StoredLookup {
  value: Lookup;
  /** When it was fetched (epoch ms). */
  at: number;
}

interface LookupStore {
  read(key: string): Promise<StoredLookup | null>;
  write(key: string, entry: StoredLookup): Promise<void>;
}

/** JSON files under `dir`: `<platform>/<name>.json`. */
export class DiskLookupStore implements LookupStore {
  constructor(private readonly dir: string) {}

  async read(key: string): Promise<StoredLookup | null> {
    try {
      const entry = JSON.parse(await readFile(this.file(key), 'utf8')) as StoredLookup;
      return typeof entry.at === 'number' && Array.isArray(entry.value?.images) ? entry : null;
    } catch {
      return null;
    }
  }

  async write(key: string, entry: StoredLookup): Promise<void> {
    try {
      const file = this.file(key);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, file);
    } catch (err) {
      console.warn(`[launchbox] could not cache ${key}: ${String(err)}`);
    }
  }

  private file(key: string): string {
    return join(this.dir, `${key}.json`);
  }
}

/** Serverless: a bounded map per warm instance; the CDN holds the answers. */
export class MemoryLookupStore implements LookupStore {
  private readonly entries = new Map<string, StoredLookup>();

  constructor(private readonly max = 3000) {}

  async read(key: string): Promise<StoredLookup | null> {
    return this.entries.get(key) ?? null;
  }

  async write(key: string, entry: StoredLookup): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
  }
}

// --- Index -----------------------------------------------------------------------------------

/**
 * Finds games on LaunchBox and remembers what was found: a match for 30 days, no match for 7,
 * concurrent identical lookups share one promise, and a refresh that fails serves the old answer.
 */
export class LaunchBoxIndex {
  private readonly inflight = new Map<string, Promise<Lookup>>();

  constructor(
    private readonly store: LookupStore,
    private readonly fetcher: PoliteFetcher = SITE_FETCHER,
  ) {}

  /** `name` is the libretro (No-Intro) name when the game has one, else its title. */
  lookup(platform: string, name: string, deadline = Date.now() + LOOKUP_BUDGET_MS): Promise<Lookup> {
    const key = `${platform}/${fileSafe(name)}`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.resolve(key, platform, name, deadline).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async resolve(key: string, platform: string, name: string, deadline: number): Promise<Lookup> {
    const cached = await this.store.read(key);
    if (cached && Date.now() - cached.at < (cached.value.id === null ? MISS_TTL_MS : HIT_TTL_MS)) return cached.value;
    try {
      const value = await this.fetchLookup(platform, name, deadline);
      await this.store.write(key, { value, at: Date.now() });
      return value;
    } catch (err) {
      if (cached) return cached.value; // stale beats nothing
      throw err;
    }
  }

  private async fetchLookup(platform: string, name: string, deadline: number): Promise<Lookup> {
    const platformName = LAUNCHBOX_PLATFORMS[platform];
    if (!platformName) return { id: null, images: [] };
    const title = parseNoIntroName(name).title;
    // The full title first, then the part before a subtitle ("Zelda II: The Adventure of Link" -> "Zelda II").
    const queries = [...new Set([title, title.split(/:\s| - /)[0]!.trim()])].filter((q) => q.length >= 2);
    for (const query of queries) {
      // The platform narrows the results (loosely: SNES games come with NES ones), so the real game is not crowded out by hacks.
      const page = await this.page(`${SITE}/games/results/${encodeURIComponent(query)}?platform=${encodeURIComponent(platformName)}`, deadline);
      const match = bestMatch(parseSearch(page).filter((c) => c.platform === platformName), title);
      if (!match) continue;
      const images = parseImages(await this.page(`${SITE}/games/images/${match.id}`, deadline));
      return { id: match.id, title: match.title, images };
    }
    return { id: null, images: [] };
  }

  private async page(url: string, deadline: number): Promise<string> {
    const response = await this.fetcher.fetch(url, deadline);
    if (!response.ok) throw new Error(`launchbox ${response.status} for ${url}`);
    return response.text();
  }
}

// --- Parsing ---------------------------------------------------------------------------------

interface Candidate {
  id: number;
  title: string;
  platform: string;
}

/** The search page's cards: `href="/games/details/<id>-slug"` ... `<h3>title</h3><p>platform</p>`. */
function parseSearch(html: string): Candidate[] {
  const out: Candidate[] = [];
  const card = /href="\/games\/details\/(\d+)[^"]*"[\s\S]*?<h3[^>]*>([^<]*)<\/h3>\s*<p[^>]*>([^<]*)<\/p>/g;
  for (const m of html.matchAll(card)) out.push({ id: Number(m[1]), title: decodeEntities(m[2]!.trim()), platform: decodeEntities(m[3]!.trim()) });
  return out;
}

const IMAGE_HREF = /^https:\/\/images\.launchbox-app\.com\/([0-9a-f-]{36})\.(png|jpe?g)$/i;
const IMAGE_TYPE = /(Box - Back|Box - Spine|Cart - Front|Disc)(?: Image)?(?: \(([^)]*)\))?$/;
const KIND_OF_TYPE: Record<string, ScanKind> = { 'Box - Back': 'back', 'Box - Spine': 'spine', 'Cart - Front': 'cart', Disc: 'disc' };

/** The images page's lightbox anchors: the full-size file, "<game> - <type> Image (<region>)", "800 x 1123 JPEG". */
function parseImages(html: string): ScanImage[] {
  const out: ScanImage[] = [];
  for (const [tag] of html.matchAll(/<a\b[^>]*data-toggle="lightbox"[^>]*>/g)) {
    const href = /href="([^"]*)"/.exec(tag)?.[1];
    const title = decodeEntities(/data-title="([^"]*)"/.exec(tag)?.[1] ?? '');
    const file = href ? IMAGE_HREF.exec(href) : null;
    const type = IMAGE_TYPE.exec(title);
    if (!file || !type) continue;
    // The footer holds markup of its own: the tag match stops inside it, but its size comes first.
    const size = /data-footer="(\d+) x (\d+)/.exec(tag);
    out.push({
      kind: KIND_OF_TYPE[type[1]!]!,
      region: type[2] ?? '',
      uuid: file[1]!.toLowerCase(),
      ext: file[2]!.toLowerCase() === 'png' ? 'png' : 'jpg',
      width: size ? Number(size[1]) : 0,
      height: size ? Number(size[2]) : 0,
    });
  }
  return out;
}

/** The candidate most like `title`: the same words first, else the most words in common; ties go to the oldest entry. */
function bestMatch(candidates: readonly Candidate[], title: string): Candidate | null {
  const want = normalise(title);
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const got = normalise(c.title);
    const score = got === want ? 1 : likeness(want, got);
    if (score > bestScore || (score === bestScore && best && c.id < best.id)) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

/** Lower case, no accents, "&" as "and", no leading "the", punctuation as spaces. */
function normalise(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/, the\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

/** Dice coefficient of the two titles' words. */
function likeness(a: string, b: string): number {
  const wa = a.split(' ');
  const wb = new Set(b.split(' '));
  if (!wa.length || !wb.size) return 0;
  const common = wa.filter((w) => wb.has(w)).length;
  return (2 * common) / (wa.length + wb.size);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** A name as a file name: no path separators, no oddities, not too long. */
function fileSafe(name: string): string {
  return name.replace(/[^A-Za-z0-9 ,.'!()+_-]/g, '_').replace(/\.\.+/g, '_').slice(0, 180);
}

// --- Choosing the scans ----------------------------------------------------------------------

/** The regions a copy's scans may come from, best first; '' is a scan with no region given. */
const REGION_PREFERENCE: Record<ScanRegion, readonly string[]> = {
  na: ['North America', 'United States', 'Canada', 'World', ''],
  eu: ['Europe', 'United Kingdom', 'Australia', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Sweden', 'Scandinavia', 'World', ''],
  jp: ['Japan', 'World', ''],
};

/**
 * One scan per kind for a copy of `region`. Backs and spines carry the copy's own print, so they
 * come from its region; failing that, a North American print stands in for a European one and
 * the other way round (the same English text, mostly), never a Japanese one for either, nor a
 * Western one for a Japanese copy. A cartridge or a disc looks alike everywhere: any region will do
 * last. Within a region the smallest scan that is sharp enough wins (else the largest).
 */
function manifestFor(lookup: Lookup, region: ScanRegion): Manifest {
  const manifest: Manifest = { id: lookup.id };
  if (lookup.title) manifest.title = lookup.title;
  const western = region === 'na' ? REGION_PREFERENCE.eu : region === 'eu' ? REGION_PREFERENCE.na : [];
  for (const kind of SCAN_KINDS) {
    const printed = kind === 'back' || kind === 'spine';
    const order = [...REGION_PREFERENCE[region], ...western];
    const pick = choose(lookup.images.filter((i) => i.kind === kind), order, !printed);
    if (!pick) continue;
    manifest[kind] = `/api/scan/${kind}/${pick.uuid}.${pick.ext}`;
    manifest[`${kind}Region`] = pick.region;
  }
  return manifest;
}

function choose(images: readonly ScanImage[], order: readonly string[], anyLast: boolean): ScanImage | null {
  const rank = (i: ScanImage) => {
    const at = order.indexOf(i.region);
    return at >= 0 ? at : anyLast ? order.length : -1;
  };
  let best: ScanImage | null = null;
  for (const image of images) {
    const r = rank(image);
    if (r < 0) continue;
    if (!best || r < rank(best) || (r === rank(best) && handier(image, best))) best = image;
  }
  return best;
}

/** Scans are served at 1024 px at most: past this, a bigger file is only a slower download (some are 4 MB). */
const ENOUGH_PX = 1100;

/** The smallest scan big enough, else the biggest there is. */
function handier(a: ScanImage, b: ScanImage): boolean {
  const big = (i: ScanImage) => Math.max(i.width, i.height) >= ENOUGH_PX;
  if (big(a) !== big(b)) return big(a);
  return big(a) ? a.width * a.height < b.width * b.height : a.width * a.height > b.width * b.height;
}

// --- Handler ---------------------------------------------------------------------------------

/**
 * GET /api/launchbox/<platform>/<name>?region=na|eu|jp as a pure handler: the game's `Manifest`.
 * `req.url.pathname` is the part after `/api/launchbox`. While LaunchBox is left alone (it kept
 * failing) the answer is a quick 503 with Retry-After: the client keeps its generated art.
 */
export async function handleLaunchBox(index: LaunchBoxIndex, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
  const parts = req.url.pathname.split('/').filter(Boolean);
  const platform = parts[0] ?? '';
  let name: string;
  try {
    name = decodeURIComponent(parts.slice(1).join('/')).trim();
  } catch {
    return json(400, { error: 'bad name' });
  }
  if (!LAUNCHBOX_PLATFORMS[platform] || !name || name.length > 200) return json(400, { error: 'expected /api/launchbox/<platform>/<name>' });
  const asked = req.url.searchParams.get('region');
  const region: ScanRegion = asked === 'eu' || asked === 'jp' || asked === 'na' ? asked : regionOfName(name);
  try {
    const lookup = await index.lookup(platform, name);
    return json(200, manifestFor(lookup, region), { 'Cache-Control': lookup.id === null ? MISS_CACHE_CONTROL : HIT_CACHE_CONTROL });
  } catch (err) {
    if (err instanceof UpstreamPaused) {
      return json(503, { error: err.message }, { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)), 'Cache-Control': 'no-store' });
    }
    throw err; // a 502, not cached (serveNode)
  }
}

/** The region of a No-Intro name, for a caller that did not say. */
function regionOfName(name: string): ScanRegion {
  const region = parseNoIntroName(name).region ?? '';
  const first = region.split(',')[0]!.trim();
  if (first === 'Japan' || first === 'Asia' || first === 'Korea') return 'jp';
  if (first === '' || first === 'USA' || first === 'World' || first === 'Canada' || first === 'Brazil') return 'na';
  return 'eu';
}
