import type { IncomingMessage, ServerResponse } from 'node:http';
import { FameIndex, handleFame } from '../server/fame';
import { serveNode } from '../server/http';

/**
 * Vercel Node function: GET /api/fame?title=...&platform=... (same handler as server/famePlugin.ts).
 * `/tmp` only lives as long as the instance; the week-long `s-maxage` lets the CDN hold the answers.
 */
const index = new FameIndex('/tmp/fame');

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleFame(index, r), req, res);
}
