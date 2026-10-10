import { ballotFor } from '@/building/coproState';
import { nextMeetingDay } from '@/building/coproMeeting';
import { ESTATE, estatePhase, estateStart } from '@/building/estateSale';
import { isPartyDay, PARTY } from '@/building/neighboursParty';
import type { Game } from '@/catalog/types';
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { consoleChecklists } from '@/economy/Honours';
import { clockShort } from '@/text/clock';
import { weekdayOf } from '@/time/wakefulness';
import type { Upcoming } from './upcoming';

/** Saturday in the game's week (`weekdayOf`: Monday 0 .. Sunday 6): the arcade's tournament. */
const SATURDAY = 5;
/** How far ahead a building event is worth a line. */
const AHEAD_DAYS = 3;

/** What the journal reads of the rest of the game for its "to do, to watch" lines; each optional, read-only. */
interface WatchSources {
  /** The game day. */
  day: number;
  /** The real date (the Fête des voisins is the last Friday of May). */
  date: Date;
  /** The arcade's Saturday tournament (`economy/ArcadeTournament`). */
  tournament?: { readonly isOn: boolean; view(): { entered: boolean; out: boolean; wins: number } };
  /** A small ad's seller expecting the player (`classifieds/Classifieds.booking`). */
  booking?: { ad: { name: string; flat: string; hours: readonly [number, number] }; day: number } | null;
  /** Copies held at the stalls today, and orders due on a stall (`economy/MarketLedger`). */
  held?: readonly { game: { title: string } }[];
  orders?: readonly { game: { title: string }; day: number }[];
  /** Games waiting in the parcel under the hall console, sealed cartons at home, consoles waiting on the kitchen table. */
  parcel?: number;
  cartons?: number;
  broken?: number;
  /** Milestone rewards still to claim in the collector's book (an older save's). */
  unclaimed?: number;
  /** The collection: a console's list or a club set one game short gets a line. */
  games?: readonly Game[];
}

/**
 * What else has a date or is waiting, for the journal's "to do, to watch": the arcade's tournament, the co-owners'
 * meeting, the estate sale (once only), the neighbours' party, a seller expecting the player, copies held and orders
 * due at the stalls, and what waits at home (the parcel, a carton, a console to mend, a reward). Today's lines first,
 * a few words each in the player's words; the day is a number beside the line (`inDays`), never in the words.
 */
export function upcomingWorld(s: WatchSources): Upcoming[] {
  const today: Upcoming[] = [];
  const later: Upcoming[] = [];
  const { day } = s;

  // The arcade's tournament, on the game week's Saturdays.
  if (s.tournament?.isOn) {
    const v = s.tournament.view();
    if (!v.entered) today.push({ kind: 'arcade', text: 'Tournament at the arcade: sign the sheet', inDays: 0 });
    else if (!v.out && v.wins < 3) today.push({ kind: 'arcade', text: 'Tournament at the arcade: your next round', inDays: 0 });
  } else if (s.tournament) {
    for (let n = 1; n <= AHEAD_DAYS; n++) {
      if (weekdayOf(day + n) !== SATURDAY) continue;
      later.push({ kind: 'arcade', text: 'Arcade tournament, Saturday', inDays: n });
      break;
    }
  }

  // A seller from the small ads, expecting the player at Park Corner Mansions.
  const booking = s.booking;
  if (booking) {
    const [from, to] = booking.ad.hours;
    const when = `${clockShort(from)} to ${clockShort(to)}`;
    if (booking.day === day) today.push({ kind: 'seller', text: `${booking.ad.name} expects you, ${when}, ${booking.ad.flat}, Park Corner Mansions`, inDays: 0 });
    else if (booking.day > day) later.push({ kind: 'seller', text: `${booking.ad.name} expects you, ${when}`, inDays: booking.day - day });
  }

  // The market: copies held under a stall till closing, orders turning up.
  for (const copy of s.held ?? []) today.push({ kind: 'market', text: `${copy.game.title} held for you at the market till closing`, inDays: 0 });
  for (const order of s.orders ?? []) {
    if (order.day <= day) today.push({ kind: 'market', text: `Your order of ${order.game.title} waits on its stall`, inDays: 0 });
    else if (order.day - day <= AHEAD_DAYS) later.push({ kind: 'market', text: `Your order of ${order.game.title} reaches the stall`, inDays: order.day - day });
  }

  // The building: the estate sale (once only), the co-owners' meeting, the party.
  const estate = estatePhase(day);
  if (estate === 'on') today.push({ kind: 'building', text: `The ${ESTATE.surname} estate sale in the entrance hall, once only`, inDays: 0 });
  else if (estate === 'notice') {
    const start = estateStart(day);
    if (start !== null) later.push({ kind: 'building', text: `The ${ESTATE.surname} estate sale, in the entrance hall`, inDays: start - day });
  }
  const meeting = nextMeetingDay(day);
  const voted = Object.keys(ballotFor(meeting).votes).length > 0;
  if (meeting === day) today.push({ kind: 'building', text: voted ? 'The co-owners meet: your ballot is in' : 'The co-owners meet: post your ballot first', inDays: 0 });
  else if (meeting - day <= AHEAD_DAYS && !voted) later.push({ kind: 'building', text: 'Co-owners’ meeting: the ballot is in the mailbox', inDays: meeting - day });
  if (isPartyDay(day, s.date)) today.push({ kind: 'building', text: `The neighbours’ party in the courtyard, from ${clockShort(PARTY.from)}`, inDays: 0 });
  else {
    for (let n = 1; n <= AHEAD_DAYS; n++) {
      const date = new Date(s.date.getFullYear(), s.date.getMonth(), s.date.getDate() + n, 12);
      if (!isPartyDay(day + n, date)) continue;
      later.push({ kind: 'building', text: 'The neighbours’ party in the courtyard', inDays: n });
      break;
    }
  }

  // What waits at home.
  if (s.parcel) today.push({ kind: 'home', text: s.parcel === 1 ? 'A game waits in the parcel under the hall console' : 'Games wait in the parcel under the hall console' });
  if (s.cartons) today.push({ kind: 'home', text: s.cartons === 1 ? 'A sealed carton waits at home' : 'Sealed cartons wait at home' });
  if (s.broken) today.push({ kind: 'home', text: s.broken === 1 ? 'A console waits on the kitchen table to be mended' : 'Consoles wait on the kitchen table to be mended' });
  if (s.unclaimed) today.push({ kind: 'home', text: 'The collector’s book on the sideboard has a reward for you' });

  // One game short of a console's list or of a club set: worth a look out for.
  if (s.games) {
    for (const list of consoleChecklists(s.games)) {
      const missing = list.entries.filter((e) => !e.have);
      if (missing.length === 1) later.push({ kind: 'collection', text: `One game from the whole ${list.name} list: ${missing[0]!.game.title}` });
    }
    for (const set of COLLECTOR_SETS) {
      const missing = setProgress(set, s.games).filter((p) => !p.have);
      if (missing.length === 1) later.push({ kind: 'collection', text: `One piece from the club’s “${set.name}”: ${missing[0]!.piece.name}` });
    }
  }
  return [...today, ...later];
}
