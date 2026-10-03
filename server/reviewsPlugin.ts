import type { Plugin } from 'vite';
import { ReviewIndex, handleReviews } from './reviews';
import { serveNode } from './http';

/**
 * Dev-server middleware exposing GET /api/reviews?title=...&platform=...&year=...: the game's scores and
 * a quoted line from its English Wikipedia article's reception (see server/reviews.ts), cached under
 * `.cache/reviews` for a month. In production the same handler runs as a serverless function (api/reviews.ts).
 */
export function reviewsApi(cacheDir = '.cache/reviews'): Plugin {
  const index = new ReviewIndex(cacheDir);
  return {
    name: 'bibliothek:reviews',
    configureServer(server) {
      server.middlewares.use('/api/reviews', (req, res) => void serveNode((r) => handleReviews(index, r), req, res));
    },
  };
}
