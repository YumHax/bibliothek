import type { IncomingMessage, ServerResponse } from 'node:http';
import { LongplaySearch, handleLongplaySearch } from '../../server/longplaySearch';
import { serveNode } from '../../server/http';

/**
 * Vercel Node function: GET /api/youtube/search?q=...&title=...&platform=...
 * Same handler as the Vite dev middleware; the TTL cache lives as long as the instance is warm
 * and the `s-maxage` header lets the CDN absorb repeats across instances.
 */
const search = new LongplaySearch();

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleLongplaySearch(search, r), req, res);
}
