import { KEYS, PersistedStore } from '@/persistence';

/*
 * VICTOR'S WAGER (docs/social.md "Victor"): his wager taken up in conversation ("Next market day, first to the star
 * copy. Loser buys the espresso.") is a bet on his next hunt at the flea market (`economy/rivalCollector` `endHunt`): the player
 * beating him to the copy he is after wins it, him taking it loses it. The loser owes an espresso: Victor's is
 * waiting behind a café's counter for the player (`baristaTalk`), the player's is bought for him in conversation
 * (`social/rivalry`), a promise like any (`promises`): paid, kept; let go past `WAGER_GRACE` days, broken. One wager
 * at a time.
 */

/** How a wager stands: taken on `made`, settled on `settled` (won or lost), the espresso paid (`paid`). */
interface Wager {
  made: number;
  result: 'won' | 'lost' | null;
  settled: number | null;
  paid: boolean;
  /** Closed unpaid: the player welshed on the espresso they owed. */
  welshed?: boolean;
}

/** Game days the player has to buy the espresso they owe before Victor calls it welshing. */
const WAGER_GRACE = 3;

/** No wager ever made (`made` -1). */
const NONE: Wager = { made: -1, result: null, settled: null, paid: true };

const store = new PersistedStore<Wager>({
  key: KEYS.rivalWager,
  version: 1,
  defaults: () => NONE,
  read: (data) => {
    const d = data as Partial<Wager> | null;
    if (!d || typeof d.made !== 'number') return null;
    const result = d.result === 'won' || d.result === 'lost' ? d.result : null;
    return { made: d.made, result, settled: typeof d.settled === 'number' ? d.settled : null, paid: d.paid === true, welshed: d.welshed === true || undefined };
  },
});
const stored = store.load();
let wager: Wager | null = stored.made < 0 ? null : stored;

function save(next: Wager): void {
  wager = next;
  store.save(next);
}

/** Whether a wager is on and not settled yet (his next hunt decides it). */
export function wagerOpen(): boolean {
  return !!wager && wager.result === null;
}

/** The challenge taken up on `day`: a wager on his next hunt (one at a time; one still owed blocks a new one). */
export function makeWager(day: number): boolean {
  if (wager && (wager.result === null || !wager.paid)) return false;
  save({ made: day, result: null, settled: null, paid: false });
  return true;
}

/** His hunt on `day` ended: `beaten` (the player was first) wins the wager, `took` loses it. Returns the result, or null if none was on. */
export function settleWager(day: number, outcome: 'took' | 'beaten'): 'won' | 'lost' | null {
  if (!wager || wager.result !== null || day <= wager.made) return null;
  const result = outcome === 'beaten' ? 'won' : 'lost';
  save({ ...wager, result, settled: day });
  return result;
}

/** Victor owes the player an espresso (won, not drunk yet). */
export function victorOwesEspresso(): boolean {
  return !!wager && wager.result === 'won' && !wager.paid;
}

/** The player owes Victor an espresso (lost, not bought yet). */
export function playerOwesEspresso(): boolean {
  return !!wager && wager.result === 'lost' && !wager.paid;
}

/** The espresso owed was drunk or bought: the wager is closed, a new one may be made. */
export function payEspresso(): void {
  if (wager && wager.result !== null && !wager.paid) save({ ...wager, paid: true });
}

/**
 * On a new game day: an espresso owed to Victor past `WAGER_GRACE` days is welshing. The wager is closed (he will not
 * be paid now) and true is returned once, for the grudge.
 */
export function welshed(day: number): boolean {
  if (!wager || wager.result !== 'lost' || wager.paid || wager.settled === null || day - wager.settled <= WAGER_GRACE) return false;
  save({ ...wager, paid: true, welshed: true });
  return true;
}

/**
 * The espresso the player owes (or owed) Victor on the last wager they lost, as a promise: from the day it was lost,
 * due `WAGER_GRACE` days on, open, kept (bought) or broken (welshed). Null when the last wager was not lost.
 */
export function espressoOwed(): { made: number; due: number; state: 'open' | 'kept' | 'broken' } | null {
  if (!wager || wager.result !== 'lost' || wager.settled === null) return null;
  return { made: wager.settled, due: wager.settled + WAGER_GRACE, state: !wager.paid ? 'open' : wager.welshed ? 'broken' : 'kept' };
}
