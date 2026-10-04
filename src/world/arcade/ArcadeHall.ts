import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { ArcadeLeague } from '@/economy/ArcadeLeague';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import type { Jackpot } from '@/economy/Jackpot';
import { PLAY_COST, TOURNAMENT, playIsFree } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { rivalScore } from '@/economy/rivals';
import { Prop } from '../props/Prop';
import { random } from '@/random';
import { formatNumber } from '@/text/count';
import { formatCoins, formatTickets } from '@/text/money';

/** A regular's score may go on the table up to this much above the best starting rival (they play better than people). */
const RIVAL_CAP = 1.1;

interface ArcadeHallOptions {
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
interface HallGame {
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
    return rank === null ? null : lines[Math.floor(random() * lines.length)]!;
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

  /** Every line of the day's news (`attendantLines`' first part), said or not: what the attendant tells a friend all at once. */
  newsToday(titleOf: (id: string) => string, tabled: readonly HallGame[]): string[] {
    return this.news(titleOf, tabled);
  }

  /** Every line of the day's news, in telling order: each source adds its lines when it has any. */
  private news(titleOf: (id: string) => string, tabled: readonly HallGame[]): string[] {
    return [
      ...this.challengeNews(titleOf),
      ...this.machineNews(titleOf),
      ...this.tournamentNews(titleOf),
      ...this.leagueNews(),
      ...this.jackpotNews(),
      ...this.recordNews(tabled),
      ...this.prizeNews(),
    ];
  }

  /** Today's challenge: still to beat, or beaten. */
  private challengeNews(titleOf: (id: string) => string): string[] {
    const challenge = this.options.daily?.challenge();
    if (!challenge) return [];
    if (challenge.done) return ['You beat the challenge today. A new one comes at midnight, your midnight, not this clock’s.'];
    return [`Today’s challenge is ${titleOf(challenge.gameId)}: score ${formatNumber(challenge.target)} and I add ${formatTickets(challenge.reward)}.`];
  }

  /** The change machine, and the machine out of order. */
  private machineNews(titleOf: (id: string) => string): string[] {
    const lines: string[] = [];
    if (this.options.daily?.changeMachineWorks) lines.push('The change machine is working today. Do not tell anyone.');
    if (this.broken) lines.push(`${titleOf(this.broken)} is out of order today. The repair man comes tomorrow. Probably.`);
    return lines;
  }

  /** The Saturday cup: to enter, the next round, the win. */
  private tournamentNews(titleOf: (id: string) => string): string[] {
    const cup = this.options.tournament.view();
    if (!cup.on) return [];
    const lines: string[] = [];
    if (!cup.entered) lines.push(`Tournament day! ${titleOf(cup.gameId)}, three rounds against the regulars. The sheet is on the back wall, ${formatCoins(TOURNAMENT.entry)} to sign.`);
    if (cup.entered && cup.next) lines.push(`Your ${cup.next.round === 2 ? 'final' : cup.next.round === 1 ? 'semi-final' : 'quarter-final'} is against ${cup.next.name}: beat ${formatNumber(cup.next.score)}. They practised all week.`);
    if (cup.wins >= 3) lines.push('Champion of the Saturday cup. I will engrave it. With a biro.');
    return lines;
  }

  /** Last week's result, the streak, the lead. */
  private leagueNews(): string[] {
    const { league } = this.options;
    if (!league) return [];
    const lines: string[] = [];
    const last = league.lastWeek;
    if (last?.won) lines.push('You won last week’s league! Play anything and I hand you the pennant.');
    else if (last) lines.push(`Last week’s league: you came ${last.rank + 1 === 2 ? 'second' : last.rank + 1 === 3 ? 'third' : `number ${last.rank + 1}`}. There is always this week.`);
    if (league.streakDays >= 2) lines.push(`${league.streakDays} days in a row. You should get a hobby. Oh wait.`);
    const leader = league.standings()[0];
    if (leader?.you && league.tickets > 0) lines.push('Top of the league this week. The regulars are furious.');
    return lines;
  }

  /** The wheel's pot, once it is worth mentioning. */
  private jackpotNews(): string[] {
    const { jackpot } = this.options;
    return jackpot.value >= 400 ? [`The wheel’s jackpot is at ${jackpot.value}. Somebody is going to be very happy.`] : [];
  }

  /** A table the player tops. */
  private recordNews(tabled: readonly HallGame[]): string[] {
    const top = tabled.find((g) => this.options.scores.topOf(g.id).you);
    return top ? [`First on ${top.title}? I saw. I am pretending I did not.`] : [];
  }

  /** Tickets enough for the dearest prize they buy. */
  private prizeNews(): string[] {
    const { wallet } = this.options;
    const affordable = PRIZES.filter((p) => p.tickets !== null && p.tickets <= wallet.tickets).sort((a, b) => (b.tickets ?? 0) - (a.tickets ?? 0))[0];
    return affordable && wallet.tickets >= 100 ? [`${formatTickets(wallet.tickets)}. The ${affordable.name.toLowerCase()} is yours for ${affordable.tickets}, you know.`] : [];
  }
}
