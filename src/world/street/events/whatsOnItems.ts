import { nextBrocante, whenText } from '@/economy/marketEvents';
import { isPartyDay } from '@/building/neighboursParty';
import { RIVAL_COLLECTOR } from '@/economy/rivalCollector';
import { SCHEDULES } from '@/time/schedule';
import { clockShort } from '@/text/clock';
import { formatCoins, formatTickets } from '@/text/money';
import { ANCHOR_GIG, LOCAL_QUIZ } from '@/streetShops/bars';
import { STREET_SHOPS } from '@/streetShops/rules';
import { FLEA_FAIR, GARAGE_SALE, PARK_CONCERT, TRADER, nextDayOf } from './streetSchedules';
import { STREET_PLAN } from '../streetPlan';
import { STREET_PLACES } from '../streetPlacesPlan';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import { arcadeTitle } from '../arcadeTitles';
import { formatCount } from '@/text/count';
import { capitalise } from '@/text/strings';
import { weekdayOf } from '@/time/wakefulness';

/** What the street's bills say is on: a headline and its line, most pressing first. */
export interface WhatsOnItem {
  title: string;
  line: string;
  /** Today (the bill is pasted over with TODAY). */
  today: boolean;
  /** In how many game days it is (the soonest first after today's); absent: an ongoing thing. */
  inDays?: number;
}

export interface WhatsOnSources {
  /** The market day (`Today.gameDay`). */
  day: () => number;
  /** The arcade's day (its challenge) and its Saturday tournament, when the session has them. */
  daily?: ArcadeDaily;
  tournament?: ArcadeTournament;
  /** The arcade wheel's progressive pot: on the bills once it is the talk of the street. */
  jackpot?: { readonly value: number; readonly newsworthy: boolean };
}


/**
 * What is on, from the calendars the game already keeps: the next Grand Flea Fair (`marketEvents`),
 * today's arcade challenge (`ArcadeDaily`), the Saturday tournament (`ArcadeTournament`), the wheel's jackpot once it
 * is past `JACKPOT.news` (`Jackpot`). Read
 * fresh each time: the bills are repainted when the day turns.
 */
export function whatsOn({ day, daily, tournament, jackpot }: WhatsOnSources): WhatsOnItem[] {
  const today = day();
  const items: WhatsOnItem[] = [];
  const fair = nextBrocante(today);
  // The fair's days are its schedule's (`streetSchedules`), the same the saleroom and the paper go by.
  const fairToday = FLEA_FAIR.isDay(today);
  items.push({
    title: 'GRAND FLEA FAIR',
    line: fairToday ? 'Today! The hall full to the rafters, through RETRO GAMES.' : `${capitalise(whenText(fair - today))}, at the Old Market Hall, through RETRO GAMES.`,
    today: fairToday,
  });
  if (daily) {
    const c = daily.challenge();
    const ask = c.ask;
    items.push({ title: 'ARCADE CHALLENGE', line: c.done ? `${arcadeTitle(c.gameId)}: beaten today. Back tomorrow for the next.` : `${arcadeTitle(c.gameId)}: ${ask} for ${formatCount(c.reward, 'bonus ticket')}.`, today: !c.done });
  }
  if (tournament) {
    items.push({ title: 'SATURDAY TOURNAMENT', line: tournament.isOn ? `Today, on ${arcadeTitle(tournament.gameId)}: sign the sheet at the arcade.` : 'Every Saturday at the arcade: three rounds, one cabinet.', today: tournament.isOn });
  }
  if (jackpot?.newsworthy) items.push({ title: 'WHEEL JACKPOT', line: `Over ${formatTickets(Math.floor(jackpot.value / 100) * 100)} on the arcade’s wheel. Somebody is due.`, today: true });
  items.push(...comingUp(today));
  // Today's first, then the soonest.
  return items.sort((a, b) => Number(b.today) - Number(a.today) || (a.inDays ?? 0) - (b.inDays ?? 0));
}

/** The street's weekly market mornings (`weekdayOf`: Wednesday, Saturday), when the greengrocer puts the crates out. */
const MARKET_MORNINGS: readonly number[] = [2, 5];

/** The street's and the building's other days in the next week or so: the saleroom, a garage sale, the collector, the party, the band. */
function comingUp(today: number): WhatsOnItem[] {
  const items: WhatsOnItem[] = [];
  const when = (day: number): string => capitalise(whenText(day - today));
  const add = (day: number | null, title: string, line: (when: string) => string): void => {
    if (day === null) return;
    items.push({ title, line: line(when(day)), today: day === today, inDays: day - today });
  };
  const sale = SCHEDULES.get('saleroomSale');
  if (sale) add(nextDayOf(sale, today, 8), 'SUNDAY SALEROOM', (w) => `${w}: lots under the hammer, through the flea market’s back door.`);
  add(nextDayOf(GARAGE_SALE, today, 8), 'GARAGE SALE', (w) => `${w}: a loft cleared onto the pavement on our side, games at the bin price.`);
  const [from, to] = STREET_PLAN.trader.hours;
  add(nextDayOf(TRADER, today, 8), 'THE COLLECTOR', (w) => `${w}: ${RIVAL_COLLECTOR.name} and his suitcase by RETRO GAMES, ${clockShort(from)} to ${clockShort(to)}.`);
  const [open, close] = STREET_PLACES.park.concert.hours;
  add(nextDayOf(PARK_CONCERT, today, 8), 'SUNDAYS IN THE PARK', (w) => `${w}: live music on the lawn, ${clockShort(open)} to ${clockShort(close)}. Dry weather only.`);
  const { gig, quiz } = STREET_SHOPS;
  add(nextDayOf(ANCHOR_GIG, today, 8), 'LIVE AT THE ANCHOR', (w) => `${w}: Lou’s band, ${clockShort(gig.from)} till late. ${formatCoins(gig.cover)} on the door.`);
  add(nextDayOf(LOCAL_QUIZ, today, 8), 'QUIZ AT THE LOCAL', (w) => `${w}: video game trivia from ${clockShort(quiz.from)}. Prizes for the best team.`);
  // The grocer's market mornings (Wednesday, Saturday: `shopPlan.WEEKDAY_LOOKS`), crates out on the pavement.
  let market: number | null = null;
  for (let day = today; day < today + 7 && market === null; day++) if (MARKET_MORNINGS.includes(weekdayOf(day))) market = day;
  add(market, 'MARKET MORNING', (w) => `${w}: crates out at the greengrocer’s, fruit and veg along the pavement till lunch.`);
  let party: number | null = null;
  for (let day = today; day < today + 15 && party === null; day++) if (isPartyDay(day, day === today ? new Date() : new Date(0))) party = day;
  add(party, 'NEIGHBOURS’ PARTY', (w) => `${w}: tables out in our courtyard, everyone in the building welcome.`);
  return items;
}
