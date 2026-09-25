import { ticketsFor } from './pricing';
import { getPrize } from './Prizes';

/** The machine a play was on, as the payout reads it. */
export interface PayoutMachine {
  readonly game: { readonly id: string; readonly title: string };
  /** A ticket machine (the claw is not: it pays a prize or nothing). */
  readonly freeWhenBroke: boolean;
  /** Pure luck (the ticket wheel): its score is the tickets it paid; no medal, no challenge. */
  readonly luck?: boolean;
}

/** How the play went: the score, whether it beat the player's best, a prize won (the claw). */
export interface PayoutPlay {
  readonly score: number;
  readonly best: boolean;
  readonly prize?: string;
}

/**
 * The arcade's books a play is settled against (`ArcadeDaily`, `ArcadeMedals`, `ArcadeLeague`):
 * each claim is made once, here, so a challenge or a medal is never paid twice.
 */
export interface PayoutBooks {
  daily?: {
    challenge(): { gameId: string; target: number; reward: number; done: boolean };
    claimChallenge(): boolean;
  };
  medals?: { award(gameId: string, score: number): readonly { tier: string; reward: number }[] };
  league?: {
    record(tickets: number): { days: number; bonus: number };
    takeWeekResult(): { rank: number; tickets: number; won: boolean } | null;
  };
}

/** What a play pays and how it is announced; the Session hands it over (wallet, prize shelf, balance table, toast). */
export interface ArcadePayout {
  /** Prize ids to take home: the claw's plush, a won week's pennant. */
  prizes: string[];
  /** A ticket play: what the score earned on its own (the balance table's figure) and everything paid with the extras. */
  tickets: { earned: number; paid: number } | null;
  /** The toast, a line each. */
  lines: string[];
}

/**
 * Settles a finished play: its tickets (or its prize), today's challenge bonus if it met the
 * target, any medal it earned, the streak's bonus on the day's first play; it all counts in the
 * weekly league, and a finished week is announced (a won one brings the pennant home).
 */
export function arcadePayout(machine: PayoutMachine, play: PayoutPlay, books: PayoutBooks): ArcadePayout {
  const { daily, medals, league } = books;
  if (play.prize) {
    return { prizes: [play.prize], tickets: null, lines: [`You won the ${getPrize(play.prize)?.name ?? 'prize'}! It is on the prize shelf at home.`] };
  }
  if (!machine.freeWhenBroke) return { prizes: [], tickets: null, lines: ['Nothing this time.'] };

  const prizes: string[] = [];
  const lines: string[] = [];
  const earned = ticketsFor(machine.game.id, play.score);
  let paid = earned;
  lines.push(machine.luck ? `The wheel pays ${earned} ticket${earned === 1 ? '' : 's'}!` : `${play.score.toLocaleString('en-US')} points: ${earned} ticket${earned === 1 ? '' : 's'} in your pocket${play.best ? ' — new best!' : ''}`);
  const challenge = daily?.challenge();
  if (challenge && !challenge.done && challenge.gameId === machine.game.id && play.score >= challenge.target && daily?.claimChallenge()) {
    paid += challenge.reward;
    lines.push(`Daily challenge beaten: +${challenge.reward} tickets!`);
  }
  for (const medal of machine.luck ? [] : (medals?.award(machine.game.id, play.score) ?? [])) {
    paid += medal.reward;
    lines.push(`${medal.tier[0]!.toUpperCase()}${medal.tier.slice(1)} medal on ${machine.game.title}: +${medal.reward} tickets!`);
  }
  const streak = league?.record(paid);
  if (streak?.bonus) {
    paid += streak.bonus;
    lines.push(`Day ${streak.days} in a row: +${streak.bonus} tickets!`);
  }
  const week = league?.takeWeekResult();
  if (week?.won) {
    prizes.push('pennant');
    lines.push(`You won last week's league with ${week.tickets} tickets! The pennant is on the prize shelf at home.`);
  } else if (week) {
    lines.push(`Last week's league: you came ${ordinalOf(week.rank + 1)} with ${week.tickets} tickets.`);
  }
  return { prizes, tickets: { earned, paid }, lines };
}

/** 1st, 2nd, 3rd, 4th… */
function ordinalOf(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}
