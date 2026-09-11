import type { IncomingMessage, ServerResponse } from 'node:http';
import { ArtCache, handleArtRequest } from '../../server/artCache';
import { MemoryArtStore } from '../../server/artStore';
import { serveNode } from '../../server/http';

/**
 * Vercel Node function: GET /api/art/<repo>/<folder>/<file>.png
 * Serverless disks are ephemeral, so the store is in-memory (per warm instance) and the
 * one-year `Cache-Control` lets Vercel's CDN keep the images instead.
 */
const cache = new ArtCache(new MemoryArtStore());

type VercelRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

export default function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleArtRequest(cache, r), req, res, artPath(req));
}

/** The part after `/api/art`, from Vercel's `[...path]` query when present, else from the URL. */
function artPath(req: VercelRequest): string {
  const q = req.query?.path;
  const segments = Array.isArray(q) ? q : typeof q === 'string' ? q.split('/') : null;
  if (segments) return '/' + segments.map(encodeURIComponent).join('/');
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/art/, '') || '/';
}
