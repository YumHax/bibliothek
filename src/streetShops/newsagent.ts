import { themeOf } from '@/economy/marketDays';
import { gameDayRandom } from '@/time/daily';
import { pick } from '@/random';
import { COVER_CARDS, STREET_SHOPS } from './rules';
import { streetShops } from './store';

/*
 * The newsagent's kiosk on Front Street (docs/economy.md "Front Street's shops and finds"): THE GAMING WEEKLY is read
 * free at the kiosk, as ever; bought (a coin) it is the player's to keep, and every other issue has a cover card slipped
 * inside, one of a set of twelve (a full set handed back at the kiosk earns the newsagent's prize). A subscription
 * brings the paper to the flat's doormat every morning, its card with it.
 */

/** The cover card inside game `day`'s issue, or null (an issue without one). */
export function cardIn(day: number): (typeof COVER_CARDS)[number] | null {
  if (day % STREET_SHOPS.paper.cardEvery !== 0) return null;
  return pick(gameDayRandom('coverCard', day), COVER_CARDS);
}

/** What came with the issue of `day`, now the player's: the card if any (and whether it was a new one). */
export function keepIssue(day: number): { card: (typeof COVER_CARDS)[number] | null; fresh: boolean } {
  if (streetShops.hasIssue(day)) return { card: null, fresh: false };
  streetShops.addIssue(day);
  const card = cardIn(day);
  return { card, fresh: card ? streetShops.addCard(card.id) : false };
}

/** Whether every card of the set is in, and its prize not had yet. */
export function setComplete(): boolean {
  return !streetShops.setDone && COVER_CARDS.every((c) => streetShops.cards.includes(c.id));
}

/** The coins the full set of cards earns, once. */
export const SET_PRIZE = 25;

/**
 * The subscription's paper on the mat for game `day` (`world/hallway/mail`, asked once a day), or null when the player
 * does not take it: the masthead, the market's day, the card inside. Asking keeps the issue (and its card).
 */
export function subscriptionMail(day: number): { title: string; lines: string[]; accent: number } | null {
  if (!streetShops.subscribedOn(day)) return null;
  const { card, fresh } = keepIssue(day);
  const theme = themeOf(day);
  const inside = card ? (fresh ? `Inside: a cover card, ${card.title}. A new one for the set.` : `Inside: a cover card, ${card.title}. You have it already.`) : 'No card in this one.';
  const last = streetShops.subscribedUntil === day ? 'Your subscription ends with this issue: renew it at the kiosk.' : 'Delivered with the newsagent’s compliments.';
  return { title: 'THE GAMING WEEKLY', lines: [`Today at the market: ${theme.title}`, inside, last], accent: 0x2f5a44 };
}
