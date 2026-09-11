import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ApiRequest, type ApiResponse, json } from './http';

const API = 'https://api.github.com/repos/libretro-thumbnails';
const FOLDER = 'Named_Boxarts';
const SEGMENT = /^[A-Za-z0-9_.,'!()+ -]+$/; // repo names like Nintendo_-_Game_Boy; no slashes, no "..".
const TTL_MS = 7 * 24 * 3600 * 1000;
/** The contents API silently stops at 1000 entries; larger folders go through the trees API. */
const CONTENTS_LIMIT = 1000;

interface ContentsEntry { name: string; type: string }
interface TreeEntry { path: string; type: string }
interface TreeResponse { tree: TreeEntry[]; truncated: boolean }

/**
 * Lists the box art names of a libretro-thumbnails repository. Unauthenticated GitHub API calls are
 * limited to 60 per hour, so each listing is cached on disk for a week under `<dir>/<repo>.json`;
 * a stale copy is served when GitHub refuses the refresh.
 */
export class LibretroIndex {
  private readonly inflight = new Map<string, Promise<string[]>>();

  constructor(private readonly dir: string) {}

  /** `/<repo>` -> repo, or null if it is not a safe repository name. */
  static parsePath(pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    let repo: string;
    try {
      repo = decodeURIComponent(parts[0]!);
    } catch {
      return null;
    }
    if (!SEGMENT.test(repo) || repo.includes('..')) return null;
    return repo;
  }

  get(repo: string): Promise<string[]> {
    let pending = this.inflight.get(repo);
    if (!pending) {
      pending = this.resolve(repo).finally(() => this.inflight.delete(repo));
      this.inflight.set(repo, pending);
    }
    return pending;
  }

  private async resolve(repo: string): Promise<string[]> {
    const file = join(this.dir, `${repo}.json`);
    const cached = await readNames(file);
    const age = await ageOf(file);
    if (cached && age !== null && age < TTL_MS) return cached;

    try {
      const names = await fetchNames(repo);
      await mkdir(this.dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(names));
      await rename(tmp, file);
      return names;
    } catch (err) {
      if (cached) {
        console.warn(`[libretro-index] refresh failed for ${repo}, serving stale cache: ${String(err)}`);
        return cached;
      }
      throw err;
    }
  }
}

/**
 * GET /api/libretro/index/<repo> as a pure handler: the JSON array of box art names.
 * `req.url.pathname` must be the part after `/api/libretro/index` (the adapters strip the mount point).
 * A day on the CDN: listings change slowly and the client keeps its own copy per session.
 */
export async function handleLibretroIndex(index: LibretroIndex, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
  const repo = LibretroIndex.parsePath(req.url.pathname);
  if (!repo) return json(400, { error: 'expected /api/libretro/index/<repo>' });
  const names = await index.get(repo);
  return json(200, names, { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' });
}

async function fetchNames(repo: string): Promise<string[]> {
  const contents = await github<ContentsEntry[]>(`${API}/${repo}/contents/${FOLDER}`);
  if (!Array.isArray(contents)) throw new Error(`unexpected contents payload for ${repo}`);
  let files = contents.filter((e) => e.type === 'file').map((e) => e.name);
  if (contents.length >= CONTENTS_LIMIT) {
    const tree = await github<TreeResponse>(`${API}/${repo}/git/trees/master?recursive=1`);
    if (tree.truncated) console.warn(`[libretro-index] tree listing truncated for ${repo}`);
    files = tree.tree
      .filter((e) => e.type === 'blob' && e.path.startsWith(`${FOLDER}/`))
      .map((e) => e.path.slice(FOLDER.length + 1));
  }
  return files
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort((a, b) => a.localeCompare(b));
}

async function github<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'bibliothek-dev-server' },
  });
  if (!res.ok) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const hint = remaining === '0' ? ' (GitHub API rate limit reached, unauthenticated: 60/h)' : '';
    throw new Error(`GitHub ${res.status} for ${url}${hint}`);
  }
  return (await res.json()) as T;
}

async function readNames(path: string): Promise<string[] | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : null;
  } catch {
    return null;
  }
}

async function ageOf(path: string): Promise<number | null> {
  try {
    return Date.now() - (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
