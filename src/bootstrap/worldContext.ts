import type { Object3D } from 'three';
import { parcelDelayHours, setBuildingPost } from '@/building/socialBuilding';
import { bindRouxMove } from '@/building/rouxMove';
import { callCat, callCatFor } from '@/game/CatCare';
import type { PlayerActivity } from '@/game/PlayerActivity';
import type { Session } from '@/game/Session';
import type { ModalLike } from '@/game/SessionParts';
import type { SocialServices } from '@/social/talk';
import type { Notices } from '@/notices';
import type { PastimeCurtain, Pastimes } from '@/household';
import { MailPost } from '@/collection/MailPost';
import { Doorstep } from '@/world/hallway/Doorstep';
import type { BuildContext, ClassifiedsContext, MarketHallServices, WorldPanels } from '@/world/buildContext';
import type { BuildingServices, CoproPanelLike, TradePanelLike } from '@/world/stairwell/building';
import type { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import type { PhoneEvents, PhoneFriends } from '@/ui/household/PhonePanel';
import type { Cat } from '@/world/cat';
import type { Late } from './late';
import type { Services } from './services';

/** The flat's panels (made with the UI) its builders hand out: the book on the sideboard, the journal, a neighbour's swap. */
export interface FlatPanels {
  collectorBook: ModalLike;
  journalPanel: ModalLike;
  neighbourTradePanel: TradePanelLike;
  /** The co-owners' postal vote, opened by the hall's ballot box. */
  coproPanel?: CoproPanelLike;
  notices: Notices;
  /** The bedroom's phone (it reaches the friends once they exist, here) and wardrobe (docs/household.md). */
  phone: ModalLike & { setFriends(friends: PhoneFriends): void; setEvents(events: PhoneEvents): void };
  wardrobe: ModalLike;
  /** What the street's shops and the hall console open (`BuildContext.panels`). */
  panels: WorldPanels;
  /** The teleport's curtain: the household's long jobs fade to black behind it (`household/pastime.ts`). */
  fader: PastimeCurtain;
  /** The kitchen table's console repair and TV REPAIR's counter for working consoles (`BuildContext.classifieds`). */
  repairPanel?: ClassifiedsContext['repairPanel'];
  consoleDesk?: ModalLike;
  /** The people the player talks to (`BuildContext.social`, docs/social.md). */
  social?: SocialServices;
}

/**
 * The building's life the hallway and the stairs share (docs/zones.md "The stairwell"): who rings at the door, the
 * mail orders in the post (made after the parcel, whose changes it hears second), the neighbours' swaps. Mrs Roux's
 * move is bound here too, once, with the doorstep its notes slip under the door: every builder that shows a part of
 * it reads `rouxPhase` from now on, none binds it.
 */
export function makeBuilding(services: Services, flat: FlatPanels, activity: PlayerActivity): BuildingServices {
  const { collection, deliveries, market, sky, upgrades } = services;
  const building: BuildingServices = {
    doorstep: new Doorstep(),
    post: new MailPost({ collection, deliveries, calendar: market, hours: () => sky.dayNight.state.hours, home: () => activity.inFlat, delayHours: parcelDelayHours }),
    trades: services.neighbourTrades,
    tradePanel: flat.neighbourTradePanel,
    copro: flat.coproPanel,
  };
  // The concierge's word on the post reads it (docs/social.md "The building").
  setBuildingPost(building.post);
  bindRouxMove({ today: services.today, upgrades, doorstep: building.doorstep });
  return building;
}

/** What the context is made of besides the services: what the UI made, what the world made first, what comes later. */
interface ContextParts {
  flat: FlatPanels;
  /** The market hall's panels (made with the UI). */
  marketHall: MarketHallServices;
  /** The camera: distances to a screen drive its volume. */
  listener: Object3D;
  acoustics: SoundOcclusion;
  building: BuildingServices;
  pastimes: Pastimes;
  /** The Session, made last: only asked on a console click. */
  session: Late<Session>;
  /** The cat, made after the flat: only asked on a click. */
  cat: Late<Cat>;
}

/**
 * What every zone builder may draw on, assembled once (`BuildContext`): the services, grouped as the builders read them
 * (`collection`, `home`, `money`, `arcade`, `market`), and what the UI made for them. Each builder's signature names the
 * slice it reads; this is the whole.
 */
export function makeBuildContext(services: Services, parts: ContextParts): BuildContext {
  const { cssLayer, input, sky, covers, collection, deliveries, strays, overflow, arrangement, boxPool, upgrades, wallet, scores, arcadeDaily, prizes, medals, league, arcadeScreen, tournament, jackpot, replays, arcadeHabits, homeScores, milestones, collectorWatch, firstDay, market, fame } = services;
  const { flat, marketHall, listener, acoustics, building, pastimes, session, cat } = parts;
  return {
    cssLayer,
    listener,
    acoustics,
    input,
    sky,
    covers,
    collection: { games: collection, owns: (id) => collection.owns(id), isWanted: (id) => collection.isWanted(id), shelved: strays, strays, deliveries, overflow, arrangement, boxes: boxPool, showcases: services.showcases },
    home: {
      upgrades,
      furnishings: services.furnishings,
      shelfLabels: services.shelfLabels,
      onSelectPlatform: (id) => session.get().focusPlatform(id),
      // The feather wand (an arcade prize) calls the cat over; the cat exists by the time anyone can click it.
      callCat: () => (cat.get().adopted ? callCat(cat.get(), 'feathers') : 'The feathers swish. No cat lives here yet: the pet shop on Front Street has some to adopt.'),
      collector: { book: flat.collectorBook, milestones, watch: collectorWatch, honours: services.honours },
      firstDay,
      journalPanel: flat.journalPanel,
      // What the kitchen, the bathroom and the bedroom are for (docs/household.md).
      household: {
        life: services.homeLife,
        phone: flat.phone,
        wardrobe: flat.wardrobe,
        notices: flat.notices,
        catName: () => services.catSettings.settings.name,
        callCat: () => callCatFor(cat.get(), 'treats'),
        pastimes,
        boxOf: (gameId) => strays.homeBox?.(gameId),
      },
    },
    money: { wallet, purse: wallet },
    arcade: { scores, daily: arcadeDaily, prizes, medals, league, screen: arcadeScreen, tournament, jackpot, replays, habits: arcadeHabits, homeScores },
    market: { stock: market, day: services.marketDay, fame, hall: marketHall, lots: services.lots },
    today: services.today,
    panels: flat.panels,
    notices: flat.notices,
    building,
    story: services.story,
    // The paper's small ads and the sellers' flats, the consoles mended at home (docs/economy.md, docs/household.md).
    classifieds: flat.repairPanel && flat.consoleDesk
      ? { book: services.classifieds, lot: (ad) => services.sellerLots.lotFor(ad), workshop: services.workshop, repairPanel: flat.repairPanel, consoleDesk: flat.consoleDesk }
      : undefined,
    social: flat.social,
  };
}
