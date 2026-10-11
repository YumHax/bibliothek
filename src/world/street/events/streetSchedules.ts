import { isAuctionDay } from '@/economy/AuctionHouse';
import { isBrocante } from '@/economy/marketEvents';
import { AUCTION } from '@/economy/pricing';
import { rivalOnFrontStreet } from '@/economy/rivalCollector';
import { flag } from '@/settings/flags';
import { gameDays, SCHEDULES, type Schedule } from '@/time/schedule';
import { isStreetEventDay } from '@/time/streetDay';
import { weekdayOf } from '@/time/wakefulness';
import { STREET_PLAN } from '../streetPlan';
import { STREET_PLACES } from '../streetPlacesPlan';

/*
 * What is on along Front Street and when, declared once (`time/schedule`): each feature reads its own entry to decide
 * whether it is out, and the paper, the bills and the regulars read the same entries to say so, so the news never
 * contradicts the pavement (the busker's rain is not the collector's). All of them follow the GAME day (the game's own
 * calendar and week, the clock on the wallet chip, `time/streetDay`): the garage sale, the box of cast-offs, the
 * busker, the collector outside RETRO GAMES, the arcade's Saturday tournament, the market's Grand Flea Fair and the
 * saleroom's Sunday sale, so a night's sleep moves them all at once.
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
  gameDays('busker', () => true, { hours: plan.busker.hours, presence: ({ rain, snow }) => rain < BUSKER_RAIN && snow < BUSKER_SNOW }),
);

/** Somebody clearing a loft onto the pavement: one game day in `plan.garageSale.oneDayIn`, all day. */
export const GARAGE_SALE: Schedule = SCHEDULES.register(gameDays('garageSale', (day) => isStreetEventDay('garage', plan.garageSale.oneDayIn, day)));

/** A box of cast-offs by a front door, FREE TO TAKE: one game day in `plan.giveaway.oneDayIn`, all day. */
export const GIVEAWAY: Schedule = SCHEDULES.register(gameDays('giveaway', (day) => isStreetEventDay('giveaway', plan.giveaway.oneDayIn, day)));

/** The arcade's tournament: the game week's Saturdays (`?tournament` makes any day one, as `ArcadeTournament` reads it). In the book for "what's on". */
SCHEDULES.register(gameDays('tournament', (day) => flag('tournament') || weekdayOf(day) === 5));

/** The Grand Flea Fair at the Old Market Hall: the market's own calendar (`economy/marketEvents`). */
export const FLEA_FAIR: Schedule = SCHEDULES.register(gameDays('fleaFair', isBrocante));

/** The saleroom's sale: every Sunday of the game's week, between `AUCTION.hours`. In the book for "what's on". */
SCHEDULES.register(gameDays('saleroomSale', isAuctionDay, { hours: AUCTION.hours }));

/** The band on the park's lawn (`park/ParkConcert`): the game week's Sundays, in its hours, dry weather only. */
export const PARK_CONCERT: Schedule = SCHEDULES.register(
  gameDays('parkConcert', (day) => weekdayOf(day) === STREET_PLACES.park.concert.weekday, { hours: STREET_PLACES.park.concert.hours, presence: ({ rain, snow }) => rain < BUSKER_RAIN && snow < BUSKER_SNOW }),
);

/** The Grand Flea Fair's stalls on Front Street's pavements (`events/FairStalls`): the Fair's days, in their hours. */
SCHEDULES.register(gameDays('fairStalls', isBrocante, { hours: STREET_PLACES.fair.hours }));

/** Whether `schedule` is on at game day `day` and the sky's hour and weather (all of Front Street's follow the game day). */
export function onNow(schedule: Schedule, day: number, sky: { readonly hours: number; readonly rain: number; readonly snow: number }): boolean {
  return SCHEDULES.on({ date: new Date(), gameDay: day, hours: sky.hours % 24, weather: sky }).includes(schedule);
}

/** The first game day from `from` (today included) on which `schedule` is on, within `within` days; null when none. */
export function nextDayOf(schedule: Schedule, from: number, within = 14): number | null {
  for (let day = from; day < from + within; day++) if (schedule.isDay(day)) return day;
  return null;
}
