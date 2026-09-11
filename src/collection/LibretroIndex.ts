import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import { parseNoIntroName } from '@/catalog/nointro';

/** One box art known to libretro-thumbnails for a platform. */
export interface IndexEntry {
  platform: PlatformId;
  /** Exact file name without extension — what goes in `externalIds.libretroName`. */
  name: string;
  title: string;
  region?: string;
}

export interface IndexMatch extends IndexEntry {
  score: number;
}

/** Variants that rarely correspond to a box on a shelf; they sort below the plain release. */
const NOISY_TAGS = /\((Beta|Proto|Demo|Sample|Unl|Pirate|Aftermarket|Kiosk|Virtual Console|Program|Promo|Alt[^)]*)\)/i;
/** Revisions and multi-disc entries are real releases, just less canonical than the plain name. */
const MINOR_TAGS = /\((Rev [^)]*|v\d[^)]*|Disc \d+)\)/i;
/** Hacks and translations are tagged in square brackets. */
const BRACKET_TAG = /\[/;
const PREFERRED_REGION = /\((USA|World|Europe)[,)]/;

/**
 * Client for `/api/libretro/index/<repo>` (see server/libretroIndex.ts). Each platform's list is
 * fetched once per page load and searched in memory with token scoring.
 */
export class LibretroIndex {
  private readonly cache = new Map<PlatformId, Promise<readonly IndexEntry[]>>();

  constructor(private readonly endpoint = '/api/libretro/index') {}

  load(platform: PlatformId): Promise<readonly IndexEntry[]> {
    let pending = this.cache.get(platform);
    if (!pending) {
      pending = this.fetch(platform).catch((err) => {
        this.cache.delete(platform); // let a later search retry
        throw err;
      });
      this.cache.set(platform, pending);
    }
    return pending;
  }

  /** Fuzzy-ranked matches for `query`, restricted to one platform or across all of them. */
  async search(query: string, platform?: PlatformId, limit = 40): Promise<IndexMatch[]> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const platforms = platform ? [platform] : PLATFORM_LIST.map((p) => p.id);
    const lists = await Promise.all(platforms.map((p) => this.load(p)));
    const matches: IndexMatch[] = [];
    for (const list of lists) {
      for (const entry of list) {
        const score = scoreEntry(entry, tokens, query);
        if (score > 0) matches.push({ ...entry, score });
      }
    }
    return matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
  }

  private async fetch(platform: PlatformId): Promise<readonly IndexEntry[]> {
    const repo = getPlatform(platform).libretroRepo;
    const res = await window.fetch(`${this.endpoint}/${encodeURIComponent(repo)}`);
    if (!res.ok) throw new Error(`libretro index ${res.status} for ${repo}`);
    const names = (await res.json()) as unknown;
    if (!Array.isArray(names)) throw new Error(`libretro index for ${repo}: unexpected payload`);
    return names
      .filter((n): n is string => typeof n === 'string')
      .map((name) => ({ platform, name, ...parseNoIntroName(name) }));
  }
}

function tokenize(text: string): string[] {
  return normalise(text).split(' ').filter(Boolean);
}

function normalise(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** 0 when a query token is missing; otherwise higher is better. */
function scoreEntry(entry: IndexEntry, tokens: string[], query: string): number {
  const title = normalise(entry.title);
  const words = title.split(' ');
  let score = 0;
  for (const token of tokens) {
    if (words.includes(token)) score += 3;
    else if (words.some((w) => w.startsWith(token))) score += 2;
    else if (title.includes(token)) score += 1;
    else return 0;
  }
  const q = normalise(query);
  if (title === q) score += 6;
  else if (title.startsWith(q)) score += 1.5;
  score -= Math.min(1, Math.max(0, words.length - tokens.length) * 0.2); // shorter titles first
  if (BRACKET_TAG.test(entry.name)) score -= 3;
  if (NOISY_TAGS.test(entry.name)) score -= 2;
  if (MINOR_TAGS.test(entry.name)) score -= 0.5;
  if (PREFERRED_REGION.test(entry.name)) score += 1.5;
  else if (entry.region === 'Japan') score -= 1;
  return score;
}
