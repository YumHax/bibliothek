import type { Game, Platform } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { collectionValue, mostValuable, valuedGames } from '@/economy/collectionValue';
import type { Views } from '@/economy/Fame';
import { isGrail } from '@/economy/grails';

/** What the shared card and page say about the collection: its games, per platform, its worth, its pride. */
export interface CollectionSummary {
  /** Owned and lent out (not the wishlist), by platform then title. */
  games: Game[];
  platforms: { platform: Platform; count: number }[];
  /** The market's estimate of the whole (`collectionValue`), in coins. */
  value: number;
  /** The most valuable copies, best first; `grail` for one of the market's grails. */
  pride: { game: Game; value: number; grail: boolean }[];
  /** How many games wait in the parcel or the wishlist holds (said, not shown). */
  wished: number;
}

const PRIDE = 3;

export function summarise(all: readonly Game[], viewsOf: (game: Game) => Views): CollectionSummary {
  const games = valuedGames(all).sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  const platforms = PLATFORM_LIST.map((platform) => ({ platform, count: games.filter((g) => g.platform === platform.id).length })).filter((p) => p.count > 0);
  const pride = mostValuable(games, viewsOf, PRIDE).map(({ game, value }) => ({ game, value, grail: isGrail(game.id) }));
  return { games, platforms, value: collectionValue(games, viewsOf).market, pride, wished: all.length - games.length };
}

const order = (game: Game): number => PLATFORM_LIST.findIndex((p) => p.id === game.platform);
