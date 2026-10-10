import type { Game } from '@/catalog/types';
import { HOUSEHOLD } from './rules';
import { gameDayRandom } from '@/time/daily';
import { chance, integer, pick, seededRng, type Rng } from '@/random';

/** What a door or drawer of the flat held: a few coins, a strip of arcade tickets, or the lost booklet of a game on the shelves. */
export type RummageFind = { kind: 'coins'; coins: number } | { kind: 'tickets'; tickets: number } | { kind: 'manual'; gameId: string; title: string } | { kind: 'notebook'; title: string };

/** What lies in a door or drawer, not taken yet (`HomeLife.peekFind`): the find, whether it is the last tenant's leftover, and whether their note lies with it (the first leftover). */
export interface LaidFind {
  find: RummageFind;
  leftover: boolean;
  note: boolean;
}

/** What the last tenant left in spot `spot` (one of the flat's own fittings), the same in every save; only coins where no paper goes (`paper` false). */
export function drawLeftover(spot: string, paper: boolean): RummageFind {
  const { coins, ticketChance, tickets } = HOUSEHOLD.rummage.leftover;
  return money(seededRng(`rummage.leftover:${spot}`), coins, paper ? ticketChance : 0, tickets);
}

/**
 * What spot `spot` holds in rest `day` (`Household.rest`), or null (most rests): a few coins or tickets, or, in a drawer, now and
 * then the booklet of a shelved game that lacks one (it had slid under the cutlery tray). Only coins where no paper
 * goes (a fridge, an oven). Seeded by the spot and the day, so a reload does not reroll it.
 */
export function drawDailyFind(spot: string, day: number, where: { drawer: boolean; paper: boolean }, shelved: readonly Game[]): RummageFind | null {
  const random = gameDayRandom(`rummage:${spot}`, day);
  const { dailyChance, daily } = HOUSEHOLD.rummage;
  if (!chance(random, dailyChance)) return null;
  const lacking = where.drawer && where.paper ? shelved.filter((g) => (g.status ?? 'owned') === 'owned' && g.condition === 'noManual' && !g.repro) : [];
  if (lacking.length && chance(random, daily.manualChance)) {
    const game = pick(random, lacking);
    return { kind: 'manual', gameId: game.id, title: game.title };
  }
  return money(random, daily.coins, where.paper ? daily.ticketChance : 0, daily.tickets);
}

function money(random: Rng, coins: readonly [number, number], ticketChance: number, tickets: readonly [number, number]): RummageFind {
  if (chance(random, ticketChance)) return { kind: 'tickets', tickets: integer(random, tickets[0], tickets[1]) };
  return { kind: 'coins', coins: integer(random, coins[0], coins[1]) };
}
