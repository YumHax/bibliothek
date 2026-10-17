import type { SessionActions } from '@/game/SessionActions';
import type { HomeShop } from '@/economy/homeGoods';
import { pocket } from '@/errands/pocket';
import { FAULTS, TOOLS } from '@/repair/consoles';
import type { Workshop } from '@/repair/Workshop';
import { getPlatform } from '@/catalog/platforms';
import { has } from '@/social/perks';
import { findPerson } from '@/social/people';
import { isMet, tier } from '@/social/standing';
import { atLeast } from '@/social/tiers';
import { askDiscount, clerkOf, discountAskable, onceToday, shopFactor, usedToday } from '@/social/street/streetPerks';
import type { TalkExtra, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { bodyOf } from '../people/socialHook';
import type { Game } from '@/catalog/types';
import { formatCoins } from '@/text/money';
import { STREET_SHOPS } from '@/streetShops/rules';
import { gameWeekOf, streetShops } from '@/streetShops/store';
import { benchFee, karimDoubles, karimOffer, karimSwapsLeft } from '@/streetShops/karim';
import type { ShopClerk } from './ShopClerk';

/*
 * Talking to a walk-in shop's clerk (docs/social.md "Front Street and the arcade"): the till's list from their counter,
 * what their standing gives (a pouch of treats from Nadia, Karim's word on the console on the kitchen table, Nadia's
 * advice on the cat), and the prices they ask the player said out loud.
 */

/** What the clerk's talk reaches: the till, the cat's name, the consoles at home. */
interface ClerkTalkOptions {
  shop: HomeShop;
  clerk: ShopClerk;
  /** Opens the till's list (the shop's `HomeShopPanel`), or refuses with why. */
  openTill: (session: SessionActions) => void;
  day: () => number;
  /** The game hour (their mood decides a discount asked). */
  hour?: () => number;
  catName?: () => string;
  /** Whether a cat lives in the flat (adopted at the pet shop). */
  catHome?: () => boolean;
  workshop?: Workshop;
  /** Karim's trade at TV REPAIR: the wallet (his bench's fee), the collection, and the swap (`streetShops/karim`). */
  karim?: KarimTrade;
}

/** What Karim's bench and box of doubles reach. */
interface KarimTrade {
  purse: { readonly coins: number; spend(coins: number): boolean };
  /** The player's games that can change hands (owned, not lent, not a keepsake). */
  givable: () => readonly Game[];
  owns: (id: string) => boolean;
  /** `give` for `get`, into the parcel; false when it cannot be done. */
  swap: (give: Game, get: Game) => boolean;
}

/** How many treat portions a free pouch holds, and the pocket's limit for them (`errands.errandOf('treats')`). */
const FREE_POUCH = { portions: 3, max: 6 };

/** Nadia's advice, by the hour of the cat's day; `{cat}` is its name. */
const CAT_ADVICE: readonly string[] = [
  '{cat} wants a routine more than toys. Food at the same hour, a brush in the evening, and you’re its favourite person.',
  'If {cat} sits on your games, it isn’t vandalism. It’s affection. And warmth. Mostly warmth.',
  'A box on the floor, nothing in it. {cat} will thank you more than for any basket I sell. Don’t tell my boss.',
  'Call {cat} with the treat jar, not your voice, the first weeks. Then your voice will do.',
];

/** The name the clerk's bubble carries: their own once met, else "Shopkeeper". */
function speakerOf(id: PersonId): string {
  const card = findPerson(id);
  return card && isMet(id) ? (card.short ?? card.name) : 'Shopkeeper';
}

/** The conversation with `options.clerk`, for the click that opened it. */
export function clerkTalk(options: ClerkTalkOptions, session: SessionActions): TalkSession {
  const id = clerkOf(options.shop)!;
  const { clerk } = options;
  return {
    person: id,
    place: 'shop',
    body: { ...bodyOf(clerk), speak: (line) => clerk.speak(line, speakerOf(id)) },
    extras: extrasOf(id, options, session),
  };
}

function extrasOf(id: PersonId, options: ClerkTalkOptions, session: SessionActions): TalkExtra[] {
  const day = options.day();
  const factor = shopFactor(options.shop);
  const priceWord = factor < 1 ? ` (${Math.round((1 - factor) * 100)}% off for you)` : factor > 1 ? ` (${Math.round((factor - 1) * 100)}% more for you)` : '';
  const extras: TalkExtra[] = [{ id: 'till', group: 'trade', label: `See everything for the flat${priceWord}`, opensPanel: true, run: () => options.openTill(session) }];
  // Once a day from Friendly: no draw, their standing and their day decide (a friend always obliges).
  extras.push({
    id: 'discount',
    group: 'ask',
    icon: 'coin',
    label: 'Any chance of a discount today?',
    disabled: () => (discountAskable(id, day) ? null : 'Not today'),
    run: () => (askDiscount(id, day, options.hour?.() ?? 12)
      ? { line: 'Go on then. Ten percent off at the till, today only. Don’t tell anyone.' }
      : { line: 'Not today, sorry. It’s been one of those days.' }),
  });
  if (options.shop === 'pets') {
    extras.push({
      id: 'treats',
      group: 'ask',
      label: 'Any treats going spare?',
      disabled: () => (!has(id, 'freeTreats') ? 'Only for a friend' : usedToday(id, 'freeTreats', day) ? 'One pouch a day' : pocket.count('treats') >= FREE_POUCH.max ? 'Your pockets are full of treats' : null),
      run: () => {
        if (!onceToday(id, 'freeTreats', day)) return { line: 'One a day, you. Or the boss notices.' };
        pocket.add('treats', FREE_POUCH.portions, FREE_POUCH.max);
        session.slip({ title: 'A pouch of treats', detail: 'Three portions, on the house.' });
        return { line: 'Here. Fish ones. Don’t tell the boss, and don’t tell the cat where they came from.' };
      },
    });
    if (options.catHome?.() !== false) {
      extras.push({
        id: 'catAdvice',
        group: 'ask',
        label: 'How do I keep my cat happy?',
        disabled: () => (!has(id, 'catAdvice') ? 'Only for a close friend' : null),
        run: () => {
          const cat = options.catName?.() ?? 'your cat';
          return { line: CAT_ADVICE[day % CAT_ADVICE.length]!.replaceAll('{cat}', cat) };
        },
      });
    }
  }
  if (options.shop === 'electronics' && options.workshop && options.karim) extras.push(...karimExtras(id, day, options.workshop, options.karim, session));
  if (options.shop === 'electronics' && options.workshop) {
    const workshop = options.workshop;
    extras.push({
      id: 'repairTips',
      group: 'ask',
      label: 'About the console on my kitchen table…',
      disabled: () => (!has(id, 'repairTips') ? 'Only for a friend' : !workshop.nextBroken ? 'Nothing broken at home' : null),
      run: () => {
        const broken = workshop.nextBroken;
        if (!broken) return { line: 'Nothing on your table? Then stop worrying and play something.' };
        const fault = FAULTS[broken.fault];
        return { line: `The ${getPlatform(broken.platform).name}? “${fault.symptom}” I know that one. ${fault.finding} Take the ${TOOLS[fault.tool].name.toLowerCase()}.` };
      },
    });
  }
  return extras;
}

/**
 * Karim's bench and his box of doubles (`streetShops/karim`): the broken console on the kitchen table left with him for
 * a fee (he collects it on his way home, it is back working the next day), collected; one swap a week from his spares
 * for one of the player's games on his platforms.
 */
function karimExtras(id: PersonId, day: number, workshop: Workshop, trade: KarimTrade, session: SessionActions): TalkExtra[] {
  const offer = karimSwapsLeft(day) ? karimOffer(day, karimDoubles(day, trade.owns), trade.givable()) : null;
  const extras: TalkExtra[] = [
    {
      id: 'bench',
      group: 'trade',
      label: 'Could you mend the console on my kitchen table?',
      disabled: () => {
        const broken = workshop.nextBroken;
        if (!broken) return 'Nothing broken at home';
        const fee = benchFee(broken.platform);
        return trade.purse.coins < fee ? `${formatCoins(fee)} for the bench, you have ${trade.purse.coins}` : null;
      },
      run: () => {
        const broken = workshop.nextBroken;
        if (!broken) return { line: 'Nothing on your table? Then stop worrying and play something.' };
        const fee = benchFee(broken.platform);
        if (!trade.purse.spend(fee)) return { line: `${formatCoins(fee)} for the bench. Come back when you have it.` };
        workshop.leaveAtShop(broken.id, day);
        session.slip({ title: `The ${getPlatform(broken.platform).shortName} on Karim’s bench`, detail: 'He picks it up on his way home. Back working tomorrow.', coins: -fee });
        return { line: `The ${getPlatform(broken.platform).name}? ${FAULTS[broken.fault].finding} I’ll pick it up on my way home. Come back tomorrow, it’ll work.` };
      },
    },
    {
      id: 'benchCollect',
      group: 'trade',
      label: 'Is my console ready?',
      disabled: () => (workshop.onBench.length === 0 ? 'Nothing of yours on his bench' : null),
      run: () => {
        const done = workshop.collectFromShop(day, STREET_SHOPS.repair.days);
        if (!done.length) return { line: 'Tomorrow. Solder takes the time it takes.' };
        const names = done.map((c) => getPlatform(c.platform).shortName).join(' and the ');
        session.slip({ title: `The ${names} works`, detail: 'Mended on Karim’s bench: sell it at his counter, or keep it.' });
        return { line: `There. The ${names}, working like the day it came out of the box. The counter buys it, if you want.` };
      },
    },
  ];
  if (offer) {
    extras.push({
      id: 'karimSwap',
      group: 'trade',
      label: `Swap my ${offer.yours.title} for your spare ${offer.his.title}`,
      disabled: () => (!atLeast(tier(id), 'friendly') ? 'Only once he likes you' : !karimSwapsLeft(day) ? 'One swap a week' : trade.owns(offer.his.id) ? 'You have it already' : null),
      run: () => {
        if (!trade.swap(offer.yours, offer.his)) return { line: 'Hm. Not that one, not today.' };
        streetShops.markKarimSwap(gameWeekOf(day));
        session.slip({ title: `Swapped for ${offer.his.title}`, detail: 'It waits in the parcel under the hall console.' });
        return { line: `${offer.yours.title} for my spare ${offer.his.title}. Done. Don’t tell anyone I’m a soft touch.` };
      },
    });
  }
  return extras;
}
