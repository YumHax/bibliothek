import type { Plugin } from 'vite';
import { ArtCache, handleArtRequest } from './artCache';
import { DiskArtStore } from './artStore';
import { serveNode } from './http';

/**
 * Dev-server middleware exposing GET /api/art/<repo>/<folder>/<file>.png, a caching proxy
 * for libretro-thumbnails (see ArtCache). Images are stored under `.cache/art`.
 * In production the same handler runs as a serverless function (api/art/[...path].ts).
 */
export function artCacheApi(cacheDir = '.cache/art'): Plugin {
  const cache = new ArtCache(new DiskArtStore(cacheDir));

  return {
    name: 'bibliothek:art-cache',
    configureServer(server) {
      // connect strips the mount point, so req.url is already `/<repo>/<folder>/<file>`.
      server.middlewares.use('/api/art', (req, res) => void serveNode((r) => handleArtRequest(cache, r), req, res));
    },
  };
}
