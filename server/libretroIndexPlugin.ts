import type { Plugin } from 'vite';
import { LibretroIndex, handleLibretroIndex } from './libretroIndex';
import { serveNode } from './http';

/**
 * Dev-server middleware exposing GET /api/libretro/index/<repo>: the list of `Named_Boxarts`
 * file names (without `.png`) of a libretro-thumbnails repository, as a JSON array.
 * Listings come from the GitHub API and are cached under `.cache/libretro-index` (see LibretroIndex).
 * In production the same handler runs as a serverless function (api/libretro/index/[repo].ts).
 */
export function libretroIndexApi(cacheDir = '.cache/libretro-index'): Plugin {
  const index = new LibretroIndex(cacheDir);

  return {
    name: 'bibliothek:libretro-index',
    configureServer(server) {
      // connect strips the mount point, so req.url is already `/<repo>`.
      server.middlewares.use('/api/libretro/index', (req, res) => void serveNode((r) => handleLibretroIndex(index, r), req, res));
    },
  };
}
