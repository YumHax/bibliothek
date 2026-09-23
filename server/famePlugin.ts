import type { Plugin } from 'vite';
import { FameIndex, handleFame } from './fame';
import { serveNode } from './http';

/**
 * Dev-server middleware exposing GET /api/fame?title=...&platform=...: how well known a game is,
 * as its English Wikipedia article's monthly page views (see server/fame.ts). Answers are cached
 * under `.cache/fame` for a month. In production the same handler runs as a serverless function (api/fame.ts).
 */
export function fameApi(cacheDir = '.cache/fame'): Plugin {
  const index = new FameIndex(cacheDir);

  return {
    name: 'bibliothek:fame',
    configureServer(server) {
      server.middlewares.use('/api/fame', (req, res) => void serveNode((r) => handleFame(index, r), req, res));
    },
  };
}
