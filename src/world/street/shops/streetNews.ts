import { RIVAL_COLLECTOR, rivalOnFrontStreet } from '@/economy/rivalCollector';
import { isEventDay } from '@/time/daily';
import { ARCADE_GAMES, type ArcadeGameId } from '../../arcade/games';
import { STREET_PLAN } from '../streetPlan';
import { clockTime } from './shopHours';

/** Above this rain the busker has packed up and the collector stays home (`Busker`, `Trader`): the street says so. */
const WET = 0.3;
/** The collector does not stand in rain over this (`Trader`'s own rule). */
const TRADER_RAIN = 0.3;

interface StreetNewsSources {
  /** Rain and snow now (0..1). */
  weather: () => { rain: number; snow: number };
  /** The arcade's challenge of the day, if the arcade keeps one. */
  challenge?: () => { gameId: string; target: number; reward: number; done: boolean };
  /** Whether today is the arcade's tournament day (a Saturday). */
  tournamentOn?: () => boolean;
  date?: () => Date;
}

/**
 * What is on along Front Street today and tomorrow, as the newsagent's paper and the bar's regulars tell it: the
 * garage sale, the box of cast-offs, the collector outside RETRO GAMES (real days: `time/daily`, the same draws the
 * street makes), the arcade's challenge and its tournament, and what the rain does (the stallholders haggle easier, the
 * busker and the collector stay home). Most pressing first; nothing invented, every line is something the player can go
 * and find.
 */
export function streetNews({ weather, challenge, tournamentOn, date = () => new Date() }: StreetNewsSources): string[] {
  const now = date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const plan = STREET_PLAN;
  const { rain, snow } = weather();
  const lines: string[] = [];
  const traderToday = rivalOnFrontStreet(now, plan.trader.oneDayIn);
  const [from, to] = plan.trader.hours;
  if (traderToday && rain <= TRADER_RAIN) lines.push(`${RIVAL_COLLECTOR.name} has his suitcase out by RETRO GAMES today, ${clockTime(from)} to ${clockTime(to)}. Sells, swaps, haggles.`);
  if (isEventDay('garage', plan.garageSale.oneDayIn, { date: now })) lines.push('Somebody on our side is clearing their loft: a garage sale on the pavement today, games at the bin price.');
  if (isEventDay('giveaway', plan.giveaway.oneDayIn, { date: now })) lines.push('A box of cast-offs is out by a front door today, FREE TO TAKE. Look inside before the dealers do.');
  const c = challenge?.();
  if (c && !c.done) {
    const title = ARCADE_GAMES[c.gameId as ArcadeGameId]?.({}).title ?? c.gameId.toUpperCase();
    lines.push(`The arcade’s challenge today: ${title}, score ${c.target.toLocaleString('en')} for ${c.reward} extra tickets.`);
  }
  if (tournamentOn?.()) lines.push('Tournament day at the arcade: sign the sheet and play it out, eight in, one champion.');
  else if (tomorrow.getDay() === 6) lines.push('The arcade’s tournament is tomorrow, Saturday. Practise tonight.');
  if (rain > WET || snow > WET) lines.push('In this weather the stallholders haggle easier, but the busker has packed up and the collector stays home.');
  if (rivalOnFrontStreet(tomorrow, plan.trader.oneDayIn)) lines.push(`${RIVAL_COLLECTOR.short} the collector is back outside RETRO GAMES tomorrow.`);
  if (isEventDay('garage', plan.garageSale.oneDayIn, { date: tomorrow })) lines.push('Another loft is being cleared tomorrow: a garage sale on the pavement.');
  if (isEventDay('giveaway', plan.giveaway.oneDayIn, { date: tomorrow })) lines.push('Somebody is putting a box of cast-offs out tomorrow. FREE TO TAKE.');
  return lines;
}
