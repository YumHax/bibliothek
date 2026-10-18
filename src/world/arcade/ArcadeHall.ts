import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { ArcadeLeague } from '@/economy/ArcadeLeague';
import type { ArcadeTournament } from '@/economy/ArcadeTournament';
import type { Jackpot } from '@/economy/Jackpot';
import { LEAGUE, PLAY_COST, TOURNAMENT, playIsFree } from '@/economy/pricing';
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
  /** The medals: the attendant mentions a platinum and the hall's tour. */
  medals?: { readonly tourDone: boolean; readonly golds: number };
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
 * The hall's rules for the day: what the next play costs (broke: on the house), today's challenge per game, the one
 * machine out of order (never the tournament's cabinet; looked at again when the game day turns, so a hall that stands
 * through midnight gets the new day's), how many regulars the hour brings in, whether a regular's score goes on the
 * table, and the attendant's news (each topical line said once, then the usual ones). An empty `Prop`; the builder
 * places it and hands its answers to the machines, the crowd and the attendant.
 */
export class ArcadeHall extends Prop {
  private readonly options: ArcadeHallOptions;
  private readonly said = new Set<string>();
  /** The day `brokenOn` was worked out for, and its answer. */
  private brokenDay = '';
  private brokenOn: string | null = null;

  constructor(options: ArcadeHallOptions) {
    super();
    this.name = 'ArcadeHall';
    this.options = options;
  }

  /** Today's machine out of order, or null (worked out once a day). */
  get broken(): string | null {
    const { daily, tournament } = this.options;
    const day = daily?.day ?? '';
    if (day !== this.brokenDay) {
      this.brokenDay = day;
      const brokenToday = daily?.outOfOrder(this.options.breakable) ?? null;
      this.brokenOn = tournament.isOn && brokenToday === tournament.gameId ? null : brokenToday;
    }
    // The repair man, once rung, has it going again at the hour he said.
    const ready = daily?.repairAt;
    if (this.brokenOn && ready !== null && ready !== undefined && this.options.hours() >= ready) return null;
    return this.brokenOn;
  }

  /**
   * The player tries the broken machine: Gus rings the repair man the first time (it works again `REPAIR_HOURS`
   * later), then says when he is due. His words.
   */
  brokenClick(): string {
    const { daily } = this.options;
    if (!daily) return 'OUT OF ORDER. Sorry.';
    const asked = daily.repairAt !== null;
    const ready = daily.askRepair(this.options.hours());
    const at = `${Math.min(23, ready)}:00`;
    return asked ? `Didier’s on his way. ${at}, he said.` : `Again? Right, I’ll ring Didier. He’ll have it going by ${at}. Have a go on something else meanwhile.`;
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
      ...this.medalNews(),
      ...this.jackpotNews(),
      ...this.recordNews(tabled),
      ...this.prizeNews(),
    ];
  }

  /** Today's challenge: still to beat, or beaten. */
  private challengeNews(titleOf: (id: string) => string): string[] {
    const challenge = this.options.daily?.challenge();
    if (!challenge) return [];
    if (challenge.done) return ['You beat the challenge today. A new one comes at midnight.'];
    const title = titleOf(challenge.gameId);
    const reward = formatTickets(challenge.reward);
    if (challenge.kind === 'feat') return [`Today’s challenge is ${title}: ${challenge.ask}. Show me one and I add ${reward}.`];
    if (challenge.kind === 'twice') return [`Today’s challenge: ${formatNumber(challenge.target)} on ${title}, twice. Do that and I add ${reward}.`];
    if (challenge.kind === 'total') return [`Today’s challenge: ${formatNumber(challenge.target)} on ${title}, all your goes today added up. I add ${reward}.`];
    if (challenge.personal) return [`Today’s challenge is ${title}: ${formatNumber(challenge.target)}. I set it from your own best, gold medallist. ${reward} if you do it.`];
    return [`Today’s challenge is ${title}: score ${formatNumber(challenge.target)} and I add ${formatTickets(challenge.reward)}.`];
  }

  /** The change machine, and the machine out of order. */
  private machineNews(titleOf: (id: string) => string): string[] {
    const lines: string[] = [];
    if (this.options.daily?.changeMachineWorks) lines.push('The change machine is working today. Do not tell anyone.');
    if (this.broken) {
      const ready = this.options.daily?.repairAt;
      lines.push(ready != null ? `${titleOf(this.broken)} is out of order. Didier’s coming at ${Math.min(23, ready)}:00 to fix it.` : `${titleOf(this.broken)} is out of order today. I keep meaning to ring Didier about it.`);
    }
    return lines;
  }

  /** The Saturday cup: to enter, the next round, the win. */
  private tournamentNews(titleOf: (id: string) => string): string[] {
    const cup = this.options.tournament.view();
    if (!cup.on) return [];
    const lines: string[] = [];
    if (!cup.entered) lines.push(`Tournament day! ${titleOf(cup.gameId)}, three rounds against the regulars. The sheet is on the back wall, ${formatCoins(TOURNAMENT.entry)} to sign.`);
    if (cup.entered && cup.next) lines.push(`Your ${cup.next.round === 2 ? 'final' : cup.next.round === 1 ? 'semi-final' : 'quarter-final'} is against ${cup.next.name}: beat ${formatNumber(cup.next.score)}. They practised all week.`);
    if (cup.wins >= 3) lines.push(`Champion of the ${cup.cup.name.toLowerCase()}. I will engrave it. With a biro.`);
    if (!cup.entered && cup.cup.titles >= TOURNAMENT.cups[1]!.titles) lines.push(`It is the ${cup.cup.name.toLowerCase()} for you now. The regulars have been practising, because of you.`);
    return lines;
  }

  /** Last week's result, the streak, the lead. */
  private leagueNews(): string[] {
    const { league } = this.options;
    if (!league) return [];
    const lines: string[] = [];
    const last = league.lastWeek;
    if (last?.won) lines.push(`You won last week’s ${LEAGUE.divisionNames[last.division]?.toLowerCase() ?? ''} league! Play anything and I hand you the pennant.`);
    else if (last) lines.push(`Last week’s league: you came ${last.rank + 1 === 2 ? 'second' : last.rank + 1 === 3 ? 'third' : `number ${last.rank + 1}`}. There is always this week.`);
    if (league.division.level > 0 && !last) lines.push(`The ${league.division.name.toLowerCase()} league this week. Different crowd up there.`);
    const { tier } = league.card;
    if (tier) lines.push(tier === 'HALL LEGEND' ? 'A legend of the hall, on my card. I might frame it.' : `${tier === 'REGULAR' ? 'A regular' : `A ${tier.toLowerCase()}`}. I remember faces, you know.`);
    if (league.tokens > 0) lines.push(league.tokens === 1 ? 'You have a gold token. It goes in any slot.' : `${league.tokens} gold tokens in your pocket. They go in any slot.`);
    if (league.streakDays >= 2) lines.push(`${league.streakDays} days in a row. You should get a hobby. Oh wait.`);
    const leader = league.standings()[0];
    if (leader?.you && league.tickets > 0) lines.push('Top of the league this week. The regulars are furious.');
    return lines;
  }

  /** The hall's tour, and the golds on the way to it. */
  private medalNews(): string[] {
    const { medals } = this.options;
    if (!medals) return [];
    if (medals.tourDone) return ['Gold on every machine. I have been here twenty years and I have seen it twice.'];
    return medals.golds >= 5 ? [`${medals.golds} golds. The whole hall in gold, and there would be a trophy in it.`] : [];
  }

  /** The wheel's pot, once it is worth mentioning; past a thousand, it is the talk of the hall. */
  private jackpotNews(): string[] {
    const { jackpot } = this.options;
    if (jackpot.newsworthy) return [`The wheel’s jackpot is over ${formatTickets(Math.floor(jackpot.value / 100) * 100)}. People come in off the street just to look at it.`];
    return jackpot.value >= 400 ? [`The wheel’s jackpot is at ${formatTickets(jackpot.value)}. Somebody is going to be very happy.`] : [];
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
