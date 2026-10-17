import { BEGINNER, CLAW_MISS_TICKETS, HALL_TOUR, LEAGUE, TICKET_FLOOR, ticketsFor } from './pricing';
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
  /** The play cost a coin (`TICKET_FLOOR`: a poor score still pays more than it; a claw miss pays it back). */
  readonly paid?: boolean;
}

/**
 * The arcade's books a play is settled against (`ArcadeDaily`, `ArcadeMedals`, `ArcadeLeague`):
 * each claim is made once, here, so a challenge or a medal is never paid twice.
 */
interface PayoutBooks {
  daily?: {
    challenge(): { gameId: string; target: number; reward: number; done: boolean };
    /** The play counts towards the challenge; true when that meets it (still to claim). */
    advance(gameId: string, score: number): boolean;
    claimChallenge(): boolean;
  };
  medals?: {
    award(gameId: string, score: number): readonly { tier: string; reward: number }[];
    /** Gold on every machine: true once, the first time it is asked after (its trophy goes home). */
    takeTour?(): boolean;
    /** The share more a mastered machine pays for its score (0 until its gold). */
    mastery?(gameId: string): number;
  };
  league?: {
    record(tickets: number): { days: number; punched: boolean; tokens: number; tier: string | null };
    takeWeekResult(): { rank: number; tickets: number; won: boolean; division: number } | null;
  };
  /** A past Saturday's tournament run left before it ended: its tickets, once. */
  tournament?: { takeUnfinished(): { wins: number; tickets: number } | null };
}

/** What a play pays and how it is announced; the Session hands it over (wallet, prize shelf, balance table, toast). */
interface ArcadePayout {
  /** Prize ids to take home: the claw's plush, a won week's pennant. */
  prizes: string[];
  /**
   * A ticket play: what the score earned on its own (the balance table's figure), what the end card counts for it
   * (the floor folded in: never under `TICKET_FLOOR` for a paid play) and everything paid with the extras.
   */
  tickets: { earned: number; counted: number; paid: number } | null;
  /** The banner, a line each. */
  lines: string[];
  /** The tickets paid on top of the score's, a line each for the machine's end card ("+60 CHALLENGE"). */
  bonuses: { label: string; tickets: number }[];
  /** Something beyond the score happened (a challenge, a medal, the card, the week's result, a prize): worth a banner. */
  notable: boolean;
}

/** A ticket play's settlement as the rules write it, one after the other: the score's tickets, then each bonus on top. */
class Settlement implements ArcadePayout {
  prizes: string[] = [];
  tickets: { earned: number; counted: number; paid: number };
  lines: string[] = [];
  bonuses: { label: string; tickets: number }[] = [];
  notable = false;

  constructor(earned: number, counted: number) {
    this.tickets = { earned, counted, paid: counted };
  }

  /** Tickets on top of the score's: counted into what is paid, a line on the banner, a line on the end card. */
  bonus(label: string, tickets: number, line: string): void {
    this.tickets.paid += tickets;
    this.lines.push(line);
    this.bonuses.push({ label, tickets });
  }
}

/**
 * Settles a finished play: its tickets, never under the floor of a paid play (or its prize, or the claw's coin back),
 * today's challenge bonus if it met it, any medal it earned (and the hall's tour's trophy, gold everywhere), a past
 * Saturday's unfinished tournament run; it all counts in the weekly league, the day's first play punches the regular's
 * card (gold tokens, its colour), and a finished week is announced (a won one brings its division's pennant home).
 */
export function arcadePayout(machine: PayoutMachine, play: PayoutPlay, books: PayoutBooks): ArcadePayout {
  if (play.prize) return prizeWon(play.prize);
  if (!machine.freeWhenBroke) return clawMissed(play);
  const earned = ticketsFor(machine.game.id, play.score);
  const floor = floorOf(machine, play);
  const settled = new Settlement(earned, Math.max(earned, floor));
  // A learner's poor play lifted to the beginner's floor: said (the plain floor is not news, it is in the count).
  const lucky = Boolean(play.beginner) && earned < floor;
  settled.lines.push(scoreLine(machine, play, settled.tickets.counted));
  if (lucky) settled.lines.push('Beginner’s luck! Keep at it.');
  payChallenge(settled, machine, play, books.daily);
  payMedals(settled, machine, play, books.medals);
  const mastered = payMastery(settled, machine, books.medals);
  payUnfinished(settled, books.tournament);
  const card = punchCard(settled, books.league);
  const week = announceWeek(settled, books.league);
  // A mastered machine's extra comes with every play: on the end card, not news for the banner.
  settled.notable = settled.bonuses.length > (mastered ? 1 : 0) || week || lucky || card || settled.prizes.length > 0;
  return settled;
}

/** The claw's prize: on the bed at home, nothing else to settle. */
function prizeWon(prize: string): ArcadePayout {
  return { prizes: [prize], tickets: null, lines: [`You won the ${getPrize(prize)?.name ?? 'prize'}! It is sitting on the bed at home.`], bonuses: [], notable: true };
}

/** A claw play that dropped nothing: the coin comes back in tickets (only the plush was a gamble). */
function clawMissed(play: PayoutPlay): ArcadePayout {
  if (!play.paid) return { prizes: [], tickets: null, lines: ['Nothing this time.'], bonuses: [], notable: false };
  const back = CLAW_MISS_TICKETS;
  return { prizes: [], tickets: { earned: 0, counted: back, paid: back }, lines: [`So close! Your coin back: ${formatTickets(back)}.`], bonuses: [], notable: false };
}

/** The least the score's tickets count for: a beginner's luck on their first plays, else the floor of a paid play (none on the wheel). */
function floorOf(machine: PayoutMachine, play: PayoutPlay): number {
  if (machine.luck) return 0;
  if (play.beginner) return BEGINNER.tickets;
  return play.paid ? TICKET_FLOOR : 0;
}

/** The banner's first line: what the score paid, and whether it was a best or a first. */
function scoreLine(machine: PayoutMachine, play: PayoutPlay, counted: number): string {
  const mark = play.best ? ' — new best!' : play.first ? ' — first score on the board' : '';
  return machine.luck ? `The wheel pays ${formatTickets(counted)}!` : `${formatNumber(play.score)} points: ${formatTickets(counted)} in your pocket${mark}`;
}

/** Today's challenge, on its machine, met and not yet claimed: its reward, claimed here once. */
function payChallenge(settled: Settlement, machine: PayoutMachine, play: PayoutPlay, daily: PayoutBooks['daily']): void {
  const challenge = daily?.challenge();
  if (machine.luck || !challenge || challenge.done || challenge.gameId !== machine.game.id) return;
  if (daily?.advance(machine.game.id, play.score) && daily.claimChallenge()) {
    settled.bonus('CHALLENGE', challenge.reward, `Daily challenge beaten: +${formatTickets(challenge.reward)}!`);
  }
}

/** The medals the score earns on this machine (none on the wheel), each with its reward; gold everywhere, the hall's tour. */
function payMedals(settled: Settlement, machine: PayoutMachine, play: PayoutPlay, medals: PayoutBooks['medals']): void {
  for (const medal of machine.luck ? [] : (medals?.award(machine.game.id, play.score) ?? [])) {
    settled.bonus(`${medal.tier.toUpperCase()} MEDAL`, medal.reward, `${capitalise(medal.tier)} medal on ${machine.game.title}: +${formatTickets(medal.reward)}!`);
    if (medal.tier === 'gold') settled.lines.push(`${machine.game.title} is mastered: it pays you more from now on.`);
  }
  if (medals?.takeTour?.()) {
    settled.prizes.push(HALL_TOUR.prize);
    settled.lines.push('Gold on every machine in the hall: the hall’s tour is yours, and its trophy goes home with you.');
  }
}

/**
 * A mastered machine (its gold held, the play that wins it included) pays a share more of the score's tickets: an end
 * card line of its own, no banner line (it comes with every play). True when it paid.
 */
function payMastery(settled: Settlement, machine: PayoutMachine, medals: PayoutBooks['medals']): boolean {
  const share = machine.luck ? 0 : (medals?.mastery?.(machine.game.id) ?? 0);
  const extra = Math.round(settled.tickets.counted * share);
  if (extra <= 0) return false;
  settled.tickets.paid += extra;
  settled.bonuses.push({ label: 'MASTERED', tickets: extra });
  return true;
}

/** A past Saturday's tournament run left before it ended: paid now, as if the player had gone out then. */
function payUnfinished(settled: Settlement, tournament: PayoutBooks['tournament']): void {
  const run = tournament?.takeUnfinished();
  if (run?.tickets) settled.bonus('TOURNAMENT', run.tickets, `Saturday’s tournament, ${run.wins === 1 ? 'one round' : `${run.wins} rounds`} won: +${formatTickets(run.tickets)}.`);
}

/** What is paid so far counts in the week's league; the day's first play punches the regular's card. True when the card had news. */
function punchCard(settled: Settlement, league: PayoutBooks['league']): boolean {
  const card = league?.record(settled.tickets.paid);
  if (!card?.punched) return false;
  if (card.tier) settled.lines.push(`${cardLine(card.tier)}!${card.tokens ? ` ${capitalise(tokenWords(card.tokens))} with it.` : ''}`);
  else if (card.tokens) settled.lines.push(`Your arcade card is punched: ${tokenWords(card.tokens)}, a play on the house.`);
  return Boolean(card.tier || card.tokens);
}

/** The card's new colour, said ("REGULAR", "SILVER CARD", "GOLD CARD", "HALL LEGEND"). */
function cardLine(tier: string): string {
  if (tier.endsWith(' CARD')) return `Your arcade card turns ${tier.slice(0, -' CARD'.length).toLowerCase()}`;
  if (tier === 'REGULAR') return 'You are a regular now: the arcade card is yours';
  return 'A legend of the hall: your arcade card is engraved';
}

/** "a gold token", "3 gold tokens". */
function tokenWords(tokens: number): string {
  return tokens === 1 ? 'a gold token' : `${tokens} gold tokens`;
}

/** A finished week, announced once: won, the division's pennant goes home. True when there was one to announce. */
function announceWeek(settled: Settlement, league: PayoutBooks['league']): boolean {
  const week = league?.takeWeekResult();
  if (!week) return false;
  if (week.won) {
    const division = LEAGUE.divisionNames[week.division] ?? LEAGUE.divisionNames[0];
    settled.prizes.push(LEAGUE.pennants[week.division] ?? LEAGUE.pennants[0]);
    settled.lines.push(`You won last week's ${division.toLowerCase()} league with ${formatTickets(week.tickets)}! Its pennant goes home with you${week.division < LEAGUE.divisionNames.length - 1 ? `, and you play in the ${LEAGUE.divisionNames[week.division + 1]!.toLowerCase()} league now` : ''}.`);
  } else {
    settled.lines.push(`Last week's league: you came ${ordinal(week.rank + 1)} with ${formatTickets(week.tickets)}.`);
  }
  return true;
}
