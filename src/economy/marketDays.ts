import type { PlatformId } from '@/catalog/types';

/** What kind of day it is at the market. */
export type MarketDayKind = 'ordinary' | 'binDay' | 'nintendoFair' | 'segaSonyDay' | 'collectorsFair' | 'estateSale';

/** A market day's theme: its name and blurb, and what it changes to the stock. */
export interface MarketDayTheme {
  kind: MarketDayKind;
  /** Short title, for the poster and the chalkboard ("NINTENDO FAIR"). */
  title: string;
  /** One line on what it means for the player. */
  blurb: string;
  /** Extra ordinary copies per stall of these platforms (all platforms when the list is absent). */
  extraCopies?: { platforms?: readonly PlatformId[]; count: number };
  /** Multiplier on the day's market discount for these platforms (all when absent): below 1 is cheaper. */
  priceFactor?: { platforms?: readonly PlatformId[]; factor: number };
  /** Multiplier on the chance a stall copy is a first print. */
  firstPrintBoost?: number;
  /** The bargain bin: this many times its usual size, at this price factor. */
  bin?: { size: number; price: number };
  /** Every stall gets one more well-known title (a house clearance); `gems` more well-known titles hide in the bin. */
  estate?: { gems: number };
}

const NINTENDO: readonly PlatformId[] = ['nes', 'snes', 'gb', 'n64'];
const SEGA_SONY: readonly PlatformId[] = ['megadrive', 'ps1'];

const THEMES: Record<MarketDayKind, MarketDayTheme> = {
  ordinary: { kind: 'ordinary', title: 'MARKET DAY', blurb: 'The usual stalls, fresh crates.' },
  binDay: { kind: 'binDay', title: 'BIG BIN DAY', blurb: 'The bargain bin, twice as deep, at half price.', bin: { size: 2, price: 0.5 } },
  nintendoFair: {
    kind: 'nintendoFair',
    title: 'NINTENDO FAIR',
    blurb: 'Nintendo stalls heaped up and 10% cheaper.',
    extraCopies: { platforms: NINTENDO, count: 2 },
    priceFactor: { platforms: NINTENDO, factor: 0.9 },
  },
  segaSonyDay: {
    kind: 'segaSonyDay',
    title: 'SEGA & SONY DAY',
    blurb: 'Mega Drive and PlayStation stalls heaped up and 10% cheaper.',
    extraCopies: { platforms: SEGA_SONY, count: 3 },
    priceFactor: { platforms: SEGA_SONY, factor: 0.9 },
  },
  collectorsFair: {
    kind: 'collectorsFair',
    title: "COLLECTORS' FAIR",
    blurb: 'First prints everywhere. Prices to match.',
    firstPrintBoost: 3,
    priceFactor: { factor: 1.08 },
  },
  estateSale: {
    kind: 'estateSale',
    title: 'ESTATE SALE',
    blurb: 'A whole collection cleared out: a famous game on every stall, gems in the bin.',
    estate: { gems: 2 },
  },
};

/** The week's round, by market day: two quiet days between the special ones. */
const WEEK: readonly MarketDayKind[] = ['ordinary', 'binDay', 'nintendoFair', 'ordinary', 'segaSonyDay', 'collectorsFair', 'estateSale'];

/** What kind of day market day `day` is (the same for everyone, every reload). */
export function themeOf(day: number): MarketDayTheme {
  return THEMES[WEEK[((day % WEEK.length) + WEEK.length) % WEEK.length]!];
}

/** Whether `platform` is concerned by a platform-scoped change. */
export function appliesTo(scope: { platforms?: readonly PlatformId[] } | undefined, platform: PlatformId): boolean {
  return !!scope && (!scope.platforms || scope.platforms.includes(platform));
}
