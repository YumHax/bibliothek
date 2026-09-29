import type { Platform, PlatformId } from './types';
import { defaultCaseOf } from './media';

export const PLATFORMS: Record<PlatformId, Platform> = {
  nes: {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    boxDimensions: defaultCaseOf('nes').dims,
    accentColor: 0x8a8a8a,
    libretroRepo: 'Nintendo_-_Nintendo_Entertainment_System',
  },
  snes: {
    id: 'snes',
    name: 'Super Nintendo Entertainment System',
    shortName: 'SNES',
    boxDimensions: defaultCaseOf('snes').dims,
    accentColor: 0x6f5fb5,
    libretroRepo: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  },
  gb: {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    boxDimensions: defaultCaseOf('gb').dims,
    accentColor: 0x9bbc0f,
    libretroRepo: 'Nintendo_-_Game_Boy',
  },
  megadrive: {
    id: 'megadrive',
    name: 'Sega Mega Drive / Genesis',
    shortName: 'Mega Drive',
    boxDimensions: defaultCaseOf('megadrive').dims,
    accentColor: 0x1b1b1b,
    libretroRepo: 'Sega_-_Mega_Drive_-_Genesis',
  },
  n64: {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    boxDimensions: defaultCaseOf('n64').dims,
    accentColor: 0xc8102e,
    libretroRepo: 'Nintendo_-_Nintendo_64',
  },
  ps1: {
    id: 'ps1',
    name: 'Sony PlayStation',
    shortName: 'PS1',
    boxDimensions: defaultCaseOf('ps1').dims,
    accentColor: 0x2e5aa8,
    libretroRepo: 'Sony_-_PlayStation',
  },
};

export function getPlatform(id: PlatformId): Platform {
  return PLATFORMS[id];
}

/** All platforms in display order (the order of declaration above). */
export const PLATFORM_LIST: readonly Platform[] = Object.values(PLATFORMS);
