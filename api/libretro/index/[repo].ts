import type { IncomingMessage, ServerResponse } from 'node:http';
import { LibretroIndex, handleLibretroIndex } from '../../../server/libretroIndex';
import { serveNode } from '../../../server/http';

/**
 * Vercel Node function: GET /api/libretro/index/<repo> (same handler as
 * server/libretroIndexPlugin.ts). `/tmp` is the only writable path on a function and only lives
 * as long as the instance, so the day-long `Cache-Control` lets the CDN hold the listing.
 */
const index = new LibretroIndex('/tmp/libretro-index');

type VercelRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

export default function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleLibretroIndex(index, r), req, res, repoPath(req));
}

/** `/<repo>` from Vercel's `[repo]` query when present, else from the URL after the mount point. */
function repoPath(req: VercelRequest): string {
  const q = req.query?.repo;
  if (typeof q === 'string') return '/' + encodeURIComponent(q);
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/libretro\/index/, '') || '/';
}
