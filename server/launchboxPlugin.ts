import type { Plugin } from 'vite';
import { DiskArtStore } from './artStore';
import { serveNode } from './http';
import { DiskLookupStore, handleLaunchBox, LaunchBoxIndex } from './launchbox';
import { handleScanRequest, ScanCache } from './scanCache';

/**
 * Dev-server middleware for the LaunchBox scans: GET /api/launchbox/<platform>/<name> (the game's
 * manifest, cached under `.cache/launchbox`) and GET /api/scan/<kind>/<uuid>.<ext> (the images,
 * cached under `.cache/scans`). In production the same handlers run as serverless functions
 * (api/launchbox/[...path].ts, api/scan/[...path].ts).
 */
export function launchBoxApi(lookupDir = '.cache/launchbox', scanDir = '.cache/scans'): Plugin {
  const index = new LaunchBoxIndex(new DiskLookupStore(lookupDir));
  const scans = new ScanCache(new DiskArtStore(scanDir));

  return {
    name: 'bibliothek:launchbox',
    configureServer(server) {
      // connect strips the mount point, so req.url is already `/<platform>/<name>` or `/<kind>/<file>`.
      server.middlewares.use('/api/launchbox', (req, res) => void serveNode((r) => handleLaunchBox(index, r), req, res));
      server.middlewares.use('/api/scan', (req, res) => void serveNode((r) => handleScanRequest(scans, r), req, res));
    },
  };
}
