export type PlatformId = 'nes' | 'snes' | 'gb' | 'megadrive' | 'n64' | 'ps1';

/** Where a game stands in the collection: on the shelf, wanted, or out of the house. */
export type GameStatus = 'owned' | 'wishlist' | 'lent';

/** Physical box size in metres (width, height, depth) — drives the 3D geometry. */
export interface BoxDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface Platform {
  id: PlatformId;
  name: string;
  shortName: string;
  boxDimensions: BoxDimensions;
  /** Accent colour used for spines / placeholders. */
  accentColor: number;
  /** Repository name in the libretro-thumbnails GitHub organisation. */
  libretroRepo: string;
}

export interface Game {
  id: string;
  title: string;
  platform: PlatformId;
  /** ISO date (YYYY-MM-DD) or just a year (YYYY) when the day is unknown. */
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  region?: string;
  description?: string;
  /** Defaults to 'owned' when absent. */
  status?: GameStatus;
  /** ISO 8601 timestamp of when the game entered the collection. */
  addedAt?: string;
  /**
   * Identifiers used by cover-art providers. Each provider reads the key it cares about;
   * a missing key means the provider falls back to a title-based guess or a placeholder.
   */
  externalIds?: {
    /** No-Intro style name used by libretro-thumbnails (without extension). */
    libretroName?: string;
    igdbId?: number;
    theGamesDbId?: number;
  };
}
