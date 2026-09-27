import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { ArcadeLeague } from '@/economy/ArcadeLeague';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import type { Jackpot } from '@/economy/Jackpot';
import { PLAY_COST, TOURNAMENT, playIsFree } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { rivalScore } from '@/economy/rivals';
import { Prop } from '../props/Prop';

/** A regular's score may go on the table up to this much above the best starting rival (they play better than people). */
const RIVAL_CAP = 1.1;

export interface ArcadeHallOptions {
  wallet: { readonly coins: number; readonly tickets: number };
  scores: ArcadeScores;
  daily?: ArcadeDaily;
  league?: ArcadeLeague;
  tournament: ArcadeTournament;
  jackpot: Jackpot;
  /** The machines that may be out of order (game ids). */
  breakable: readonly string[];
  /** The game clock's hour, and how many regulars may be in from which hour on. */
  hours: () => number;
  byHour: readonly (readonly [hour: number, max: number])[];
  /** What a regular says when their score makes the table. */
  boardLines: readonly string[];
}

/** A game the hall has, by id and title. */
export interface HallGame {
  id: string;
  title: string;
}

/**
 * The hall's rules for the day, for as long as it stands: what the next play costs (broke: on
 * the house), today's challenge per game, the one machine out of order (never the tournament's
 * cabinet; decided when the hall is built), how many regulars the hour brings in, whether a
 * regular's score goes on the table, and the attendant's news (each topical line said once, then
 * the usual ones). An empty `Prop`; the builder places it and hands its answers to the machines,
 * the crowd and the attendant.
 */
export class ArcadeHall extends Prop {
  /** Today's machine out of order, or null. */
  readonly broken: string | null;
  private readonly options: ArcadeHallOptions;
  private readonly said = new Set<string>();

  constructor(options: ArcadeHallOptions) {
    super();
    this.name = 'ArcadeHall';
    this.options = options;
    const { daily, tournament } = options;
    const brokenToday = daily?.outOfOrder(options.breakable) ?? null;
    this.broken = tournament.isOn && brokenToday === tournament.gameId ? null : brokenToday;
  }

  /** The next play's price right now (0: on the house). */
  nextPlayCost(): number {
    return playIsFree(this.options.wallet) ? 0 : PLAY_COST;
  }

  /** Today's challenge when it is on `gameId`, else null. */
  challengeFor(gameId: string): () => ReturnType<ArcadeDaily['challenge']> | null {
    return () => {
      const challenge = this.options.daily?.challenge();
      return challenge && challenge.gameId === gameId ? challenge : null;
    };
  }

  /** Whether the machine of `id` is out of order today. */
  isBroken(id: string): () => boolean {
    return () => this.broken === id;
  }

  /** How many regulars may be in the hall at this hour (more in the evening). */
  maxInside(): number {
    const hour = this.options.hours();
    let max = 1;
    for (const [from, count] of this.options.byHour) if (hour >= from) max = count;
    return max;
  }

  /** A regular's finished game on `gameId`: signed on its table when it makes it (capped), with a line to say so; else null. */
  regularScore(gameId: string, score: number, name: string): string | null {
    const rank = this.options.scores.submitRival(gameId, score, name, rivalScore(gameId, 0) * RIVAL_CAP);
    const lines = this.options.boardLines;
    return rank === null ? null : lines[Math.floor(Math.random() * lines.length)]!;
  }

  /**
   * The attendant's lines: the day's news first (the challenge, the change machine, the broken
   * machine, the tournament, the streak, the league, the jackpot, a record of the player's,
   * tickets enough for a prize), each said once, the next time they are clicked; then `usual`.
   */
  attendantLines(usual: readonly string[], titleOf: (id: string) => string, tabled: readonly HallGame[]): () => readonly string[] {
    return () => {
      const fresh = this.news(titleOf, tabled).find((line) => !this.said.has(line));
      if (!fresh) return usual;
      this.said.add(fresh);
      return [fresh];
    };
  }

  private news(titleOf: (id: string) => string, tabled: readonly HallGame[]): string[] {
    const { daily, league, tournament, jackpot, scores, wallet } = this.options;
    const lines: string[] = [];
    const challenge = daily?.challenge();
    if (challenge && !challenge.done) lines.push(`Today's challenge is ${titleOf(challenge.gameId)}: score ${challenge.target.toLocaleString('en-US')} and I add ${challenge.reward} tickets.`);
    if (challenge?.done) lines.push('You beat the challenge today. Come back tomorrow, there is a new one.');
    if (daily?.changeMachineWorks) lines.push('The change machine is working today. Do not tell anyone.');
    if (this.broken) lines.push(`${titleOf(this.broken)} is out of order today. The repair man comes tomorrow. Probably.`);
    const cup = tournament.view();
    if (cup.on && !cup.entered) lines.push(`Tournament day! ${titleOf(cup.gameId)}, three rounds against the regulars. The sheet is on the back wall, ${TOURNAMENT.entry} coins to sign.`);
    if (cup.on && cup.entered && cup.next) lines.push(`Your ${cup.next.round === 2 ? 'final' : cup.next.round === 1 ? 'semi-final' : 'quarter-final'} is against ${cup.next.name}. They practised all week.`);
    if (cup.on && cup.wins >= 3) lines.push('Champion of the Saturday cup. I will engrave it. With a biro.');
    if (league && league.streakDays >= 2) lines.push(`${league.streakDays} days in a row. You should get a hobby. Oh wait.`);
    const leader = league?.standings()[0];
    if (leader?.you && (league?.tickets ?? 0) > 0) lines.push('Top of the league this week. The regulars are furious.');
    if (jackpot.value >= 400) lines.push(`The wheel's jackpot is at ${jackpot.value}. Somebody is going to be very happy.`);
    const top = tabled.find((g) => scores.topOf(g.id).you);
    if (top) lines.push(`First on ${top.title}? I saw. I am pretending I did not.`);
    const affordable = PRIZES.filter((p) => p.tickets !== null && p.tickets <= wallet.tickets).sort((a, b) => (b.tickets ?? 0) - (a.tickets ?? 0))[0];
    if (affordable && wallet.tickets >= 100) lines.push(`${wallet.tickets} tickets. The ${affordable.name.toLowerCase()} is yours for ${affordable.tickets}, you know.`);
    return lines;
  }
}
