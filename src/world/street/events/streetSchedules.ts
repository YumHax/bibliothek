import { isAuctionDay } from '@/economy/AuctionHouse';
import { isBrocante } from '@/economy/marketEvents';
import { AUCTION } from '@/economy/pricing';
import { rivalOnFrontStreet } from '@/economy/rivalCollector';
import { flag } from '@/settings/flags';
import { isEventDay } from '@/time/daily';
import { gameDays, realDays, SCHEDULES, type Schedule } from '@/time/schedule';
import { weekdayOf } from '@/time/wakefulness';
import { STREET_PLAN } from '../streetPlan';

/*
 * What is on along Front Street and when, declared once (`time/schedule`): each feature reads its own entry to decide
 * whether it is out, and the paper, the bills and the regulars read the same entries to say so, so the news never
 * contradicts the pavement (the busker's rain is not the collector's). Which day each follows:
 * - REAL date: the garage sale, the box of cast-offs and the busker's hours (the same for everyone playing that
 *   date, `time/daily`);
 * - GAME day: the collector outside RETRO GAMES, the arcade's Saturday tournament, the market's Grand Flea Fair and
 *   the saleroom's Sunday sale (the game's own calendar and week, the clock on the wallet chip).
 */

const plan = STREET_PLAN;

/** The collector does not stand in rain over this. */
const TRADER_RAIN = 0.3;
/** The busker packs up in light rain or any snow worth the name. */
const BUSKER_RAIN = 0.08;
const BUSKER_SNOW = 0.15;

/** Victor the collector, with his suitcase by RETRO GAMES: one game day in `plan.trader.oneDayIn`, his hours, not in the rain. */
export const TRADER: Schedule = SCHEDULES.register(
  gameDays('trader', (day) => rivalOnFrontStreet(day, plan.trader.oneDayIn), { hours: plan.trader.hours, presence: ({ rain }) => rain < TRADER_RAIN }),
);

/** The busker at the corner: every day between their hours, unless it rains or snows. */
export const BUSKER: Schedule = SCHEDULES.register(
  realDays('busker', () => true, { hours: plan.busker.hours, presence: ({ rain, snow }) => rain < BUSKER_RAIN && snow < BUSKER_SNOW }),
);

/** Somebody clearing a loft onto the pavement: one real day in `plan.garageSale.oneDayIn`, all day. */
export const GARAGE_SALE: Schedule = SCHEDULES.register(realDays('garageSale', (date) => isEventDay('garage', plan.garageSale.oneDayIn, { date })));

/** A box of cast-offs by a front door, FREE TO TAKE: one real day in `plan.giveaway.oneDayIn`, all day. */
export const GIVEAWAY: Schedule = SCHEDULES.register(realDays('giveaway', (date) => isEventDay('giveaway', plan.giveaway.oneDayIn, { date })));

/** The arcade's tournament: the game week's Saturdays (`?tournament` makes any day one, as `ArcadeTournament` reads it). In the book for "what's on". */
SCHEDULES.register(gameDays('tournament', (day) => flag('tournament') || weekdayOf(day) === 5));

/** The Grand Flea Fair at the Old Market Hall: the market's own calendar (`economy/marketEvents`). */
export const FLEA_FAIR: Schedule = SCHEDULES.register(gameDays('fleaFair', isBrocante));

/** The saleroom's sale: every Sunday of the game's week, between `AUCTION.hours`. In the book for "what's on". */
SCHEDULES.register(gameDays('saleroomSale', isAuctionDay, { hours: AUCTION.hours }));
