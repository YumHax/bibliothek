import { startBuildingSocial } from '@/building/socialBuilding';
import { SEED_GAMES } from '@/catalog';
import { isKeepsake } from '@/economy/Transactions';
import { startSocialLife } from '@/social/life/startLife';
import { startFirstWelcome } from '@/onboarding/firstWelcome';
import { pocket } from '@/errands/pocket';
import { getPrize } from '@/economy/Prizes';
import { givePlush, plushToGive } from '@/social/street/plushGifts';
import { onStreetMark } from '@/social/street/streetMarks';
import { onLead } from '@/social/street/leads';
import type { ErrandId } from '@/errands/errands';
import type { Notices } from '@/notices';
import { announceTiers } from '@/social/announce';
import { watchOutfit } from '@/social/outfitRemarks';
import { setPersonPageOpener } from '@/social/keepsakes';
import { wireRivalry } from '@/social/rivalry';
import { wireCraneGameBoy } from '@/family/craneGameBoy';
import { wireGaspardReturn } from '@/family/gaspardReturn';
import { startMarketSocial } from '@/social/market';
import { everyone, shortName } from '@/social/people';
import { clockShort } from '@/text/clock';
import { callRefusal, messages, phoneState, playMessages } from '@/social/phoneCalls';
import { watchSocialJournal } from '@/social/socialJournal';
import { restoreSellers } from '@/social/sellers';
import { hasNumber, setStanding, settleDay, standing } from '@/social/standing';
import type { SessionActions } from '@/game/SessionActions';
import type { PhoneContacts, PhoneVoicemail } from '@/ui/household/PhonePanel';
import { PeopleBook } from '@/ui/social/PeopleBook';
import { portrait } from '@/ui/social/portrait';
import { installSocialDebug } from './debug';
import { registerLabConversation } from '@/cheats/socialLab';
import type { SocialServices } from '@/social/talk';
import type { GiftKind } from '@/social/types';
import { ConversationPanel, type PocketGift } from '@/ui/social/ConversationPanel';
import type { Services } from './services';
import { screenPoint } from '@/core/screenPoint';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { lookTowards } from '@/player/lookTowards';
import { zoomView } from '@/player/zoomView';
import { setCloseUpRig } from '@/player/closeUp';
import { MEMORIES } from '@/grandma/memories';
import { callGrandma, watchGrandma } from '@/social/grandmaSocial';
import { watchGrandmaRituals } from '@/social/grandmaRitualsSocial';
import { startNews } from '@/social/newsSources';
import { rememberedLook, rememberLook } from '@/social/lookBook';
import { randomLook } from '@/world/people/looks';
import { castDress } from '@/world/people/castLook';
import { giftWrap } from '@/holidays/giftWrap';
import { daysAgoWords } from '@/time/dayWords';
import { GASPARD_ID, MEME_ID } from '@/social/people/family';
import { gaspardLook, memeLook } from '@/world/grandma/familyLooks';

/** What in the pocket is given as what (`errands/pocket`'s ids to the social layer's gifts). */
const POCKET_GIFTS: readonly [ErrandId, GiftKind][] = [
  ['croissant', 'croissant'],
  ['bunch', 'flowers'],
  ['treats', 'treats'],
  ['scrap', 'scrap'],
  ['coffee', 'coffee'],
  ['cake', 'cake'],
];

/**
 * The social layer's wiring (docs/social.md): the conversation panel, the services the world's builders open it
 * through (`BuildContext.social`), the tier changes told as notices, and the drift run on every new game day.
 */
export function createSocial(services: Services, container: HTMLElement, notices: Notices, session?: () => SessionActions, player?: Pick<FirstPersonController, 'getLook' | 'setLook' | 'getEyePosition'>) {
  const { wallet, collection, tx, today, sky, params, journal, engine } = services;
  // The view's close look at something in the room (the fridge door's keepsakes) turns and draws in the same rig.
  if (player) setCloseUpRig({ player, camera: engine.camera });
  const hour = (): number => sky.dayNight.state.hours;
  const plushShelf = { get owned() { return services.prizes.owned; }, isPlush: (id: string) => getPrize(id)?.kind === 'plush' };
  // The People book (its key, the journal, the pause menu, a name in a conversation) and the phone's contacts (docs/social.md).
  // Its pages ring people (the contacts' call, made below) and show the covers of the games remembered.
  let callFromBook: ((id: string) => string | null) | undefined;
  const peopleBook = new PeopleBook(container, {
    day: () => today.gameDay,
    hour,
    call: (id) => callFromBook?.(id) ?? 'The line is dead.',
    game: (id) => collection.find(id) ?? SEED_GAMES.find((g) => g.id === id),
    coverUrl: services.coverUrl,
  });
  const conversation = new ConversationPanel(container, {
    day: () => today.gameDay,
    hour,
    wallet,
    givable: () => collection.games.filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g)),
    // A game wrapped at the Christmas stall leaves its paper behind once given (`holidays/giftWrap`).
    giveGame: (game) => {
      const ok = tx.giveAway(game).ok;
      if (ok) giftWrap.unwrap(game.id);
      return ok;
    },
    pocket: () => [
      ...POCKET_GIFTS.map(([errand, kind]): PocketGift => ({ kind, count: pocket.count(errand), take: () => pocket.take(errand) === errand })),
      // The claw's bunnies won at the arcade (`social/street/plushGifts`): given from the prize shelf.
      { kind: 'plush', count: plushToGive(plushShelf), take: () => givePlush(plushShelf) },
    ],
    notices,
    coverUrl: services.coverUrl,
    findGame: (id) => collection.find(id),
    // The controller: Y opens their page, A held confirms what is done for good.
    pad: { onPress: (handler) => services.input.onPress((code) => handler(code)), isDown: (code) => services.input.isDown(code) },
    // The conversation sits beside the person and turns the view to their face (docs/social.md "Talking").
    whereOnScreen: (anchor, lift) => screenPoint(engine.camera, anchor, lift),
    frame: player ? (anchor, lift) => void lookTowards(player, anchor, lift) : undefined,
    zoom: (factor) => zoomView(engine.camera, factor),
    // Their page opens over the conversation; closing the book comes back to it.
    openPerson: (id, back) => {
      if (!session) return;
      peopleBook.showPerson(id);
      session().openPanel(peopleBook);
      const off = peopleBook.addOpenListener((open) => {
        if (open) return;
        off();
        back();
      });
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
  if (params.has('debug')) {
    installSocialDebug(() => today.gameDay);
    // The social lab's conversation (cheats/socialLab): any opening, any outcome played in the card.
    registerLabConversation({
      open: (person, kind) => (session ? conversation.labOpen(session(), person, kind) : false),
      play: (person, state) => (conversation.isOpen || (session && conversation.labOpen(session(), person, 'hello')) ? conversation.labPlay(state) : false),
    });
  }
  // Before anything reads them: the small ads' sellers met in earlier sessions.
  restoreSellers();
  announceTiers(notices, (id, ring) => portrait(id, 72, ring));
  // A keepsake on the fridge opens its giver's page (docs/social.md "Keepsakes").
  setPersonPageOpener((id) => {
    if (!session) return;
    peopleBook.showPerson(id);
    session().openPanel(peopleBook);
  });
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
    // Where the player stands, for who sees what they do in public (docs/social.md "Witnesses").
    player: () => player?.getEyePosition() ?? null,
  });
  // The first day: Mme Pereira's welcome, the first promise (docs/social.md "The first day").
  startFirstWelcome({ day: () => today.gameDay, onNewDay: (cb) => void today.onNewGameDay(cb), notices, note: (text) => journal.note('note', text), enabled: services.playsOpening && !services.returningPlayer });
  // Victor Crane: a kind word after beating him, a gloat; his wager; his collection shown at the end of the arc (docs/social.md "Victor").
  wireRivalry({ rival: services.lots.rival, collection, notices, pool: SEED_GAMES, day: () => today.gameDay, onNewDay: (cb) => void today.onNewGameDay(cb) });
  // Front Street's moments (the stray come home, a secret, a find) count in the collector's book; a passer-by's lead goes in the journal.
  onStreetMark(() => services.collectorWatch.refresh());
  onLead((lead) => journal.note('note', lead.note, { weight: 'note' }));
  // A wrapped game gone from the collection (sold, traded, given) takes its paper with it (`holidays/giftWrap`).
  const pruneWraps = (): void => giftWrap.prune((id) => collection.owns(id));
  collection.subscribe(pruneWraps);
  // Lot one, the Christmas Game Boy, asked after and bought back from him once Mémé has told it (docs/grandma.md).
  wireCraneGameBoy({ family: services.family, wallet, collection, pool: SEED_GAMES, notices, day: () => today.gameDay });
  // Gaspard's Sunday back after his apology: the copy of Félix's he kept back from the sale, into the parcel.
  wireGaspardReturn({ family: services.family, collection, notices });
  const contacts: PhoneContacts = {
    // Who picks up now first (asleep, at work: said in words), then the warmest.
    list: () =>
      everyone()
        .filter((p) => hasNumber(p.id))
        .map((p) => ({ p, state: phoneState(p.id, today.gameDay, hour()) }))
        .sort((a, b) => Number(b.state.picks) - Number(a.state.picks) || standing(b.p.id).warmth - standing(a.p.id).warmth)
        .map(({ p, state }) => ({ id: p.id, name: p.short ?? p.name, note: state.note, picks: state.picks })),
    call: (id) => {
      // Mémé answers in her own words: the album, Sunday's lunch, her nightie after nine (docs/social.md "Mémé").
      if (id === MEME_ID && session) {
        const call = callGrandma({ day: today.gameDay, hour: hour(), photos: services.grandma.due !== null });
        if ('refused' in call) return call.refused;
        social.open(session(), { person: id, place: 'phone', opening: () => call.opening });
        return null;
      }
      const why = callRefusal(id, today.gameDay, hour());
      if (why !== null || !session) return why ?? 'The line is dead.';
      // The lost prototype's keeper answers about the grey cart as on a visit (src/story: "ring him from the bedroom").
      const story = services.story.onPhone(id);
      social.open(session(), { person: id, place: 'phone', ...(story ? { opening: () => story } : {}) });
      return null;
    },
  };
  callFromBook = (id) => contacts.call(id);
  // The messages friends left when nobody picked up (docs/social.md "The phone"), played off the phone.
  const voicemail: PhoneVoicemail = {
    count: () => messages().length,
    play: () =>
      playMessages().map((m) => {
        const day = daysAgoWords(m.day, today.gameDay);
        return { id: m.person, name: shortName(m.person), when: `${day}, ${clockShort(m.hour)}`, text: m.text };
      }),
  };
  // Mémé: her face as she is in her flat, and her warmth from the visits, lunches, gifts and the album's memories.
  rememberLook(MEME_ID, memeLook());
  rememberLook(GASPARD_ID, gaspardLook());
  // Everyone else, until a body of theirs is built: drawn as who they are (their card's sex and age), never a
  // bearded Mme Pereira in the People book.
  for (const card of everyone()) if (!rememberedLook(card.id)) rememberLook(card.id, randomLook(card.look.seed, card.look.role, castDress(card.id)));
  watchOutfit(() => services.perks.outfit.id);
  watchGrandma(services.grandma, { day: () => today.gameDay, title: (id) => MEMORIES.find((m) => m.id === id)?.title ?? null, scarf: () => services.perks.outfit.id === 'memeScarf' });
  watchGrandmaRituals(services.grandmaRituals, () => today.gameDay);
  // The player's news people can be told (a find, a medal, a Sunday at Mémé's: docs/social.md "Your news").
  startNews({ day: () => today.gameDay, collection, medals: services.medals, grandma: services.grandma, workshop: services.workshop, journal });
  return { conversation, social, peopleBook, contacts, voicemail };
}
