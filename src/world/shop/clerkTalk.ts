import type { SessionActions } from '@/game/SessionActions';
import type { HomeShop } from '@/economy/homeGoods';
import { pocket } from '@/errands/pocket';
import { FAULTS, TOOLS } from '@/repair/consoles';
import type { Workshop } from '@/repair/Workshop';
import { getPlatform } from '@/catalog/platforms';
import { has } from '@/social/perks';
import { findPerson } from '@/social/people';
import { isMet } from '@/social/standing';
import { clerkOf, onceToday, shopFactor, usedToday } from '@/social/street/streetPerks';
import type { TalkExtra, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { actReaction } from '../people/socialHook';
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
  catName?: () => string;
  /** Whether a cat lives in the flat (adopted at the pet shop). */
  catHome?: () => boolean;
  workshop?: Workshop;
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
    body: { speak: (line) => clerk.speak(line, speakerOf(id)), react: (reaction) => actReaction(clerk, reaction), anchor: clerk.speechAnchor },
    extras: extrasOf(id, options, session),
  };
}

function extrasOf(id: PersonId, options: ClerkTalkOptions, session: SessionActions): TalkExtra[] {
  const day = options.day();
  const factor = shopFactor(options.shop);
  const priceWord = factor < 1 ? ` (${Math.round((1 - factor) * 100)}% off for you)` : factor > 1 ? ` (${Math.round((factor - 1) * 100)}% more for you)` : '';
  const extras: TalkExtra[] = [{ id: 'till', group: 'trade', label: `See everything for the flat${priceWord}`, opensPanel: true, run: () => options.openTill(session) }];
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
