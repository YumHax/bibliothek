import type { Today } from '@/time/Today';
import { gameDayRandom } from '@/time/daily';
import { STAIRWELL_PLAN } from '@/world/stairwell/stairwellPlan';
import { pinSource, refreshBoard, type BoardNote } from './boardNotes';
import { estatePhase } from './estateSale';
import { mainsOn } from './mains';
import { COPRO_PLAN as plan, RESOLUTIONS, type Resolution, type ResolutionId } from './coproPlan';
import { ballotFor, castBallot, coproChoice, minutesOf, pendingBallotDays, recordMeeting, settledThrough, voidBallot, type Outcome } from './coproState';

/** One resolution as the ballot shows it: its options with who leans to each, the building's current choice, the player's vote. */
export interface BallotItem {
  id: ResolutionId;
  title: string;
  detail: string;
  current: string;
  options: { id: string; label: string; leaning: string[] }[];
  vote?: string;
  /** Votes the player's coins bought already (paid: they stay). */
  bought: number;
}

/** The open ballot, as the panel needs it. */
export interface BallotView {
  day: number;
  hour: number;
  syndic: string;
  items: BallotItem[];
  /** Coins a bought vote costs, and at most how many on one resolution. */
  contribution: number;
  maxBought: number;
  /** The player's own votes (two once they own two flats). */
  playerVotes: number;
}

export interface CoproMeetingOptions {
  today: Today;
  /** How many flats the player owns, each a vote (1; 2 once Mrs Roux's is theirs). */
  playerVotes?: () => number;
  /** Whether a voter of the plan still lives here (Mrs Roux moved out: her flat is the player's). */
  stillHere?: (who: string) => boolean;
  /** Gives back coins the player paid for votes at a meeting that can never sit (a ballot off the meetings' days). */
  refund?: (coins: number) => void;
}

/** The meeting sitting on or after game day `day`. */
export function nextMeetingDay(day: number): number {
  return Math.max(plan.every, Math.ceil(day / plan.every) * plan.every);
}

/** The last meeting that sat before game day `day` (0: none yet). */
export function lastMeetingDay(day: number): number {
  return Math.floor((day - 1) / plan.every) * plan.every;
}

/** The resolutions put to the meeting of `day`: a seeded draw, those never decided first. */
export function agendaFor(day: number): Resolution[] {
  const random = gameDayRandom('copro.agenda', day);
  const weighed = RESOLUTIONS.map((r) => ({ r, key: random() + (minutesEverDecided(r.id, day) ? 1 : 0) }));
  return weighed.sort((a, b) => a.key - b.key).slice(0, plan.perAgenda).map((w) => w.r);
}

/** Whether a meeting before `day` already had `id` on its agenda. */
function minutesEverDecided(id: ResolutionId, day: number): boolean {
  for (let d = day - plan.every; d >= plan.every; d -= plan.every) if (agendaIds(d).includes(id)) return true;
  return false;
}

/** The agenda's ids without the history weighting (so the recursion above stops): the draw of meeting `day` alone. */
function agendaIds(day: number): ResolutionId[] {
  const random = gameDayRandom('copro.agenda', day);
  return RESOLUTIONS.map((r) => ({ id: r.id, key: random() })).sort((a, b) => a.key - b.key).slice(0, plan.perAgenda).map((w) => w.id);
}

/** How voter `who` votes on `resolution` at the meeting of `day`: their nature, else a seeded mind of their own (status quo half the time). */
function voteOf(who: string, resolution: Resolution, day: number, current: string): string {
  const fixed = plan.voters.find((v) => v.who === who)?.leans[resolution.id];
  if (fixed) return fixed;
  const random = gameDayRandom(`copro.vote:${who}:${resolution.id}`, day);
  if (random() < 0.5) return current;
  return resolution.options[Math.floor(random() * resolution.options.length)]!.id;
}

/**
 * The co-ownership meeting (l'AG): every `COPRO_PLAN.every` game days, three resolutions on the
 * agenda (the stair carpet, the paint, the plants, the bikes, the lift, the fibre...). The agenda
 * goes up on the hall's board `openDays` before; meanwhile the player votes in the ballot box by the
 * board (`ballotView` / `cast`), and may pay towards the works for extra votes. The residents vote
 * by their nature or a mind of their own (drawn per meeting). The day after the meeting it is tallied
 * (`settle`, on each new game day and at boot): the outcomes become the building's (`coproState`),
 * the minutes go up on the board, and the stairwell repaints itself (`stairwell/coproLook`).
 */
export class CoproMeeting {
  private readonly playerVotes: () => number;
  private readonly stillHere: (who: string) => boolean;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(private readonly options: CoproMeetingOptions) {
    this.playerVotes = options.playerVotes ?? (() => 1);
    this.stillHere = options.stillHere ?? (() => true);
    this.settle();
    this.unsubscribe.push(options.today.onNewGameDay(() => this.settle()));
    this.unsubscribe.push(pinSource('copro', (day) => this.notes(day)));
  }

  private get day(): number {
    return this.options.today.gameDay;
  }

  /** The meeting whose ballot is open today, or null between the agendas. */
  get openMeeting(): number | null {
    const next = nextMeetingDay(this.day);
    return next - this.day <= plan.openDays ? next : null;
  }

  /**
   * The syndic stands in the hall: on a meeting's day, in his hours; on a day of the late Mr Lambert's sale
   * (`estateSale`), only once its tables are cleared away, as both stand where the chairs go. Not in a power cut
   * (`mains`): the residents' card table takes the hall's middle, and the ballot is postal anyway.
   */
  syndicHere(hours: number): boolean {
    if (!mainsOn()) return false;
    if (estatePhase(this.day) === 'on' && hours < STAIRWELL_PLAN.estateSale.hours[1]) return false;
    return nextMeetingDay(this.day) === this.day && hours >= plan.syndicHours[0] && hours < plan.syndicHours[1];
  }

  /** The open ballot, as the panel shows it; null when none is open. */
  ballotView(): BallotView | null {
    const day = this.openMeeting;
    if (day === null) return null;
    const ballot = ballotFor(day);
    const voters = plan.voters.filter((v) => this.stillHere(v.who));
    const items = agendaFor(day).map((r): BallotItem => {
      const current = coproChoice(r.id);
      return {
        id: r.id,
        title: r.title,
        detail: r.detail,
        current,
        options: r.options.map((o) => ({ id: o.id, label: o.label, leaning: voters.filter((v) => v.leans[r.id] === o.id).map((v) => v.who) })),
        vote: ballot.votes[r.id],
        bought: ballot.bought[r.id] ?? 0,
      };
    });
    return { day, hour: plan.hour, syndic: plan.syndic, items, contribution: plan.contribution, maxBought: plan.maxBought, playerVotes: this.playerVotes() };
  }

  /**
   * The player's ballot for the open meeting: a vote per resolution and the votes bought on each (never fewer than
   * already paid for), the new bought votes paid through `pay`. 'closed' when no ballot is open, 'broke' when the
   * coins fell short (nothing is recorded then).
   */
  cast(votes: Partial<Record<ResolutionId, string>>, bought: Partial<Record<ResolutionId, number>>, pay: (coins: number) => boolean): 'closed' | 'broke' | 'cast' {
    const day = this.openMeeting;
    if (day === null) return 'closed';
    const before = ballotFor(day);
    const kept: Partial<Record<ResolutionId, number>> = {};
    let extra = 0;
    for (const r of agendaFor(day)) {
      const paid = before.bought[r.id] ?? 0;
      // Bought votes go to the player's own vote: none without one.
      const wanted = votes[r.id] ? Math.min(plan.maxBought, Math.max(paid, bought[r.id] ?? 0)) : paid;
      kept[r.id] = wanted;
      extra += wanted - paid;
    }
    if (extra > 0 && !pay(extra * plan.contribution)) return 'broke';
    castBallot(day, { votes, bought: kept });
    refreshBoard();
    return 'cast';
  }

  /**
   * Tallies, in order, every meeting that sat and was not counted yet (a new day, the game loaded after it, or days
   * jumped past several), so a ballot and the votes it bought always count. A ballot for a day no meeting falls on
   * (never cast so by the panel) is voided and its bought votes refunded.
   */
  settle(): void {
    const last = lastMeetingDay(this.day);
    if (last < plan.every) return;
    for (const d of pendingBallotDays()) {
      if (d > last || d % plan.every === 0) continue;
      const votes = voidBallot(d);
      if (votes > 0) this.options.refund?.(votes * plan.contribution);
    }
    const pending = pendingBallotDays().filter((d) => d <= last);
    const done = settledThrough();
    // Never tallied (a save from before the marker, or a first meeting): from its oldest ballot, else the last meeting only.
    const from = done > 0 ? done + plan.every : Math.min(last, ...pending);
    let tallied = false;
    for (let d = Math.max(plan.every, from); d <= last; d += plan.every) {
      if (minutesOf(d)) continue;
      this.tally(d);
      tallied = true;
    }
    if (tallied) refreshBoard();
  }

  /** Tallies the meeting of game day `day`: the residents' votes and the player's ballot; its outcomes become the building's. */
  private tally(day: number): void {
    const ballot = ballotFor(day);
    const voters = plan.voters.filter((v) => this.stillHere(v.who));
    const outcomes = agendaFor(day).map((r): Outcome => {
      const current = coproChoice(r.id);
      const tally: Record<string, number> = Object.fromEntries(r.options.map((o) => [o.id, 0]));
      for (const v of voters) tally[voteOf(v.who, r, day, current)]! += 1;
      const player = ballot.votes[r.id];
      if (player && player in tally) tally[player]! += this.playerVotes() + (ballot.bought[r.id] ?? 0);
      const best = Math.max(...Object.values(tally));
      const top = r.options.filter((o) => tally[o.id] === best).map((o) => o.id);
      // A tie keeps the building as it is.
      const winner = top.includes(current) ? current : top[0]!;
      return { id: r.id, winner, tally, player, changed: winner !== current };
    });
    recordMeeting(day, outcomes);
  }

  /** The board's notes: the agenda while the ballot is open, the minutes for a few days after. */
  private notes(day: number): BoardNote[] {
    const notes: BoardNote[] = [];
    const next = nextMeetingDay(day);
    if (next - day <= plan.openDays) {
      const when = next === day ? `TONIGHT, ${plan.hour}:00` : `Day ${next}, ${plan.hour}:00`;
      notes.push({
        id: `copro-agenda-${next}`,
        title: 'General meeting of the co-owners',
        lines: [when, 'In the entrance hall.', ...agendaFor(next).map((r, i) => `${i + 1}. ${r.title}`), 'Postal votes: the box below.'],
        signed: `${plan.syndic}, syndic`,
        weight: 10,
      });
    }
    const last = lastMeetingDay(day);
    const minutes = last >= plan.every ? minutesOf(last) : null;
    if (minutes && day - last <= plan.minutesDays) {
      notes.push({
        id: `copro-minutes-${last}`,
        title: 'Minutes of the general meeting',
        lines: minutes.map((o) => {
          const r = RESOLUTIONS.find((x) => x.id === o.id)!;
          const label = r.options.find((x) => x.id === o.winner)?.label ?? o.winner;
          const votes = Object.values(o.tally).reduce((a, b) => a + b, 0);
          return `${r.title}: ${label} (${o.tally[o.winner]} of ${votes})`;
        }),
        paper: 0xf2efe6,
        signed: `${plan.syndic}, syndic`,
        weight: 8,
      });
    }
    return notes;
  }

  /** A line about the last meeting, for whoever mentions it (the minutes' asides). */
  gossip(): string | null {
    const last = lastMeetingDay(this.day);
    const minutes = last >= plan.every ? minutesOf(last) : null;
    if (!minutes) return null;
    const asides = plan.voters.filter((v) => v.aside && minutes.some((o) => v.leans[o.id])).map((v) => v.aside!);
    return asides.length ? asides[(this.day * 7) % asides.length]! : null;
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
  }
}
