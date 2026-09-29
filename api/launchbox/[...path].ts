import type { IncomingMessage, ServerResponse } from 'node:http';
import { serveNode } from '../../server/http';
import { handleLaunchBox, LaunchBoxIndex, MemoryLookupStore } from '../../server/launchbox';

/**
 * Vercel Node function: GET /api/launchbox/<platform>/<name>?region=na|eu|jp (see server/launchbox.ts).
 * The memory store only absorbs repeats within a warm instance; the month-long `s-maxage` lets the CDN keep the answers.
 */
const index = new LaunchBoxIndex(new MemoryLookupStore());

type VercelRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

export default function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleLaunchBox(index, r), req, res, pathAfter(req, '/api/launchbox'));
}

/** The part after the mount point, from Vercel's `[...path]` query when present, else from the URL. */
function pathAfter(req: VercelRequest, mount: string): string {
  const q = req.query?.path;
  const segments = Array.isArray(q) ? q : typeof q === 'string' ? q.split('/') : null;
  if (segments) return '/' + segments.map(encodeURIComponent).join('/');
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  return pathname.slice(mount.length) || '/';
}
