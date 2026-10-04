import { ordinal } from '@/text/count';
import { actionKeyLabel } from '@/ui/keys';
import type { ArcadeResult } from '@/game/SessionActions';

/** What the end card needs of a run: the last result, its place on the table, the price of another go. */
interface EndCardRun {
  readonly last: ArcadeResult;
  readonly lastRank: number | null;
  priceText(): string;
}

/**
 * The end card's verdict, one wording on every machine (the cabinets' glass, the pinball's
 * backglass, the alley's backboard): the place taken on the table, else a new best, else the first
 * score on the board, else `fallback` (the pinball's GAME OVER; nothing by default).
 */
export function endCardNote(run: Pick<EndCardRun, 'last' | 'lastRank'>, fallback = ''): string {
  const { last, lastRank } = run;
  if (lastRank !== null) return `${ordinal(lastRank + 1).toUpperCase()} ON THE BOARD!`;
  if (last.best) return 'NEW BEST!';
  if (last.first) return 'FIRST SCORE ON THE BOARD';
  return fallback;
}

/** Another go, once the card is counted up and fire let go: "SPACE · PLAY AGAIN (1 COIN)", "(FREE PLAY)". */
export function playAgainLine(run: Pick<EndCardRun, 'priceText'>): string {
  return `${actionKeyLabel('fire').toUpperCase()} · PLAY AGAIN (${run.priceText().toUpperCase()})`;
}

/** Leaving the machine, as the cards spell it. */
export function walkAwayLine(): string {
  return `${actionKeyLabel('walkAway').toUpperCase()} TO WALK AWAY`;
}

/** The tickets line under a count: "1 TICKET", "48 TICKETS". */
export function ticketsWord(total: number): string {
  return total === 1 ? 'TICKET' : 'TICKETS';
}
