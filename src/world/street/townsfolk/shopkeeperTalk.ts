import type { SessionActions } from '@/game/SessionActions';
import { errandOf } from '@/errands/errands';
import { pocket } from '@/errands/pocket';
import { findPerson } from '@/social/people';
import { has } from '@/social/perks';
import { isMet } from '@/social/standing';
import { onceToday } from '@/social/street/streetPerks';
import { markStreet, streetMarked } from '@/social/street/streetMarks';
import type { TalkExtra, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { voiceBody } from '../../people/socialHook';
import type { ShopKind } from '../streetPlan';

/*
 * The counters that used to be only a look in, as a conversation with whoever serves there (docs/social.md "Front
 * Street and the arcade"): Stan the butcher, Agnès at CORNER BOOKS. A voice over the counter (`voiceBody`), the shop's
 * own business as before as the first entry (`counter`: what a click on the door did, the conversation closed
 * first), a look round, and their perks: Stan's scrap for the stray on the house (`freeScrap`), none at all for a
 * cold customer (`noScrap`); Agnès' guide with Félix's maps (`felixGuide`, once).
 */

/** Who serves behind which counter: by kind, or by the shop's name where one kind has several (two bookshops). */
const SHOPKEEPERS: Partial<Record<ShopKind, PersonId | Readonly<Record<string, PersonId>>>> = {
  butcher: 'butcher',
  books: { 'CORNER BOOKS': 'bookseller' },
};

/** The person behind the counter of the shop of `kind` named `name`, or null (a plain counter). */
export function shopkeeperOf(kind: ShopKind, name: string | undefined): PersonId | null {
  const keeper = SHOPKEEPERS[kind];
  if (!keeper) return null;
  if (typeof keeper === 'string') return keeper;
  return keeper[name ?? ''] ?? null;
}

interface ShopkeeperTalkOptions {
  person: PersonId;
  /** The shop's business as a click on its door did it (buy the offer, open its panel, a look in): the first entry. */
  counter?: { label: string; run(): void };
  /** A line about the shop, a look round. */
  look: () => string;
  day: () => number;
}

/** The name over their words: theirs once met, the shop's role before. */
function speakerOf(id: PersonId): string {
  const card = findPerson(id);
  return card && isMet(id) ? (card.short ?? card.name) : (card?.role ?? 'Shopkeeper');
}

/** The conversation at the counter of `options.person`'s shop. */
export function shopkeeperTalk(options: ShopkeeperTalkOptions, session: SessionActions): TalkSession {
  const { person, counter, look, day } = options;
  const extras: TalkExtra[] = [];
  // A cold butcher sells the player no scraps for the stray (`noScrap`): his counter is all scraps.
  const refused = (): string | null => (person === 'butcher' && has(person, 'noScrap') ? 'He won’t serve you' : null);
  if (counter) extras.push({ id: 'counter', group: 'trade', label: counter.label, opensPanel: true, disabled: refused, run: () => counter.run() });
  extras.push({ id: 'look', group: 'talk', label: 'Have a look round', run: () => ({ line: look() }) });
  if (person === 'butcher') {
    extras.push({
      id: 'freeScrap',
      group: 'ask',
      label: 'Anything for the stray today?',
      disabled: () => (has(person, 'noScrap') ? 'Not for you' : !has(person, 'freeScrap') ? 'Only for a friendly face' : null),
      run: () => {
        if (pocket.count('scrap') >= errandOf('scrap', 'spring').max) return { line: 'You’ve a pocketful already. Feed the poor beast first.' };
        if (!onceToday(person, 'freeScrap', day())) return { line: 'One a day. He’s getting fat as it is.' };
        pocket.add('scrap', 1, errandOf('scrap', 'spring').max);
        session.slip({ title: 'A scrap for the stray', detail: 'Ham ends in paper, on the house.' });
        return { line: 'Here. Tell Trouble it’s from me.' };
      },
    });
  }
  if (person === 'bookseller') {
    extras.push({
      id: 'felixGuide',
      group: 'ask',
      label: 'Did my uncle ever buy guides here?',
      disabled: () => (streetMarked('felixGuide') ? 'She gave you his guide' : null),
      run: () => {
        if (!has(person, 'felixGuide')) return { line: 'Félix? Oh, often. I’d have to look for his things. Ask me another time.' };
        markStreet('felixGuide');
        session.read({
          title: 'A guide with his maps',
          text: 'From the back, under the atlases, she brings out a strategy guide with a broken spine. Every map in it is redrawn in pencil, in the margins, in a small square hand, with notes: “wrong, the door is here”, “secret wall!!”, “ask F. for the code”. On the inside cover: F. Aubry.',
          effect: 'His guide, for you to keep. She will not take a coin for it.',
          look: 'note',
        });
        return { line: 'He kept bringing it back to argue about the maps. It’s yours now. It was always more his than mine.' };
      },
    });
  }
  return { person, place: 'shop', body: voiceBody((line, speaker) => session.say(line, speaker), speakerOf(person)), extras };
}
