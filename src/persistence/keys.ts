import { safeStorage, storageKeys } from './storage';

/** Every key the game writes starts with this. */
export const ROOT_PREFIX = 'bibliothek.';

/**
 * `?debug` plays on a save of its own (the seed collection, the editor's add pane), so it never writes into the
 * player's real one: its keys start `bibliothek.debug.` instead of `bibliothek.`.
 */
export const DEBUG_SAVE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** The prefix of this session's save keys. */
export const SAVE_PREFIX = DEBUG_SAVE ? `${ROOT_PREFIX}debug.` : ROOT_PREFIX;

/** Browser-side caches (search results, page views): not progress, shared by the real and the debug save. */
export const CACHE_PREFIX = `${ROOT_PREFIX}cache.`;

/** Unreadable saves are copied here (`bibliothek.corrupt.<key>.<timestamp>`) before the store starts afresh. */
export const CORRUPT_PREFIX = `${ROOT_PREFIX}corrupt.`;

const save = (name: string) => `${SAVE_PREFIX}${name}`;
const pref = (name: string) => `${ROOT_PREFIX}${name}`;

/**
 * Every localStorage key, in one place. Save keys follow `SAVE_PREFIX` (the debug save has its own);
 * preferences (`settings`, `quality`, `cat`) are the same in both. The names keep the versions they
 * were first written with: the format version now lives inside the value (see `PersistedStore`).
 */
export const KEYS = {
  // Preferences: kept by a new game.
  settings: pref('settings.v1'),
  quality: pref('quality'),
  cat: pref('cat.v1'),
  marketRadio: pref('marketRadio.v1'),
  // Progress.
  collection: save('collection.v1'),
  deliveries: save('deliveries.v1'),
  wallet: save('wallet.v1'),
  prizes: save('prizes.v1'),
  home: save('home.v1'),
  market: save('market.v1'),
  standing: save('standing.v1'),
  notices: save('notices.v1'),
  calendar: save('calendar.v1'),
  arcadeScores: save('arcade.v2'),
  arcadeScoresLegacy: save('arcade.v1'),
  arcadeDaily: save('arcadeDaily.v1'),
  arcadeMedals: save('arcadeMedals.v1'),
  arcadeLeague: save('arcadeLeague.v1'),
  arcadeJackpot: save('arcadeJackpot.v1'),
  arcadeTournament: save('arcadeTournament.v1'),
  arcadeReplays: save('arcadeReplays.v1'),
  arcadeHabits: save('arcadeHabits.v1'),
  /** The home cabinet's own hall of fame, game by game (`world/homeArcade/HomeScores`): nothing to do with the arcade's. */
  homeArcade: save('homeArcade.v1'),
  /** The turntable: the record last put on (`vinyl/`). */
  turntable: save('turntable.v1'),
  payoutStats: save('payoutStats.v1'),
  position: save('position.v1'),
  moodLamp: save('moodLamp.v1'),
  busker: save('busker.v1'),
  finds: save('finds.v1'),
  giveaway: save('giveaway.v1'),
  garageSale: save('garageSale.v1'),
  trader: save('trader.v1'),
  /** What the player carries from Front Street's shops (`errands/`): the scrap, the treats, the bunch, the croissant; and today's buys. */
  pocket: save('pocket.v1'),
  /** The stray cat: how far he trusts the player, the last real day he was fed and brought a find (`street/life/StrayCat`). */
  strayCat: save('strayCat.v1'),
  /** The coin dropped each game day on Front Street, once picked (`street/shops/DroppedCoins`). */
  gameDayFinds: save('gameDayFinds.v1'),
  /** The rival collector: who beat whom, today's hunt at the flea market, what he still has in his suitcase (`economy/rivalCollector`). */
  rival: save('rival.v1'),
  /** The saleroom's results, lot by lot, for the sale day (`economy/AuctionHouse`). */
  auction: save('auction.v1'),
  /** Sealed box lots bought, waiting at home to be unpacked, and the flea market's carton of the day (`economy/SealedLots`). */
  sealedLots: save('sealedLots.v1'),
  scratch: save('scratch.v1'),
  scratchCard: save('scratchCard.v1'),
  visitors: save('visitors.v1'),
  journal: save('journal.v1'),
  milestones: save('milestones.v1'),
  valueHistory: save('valueHistory.v1'),
  firstDay: save('firstDay.v1'),
  post: save('post.v1'),
  neighbourTrades: save('neighbourTrades.v1'),
  /** How well the player stands with each resident of the building (`building/friendship`), and their complaints. */
  neighbourFriendship: save('neighbourFriendship.v1'),
  /** The game day the cat last slipped out onto the stairs (`world/cat/escapes`): rare, a couple of days apart at least. */
  catOutings: save('catOutings.v1'),
  /** Whose flat the player is visiting (or last visited) and whose they have been in (`world/neighbourFlat/visits`). */
  neighbourVisits: save('neighbourVisits.v1'),
  /** The building's estate sale: when it runs, what went (`building/estateSale`). */
  estateSale: save('estateSale.v1'),
  /** The neighbours' party in the courtyard: the tournament's plays and prize, per party (`building/neighboursParty`). */
  neighboursParty: save('neighboursParty.v1'),
  household: save('household.v1'),
  /** The sort the shelves stand in and the player's own arrangement of the boxes (`world/shelving/arrangement`). */
  shelves: save('shelves.v1'),
  /** Where the player moved the flat's furniture (`furnishing/FurnitureLayout`). */
  furniture: save('furniture.v1'),
  /** Which game stands in which slot of the flat's displays (`world/showcase/Showcases`). */
  showcases: save('showcases.v1'),
  /** The labels printed and stuck on the shelves' edges (`world/labels/ShelfLabels`). */
  shelfLabels: save('shelfLabels.v1'),
  /** Games nights and open houses: planned, held, the paper's article, the evenings' photos (`visitors/gathering/GatheringBook`). */
  gatherings: save('gatherings.v1'),
  /** The sets and consoles completed, and whether the club came to see each (`economy/Honours`). */
  honours: save('honours.v1'),
  /** The lost prototype's trail: how far the player followed it (`story/PrototypeStory`). */
  prototypeStory: save('prototypeStory.v1'),
  /** The building's keys the player was given (the cellar's, `building/keys`). */
  buildingKeys: save('buildingKeys.v1'),
  /** The game day the building last had a power cut (`building/blackout`): one storm's evening a day at most. */
  blackout: save('blackout.v1'),
  /** What the player took from the cellars and which storage boxes they opened (`world/cellar/cellarFinds`). */
  cellar: save('cellar.v1'),
  /** The co-ownership meetings' votes and what they decided (`building/coproState`). */
  copro: save('copro.v1'),
  /** The concierge's errand and how she knows the player (`building/conciergeState`). */
  concierge: save('concierge.v1'),
  /** Mrs Roux's move from the 5th floor: the day the player bought her flat, the notes sent (`building/rouxMove`). */
  rouxMove: save('rouxMove.v1'),
  /** The attic up the lift: whether its code was found, the collector's cabinet beaten, his chest opened (`world/attic/atticState`). */
  attic: save('attic.v1'),
  /** The roof's aerial: where it points, the old channels it brought in for the flat's TV (`world/roof/channels`). */
  aerial: save('aerial.v1'),
  /** The building's treasure hunt, the sixth floor: the clues found and when (`building/hunt`). */
  buildingHunt: save('buildingHunt.v1'),
  /** The Gaming Weekly's small ads read, the seller's visit booked, what was bought from whom (`classifieds/Classifieds`). */
  classifieds: save('classifieds.v1'),
  /** The consoles bought broken, mended at the kitchen table or not yet (`repair/Workshop`). */
  workshop: save('workshop.v1'),
  // Caches.
  longplayCache: `${CACHE_PREFIX}longplay.v1`,
  fameCache: `${CACHE_PREFIX}fame.v1`,
  /** The LaunchBox scans found per game (backs, spines, cartridges, discs), and the art addresses answered 404 lately. */
  scanCache: `${CACHE_PREFIX}scans.v1`,
  artMisses: `${CACHE_PREFIX}artMisses.v1`,
  /** The press's scores and a quoted line per game, from its Wikipedia article (`reviews/Reviews`). */
  reviewsCache: `${CACHE_PREFIX}reviews.v1`,
} as const;

/** Preferences, not progress: a new game keeps them. */
export const PREFERENCE_KEYS: readonly string[] = [KEYS.settings, KEYS.quality, KEYS.cat, KEYS.marketRadio];

/** Keys that exist once anything was played (the wallet is written on the first coin spent or won). */
export const PROGRESS_MARKERS: readonly string[] = [KEYS.wallet, KEYS.collection, KEYS.market, KEYS.arcadeScores];

/**
 * The keys of this session's save as they stand in storage: everything under `SAVE_PREFIX` but the
 * preferences, the caches, the corrupt copies and (for the real save) the debug save. What "new game" wipes.
 */
export function saveKeys(storage: Storage | null = safeStorage()): string[] {
  const other = DEBUG_SAVE ? null : `${ROOT_PREFIX}debug.`;
  return storageKeys(storage).filter((key) => key.startsWith(SAVE_PREFIX)
    && !PREFERENCE_KEYS.includes(key)
    && !key.startsWith(CACHE_PREFIX)
    && !key.startsWith(CORRUPT_PREFIX)
    && (other === null || !key.startsWith(other)));
}
