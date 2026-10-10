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
import { screenPoint } from '@/core/screenPoint';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { lookTowards } from '@/player/lookTowards';
import { zoomView } from '@/player/zoomView';
import { MEMORIES } from '@/grandma/memories';
import { callGrandma, watchGrandma } from '@/social/grandmaSocial';
import { rememberLook } from '@/social/lookBook';
import { MEME_ID } from '@/social/people/family';
import { memeLook } from '@/world/grandma/familyLooks';

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
export function createSocial(services: Services, container: HTMLElement, notices: Notices, session?: () => SessionActions, player?: Pick<FirstPersonController, 'getLook' | 'setLook' | 'getEyePosition'>) {
  const { wallet, collection, tx, today, sky, params, journal, engine } = services;
  const hour = (): number => sky.dayNight.state.hours;
  // The People book (its key, the journal, the pause menu, a name in a conversation) and the phone's contacts (docs/social.md).
  const peopleBook = new PeopleBook(container, { day: () => today.gameDay, hour });
  const conversation = new ConversationPanel(container, {
    day: () => today.gameDay,
    hour,
    wallet,
    givable: () => collection.games.filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g)),
    giveGame: (game) => tx.giveAway(game).ok,
    pocket: () =>
      POCKET_GIFTS.map(([errand, kind]): PocketGift => ({ kind, count: pocket.count(errand), take: () => pocket.take(errand) === errand })),
    notices,
    coverUrl: services.coverUrl,
    // The conversation sits beside the person and turns the view to their face (docs/social.md "Talking").
    whereOnScreen: (anchor, lift) => screenPoint(engine.camera, anchor, lift),
    frame: player ? (anchor, lift) => void lookTowards(player, anchor, lift) : undefined,
    zoom: (factor) => zoomView(engine.camera, factor),
    openPerson: (id) => {
      if (!session) return;
      peopleBook.showPerson(id);
      session().openPanel(peopleBook);
    },
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
    note: (text, weight) => journal.note('note', text, { weight }),
  });
  // Victor Crane: a kind word after beating him, a gloat; his collection shown at the end of the arc (docs/social.md "Victor").
  wireRivalry({ rival: services.lots.rival, collection, notices, pool: SEED_GAMES, day: () => today.gameDay });
  const contacts: PhoneContacts = {
    list: () =>
      everyone()
        .filter((p) => hasNumber(p.id))
        .sort((a, b) => standing(b.id).warmth - standing(a.id).warmth)
        .map((p) => ({ id: p.id, name: p.short ?? p.name, note: `${tierInfo(tierOf(standing(p.id).warmth, standing(p.id).trust)).name} · ${phoneNote(p.id, hour())}` })),
    call: (id) => {
      // Mémé answers in her own words: the album, Sunday's lunch, her nightie after nine (docs/social.md "Mémé").
      if (id === MEME_ID && session) {
        const call = callGrandma({ day: today.gameDay, hour: hour(), photos: services.grandma.due !== null });
        if ('refused' in call) return call.refused;
        social.open(session(), { person: id, place: 'phone', opening: () => call.opening });
        return null;
      }
      const why = phoneRefusal(id, hour());
      if (why !== null || !session) return why ?? 'The line is dead.';
      social.open(session(), { person: id, place: 'phone' });
      return null;
    },
  };
  // Mémé: her face as she is in her flat, and her warmth from the visits, lunches, gifts and the album's memories.
  rememberLook(MEME_ID, memeLook());
  watchGrandma(services.grandma, { day: () => today.gameDay, title: (id) => MEMORIES.find((m) => m.id === id)?.title ?? null, scarf: () => services.perks.outfit.id === 'memeScarf' });
  return { conversation, social, peopleBook, contacts };
}
