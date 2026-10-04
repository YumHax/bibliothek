/*
 * THE FIRST DAY'S STEPS, in order: the to-do list on the hall console (`ToDoNote`), with the tip a
 * zone shows for the first step not done yet. Each (step, zone) tip shows once a visit, a few visits at most; a step is done by
 * what the stores and the zones say (`FirstDay`), never by a timer.
 */

import { actionKeyLabel } from '@/ui/keys';
import { useVerbOn, useVerbOnCap } from '@/ui/verb';
import { BARGAIN_PRICE, HOME_GOOD_PRICES, TICKETS_PER_COIN } from '@/economy/pricing';
import { SHOP_HOURS } from '@/world/street/shops/shopHours';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';

/** The flat's shops' hours, as the tips say them ("9:00 to 21:00"). */
const FLAT_SHOPS_HOURS = `${clockShort(SHOP_HOURS.furniture?.open ?? 9)} to ${clockShort(SHOP_HOURS.furniture?.close ?? 21)}`;

export type FirstDayStepId = 'note' | 'out' | 'arcade' | 'play' | 'redeem' | 'market' | 'buy' | 'unpack' | 'shelf';

interface FirstDayStep {
  id: FirstDayStepId;
  /** The line on the to-do list, in the player's own hand. */
  todo: string;
  /** What the HUD says in a zone (by id) while this is the first step not done; a function when it names keys (they follow the bindings and the layout). */
  tips: Partial<Record<string, string | (() => string)>>;
}

/** A step's tip in `zone`, keys named as the player's keyboard prints them. */
export function tipText(step: FirstDayStep, zone: string): string | undefined {
  const tip = step.tips[zone];
  return typeof tip === 'function' ? tip() : tip;
}

/** The flat's rooms, where the first tip may show. */
const FLAT_ROOMS = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony'];
const everywhereAtHome = (text: string): Partial<Record<string, string>> => Object.fromEntries(FLAT_ROOMS.map((id) => [id, text]));

export const FIRST_DAY_STEPS: readonly FirstDayStep[] = [
  {
    id: 'note',
    todo: 'Read this list (done!)',
    tips: everywhereAtHome('New flat, bare walls: one bookcase, one game, the TV. Your to-do list is on the hall console, by the keys.'),
  },
  {
    id: 'out',
    todo: 'Keys from the bowl, out the front door',
    tips: {
      hallway: 'Take the keys from the bowl on the console, then the front door at the end of the corridor.',
      living: 'Through the door to the hallway: keys in the bowl on the console, then out.',
    },
  },
  {
    id: 'arcade',
    todo: 'Find the arcade on Front Street',
    tips: {
      stairwell: 'Down the stairs (or the lift): the street door is in the entrance hall.',
      street: 'The arcade is on our side of the street, a few doors along from ours, under the neon. It never closes. The fingerpost by our door and the street plan on the wall point the way to everything.',
    },
  },
  {
    id: 'play',
    todo: 'Play something: good scores pay tickets',
    tips: { arcade: () => `${useVerbOnCap('a machine')} to put a coin in. Good scores pay tickets; ${actionKeyLabel('walkAway')} walks away.` },
  },
  {
    id: 'redeem',
    todo: `Tickets → ${formatCoins(BARGAIN_PRICE)} at the prize counter`,
    tips: { arcade: `Tickets in your pocket: the prize counter swaps them for coins (${TICKETS_PER_COIN} a coin), or for prizes. About ${formatCoins(BARGAIN_PRICE)} buys a bargain-bin game.` },
  },
  {
    id: 'market',
    todo: 'Flea market, at the back of RETRO GAMES',
    tips: {
      arcade: 'Coins in hand: the flea market is at the back of RETRO GAMES, across the street.',
      street: `RETRO GAMES: the flea market is at its back, open ${clockShort(SHOP_HOURS.retro?.open ?? 8)} to ${clockShort(SHOP_HOURS.retro?.close ?? 23)}.`,
    },
  },
  {
    id: 'buy',
    todo: 'Buy a first game!',
    tips: {
      market: () => `The bargain bin: anything in it for ${formatCoins(BARGAIN_PRICE)}. ${useVerbOnCap('a game')} to look closer: ${actionKeyLabel('buy')} buys it, ${actionKeyLabel('haggle')} haggles (not in the bin). What you buy is sent home.`,
      street: `The flat is bare: SECOND HOME (furniture), the florist and the pet shop are along Front Street, TV REPAIR round the corner on Park Street, open ${FLAT_SHOPS_HOURS}. A houseplant is ${formatCoins(HOME_GOOD_PRICES.houseplant)}.`,
    },
  },
  {
    id: 'unpack',
    todo: 'Unpack the parcel in the hall',
    tips: {
      market: 'Your game is on its way home: the parcel will wait in the hall.',
      hallway: () => `Your parcel is under the console: ${useVerbOn()} to unpack.`,
    },
  },
  {
    id: 'shelf',
    todo: 'Find it on the shelf, watch it on the TV',
    tips: { living: () => `It is on the shelf now. Pick it up, bring it to its console under the TV and ${useVerbOn('the console')} to put it in.` },
  },
];

/** Said once the list is done (or skipped from the note). */
export const FIRST_DAY_DONE = `That is the round: arcade, market, shelves. The flat fills up from the shops on Front Street (${FLAT_SHOPS_HOURS}): a plant, an armchair, one day a cat. The journal on the console keeps your days.`;
