/*
 * THE FIRST DAY'S STEPS, in order: the to-do list on the hall console (`ToDoNote`), with the tip a
 * zone shows for the first step not done yet. Each step's tip shows once a visit to its place (rooms sharing a text are one
 * place), a few visits at most; a step is done by what the stores and the zones say (`FirstDay`), never by a timer.
 */

import { actionKeyLabel } from '@/ui/keys';
import { useVerbOn, useVerbOnCap } from '@/ui/verb';
import { BARGAIN_PRICE } from '@/economy/pricing';
import { SHOP_HOURS } from '@/world/street/shops/shopHours';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';

/** The flat's shops' hours, as the tips say them ("9:00 to 21:00"). */
const FLAT_SHOPS_HOURS = `${clockShort(SHOP_HOURS.furniture?.open ?? 9)} to ${clockShort(SHOP_HOURS.furniture?.close ?? 21)}`;

export type FirstDayStepId = 'note' | 'lid' | 'out' | 'arcade' | 'play' | 'redeem' | 'market' | 'buy' | 'unpack' | 'shelf';

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

/**
 * Where a step's tip in `zone` belongs: the first zone with the same words (the flat's rooms sharing the first tip are
 * one place, so the tip is not rung again room by room).
 */
export function placeOf(step: FirstDayStep, zone: string): string {
  const text = tipText(step, zone);
  return Object.keys(step.tips).find((z) => tipText(step, z) === text) ?? zone;
}

/** The flat's rooms, where the first tip may show. */
const FLAT_ROOMS = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony'];
const everywhereAtHome = (text: string): Partial<Record<string, string>> => Object.fromEntries(FLAT_ROOMS.map((id) => [id, text]));

export const FIRST_DAY_STEPS: readonly FirstDayStep[] = [
  {
    id: 'note',
    todo: 'Read this list (done!)',
    tips: everywhereAtHome('Mémé left you a note on the hall console, by the keys.'),
  },
  {
    // Félix's game, the one the sale missed behind the bookcase: his note in its lid. Done with going out too (not needed).
    id: 'lid',
    todo: 'Open Félix’s game on the shelf: look inside the lid',
    tips: {
      living: () => `Félix’s game is on the shelf, the one the sale missed. ${useVerbOnCap('it')}, then open the box.`,
      hallway: 'Félix’s game waits on the shelf in the living room: look inside its lid.',
    },
  },
  {
    id: 'out',
    todo: 'Keys from the bowl, out the front door',
    tips: {
      hallway: 'Keys from the bowl on the console, then the front door at the end.',
      living: 'Through to the hallway: keys from the bowl, then out.',
    },
  },
  {
    id: 'arcade',
    todo: 'Find the arcade on Front Street',
    tips: {
      stairwell: 'Down the stairs or the lift: the street door is past the concierge’s lodge.',
      street: 'The arcade is a few doors along on our side, under the neon.',
    },
  },
  {
    id: 'play',
    todo: 'Play something: good scores pay tickets',
    tips: { arcade: () => `${useVerbOnCap('a machine')} to put a coin in. Good scores pay tickets.` },
  },
  {
    id: 'redeem',
    todo: 'Swap your tickets for coins at the prize counter',
    tips: { arcade: 'Tickets in hand? The prize counter swaps them for coins.' },
  },
  {
    id: 'market',
    todo: 'Flea market, at the back of RETRO GAMES',
    tips: {
      arcade: 'Coins in hand: the flea market is at the back of RETRO GAMES, across the street.',
      street: `The flea market: at the back of RETRO GAMES, ${clockShort(SHOP_HOURS.retro?.open ?? 8)} to ${clockShort(SHOP_HOURS.retro?.close ?? 23)}.`,
    },
  },
  {
    id: 'buy',
    todo: 'Buy a first game!',
    tips: {
      market: () => `The bargain bin: anything in it for ${formatCoins(BARGAIN_PRICE)}. ${useVerbOnCap('a game')} to look closer, [${actionKeyLabel('buy')}] buys it.`,
      street: 'A first game: the bargain bin is at the back of RETRO GAMES, across the street.',
    },
  },
  {
    id: 'unpack',
    todo: 'Unpack the parcel in the hall',
    tips: {
      market: 'Your game is on its way home: the parcel waits in the hall.',
      hallway: () => `Your parcel is under the console: ${useVerbOn()} to unpack.`,
    },
  },
  {
    id: 'shelf',
    todo: 'Find it on the shelf, watch it on the TV',
    tips: { living: () => `On the shelf now. Take it to the console under the TV and ${useVerbOn()}.` },
  },
];

/** Said once the list is done. */
export const FIRST_DAY_DONE = `That is the round: arcade, market, shelves. The flat fills up from Front Street’s shops (${FLAT_SHOPS_HOURS}). The journal on the console keeps your days.`;

/** On the card when the list is put away from the note ("I know my way around"). */
export const FIRST_DAY_SKIPPED = `No more to-do tips. The round is still there: the arcade pays tickets, the prize counter swaps them, the flea market behind RETRO GAMES sells games. The flat fills up from Front Street’s shops (${FLAT_SHOPS_HOURS}), and the journal on the console keeps your days.`;
