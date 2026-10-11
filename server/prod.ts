import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ArtCache, handleArtRequest } from './artCache';
import { DiskArtStore } from './artStore';
import { FameIndex, handleFame } from './fame';
import { serveNode, type ApiRequest, type ApiResponse } from './http';
import { DiskLookupStore, handleLaunchBox, LaunchBoxIndex } from './launchbox';
import { handleLibretroIndex, LibretroIndex } from './libretroIndex';
import { handleLongplaySearch, LongplaySearch } from './longplaySearch';
import { handleReviews, ReviewIndex } from './reviews';
import { handleScanRequest, ScanCache } from './scanCache';

/**
 * Production API server for a self-hosted deploy: the same handlers and disk caches as the Vite dev
 * plugins, mounted on the same paths. The reverse proxy serves `dist/` and forwards `/api/` here.
 * Bundled by `npm run build:server` into `dist-server/prod.mjs`; caches live under `.cache/` in the cwd.
 */
const art = new ArtCache(new DiskArtStore('.cache/art'));
const launchBox = new LaunchBoxIndex(new DiskLookupStore('.cache/launchbox'));
const scans = new ScanCache(new DiskArtStore('.cache/scans'));
const fame = new FameIndex('.cache/fame');
const reviews = new ReviewIndex('.cache/reviews');
const longplays = new LongplaySearch();
const libretro = new LibretroIndex('.cache/libretro-index');

/** Mount point -> handler; like connect, the handler sees the path after the mount. Longest mounts first. */
const ROUTES: [string, (req: ApiRequest) => Promise<ApiResponse>][] = [
  ['/api/libretro/index', (r) => handleLibretroIndex(libretro, r)],
  ['/api/youtube/search', (r) => handleLongplaySearch(longplays, r)],
  ['/api/launchbox', (r) => handleLaunchBox(launchBox, r)],
  ['/api/reviews', (r) => handleReviews(reviews, r)],
  ['/api/scan', (r) => handleScanRequest(scans, r)],
  ['/api/fame', (r) => handleFame(fame, r)],
  ['/api/art', (r) => handleArtRequest(art, r)],
];

function route(req: IncomingMessage, res: ServerResponse): void {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  for (const [mount, handler] of ROUTES) {
    if (pathname === mount || pathname.startsWith(mount + '/')) {
      void serveNode(handler, req, res, pathname.slice(mount.length) || '/');
      return;
    }
  }
  res.statusCode = 404;
  res.end();
}

const port = Number(process.env.PORT ?? 5180);
createServer(route).listen(port, '127.0.0.1', () => console.log(`[bibliothek] api on 127.0.0.1:${port}`));
