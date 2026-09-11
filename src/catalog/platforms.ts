import type { Platform, PlatformId } from './types';

export const PLATFORMS: Record<PlatformId, Platform> = {
  nes: {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    // Real NES box: 5" x 7" x 1" (approx.).
    boxDimensions: { width: 0.127, height: 0.178, depth: 0.025 },
    accentColor: 0x8a8a8a,
    libretroRepo: 'Nintendo_-_Nintendo_Entertainment_System',
  },
  snes: {
    id: 'snes',
    name: 'Super Nintendo Entertainment System',
    shortName: 'SNES',
    // US cardboard box: 5" x 7" x 1.4" (approx.).
    boxDimensions: { width: 0.127, height: 0.178, depth: 0.035 },
    accentColor: 0x6f5fb5,
    libretroRepo: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  },
  gb: {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    // Small square cardboard box: 4" x 4" x 0.8" (approx.).
    boxDimensions: { width: 0.103, height: 0.103, depth: 0.02 },
    accentColor: 0x9bbc0f,
    libretroRepo: 'Nintendo_-_Game_Boy',
  },
  megadrive: {
    id: 'megadrive',
    name: 'Sega Mega Drive / Genesis',
    shortName: 'Mega Drive',
    // Plastic clamshell: 5.5" x 7.7" x 1.1" (approx.).
    boxDimensions: { width: 0.14, height: 0.195, depth: 0.028 },
    accentColor: 0x1b1b1b,
    libretroRepo: 'Sega_-_Mega_Drive_-_Genesis',
  },
  n64: {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    // US cardboard box, same footprint as SNES: 5" x 7" x 1.4" (approx.).
    boxDimensions: { width: 0.127, height: 0.178, depth: 0.035 },
    accentColor: 0xc8102e,
    libretroRepo: 'Nintendo_-_Nintendo_64',
  },
  ps1: {
    id: 'ps1',
    name: 'Sony PlayStation',
    shortName: 'PS1',
    // Standard CD jewel case: 142 x 125 x 10 mm.
    boxDimensions: { width: 0.142, height: 0.125, depth: 0.01 },
    accentColor: 0x2e5aa8,
    libretroRepo: 'Sony_-_PlayStation',
  },
};

export function getPlatform(id: PlatformId): Platform {
  return PLATFORMS[id];
}

/** All platforms in display order (the order of declaration above). */
export const PLATFORM_LIST: readonly Platform[] = Object.values(PLATFORMS);
