import type { SessionActions } from '@/game/SessionActions';
import { isAuctionDay } from '@/economy/AuctionHouse';
import { RIVAL_COLLECTOR, rivalAtMarket, rivalOnFrontStreet } from '@/economy/rivalCollector';
import { formatCoins } from '@/text/money';
import { findPerson } from '@/social/people';
import { effect, has } from '@/social/perks';
import { isMet } from '@/social/standing';
import { onceToday, usedToday } from '@/social/street/streetPerks';
import type { TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { voiceBody } from '../../people/socialHook';
import { errandOf, type ErrandId } from '@/errands/errands';
import { pocket } from '@/errands/pocket';
import { payEspresso, victorOwesEspresso } from '@/social/street/wager';
import type { ShopServices } from './ShopEntrance';

/*
 * The café's counter as a conversation with its barista (docs/social.md "Front Street and the arcade"): the coffee
 * (the flea market's coffee of the day: the stallholders go easier) with its market tip, two from a friendly barista,
 * none from a cold one; on the house once a day for a friend; and, for a close friend, where Victor is today. The
 * barista is a voice over the counter (subtitles, named once met).
 */

interface BaristaTalkOptions {
  id: PersonId;
  /** The coffee's price (`SHOP_TALK.cafe.offer`). */
  price: number;
  services: ShopServices;
  /** The barista's tips today, the most useful first. */
  tips: () => readonly string[];
}

/** Which of today's tips the barista gave already, by barista (one more each time the player asks). */
const given = new Map<PersonId, { day: number; count: number }>();

function speakerOf(id: PersonId): string {
  const card = findPerson(id);
  return card && isMet(id) ? (card.short ?? card.name) : 'Barista';
}

/** How many of today's tips `id` gave the player. */
function tipsGiven(id: PersonId, day: number): number {
  const g = given.get(id);
  return g && g.day === day ? g.count : 0;
}

/** Pins `id`'s next tip of the day (top left: the market tip card); false when there is none left. */
function giveTip(session: SessionActions, id: PersonId, day: number, tips: readonly string[]): boolean {
  const n = tipsGiven(id, day);
  const tip = tips[n];
  if (!tip) return false;
  given.set(id, { day, count: n + 1 });
  session.tip(tip, { id: `barista-${n}`, head: 'Market tip' });
  return true;
}

/** Where Victor is today, as the barista heard it. */
function victorToday(day: number): string {
  const where = [
    rivalOnFrontStreet(day) ? 'outside RETRO GAMES with his suitcase, ten till six' : '',
    rivalAtMarket(day) ? 'at the flea market first thing, hunting' : '',
    isAuctionDay(day) ? 'in the front row at the saleroom' : '',
  ].filter(Boolean);
  if (!where.length) return `${RIVAL_COLLECTOR.short}? Not out today. He had his espresso at nine and went home to polish something.`;
  return `${RIVAL_COLLECTOR.short}? ${where.join(', then ')}. You didn’t hear it from me.`;
}

/** The conversation at the counter of `options.id`'s café. */
export function baristaTalk(options: BaristaTalkOptions, session: SessionActions): TalkSession {
  const { id, price, services } = options;
  const day = (): number => services.day?.() ?? 0;
  const free = (): boolean => has(id, 'freeCoffee') && !usedToday(id, 'freeCoffee', day());
  const coffee = (): { line: string } => {
    const { market, purse } = services;
    if (market.hadCoffee) return { line: 'Another one? You’ll be haggling in your sleep.' };
    // Victor lost his wager (`social/street/wager`): his espresso waits behind the counter.
    const onVictor = victorOwesEspresso();
    const onTheHouse = onVictor || free();
    if (onVictor) payEspresso();
    else if (onTheHouse) onceToday(id, 'freeCoffee', day());
    else if (!purse.spend(price)) {
      session.refuse(`A coffee is ${formatCoins(price)} and you have ${purse.coins}.`);
      return { line: 'Pay me next time? No. Sorry, love, rules.' };
    }
    market.drinkCoffee();
    session.slip({ title: onVictor ? 'An espresso, on Victor' : onTheHouse ? 'A coffee, on the house' : 'A coffee', detail: 'The stallholders go easier on you today.', coins: onTheHouse ? 0 : -price });
    // A cold barista keeps the market to themself; a friendly one has two things to say.
    const tips = options.tips();
    const count = effect(id, 'noTip') ? 0 : effect(id, 'twoTips') ? 2 : 1;
    for (let i = 0; i < count; i++) giveTip(session, id, day(), tips);
    if (onVictor) return { line: 'Mr Crane left this for you. He said, and I quote, “Don’t make a song of it.” And listen…' };
    return { line: count === 0 ? 'There. Anything else?' : onTheHouse ? 'On the house. And listen…' : 'There you go. And listen…' };
  };
  // To take away, for somebody else (a gift, a favour at the Mansions): into the pocket.
  const toGo = (item: Extract<ErrandId, 'coffee' | 'cake'>): { line: string } => {
    const errand = errandOf(item, 'spring');
    if (pocket.boughtToday(item) >= errand.perDay) return { line: item === 'cake' ? 'That was the last slice, sorry.' : 'I’m out of cups to go. Drink it here?' };
    if (pocket.count(item) >= errand.max) return { line: 'Your hands are full already, love.' };
    if (!services.purse.spend(errand.price)) {
      session.refuse(`That is ${formatCoins(errand.price)} and you have ${services.purse.coins}.`);
      return { line: 'Next time, then.' };
    }
    pocket.recordBuy(item);
    pocket.add(item, errand.portions, errand.max);
    session.slip({ title: item === 'cake' ? 'A slice of cake, to take away' : 'A coffee, to take away', detail: errand.bought, coins: -errand.price });
    return { line: item === 'cake' ? 'Boxed and tied. Someone’s lucky.' : 'Lid on, sleeve on. Mind, it’s hot.' };
  };
  return {
    person: id,
    place: 'shop',
    body: voiceBody((line, speaker) => session.say(line, speaker), speakerOf(id)),
    extras: [
      {
        id: 'coffee',
        group: 'trade',
        label: victorOwesEspresso() ? 'An espresso (on Victor)' : free() ? 'A coffee (on the house)' : `A coffee (${formatCoins(price)})`,
        disabled: () => (services.market.hadCoffee ? 'One coffee a day is plenty' : null),
        run: coffee,
      },
      {
        id: 'coffeeToGo',
        group: 'trade',
        label: `A coffee to take away (${formatCoins(errandOf('coffee', 'spring').price)})`,
        run: () => toGo('coffee'),
      },
      {
        id: 'cakeToGo',
        group: 'trade',
        label: `A slice of cake to take away (${formatCoins(errandOf('cake', 'spring').price)})`,
        run: () => toGo('cake'),
      },
      {
        id: 'moreTips',
        group: 'ask',
        label: 'Heard anything else?',
        disabled: () => (!services.market.hadCoffee ? 'Have a coffee first' : !has(id, 'twoTips') ? 'Only for a friendly face' : tipsGiven(id, day()) >= options.tips().length ? 'Nothing more today' : null),
        run: () => (giveTip(session, id, day(), options.tips()) ? { line: 'Since you ask…' } : { line: 'That’s all I know today, honest.' }),
      },
      ...(findPerson(id)?.effects?.some((e) => e.key === 'victorWhere')
        ? [
            {
              id: 'victor',
              group: 'ask' as const,
              label: `Where’s ${RIVAL_COLLECTOR.short} today?`,
              disabled: () => (!has(id, 'victorWhere') ? 'Only for a close friend' : null),
              run: () => ({ line: victorToday(day()) }),
            },
          ]
        : []),
    ],
  };
}
