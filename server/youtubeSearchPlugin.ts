import type { Plugin } from 'vite';
import { LongplaySearch, handleLongplaySearch } from './longplaySearch';
import { serveNode } from './http';

/**
 * Dev-server middleware exposing GET /api/youtube/search?q=...&title=...&platform=...
 * In production the same handler runs as a serverless function (api/youtube/search.ts).
 */
export function youtubeSearchApi(): Plugin {
  const search = new LongplaySearch();

  return {
    name: 'bibliothek:youtube-search',
    configureServer(server) {
      server.middlewares.use('/api/youtube/search', (req, res) => void serveNode((r) => handleLongplaySearch(search, r), req, res));
    },
  };
}
