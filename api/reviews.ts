import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReviewIndex, handleReviews } from '../server/reviews';
import { serveNode } from '../server/http';

/** Vercel Node function: GET /api/reviews?title=...&platform=...&year=... (same handler as server/reviewsPlugin.ts). */
const index = new ReviewIndex('/tmp/reviews');

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return serveNode((r) => handleReviews(index, r), req, res);
}
