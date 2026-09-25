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
  payoutStats: save('payoutStats.v1'),
  position: save('position.v1'),
  moodLamp: save('moodLamp.v1'),
  busker: save('busker.v1'),
  finds: save('finds.v1'),
  giveaway: save('giveaway.v1'),
  garageSale: save('garageSale.v1'),
  trader: save('trader.v1'),
  scratch: save('scratch.v1'),
  scratchCard: save('scratchCard.v1'),
  visitors: save('visitors.v1'),
  journal: save('journal.v1'),
  milestones: save('milestones.v1'),
  valueHistory: save('valueHistory.v1'),
  firstDay: save('firstDay.v1'),
  post: save('post.v1'),
  neighbourTrades: save('neighbourTrades.v1'),
  // Caches.
  longplayCache: `${CACHE_PREFIX}longplay.v1`,
  fameCache: `${CACHE_PREFIX}fame.v1`,
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

/** Preferences, not progress: a new game keeps them. */
export const PREFERENCE_KEYS: readonly string[] = [KEYS.settings, KEYS.quality, KEYS.cat];

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
