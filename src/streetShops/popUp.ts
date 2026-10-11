import type { Game } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog/index';
import { inHours } from '@/time/clock';
import { gameDayRandom } from '@/time/daily';
import { weekdayOf } from '@/time/wakefulness';
import { chance, shuffled } from '@/random';
import { STREET_SHOPS } from './rules';

/*
 * The empty shop by the butcher, TO LET since anyone remembers, opens late in the game (docs/economy.md "Front Street's
 * shops and finds"): CONTINUE?, a pop-up run by a young dealer with a van full of collector-grade copies. A few a week,
 * complete, some first prints, now and then one still sealed, at the full shop price (the market's `shopPrice` by
 * edition and variant: never a bargain to sell back). Shut on Mondays.
 */

/** The pop-up's name on its sign, and the receipt's "where". */
export const POP_UP_NAME = 'CONTINUE?';
export const POP_UP_WHERE = 'CONTINUE?, the pop-up on Front Street';

/** Odds a copy of the week is a first print, and that one is still sealed. */
const FIRST_PRINT = 0.35;
const SEALED = 0.12;

/** Whether the pop-up has opened by game `day` (the TO LET sign gone). */
export function popUpOpened(day: number): boolean {
  return day >= STREET_SHOPS.popUp.fromDay;
}

/** Whether it is open now: opened, not a Monday, in its hours. */
export function popUpOpen(day: number, hours: number): boolean {
  const { open, close } = STREET_SHOPS.popUp.hours;
  return popUpOpened(day) && weekdayOf(day) !== 0 && inHours(hours, { from: open, to: close });
}

/** This game week's copies: complete, collector grade, none the player owns, the same all week. */
export function popUpStock(week: number, owns: (id: string) => boolean): Game[] {
  const random = gameDayRandom('popUp', week);
  return shuffled(random, SEED_GAMES.filter((g) => !g.bootleg && !owns(g.id)))
    .slice(0, STREET_SHOPS.popUp.count)
    .map((g): Game => {
      const firstPrint = chance(random, FIRST_PRINT);
      const sealed = chance(random, SEALED);
      return { ...g, condition: 'complete', status: 'owned', ...(firstPrint ? { edition: 'firstPrint' as const } : {}), ...(sealed ? { variant: 'sealed' as const } : {}) };
    });
}
