export type PlatformId = 'nes' | 'snes' | 'gb' | 'megadrive' | 'n64' | 'ps1';

/** Where a game stands in the collection: on the shelf, wanted, or out of the house. */
export type GameStatus = 'owned' | 'wishlist' | 'lent';

/**
 * Physical state of a second-hand copy: `complete` (box, manual, cartridge), `noManual` (the
 * booklet is gone), `worn` (a tired box, no manual). Absent means complete. Set by the market;
 * the shop only sells complete copies.
 */
export type BoxCondition = 'complete' | 'noManual' | 'worn';

/**
 * Which printing a copy is: a `firstPrint` (collectors pay more), the `standard` run, or a
 * `budget` re-release (Player's Choice, Greatest Hits...: cheaper). Absent means standard.
 */
export type Edition = 'firstPrint' | 'standard' | 'budget';

/** The receipt kept with a game: what it cost, where it came from, and on which market day. */
export interface Acquisition {
  /** Coins paid (0 for a swap with nothing added, a prize...). */
  price: number;
  /** Plain words: "the NES stall", "the bargain bin", "mail order", "a job lot", "a swap". */
  where: string;
  /** The market day it was bought on (see `MarketCalendar`). */
  day: number;
}

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
  /** State of the copy when it was bought second-hand (see `BoxCondition`); absent = complete. */
  condition?: BoxCondition;
  /** Which printing the copy is (see `Edition`); absent = standard. */
  edition?: Edition;
  /** True for a reproduction sold as the real thing (the market's fakes): worth next to nothing. */
  repro?: boolean;
  /** Where and for how much the player got it; absent for games from before receipts were kept. */
  acquired?: Acquisition;
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
