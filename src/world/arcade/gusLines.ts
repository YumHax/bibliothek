import type { ArcadeScores } from '@/economy/ArcadeScores';
import { type ArcadeWins, lastVisitWins } from '@/economy/arcadeVisits';
import { regularNamed } from '@/economy/hallRegulars';
import { tier } from '@/social/standing';
import { formatNumber } from '@/text/count';
import { weekdayOf } from '@/time/wakefulness';
import { ATTENDANT } from './arcadeTalk';
import { ARCADE_PLAN } from './arcadePlan';
import { marcoHere } from './guestDays';

interface GusLinesOptions {
  scores: ArcadeScores;
  titleOf: (id: string) => string;
  /** What the player has won at the arcade now (the last visit is what grew since it began). */
  wins: ArcadeWins;
  day: () => number;
  hour: () => number;
  /** The social layer is on: how he gets on with the player colours his usual lines. */
  social: boolean;
}

/** The arcade's stores that know what the player has won. */
interface WinsSource {
  medals?: { readonly total: number; earned(gameId: string): readonly string[] };
  prizes?: { readonly owned: readonly { readonly id: string }[]; count(id: string): number };
  league?: { readonly pennants: number };
}

/** The Saturday cup as the tournament's cup level gives it (`ArcadeTournament`: plain, silver, gold). */
const CUP_IDS = ['saturdayCup', 'saturdayCup-silver', 'saturdayCup-gold'] as const;

/** What the player has won at the arcade, counted (golds over `games`). */
export function winsOf({ medals, prizes, league }: WinsSource, games: readonly { id: string }[]): ArcadeWins {
  return {
    medals: medals?.total ?? 0,
    golds: medals ? games.filter((g) => medals.earned(g.id).includes('gold')).length : 0,
    plush: prizes?.owned.filter((p) => p.id.startsWith('plush-')).length ?? 0,
    pennants: league?.pennants ?? 0,
    cups: prizes ? CUP_IDS.reduce((n, id) => n + prizes.count(id), 0) : 0,
  };
}

/** What Gus says about the last visit's wins, by kind, most notable first. */
const LAST_VISIT: readonly [kind: keyof ArcadeWins, line: string][] = [
  ['cups', 'Saturday’s champion, in my hall. The engraving on that cup is my best biro work.'],
  ['pennants', 'League champion. The regulars are still sulking. I am enjoying it.'],
  ['golds', 'A gold lamp last time. I saw it light up. I pretended not to.'],
  ['plush', 'The claw let go of a bunny for you last time. It never lets go of anything for me.'],
  ['medals', 'Another medal on a machine last time. Don’t let it go to your head.'],
];

/**
 * Gus's word on the people of the hall (docs/social.md "Front Street and the arcade"): a record a regular took off the
 * player while they were away, a friend expected today, what the player won on their last visit; and his usual lines
 * as he gets on with them (curt when cold, warmer for a friend). Each news line once a visit, before the hall's news.
 */
export class GusLines {
  private readonly said = new Set<string>();
  private readonly lastVisit: ArcadeWins;

  constructor(private readonly options: GusLinesOptions) {
    this.lastVisit = lastVisitWins(options.day(), options.wins);
  }

  /** Every line of his people news, said or not: records taken, friends expected, the last visit. */
  news(): string[] {
    return [...this.takenNews(), ...this.guestNews(), ...this.visitNews()];
  }

  /** The next line of his people news not said yet this visit, or null. */
  fresh(): string | null {
    const taken = this.takenNews();
    const line = this.news().find((l) => !this.said.has(l)) ?? null;
    if (line) this.said.add(line);
    // Every record taken told: the board's news is spent.
    if (taken.length && taken.every((l) => this.said.has(l))) this.options.scores.told();
    return line;
  }

  /** His usual lines, as he gets on with the player. */
  usual(): readonly string[] {
    const { attendant } = ARCADE_PLAN.crowd;
    if (!this.options.social) return attendant.lines;
    const t = tier(ATTENDANT);
    if (t === 'cold' || t === 'hostile' || t === 'nemesis') return attendant.curt;
    if (t === 'friend' || t === 'close') return [...attendant.warm, ...attendant.lines];
    return attendant.lines;
  }

  /** The records the regulars took while the player was away. */
  private takenNews(): string[] {
    return this.options.scores.takenNews.map((t) => {
      const who = regularNamed(t.name)?.name ?? t.name;
      return `${who} took first place on ${this.options.titleOf(t.gameId)} while you were out: ${formatNumber(t.score)}. Your initials are one line down. For now.`;
    });
  }

  /** A friend of the player's expected in the hall today. */
  private guestNews(): string[] {
    const day = this.options.day();
    const hour = this.options.hour();
    const lines: string[] = [];
    const { marco, hugo } = ARCADE_PLAN.crowd.guests;
    if (hour < marco.hours[0] && marcoHere(day, marco.hours[0])) lines.push('A Marco rang to say he’ll be in this afternoon. PADDLE WARS, he said. Like a threat.');
    if (weekdayOf(day) === hugo.weekday && hour < hugo.hours[1]) lines.push('Wednesday: young Hugo comes in this morning. HUG on the Snake board one day, he says. His mum says no later than half twelve.');
    return lines;
  }

  /** The best of what the last visit won. */
  private visitNews(): string[] {
    const best = LAST_VISIT.find(([kind]) => this.lastVisit[kind] > 0);
    return best ? [best[1]] : [];
  }
}
