#!/usr/bin/env node
/**
 * Bakes the built-in games' box art into public/boxart, so they need no API at all:
 * `public/boxart/<platform>/<slug>/{front,back,spine,cart,disc}.webp` (whatever exists) and
 * `public/boxart/index.json` (`StaticArtProvider` reads it). The fronts come from libretro, the
 * rest from LaunchBox, through the very same server code the dev API runs (loaded with Vite's
 * SSR loader): the same polite throttle (LaunchBox a second apart), the same disk caches under
 * `.cache/`, so a second run asks nobody anything. Resumable: what is baked already is kept.
 *
 *   npm run bake-art            # every seed game
 *   npm run bake-art -- --force # bake again what exists
 */
import { mkdir, readdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/boxart');
const KINDS = ['front', 'back', 'spine', 'cart', 'disc'];
const force = process.argv.includes('--force');

const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': join(ROOT, 'src') } },
});

try {
  const load = (path) => vite.ssrLoadModule(path);
  const { SEED_GAMES } = await load('/src/catalog/index.ts');
  const { regionOf } = await load('/src/catalog/media.ts');
  const { slugify } = await load('/src/catalog/nointro.ts');
  const { getPlatform } = await load('/src/catalog/platforms.ts');
  const { sanitizeLibretroName } = await load('/src/covers/LibretroCoverProvider.ts');
  const { LaunchBoxIndex, DiskLookupStore, manifestFor } = await load('/server/launchbox.ts');
  const { ScanCache } = await load('/server/scanCache.ts');
  const { ArtCache } = await load('/server/artCache.ts');
  const { DiskArtStore } = await load('/server/artStore.ts');

  const index = new LaunchBoxIndex(new DiskLookupStore(join(ROOT, '.cache/launchbox')));
  const scans = new ScanCache(new DiskArtStore(join(ROOT, '.cache/scans')));
  const fronts = new ArtCache(new DiskArtStore(join(ROOT, '.cache/art')));

  const games = SEED_GAMES.filter((g) => g.externalIds?.libretroName);
  const baked = {};
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let n = 0;
  for (const game of games) {
    n++;
    const name = game.externalIds.libretroName;
    const dir = `${game.platform}/${slugify(name)}`;
    const folder = join(OUT, dir);
    await mkdir(folder, { recursive: true });
    const sources = {};
    sources.front = () => fronts.get({ repo: getPlatform(game.platform).libretroRepo, folder: 'Named_Boxarts', file: `${sanitizeLibretroName(name)}.png` });
    const missing = KINDS.filter((k) => k !== 'front');
    const need = force || (await Promise.all(missing.map((k) => exists(join(folder, `${k}.webp`))))).some((e) => !e);
    if (need) {
      try {
        const manifest = manifestFor(await index.lookup(game.platform, name, Infinity), regionOf(game));
        for (const kind of missing) {
          const url = manifest[kind];
          const parsed = url ? ScanCache.parsePath(url.slice('/api/scan'.length)) : null;
          if (parsed) sources[kind] = () => scans.get(parsed);
        }
        if (manifest.id === null) console.log(`  no LaunchBox match for ${name}`);
      } catch (err) {
        console.warn(`  LaunchBox lookup failed for ${name}: ${err.message ?? err}`);
      }
    }
    for (const [kind, get] of Object.entries(sources)) {
      const file = join(folder, `${kind}.webp`);
      if (!force && (await exists(file))) continue;
      try {
        const art = await get();
        if (art.status !== 200) continue;
        const body = art.contentType === 'image/webp' ? art.body : await sharp(art.body).webp({ quality: 82 }).toBuffer();
        await writeFile(file, body);
      } catch (err) {
        console.warn(`  ${kind} failed for ${name}: ${err.message ?? err}`);
      }
    }
    const files = (await readdir(folder)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).filter((k) => KINDS.includes(k));
    for (const k of files) counts[k]++;
    if (files.length) baked[`${game.platform}/${name}`] = { dir, files };
    console.log(`[${n}/${games.length}] ${game.platform} ${name}: ${files.join(', ') || 'nothing'}`);
  }

  await writeFile(join(OUT, 'index.json'), JSON.stringify({ version: 1, games: baked }, null, 1) + '\n');
  console.log(`baked ${Object.keys(baked).length} games:`, counts);
} finally {
  await vite.close();
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
