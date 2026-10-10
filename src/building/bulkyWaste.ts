import { KEYS, PersistedStore } from '@/persistence';
import type { HomeUpgrade } from '@/economy/homeGoods';
import { CONSOLES, brokenOf, type FaultId } from '@/repair/consoles';
import type { PlatformId } from '@/catalog/types';
import { gameDayRandom } from '@/time/daily';
import { chance, integer, pick, shuffled } from '@/random';
import { doorKey } from '@/world/stairwell/building';
import type { BoardNote } from './boardNotes';
import { befriend } from './friendship';
import { partyGuests } from './neighboursParty';

/*
 * BULKY-WASTE DAY ("les encombrants"): one game day a week a resident clears out a cupboard and puts it out in the
 * courtyard by the bins for the lorry that comes at dawn (`world/courtyard/placeBulky` lays it out). Most of it is
 * junk (a mattress, a chair with a split seat, a rolled carpet), but there is always a carton of old games, often a
 * piece of furniture the flat has room for, and some weeks a console that does not switch on. Whatever the player
 * carries off is theirs, free: the games go in the parcel, the piece stands in the flat, the console waits on the
 * kitchen chair for its repair. Whoever put it out is glad it found a home. The hall's board says so the day before.
 * Taken things are kept per day; the next bulky day starts afresh.
 */

const BULKY = {
  /** One bulky day every `every` game days, on this day of the cycle (never a party day: those fall on 20 of 28). */
  every: 7,
  phase: 5,
  /** Loose games in the carton. */
  games: [2, 4] as const,
  /** How often a piece of furniture for the flat is out, and a broken console. */
  pieceChance: 0.7,
  consoleChance: 0.45,
  /** How many pieces of junk round it. */
  junk: [3, 5] as const,
  /** What taking something raises the owner's friendship by (once a day). */
  warmth: 3,
} as const;

/** Furniture for the flat that turns up at the kerb (`HOME_GOODS` ids): what a pile may offer, if the flat has room. */
export const BULKY_PIECES = ['armchair', 'floorLamp', 'sideTable', 'mirror', 'dresser', 'bookcase', 'crt', 'framedPrint'] as const satisfies readonly HomeUpgrade[];
export type BulkyPiece = (typeof BULKY_PIECES)[number];

/** What nobody wants (drawn, never taken). */
export const BULKY_JUNK = ['mattress', 'chair', 'carpet', 'crockery', 'deadTv', 'pram', 'skis'] as const;
export type BulkyJunk = (typeof BULKY_JUNK)[number];

/** One day's pile: who put it out, what is in it. */
export interface BulkyLot {
  day: number;
  owner: { k: number; i: number; name: string };
  junk: BulkyJunk[];
  /** A piece for the flat, or null (none out, or the flat has no room for any). */
  piece: BulkyPiece | null;
  /** A console that does not switch on, or null. */
  console: { platform: PlatformId; fault: FaultId } | null;
  /** How many loose games are in the carton. */
  games: number;
}

/** A game day `?debug` made a bulky-waste day too (this page only). */
let forcedDay: number | null = null;

/** `?debug`: game day `day` is a bulky-waste day too (the courtyard lays the pile out the next time it is built). */
export function forceBulkyDay(day: number): void {
  forcedDay = day;
}

/** Whether game day `day` is a bulky-waste day. */
function isBulkyDay(day: number): boolean {
  return (day > 0 && day % BULKY.every === BULKY.phase) || day === forcedDay;
}

/**
 * Day `day`'s pile, the same for the same day (`gameDayRandom`); the piece is the first of the day's order the flat
 * has room for (`fits`: `HomeUpgrades.canBuy`). Null on any other day, or with nobody left in the building.
 */
export function bulkyLot(day: number, fits: (piece: BulkyPiece) => boolean): BulkyLot | null {
  if (!isBulkyDay(day)) return null;
  const guests = partyGuests();
  if (!guests.length) return null;
  const random = gameDayRandom('bulky', day);
  const owner = pick(random, guests);
  const junk = shuffled(random, BULKY_JUNK).slice(0, integer(random, BULKY.junk[0], BULKY.junk[1]));
  const pieceOut = chance(random, BULKY.pieceChance);
  const order = shuffled(random, BULKY_PIECES);
  const piece = pieceOut ? (order.find(fits) ?? null) : null;
  const platforms = Object.keys(CONSOLES) as PlatformId[];
  const platform = pick(random, platforms);
  const { fault } = brokenOf(platform, random(), random());
  const console = chance(random, BULKY.consoleChance) ? { platform, fault } : null;
  return { day, owner: { k: owner.k, i: owner.i, name: owner.name }, junk, piece, console, games: integer(random, BULKY.games[0], BULKY.games[1]) };
}

/** What was carried off on the last bulky day: `piece`, `console`, `game:<id>`. */
interface State {
  day: number;
  taken: string[];
}

const store = new PersistedStore<State>({
  key: KEYS.bulkyWaste,
  version: 1,
  defaults: () => ({ day: 0, taken: [] }),
  read: (data) => {
    const d = data as Partial<State> | null;
    return d && typeof d.day === 'number' && Array.isArray(d.taken) ? { day: d.day, taken: d.taken.filter((t): t is string => typeof t === 'string') } : null;
  },
});
let state: State = store.load();

/** Whether `what` (`piece`, `console`, `game:<id>`) was carried off on day `day`. */
export function bulkyTaken(day: number, what: string): boolean {
  return state.day === day && state.taken.includes(what);
}

/** `what` was carried off `lot`'s pile: kept for the day, and its owner is glad of it. */
export function takeFromBulky(lot: BulkyLot, what: string): void {
  if (bulkyTaken(lot.day, what)) return;
  state = { day: lot.day, taken: [...(state.day === lot.day ? state.taken : []), what] };
  store.save(state);
  befriend(doorKey(lot.owner.k, lot.owner.i), BULKY.warmth, 'bulkyWaste', lot.day);
}

/** The board's notes: the concierge's reminder the day before, the owner's word on the day. */
export function bulkyNotes(day: number): BoardNote[] {
  if (isBulkyDay(day + 1)) {
    return [{ id: 'bulky-eve', title: 'BULKY WASTE · TOMORROW', lines: ['Out by the bins in the courtyard,', 'not on the pavement please.', 'The lorry comes at dawn.'], paper: 0xdfe8ef, signed: 'The concierge', weight: 1 }];
  }
  const guests = isBulkyDay(day) ? partyGuests() : [];
  if (!guests.length) return [];
  const owner = pick(gameDayRandom('bulky', day), guests);
  return [{ id: 'bulky-day', title: 'CLEARING OUT', lines: ['A few things by the bins,', 'games among them.', 'Help yourselves before the lorry!'], paper: 0xf4ecd8, signed: owner.name, weight: 1 }];
}
