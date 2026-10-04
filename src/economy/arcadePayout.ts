import { BEGINNER, COIN_BACK, ticketsFor } from './pricing';
import { getPrize } from './Prizes';
import { formatNumber, ordinal } from '@/text/count';
import { formatTickets } from '@/text/money';
import { capitalise } from '@/text/strings';

/** The machine a play was on, as the payout reads it. */
interface PayoutMachine {
  readonly game: { readonly id: string; readonly title: string };
  /** A ticket machine (the claw is not: it pays a prize or nothing). */
  readonly freeWhenBroke: boolean;
  /** Pure luck (the ticket wheel): its score is the tickets it paid; no medal, no challenge. */
  readonly luck?: boolean;
}

/** How the play went: the score, whether it beat the player's best (or was their first score there), a prize won (the claw). */
interface PayoutPlay {
  readonly score: number;
  readonly best: boolean;
  readonly first?: boolean;
  readonly prize?: string;
  /** One of the player's first plays on this machine (`BEGINNER`): a poor score still pays twice its coin. */
  readonly beginner?: boolean;
  /** The play cost a coin (`COIN_BACK`: a poor score still pays it back). */
  readonly paid?: boolean;
}

/**
 * The arcade's books a play is settled against (`ArcadeDaily`, `ArcadeMedals`, `ArcadeLeague`):
 * each claim is made once, here, so a challenge or a medal is never paid twice.
 */
interface PayoutBooks {
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
interface ArcadePayout {
  /** Prize ids to take home: the claw's plush, a won week's pennant. */
  prizes: string[];
  /** A ticket play: what the score earned on its own (the balance table's figure) and everything paid with the extras. */
  tickets: { earned: number; paid: number } | null;
  /** The banner, a line each. */
  lines: string[];
  /** The tickets paid on top of the score's, a line each for the machine's end card ("+60 CHALLENGE"). */
  bonuses: { label: string; tickets: number }[];
  /** Something beyond the score happened (a challenge, a medal, the streak, the week's result, a prize): worth a banner. */
  notable: boolean;
}

/** A ticket play's settlement as the rules write it, one after the other: the score's tickets, then each bonus on top. */
class Settlement implements ArcadePayout {
  prizes: string[] = [];
  tickets: { earned: number; paid: number };
  lines: string[] = [];
  bonuses: { label: string; tickets: number }[] = [];
  notable = false;

  constructor(earned: number) {
    this.tickets = { earned, paid: earned };
  }

  /** Tickets on top of the score's: counted into what is paid, a line on the banner, a line on the end card. */
  bonus(label: string, tickets: number, line: string): void {
    this.tickets.paid += tickets;
    this.lines.push(line);
    this.bonuses.push({ label, tickets });
  }
}

/**
 * Settles a finished play: its tickets (or its prize), today's challenge bonus if it met the
 * target, any medal it earned, the streak's bonus on the day's first play; it all counts in the
 * weekly league, and a finished week is announced (a won one brings the pennant home).
 */
export function arcadePayout(machine: PayoutMachine, play: PayoutPlay, books: PayoutBooks): ArcadePayout {
  if (play.prize) return prizeWon(play.prize);
  if (!machine.freeWhenBroke) return { prizes: [], tickets: null, lines: ['Nothing this time.'], bonuses: [], notable: false };
  const settled = new Settlement(ticketsFor(machine.game.id, play.score));
  settled.lines.push(scoreLine(machine, play, settled.tickets.earned));
  payFloor(settled, machine, play);
  payChallenge(settled, machine, play, books.daily);
  payMedals(settled, machine, play, books.medals);
  payStreak(settled, books.league);
  const week = announceWeek(settled, books.league);
  // The coin back is a floor, not news: the end card counts it up, no banner.
  settled.notable = settled.bonuses.some((b) => b.label !== 'COIN BACK') || week;
  return settled;
}

/** The claw's prize: on the shelf at home, nothing else to settle. */
function prizeWon(prize: string): ArcadePayout {
  return { prizes: [prize], tickets: null, lines: [`You won the ${getPrize(prize)?.name ?? 'prize'}! It is on the prize shelf at home.`], bonuses: [], notable: true };
}

/** The banner's first line: what the score earned, and whether it was a best or a first. */
function scoreLine(machine: PayoutMachine, play: PayoutPlay, earned: number): string {
  const mark = play.best ? ' — new best!' : play.first ? ' — first score on the board' : '';
  return machine.luck ? `The wheel pays ${formatTickets(earned)}!` : `${formatNumber(play.score)} points: ${formatTickets(earned)} in your pocket${mark}`;
}

/** A poor score's floor: a beginner's luck up to `BEGINNER.tickets` on their first plays, else the coin back for a paid play (not on the wheel). */
function payFloor(settled: Settlement, machine: PayoutMachine, play: PayoutPlay): void {
  const { earned } = settled.tickets;
  if (play.beginner && !machine.luck && earned < BEGINNER.tickets) {
    const luck = BEGINNER.tickets - earned;
    settled.bonus('BEGINNER', luck, `Beginner’s luck: +${formatTickets(luck)} while you learn this one.`);
  } else if (play.paid && !machine.luck && earned < COIN_BACK) {
    const back = COIN_BACK - earned;
    settled.bonus('COIN BACK', back, `Coin back: +${formatTickets(back)}, try again!`);
  }
}

/** Today's challenge, on its machine, met and not yet claimed: its reward, claimed here once. */
function payChallenge(settled: Settlement, machine: PayoutMachine, play: PayoutPlay, daily: PayoutBooks['daily']): void {
  const challenge = daily?.challenge();
  if (challenge && !challenge.done && challenge.gameId === machine.game.id && play.score >= challenge.target && daily?.claimChallenge()) {
    settled.bonus('CHALLENGE', challenge.reward, `Daily challenge beaten: +${formatTickets(challenge.reward)}!`);
  }
}

/** The medals the score earns on this machine (none on the wheel), each with its reward. */
function payMedals(settled: Settlement, machine: PayoutMachine, play: PayoutPlay, medals: PayoutBooks['medals']): void {
  for (const medal of machine.luck ? [] : (medals?.award(machine.game.id, play.score) ?? [])) {
    settled.bonus(`${medal.tier.toUpperCase()} MEDAL`, medal.reward, `${capitalise(medal.tier)} medal on ${machine.game.title}: +${formatTickets(medal.reward)}!`);
  }
}

/** What is paid so far counts in the week's league; the day's first play may bring the streak's bonus. */
function payStreak(settled: Settlement, league: PayoutBooks['league']): void {
  const streak = league?.record(settled.tickets.paid);
  if (streak?.bonus) settled.bonus(`DAY ${streak.days} STREAK`, streak.bonus, `Day ${streak.days} in a row: +${formatTickets(streak.bonus)}!`);
}

/** A finished week, announced once: won, the pennant goes home. True when there was one to announce. */
function announceWeek(settled: Settlement, league: PayoutBooks['league']): boolean {
  const week = league?.takeWeekResult();
  if (!week) return false;
  if (week.won) {
    settled.prizes.push('pennant');
    settled.lines.push(`You won last week's league with ${formatTickets(week.tickets)}! The pennant is on the prize shelf at home.`);
  } else {
    settled.lines.push(`Last week's league: you came ${ordinal(week.rank + 1)} with ${formatTickets(week.tickets)}.`);
  }
  return true;
}
