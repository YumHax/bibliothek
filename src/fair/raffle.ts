import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom } from '@/time/daily';

/*
 * The Grand Flea Fair's raffle on Front Street (docs/zones.md "The street", the Fair's day): tickets sold at the
 * overflow stall by RETRO GAMES through the day, drawn at `drawAt`; a boxed game for the winner, put by on the stall
 * until it is taken. The more tickets, the better the chance, never said in numbers. Kept for the Fair's game day.
 */

export const RAFFLE = {
  /** Coins a ticket. */
  price: 2,
  /** Tickets one person may buy on the day. */
  perDay: 5,
  /** The game hour the drum is turned (tickets are sold until then). */
  drawAt: 18,
  /** Each ticket's chance, as the draw weighs it (not told). */
  each: 0.14,
} as const;

type Prize = 'none' | 'won' | 'taken';

interface RaffleState {
  /** The Fair's game day the tickets are for. */
  day: number;
  tickets: number;
  prize: Prize;
}

const store = new PersistedStore<RaffleState>({
  key: KEYS.fairRaffle,
  version: 1,
  defaults: () => ({ day: -1, tickets: 0, prize: 'none' }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as Partial<RaffleState>;
    const prize: Prize = o.prize === 'won' || o.prize === 'taken' ? o.prize : 'none';
    return { day: typeof o.day === 'number' ? o.day : -1, tickets: typeof o.tickets === 'number' ? Math.max(0, Math.floor(o.tickets)) : 0, prize };
  },
});

let state = store.load();

function today(day: number): RaffleState {
  return state.day === day ? state : { day, tickets: 0, prize: 'none' };
}

function commit(next: RaffleState): void {
  state = next;
  store.save(state);
}

export const raffle = {
  /** Tickets the player holds for `day`'s draw. */
  tickets(day: number): number {
    return today(day).tickets;
  },
  /** The drum has been turned on `day` (it is `drawAt` or later). */
  drawn(hours: number): boolean {
    return hours >= RAFFLE.drawAt;
  },
  /** Another ticket can still be bought: before the draw, under the day's limit. */
  canBuy(day: number, hours: number): boolean {
    return !this.drawn(hours) && today(day).tickets < RAFFLE.perDay;
  },
  buy(day: number): number {
    const s = today(day);
    commit({ ...s, tickets: s.tickets + 1 });
    return s.tickets + 1;
  },
  /** Whether one of the player's tickets came out (the same answer all day, once drawn): none held, never. */
  won(day: number): boolean {
    const s = today(day);
    if (!s.tickets) return false;
    const draw = gameDayRandom('raffle', day)();
    return draw < 1 - Math.pow(1 - RAFFLE.each, s.tickets);
  },
  /** The prize is on the stall for the player (won, not taken yet). */
  waiting(day: number, hours: number): boolean {
    return this.drawn(hours) && this.won(day) && today(day).prize !== 'taken';
  },
  takePrize(day: number): void {
    // An old Fair's prize taken off the kiosk's ledge after tickets for a new Fair were bought: the new ones stay.
    if (state.day !== day) return;
    commit({ ...state, prize: 'taken' });
  },
  /** The number printed on the player's `n`th ticket of `day` (from 1; four figures). */
  ticketNumber(day: number, n: number): number {
    return 1000 + Math.floor(gameDayRandom(`raffle-ticket:${n}`, day)() * 9000);
  },
  /**
   * The number read out from the drum on `day` (four figures): one of the player's own when they won (which one,
   * drawn for the day), else somebody else's (never one of theirs).
   */
  number(day: number): number {
    const s = today(day);
    if (this.won(day)) return this.ticketNumber(day, 1 + Math.floor(gameDayRandom('raffle-which', day)() * s.tickets));
    const theirs = new Set(Array.from({ length: s.tickets }, (_, i) => this.ticketNumber(day, i + 1)));
    let n = 1000 + Math.floor(gameDayRandom('raffle-number', day)() * 9000);
    while (theirs.has(n)) n = n === 9999 ? 1000 : n + 1;
    return n;
  },
  /**
   * A Fair before `day` whose prize the player won and never took off the stall (gone home before six): its day, or
   * null. The prize waits at the newsagent's kiosk on Front Street (`world/street/shops/Newsagent`) until taken; a card
   * about it comes through the door (`unclaimedCard`).
   */
  unclaimed(day: number): number | null {
    return state.day >= 0 && state.day < day && state.tickets > 0 && state.prize !== 'taken' && this.won(state.day) ? state.day : null;
  },
  /** The card through the door the days after a Fair whose prize was never taken: the number, and where it waits. */
  unclaimedCard(day: number): { title: string; lines: string[]; look: 'note'; from: string; hand: 'pen' } | null {
    const fair = this.unclaimed(day);
    if (fair === null || day - fair > UNCLAIMED_CARD_DAYS) return null;
    return {
      title: 'Your number came up!',
      lines: [`The Fair’s raffle: number ${this.number(fair)}. That’s your ticket.`, 'You’d gone by the time the drum turned, so I left your prize with the newsagent’s kiosk on Front Street.', 'Ask at the hatch. — the overflow stall'],
      look: 'note',
      from: 'The Fair’s overflow stall',
      hand: 'pen',
    };
  },
};

/** The card about an unclaimed prize comes through the door this many days after the Fair (the prize waits longer). */
const UNCLAIMED_CARD_DAYS = 3;
