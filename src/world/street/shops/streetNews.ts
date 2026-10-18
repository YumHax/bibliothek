import { RIVAL_COLLECTOR } from '@/economy/rivalCollector';
import { WORKS_LIFT } from '@/world/measures/street';
import { callTalk } from '../traffic/callLog';
import { keptAway } from '@/time/schedule';
import { weekdayOf } from '@/time/wakefulness';
import { ARCADE_GAMES, type ArcadeGameId } from '../../arcade/games';
import { BUSKER, GARAGE_SALE, GIVEAWAY, TRADER } from '../events/streetSchedules';
import { ANCHOR_GIG, LOCAL_QUIZ } from '@/streetShops/bars';
import { STREET_PLAN } from '../streetPlan';
import { clockShort } from '@/text/clock';
import { formatTickets } from '@/text/money';
import { capitalise } from '@/text/strings';

/** Above this rain or snow the stallholders haggle easier (`economy/haggle`'s weather): the street says so. */
const WET = 0.3;
/** How many game days the street goes on about the works having moved on. */
const WORKS_TALKED = 4;

interface StreetNewsSources {
  /** Rain and snow now (0..1). */
  weather: () => { rain: number; snow: number };
  /** The arcade's challenge of the day, if the arcade keeps one. */
  challenge?: () => { gameId: string; reward: number; done: boolean; ask: string };
  /** Whether today is the arcade's tournament day (a Saturday). */
  tournamentOn?: () => boolean;
  /** The arcade wheel's jackpot, when it is big enough to be talked about (null otherwise). */
  jackpot?: () => number | null;
  /** The game's day count: everything on the street follows the game's days (`events/streetSchedules`). */
  gameDay: () => number;
}

/**
 * What is on along Front Street today and tomorrow, as the newsagent's paper and the bar's regulars tell it: the
 * garage sale, the box of cast-offs, the collector outside RETRO GAMES (their schedules, `events/streetSchedules`:
 * the same days and the same weather the pavement goes by), the arcade's challenge and its tournament, and what the
 * weather does (the stallholders haggle easier; the busker and the collector each stay home by their own rule). Most
 * pressing first; nothing invented, every line is something the player can go and find.
 */
export function streetNews({ weather, challenge, tournamentOn, jackpot, gameDay }: StreetNewsSources): string[] {
  const day = gameDay();
  const w = weather();
  const lines: string[] = [];
  // The works moving on (`WORKS_LIFT`): the talk of the street for the first days after.
  if (day >= WORKS_LIFT.afterGameDay && day < WORKS_LIFT.afterGameDay + WORKS_TALKED) lines.push('The roadworks have moved on at last: Front Street is open past the butcher’s, right down to Mill Lane. New shops to look in.');
  // Today's ambulance, police or fire engine at a door, if there was one (`traffic/callLog`).
  const call = callTalk(day);
  if (call) lines.push(call);
  const traderToday = TRADER.isDay(day);
  const [from, to] = STREET_PLAN.trader.hours;
  if (traderToday && !keptAway(TRADER, w)) lines.push(`${RIVAL_COLLECTOR.name} has his suitcase out by RETRO GAMES today, ${clockShort(from)} to ${clockShort(to)}. Sells, swaps, haggles.`);
  if (GARAGE_SALE.isDay(day)) lines.push('Somebody on our side is clearing their loft: a garage sale on the pavement today, games at the bin price.');
  if (GIVEAWAY.isDay(day)) lines.push('A box of cast-offs is out by a front door today, FREE TO TAKE. Look inside before the dealers do.');
  const c = challenge?.();
  if (c && !c.done) {
    const title = ARCADE_GAMES[c.gameId as ArcadeGameId]?.({}).title ?? c.gameId.toUpperCase();
    lines.push(`The arcade’s challenge today: ${title}, ${c.ask} for ${c.reward} extra tickets.`);
  }
  const pot = jackpot?.();
  if (pot) lines.push(`The wheel at the arcade is sitting on over ${formatTickets(Math.floor(pot / 100) * 100)}. People go in just to look at it.`);
  // The two bars' nights (`streetShops/bars`): THE ANCHOR's band on Thursdays, THE LOCAL's quiz on Tuesdays.
  if (ANCHOR_GIG.isDay(day)) lines.push('Lou’s band is on at THE ANCHOR tonight, from half past eight. Bring earplugs.');
  else if (ANCHOR_GIG.isDay(day + 1)) lines.push('Lou’s band plays THE ANCHOR tomorrow night.');
  if (LOCAL_QUIZ.isDay(day)) lines.push('Quiz night at THE LOCAL from half past seven: video games this week. THE USUAL SUSPECTS are unbeatable, they say.');
  if (tournamentOn?.()) lines.push('Tournament day at the arcade: sign the sheet and play it out, eight in, one champion.');
  else if (weekdayOf(day + 1) === 5) lines.push('The arcade’s tournament is tomorrow, Saturday. Practise tonight.');
  // Who the weather keeps in, each by their own rule, so the paper never says the busker plays while they have packed up.
  const kept: string[] = [];
  if (keptAway(BUSKER, w)) kept.push('the busker has packed up');
  if (traderToday && keptAway(TRADER, w)) kept.push('the collector stays home');
  if (w.rain > WET || w.snow > WET) lines.push(kept.length ? `In this weather the stallholders haggle easier, but ${kept.join(' and ')}.` : 'In this weather the stallholders haggle easier.');
  else if (kept.length) lines.push(`${capitalise(kept.join(' and '))} in this weather.`);
  if (TRADER.isDay(day + 1)) lines.push(`${RIVAL_COLLECTOR.short} the collector is back outside RETRO GAMES tomorrow.`);
  if (GARAGE_SALE.isDay(day + 1)) lines.push('Another loft is being cleared tomorrow: a garage sale on the pavement.');
  if (GIVEAWAY.isDay(day + 1)) lines.push('Somebody is putting a box of cast-offs out tomorrow. FREE TO TAKE.');
  return lines;
}
