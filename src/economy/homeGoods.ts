import type { HomeUpgrade } from './HomeUpgrades';
import { BOOKCASE_PRICE, HOME_GOOD_PRICES } from './pricing';

/** One piece of furniture the flat can be sold: what a market stall lists, and what the flat shows once bought. */
export interface HomeGood {
  id: HomeUpgrade;
  name: string;
  /** Coins. */
  price: number;
  blurb: string;
  /** Whether it can be bought again (bookcases stack; the rest is one of a kind). */
  repeatable: boolean;
}

/**
 * What can be bought for the flat. A market stall reads this list and calls `HomeUpgrades.add(id)`;
 * where each piece stands once bought is in the flat's plan files (`homeGoods` slots).
 */
export const HOME_GOODS: readonly HomeGood[] = [
  { id: 'bookcase', name: 'Bookcase', price: BOOKCASE_PRICE, blurb: 'Flat-pack pine, 40 boxes. Goes up in the bedroom.', repeatable: true },
  { id: 'rug', name: 'Kilim rug', price: HOME_GOOD_PRICES.rug, blurb: 'Hand-woven, a little faded. For the hallway.', repeatable: false },
  { id: 'lamp', name: 'Lava lamp', price: HOME_GOOD_PRICES.lamp, blurb: 'Orange wax, warms up slowly. Sits on the side table by the TV.', repeatable: false },
  { id: 'poster', name: 'Framed game poster', price: HOME_GOOD_PRICES.poster, blurb: 'A shop display poster from the nineties, for the hallway.', repeatable: false },
  { id: 'crt', name: 'Portable CRT', price: HOME_GOOD_PRICES.crt, blurb: 'A 14-inch set for the kitchen: longplays while the kettle boils.', repeatable: false },
];

export function homeGood(id: HomeUpgrade): HomeGood {
  const good = HOME_GOODS.find((g) => g.id === id);
  if (!good) throw new Error(`unknown home good ${id}`);
  return good;
}
