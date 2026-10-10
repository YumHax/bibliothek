import { KEYS, PersistedStore } from '@/persistence';
import { inHours } from '@/time/clock';
import type { Game } from '@/catalog/types';
import type { Transactions } from '@/economy/Transactions';
import { REPUTATION } from '@/economy/pricing';
import { gameDayRandom } from '@/time/daily';
import { dayKey } from '@/economy/calendar';
import { STAIRWELL_PLAN } from '@/world/stairwell/stairwellPlan';
import type { BoardNote } from './boardNotes';
import { movedAway, residentName } from './residentsHome';
import { befriend } from './friendship';
import { doorKey } from '@/world/stairwell/building';
import { fnv1a } from '@/random';
import { buildingName, buildingWarmth } from '@/social/reputation';
import { BUILDING_SOCIAL } from './buildingSocialPlan';
import { formatCoins } from '@/text/money';

/*
 * The neighbours' party in the courtyard (the courtyard's `NeighboursParty` dresses it): once every `every` game days,
 * and on the real Fête des voisins (the last Friday of May), from the afternoon into the night. The residents come
 * down with a dish each, string lights go up between the walls, a radio plays; at a table the residents buy games off
 * the player (the party's sale, a fair price: `PARTY.saleBonus`), and on a cathode cabinet someone wheeled up from the
 * cellars they hold a little tournament: the player's best score against theirs, a few plays each, a prize for topping
 * the table. The hall's noticeboard announces it from a few days before. What the player won is kept per party.
 */

export const PARTY = {
  /** One party every so many game days, on this day of the cycle. */
  every: 28,
  phase: 20,
  /** The tables and the lights are up from `setUp` (game hours); the residents are down from `from` until `to`. */
  setUp: 14,
  from: 17,
  to: 24,
  /** The board pins the notice this many game days ahead. */
  announceDays: 4,
  /** The tournament: the games it may be on (one a party), plays allowed each, the prize for topping the table (tickets). */
  tournament: { games: ['breakout', 'snake', 'stacker', 'invaders', 'frog', 'comets'] as const, plays: 3, prize: 60 },
  /** The residents' scores, in tickets' worth of points on the party's game (a good player is about 30). */
  residentTickets: [10, 34] as const,
  /**
   * The residents' table pays what the WE BUY desk pays a legend of the market, whatever the player's standing there
   * (never more: buying to sell back must not pay, `pricing.ts`); the game goes home with them, not to the stalls.
   */
  saleBonus: REPUTATION.buyBackBonus * (REPUTATION.levels.length - 1),
};

/** What the residents say at the party, on top of their own lines (in turn). */
export const PARTY_TALK: readonly string[] = [
  'Try the quiche, it’s Mrs Dubois’s. Don’t tell her I said it was dry.',
  'Once a year we all come down. Feels nice, doesn’t it?',
  'Have a go on the old cabinet! J.-P. wheeled it up from the cellars.',
  'Somebody brought a radio. Somebody always brings a radio.',
  'We’ll buy a game or two off you, if you’re selling. At the red table.',
  'Those lights have been in the concierge’s lodge since 1987.',
];

/**
 * A game sold at the party's table on game day `day`: one of the residents (by the game) takes it home, and thinks
 * the better of the player for it (`friendship`, once a day). Returns what is said.
 */
function partySold(game: { id: string; title: string }, offer: number, day: number): string {
  const guests = STAIRWELL_PLAN.residents.filter((g) => !movedAway(g.k, g.i));
  const r = guests[fnv1a(`party-buyer:${game.id}`) % guests.length]!;
  befriend(doorKey(r.k, r.i), 3, 'partySale', day);
  return `${residentName(r.k, r.i)} takes "${game.title}" home for ${formatCoins(offer)}.`;
}

/** The residents' table as the WE BUY desk's panel takes a buyer: who they are, what they pay, what is said. */
interface PartyBuyer {
  heading: string;
  blurb: string;
  bonus: number;
  sell: (game: Game, offer: number) => { ok: boolean };
  soldLine: (game: Game, offer: number) => string;
}

/**
 * The residents' table at the party: they buy games off the player for the party's tin (`PARTY.saleBonus` over the
 * desk's price), each sale through the one `Transactions` and told as `partySold` says it.
 */
export function partyBuyer(tx: Pick<Transactions, 'sellToNeighbour'>, today: { readonly gameDay: number }): PartyBuyer {
  return {
    heading: 'The residents’ table',
    blurb: 'The neighbours buy games off you at a fair price, cash from the party’s tin. What you sell goes home with them.',
    bonus: PARTY.saleBonus,
    sell: (game, offer) => tx.sellToNeighbour(game, offer),
    soldLine: (game, offer) => partySold(game, offer, today.gameDay),
  };
}

/** A game day `?debug` made a party day (`forcePartyOn`), for this page only. */
let forcedDay: number | null = null;

/** `?debug`: game day `day` is a party day too (the courtyard sets up as its hours come). */
export function forcePartyOn(day: number): void {
  forcedDay = day;
}

/** The day of the cycle the parties fall on, counted in game days (or the one `?debug` asked for). */
function cycleParty(day: number): boolean {
  return (day > 0 && day % PARTY.every === PARTY.phase) || day === forcedDay;
}

/** Whether `date` is the last Friday of May: the Fête des voisins. */
function isFeteDesVoisins(date: Date): boolean {
  return date.getMonth() === 4 && date.getDay() === 5 && date.getDate() + 7 > 31;
}

/** Whether game day `day` (on the real date `date`) is a party day. */
export function isPartyDay(day: number, date: Date): boolean {
  return cycleParty(day) || isFeteDesVoisins(date);
}

/** What stands in the courtyard at `hours` of a party day: nothing, the tables set up, or the party itself. */
export function partyStage(day: number, hours: number, date: Date): 'none' | 'setUp' | 'on' {
  if (!isPartyDay(day, date)) return 'none';
  if (inHours(hours, PARTY)) return 'on';
  return hours >= PARTY.setUp ? 'setUp' : 'none';
}

/** The party's tournament game on day `day`. */
export function tournamentGame(day: number): (typeof PARTY.tournament.games)[number] {
  const { games } = PARTY.tournament;
  return games[fnv1a(`party-game:${day}`) % games.length]!;
}

/** A guest of the party: the resident's door (landing, door), name, look's seed. */
interface PartyGuest {
  k: number;
  i: number;
  name: string;
  seed: number;
}

/** The residents who come down on day `day`: all those of the plan, and a few of their names for the scores. */
export function partyGuests(): PartyGuest[] {
  // Not whoever has moved out of the building since (Mrs Roux, `rouxMove`).
  return STAIRWELL_PLAN.residents.filter((r) => !movedAway(r.k, r.i)).map((r) => ({ k: r.k, i: r.i, name: residentName(r.k, r.i), seed: r.seed }));
}

/** The residents' scores on the party's game, seeded by the day: their name and score, best first. */
export function residentScores(day: number, pointsPerTicket: number): { name: string; score: number }[] {
  const random = gameDayRandom('party-scores', day);
  const [low, high] = PARTY.residentTickets;
  return partyGuests()
    .map((g) => ({ name: g.name, score: Math.round((low + (high - low) * random() * random() + (high - low) * 0.3 * random()) * pointsPerTicket) }))
    .sort((a, b) => b.score - a.score);
}

/** The poster's last line, by what the building thinks of the player (`social/reputation`): a welcome, or a dig. */
function posterLine(): string[] {
  const w = buildingWarmth();
  const { party } = BUILDING_SOCIAL;
  return w >= party.warm ? [party.posterWarm] : w <= party.cold ? [party.posterCold] : [];
}

/** The board's notes about the party: the poster in the days before, the thanks the day after. */
export function partyNotes(day: number, date: Date): BoardNote[] {
  for (let ahead = 0; ahead <= PARTY.announceDays; ahead++) {
    if (!cycleParty(day + ahead) && !(ahead === 0 && isFeteDesVoisins(date))) continue;
    const when = ahead === 0 ? 'TONIGHT' : ahead === 1 ? 'TOMORROW' : `IN ${ahead} DAYS`;
    return [
      {
        id: 'party-poster',
        title: `NEIGHBOURS' PARTY · ${when}`,
        lines: ['In the courtyard, from 5 pm.', 'Bring a dish, a chair, a game to sell.', 'Tournament on the old cabinet!', ...posterLine()],
        paper: 0xf6e7a8,
        signed: 'Mme Pereira & the residents',
        weight: 2,
      },
    ];
  }
  if (cycleParty(day - 1)) {
    const toast = buildingWarmth() >= BUILDING_SOCIAL.party.warm ? [BUILDING_SOCIAL.party.toast.replace('{name}', buildingName())] : [];
    return [{ id: 'party-thanks', title: 'THANK YOU ALL', lines: ['For a lovely evening.', ...toast, 'A blue dish was left behind:', 'ask at the lodge.'], paper: 0xffffff, signed: 'The residents', weight: 1 }];
  }
  return [];
}

/**
 * Which party a game day's tournament belongs to: the cycle's party by its game day; on the real Fête des voisins (every
 * game day of that date is a party day) the date itself, so its prize is won once that date, not once a game day.
 */
function partyId(day: number, date: Date): string {
  return !cycleParty(day) && isFeteDesVoisins(date) ? `fete:${dayKey(date)}` : `day:${day}`;
}

/** The tournament's book for one party (`partyId`): the plays the player has used, whether the prize went to them. */
interface TournamentFile {
  party: string;
  plays: number;
  won: boolean;
}

const store = new PersistedStore<TournamentFile>({
  key: KEYS.neighboursParty,
  version: 2,
  defaults: () => ({ party: '', plays: 0, won: false }),
  // Version 1 kept the party's game day.
  migrate: { 1: (data) => (data && typeof (data as { day?: unknown }).day === 'number' ? { ...(data as object), party: `day:${(data as { day: number }).day}` } : data) },
  read: (data) => {
    const d = data as Partial<TournamentFile> | null;
    return d && typeof d.party === 'string' && typeof d.plays === 'number' && typeof d.won === 'boolean' ? { party: d.party, plays: d.plays, won: d.won } : null;
  },
});

/** The player's tournament at the party of game day `day` on the real date `date`: plays used, whether they won it. */
export function tournamentOf(day: number, date: Date): { plays: number; won: boolean } {
  const file = store.load();
  return file.party === partyId(day, date) ? { plays: file.plays, won: file.won } : { plays: 0, won: false };
}

/** A play of the tournament at the party of game day `day` (real date `date`) ended; `won` if it topped the residents. */
export function recordTournamentPlay(day: number, date: Date, won: boolean): void {
  const now = tournamentOf(day, date);
  store.save({ party: partyId(day, date), plays: now.plays + 1, won: now.won || won });
}
