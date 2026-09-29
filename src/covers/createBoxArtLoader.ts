import { BrowserCache } from '@/persistence/BrowserCache';
import { KEYS } from '@/persistence/keys';
import { BoxArtLoader } from './BoxArtLoader';
import { CoverArtResolver } from './CoverArtProvider';
import { ImageFetch } from './ImageFetch';
import { LaunchBoxProvider } from './LaunchBoxProvider';
import { libretroMirrors, type LibretroCoverProvider } from './LibretroCoverProvider';
import { StaticArtProvider } from './StaticArtProvider';

/** Addresses answered "not found" are not asked again for a day, reloads included. */
const MISS_TTL_MS = 24 * 3600 * 1000;

/**
 * The box art as the game loads it: the baked files first (`StaticArtProvider`, the built-in
 * games), then libretro for the fronts and LaunchBox for the scans; images fetched with retries,
 * the GitHub mirror behind the art proxy, and the misses remembered.
 */
export function createBoxArtLoader(libretro: LibretroCoverProvider, maxAnisotropy: number): BoxArtLoader {
  const baked = new StaticArtProvider();
  const misses = new BrowserCache<1>({ key: KEYS.artMisses, maxEntries: 3000, ttlMs: MISS_TTL_MS, valid: (v) => v === 1 });
  return new BoxArtLoader(new CoverArtResolver([baked, libretro]), maxAnisotropy, {
    scans: new CoverArtResolver([baked, new LaunchBoxProvider()]),
    fetch: new ImageFetch({ mirrors: (url) => libretroMirrors(url), misses }),
  });
}
