import type { Game } from '@/catalog/types';
import type { Views } from './Fame';
import { grailById } from './grails';
import { MARKET_DISCOUNT, REPRO_BUY_BACK, buyBackPrice, marketPrice } from './pricing';

/** The market's average day: halfway between its deepest and its shallowest discount. */
const AVERAGE_DISCOUNT = (MARKET_DISCOUNT.min + MARKET_DISCOUNT.max) / 2;

/** What a copy is worth, two ways: what a stall would ask for it on an average day, and what the WE BUY desk pays. */
export interface CopyValue {
  /** The collector's estimate: the market's asking price for this very copy (its state, its printing). */
  market: number;
  /** The WE BUY desk's offer, before any reputation bonus. */
  desk: number;
  /** False while the game's fame is not known yet (the estimate uses the ordinary fame). */
  priced: boolean;
}

/**
 * The value of one copy, from the market's own price model (`marketPrice`, `buyBackPrice`): no
 * second model. A grail is worth its grail price, a reproduction what the desk pays for a fake.
 */
export function copyValue(game: Game, views: Views): CopyValue {
  const grail = grailById(game.id);
  if (game.repro) return { market: REPRO_BUY_BACK, desk: REPRO_BUY_BACK, priced: true };
  if (grail) return { market: grail.price, desk: buyBackPrice(game, views), priced: true };
  return {
    market: marketPrice(game, views, game.condition ?? 'complete', AVERAGE_DISCOUNT, game.edition ?? 'standard'),
    desk: buyBackPrice(game, views),
    priced: views !== undefined,
  };
}

/** The copies a collection's value counts: owned or lent out, not the wishlist. */
export function valuedGames(games: readonly Game[]): Game[] {
  return games.filter((g) => g.status !== 'wishlist');
}

/** The whole collection's value, and how many of its games are still waiting for their fame. */
export function collectionValue(games: readonly Game[], viewsOf: (game: Game) => Views): { market: number; desk: number; pending: number } {
  let market = 0;
  let desk = 0;
  let pending = 0;
  for (const game of valuedGames(games)) {
    const value = copyValue(game, viewsOf(game));
    market += value.market;
    desk += value.desk;
    if (!value.priced) pending++;
  }
  return { market, desk, pending };
}

/** The `count` most valuable copies, best first (ties by title). */
export function mostValuable(games: readonly Game[], viewsOf: (game: Game) => Views, count: number): { game: Game; value: number }[] {
  return valuedGames(games)
    .map((game) => ({ game, value: copyValue(game, viewsOf(game)).market }))
    .sort((a, b) => b.value - a.value || a.game.title.localeCompare(b.game.title))
    .slice(0, count);
}
