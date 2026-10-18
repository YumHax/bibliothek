import type { Game } from '@/catalog/types';
import { unit01 } from '@/random';
import { formatCoins } from '@/text/money';

/*
 * Raymond at the WE BUY desk (`world/market/marketPlan` `clerks.buyBack`): what he says as he looks a copy over and
 * pays for it: pleased by a first print, amused by a bootleg, sniffy at a reproduction or a worn box. `{game}` is
 * the title, `{price}` the coins.
 */

export const DESK_BUYER = 'Raymond';

const LINES = {
  firstPrint: ['A first print! Now that’s a box. {price}, and I mean it.', 'Look at that, the first printing. {price}, happily.'],
  repro: ['A reproduction, I’m afraid: that’s all it’s worth. {price}.', 'Mm. The label’s wrong, see? A copy. {price}, and only because I’m nice.'],
  bootleg: ['Ha, a bootleg! I’ll find it a shelf. {price}.', 'Nobody made this one official, did they? {price}.'],
  worn: ['Been loved hard, this one. {price}.', 'The box has had a life. {price}, as it is.'],
  noManual: ['No manual? Shame. {price}.', 'The game and the box, no booklet. {price}.'],
  plain: ['{game}. Fair enough: {price}.', 'Right you are. {price} for {game}.', 'That’ll be on a stall by tomorrow. {price}.', '{price}, cash. Pleasure.', 'Good, clean copy. {price}.'],
} as const;

/** What Raymond says as he buys `game` for `price` (the same words for the same copy at the same price). */
export function buyerSays(game: Pick<Game, 'id' | 'title' | 'condition' | 'edition' | 'repro' | 'bootleg'>, price: number): string {
  const kind: keyof typeof LINES = game.repro ? 'repro' : game.bootleg ? 'bootleg' : game.edition === 'firstPrint' ? 'firstPrint' : game.condition === 'worn' ? 'worn' : game.condition === 'noManual' ? 'noManual' : 'plain';
  const lines = LINES[kind];
  return lines[Math.floor(unit01(`desk:${game.id}:${price}`) * lines.length)]!.replace('{price}', formatCoins(price)).replace('{game}', game.title);
}
