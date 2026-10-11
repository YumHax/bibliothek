import type { ScriptedAd } from '@/classifieds/ads';
import type { SellerKind } from '@/classifieds/rules';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { gameDayRandom } from '@/time/daily';
import { isStreetEventDay } from '@/time/streetDay';
import { pick } from '@/random';
import { STREET_SHOPS } from './rules';

/*
 * The launderette's cork board (docs/economy.md "Small ads and the seller's flat"): between the lost cat and the
 * yoga class, now and then a card from somebody in Park Corner Mansions with old games to sell. Read on the board (its
 * day only: the card is gone the day after), it joins the small ads (`Classifieds.inject`, then `markSeen`): the phone at
 * home and the kiosk's phone ring it the same way, and the flat is visited like any other seller's.
 */

/** What the rest of the board says, one card read after another. */
export const BOARD_CARDS: readonly string[] = [
  'LOST: grey tabby, answers to Biscuit. Reward. (Someone has drawn a moustache on the photo.)',
  'Yoga in the church hall, Tuesdays. First class free. Bring a mat.',
  'Odd jobs, no job too small. Shelves, flat-pack, cats fed. Ask for Bogdan.',
  'Washer-dryer, works, you collect. The card is from 2019.',
  'Piano lessons, all ages, patient teacher. Neighbours warned.',
];

const NAMES: Readonly<Record<SellerKind, readonly string[]>> = {
  clearOut: ['Mrs Achebe', 'Mr Fontaine', 'Mrs Brennan'],
  mover: ['Sami', 'Clémence', 'Josh'],
  collector: ['Theo', 'Anouk'],
  loft: ['Mrs Grant', 'Mr Ferreira'],
};

const TEXTS: Readonly<Record<SellerKind, (platform: string) => string>> = {
  clearOut: (p) => `FOR SALE: ${p} and a box of games, my son’s, he won’t miss them. Knock, or ring the number on the tabs.`,
  mover: () => 'MOVING SALE. Old video games, a mix, must go before Friday. Ring the number on the tabs.',
  collector: (p) => `${p} collection, thinning out. Complete in box only. No dealers, no time-wasters.`,
  loft: () => 'Cleared my mother’s loft: a box of old games, no idea what they are. Make me an offer.',
};

const KINDS: readonly SellerKind[] = ['clearOut', 'clearOut', 'mover', 'loft', 'loft', 'collector'];

/** The seller's card pinned on the launderette's board on game `day`, or null (most days). */
export function boardAdOn(day: number): ScriptedAd | null {
  if (!isStreetEventDay('laundryBoard', STREET_SHOPS.board.oneDayIn, day)) return null;
  const random = gameDayRandom('laundryBoard', day);
  const kind = pick(random, KINDS);
  const platform = kind === 'clearOut' || kind === 'collector' ? pick(random, PLATFORM_LIST) : null;
  return {
    id: `board:${day}`,
    fromDay: day,
    kind,
    name: pick(random, NAMES[kind]),
    platform: platform?.id ?? null,
    text: TEXTS[kind](platform?.shortName ?? 'video'),
    greeting: 'You saw my card at the launderette? Nobody reads that board. Come in, come in.',
  };
}
