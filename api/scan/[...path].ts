import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryArtStore } from '../../server/artStore';
import { serveNode } from '../../server/http';
import { handleScanRequest, ScanCache } from '../../server/scanCache';

/** Vercel Node function: GET /api/scan/<kind>/<uuid>.<ext> (see server/scanCache.ts); the year-long `Cache-Control` lets the CDN keep the images. */
const cache = new ScanCache(new MemoryArtStore());

type VercelRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

export default function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleScanRequest(cache, r), req, res, scanPath(req));
}

function scanPath(req: VercelRequest): string {
  const q = req.query?.path;
  const segments = Array.isArray(q) ? q : typeof q === 'string' ? q.split('/') : null;
  if (segments) return '/' + segments.map(encodeURIComponent).join('/');
  return new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/api\/scan/, '') || '/';
}
