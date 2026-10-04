import { startBuildingSocial } from '@/building/socialBuilding';
import { SEED_GAMES } from '@/catalog';
import { isKeepsake } from '@/economy/Transactions';
import { startSocialLife } from '@/social/life/startLife';
import { pocket } from '@/errands/pocket';
import type { ErrandId } from '@/errands/errands';
import type { Notices } from '@/notices';
import { announceTiers } from '@/social/announce';
import { wireRivalry } from '@/social/rivalry';
import { startMarketSocial } from '@/social/market';
import { everyone } from '@/social/people';
import { phoneNote, phoneRefusal } from '@/social/phoneHours';
import { watchSocialJournal } from '@/social/socialJournal';
import { restoreSellers } from '@/social/sellers';
import { hasNumber, setStanding, settleDay, standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import type { SessionActions } from '@/game/SessionActions';
import type { PhoneContacts } from '@/ui/household/PhonePanel';
import { PeopleBook } from '@/ui/social/PeopleBook';
import { portrait } from '@/ui/social/portrait';
import { installSocialDebug } from './debug';
import type { SocialServices } from '@/social/talk';
import type { GiftKind } from '@/social/types';
import { ConversationPanel, type PocketGift } from '@/ui/social/ConversationPanel';
import type { Services } from './services';

/** What in the pocket is given as what (`errands/pocket`'s ids to the social layer's gifts). */
const POCKET_GIFTS: readonly [ErrandId, GiftKind][] = [
  ['croissant', 'croissant'],
  ['bunch', 'flowers'],
  ['treats', 'treats'],
  ['scrap', 'scrap'],
];

/**
 * The social layer's wiring (docs/social.md): the conversation panel, the services the world's builders open it
 * through (`BuildContext.social`), the tier changes told as notices, and the drift run on every new game day.
 */
export function createSocial(services: Services, container: HTMLElement, notices: Notices, session?: () => SessionActions) {
  const { wallet, collection, tx, today, sky, params, journal } = services;
  const hour = (): number => sky.dayNight.state.hours;
  const conversation = new ConversationPanel(container, {
    day: () => today.gameDay,
    hour,
    wallet,
    givable: () => collection.games.filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g)),
    giveGame: (game) => tx.giveAway(game).ok,
    pocket: () =>
      POCKET_GIFTS.map(([errand, kind]): PocketGift => ({ kind, count: pocket.count(errand), take: () => pocket.take(errand) === errand })),
    notices,
  });
  const social: SocialServices = {
    open: (session, talk) => {
      conversation.prepare({ ...talk, session });
      session.openPanel(conversation);
    },
    day: () => today.gameDay,
    hour,
  };
  // `?social`: everyone met, Friendly at least (a test of the perks and the book; it writes to the save it plays on).
  if (params.has('social')) for (const p of everyone()) setStanding(p.id, Math.max(standing(p.id).warmth, 35), Math.max(standing(p.id).trust, 15), today.gameDay);
  if (params.has('debug')) installSocialDebug(() => today.gameDay);
  // Before anything reads them: the small ads' sellers met in earlier sessions.
  restoreSellers();
  announceTiers(notices, (id, ring) => portrait(id, 72, ring));
  // The building's standing at work: feuds on the board, Dubois' news, the concierge's post and roof key (docs/social.md).
  startBuildingSocial({ today, notices });
  settleDay(today.gameDay);
  today.onNewGameDay((day) => settleDay(day));
  watchSocialJournal(journal, today);
  // The flea market's stallholders: credit, the morning call when a wished-for game is in (docs/social.md "The market").
  startMarketSocial({ wallet, notices, today, todays: () => services.market.todays(), wanted: (id) => collection.isWanted(id), buysAt: (p) => services.standing.buysAt(p) });
  // Favours asked, birthdays, people grown close at gatherings, go-betweens (docs/social.md "Favours").
  startSocialLife({
    day: () => today.gameDay,
    onNewDay: (cb) => void today.onNewGameDay(cb),
    realDate: () => today.realDate(),
    catalogue: SEED_GAMES,
    collection,
    lendable: (game) => !isKeepsake(game),
    wallet,
    notices,
    note: (text) => journal.note('note', text),
  });
  // Victor Crane: a kind word after beating him, a gloat; his collection shown at the end of the arc (docs/social.md "Victor").
  wireRivalry({ rival: services.lots.rival, collection, notices, pool: SEED_GAMES, day: () => today.gameDay });
  // The People book (its key, the journal, the pause menu) and the phone's contacts (docs/social.md).
  const peopleBook = new PeopleBook(container, { day: () => today.gameDay, hour });
  const contacts: PhoneContacts = {
    list: () =>
      everyone()
        .filter((p) => hasNumber(p.id))
        .sort((a, b) => standing(b.id).warmth - standing(a.id).warmth)
        .map((p) => ({ id: p.id, name: p.short ?? p.name, note: `${tierInfo(tierOf(standing(p.id).warmth, standing(p.id).trust)).name} · ${phoneNote(p.id, hour())}` })),
    call: (id) => {
      const why = phoneRefusal(id, hour());
      if (why !== null || !session) return why ?? 'The line is dead.';
      social.open(session(), { person: id, place: 'phone' });
      return null;
    },
  };
  return { conversation, social, peopleBook, contacts };
}
