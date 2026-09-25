import { KEYS, PersistedStore } from '@/persistence';
import { dayKey } from './calendar';
import { TOURNAMENT } from './pricing';
import { REGULARS, rivalScore } from './rivals';
import { seeded } from './seeded';

export const ARCADE_TOURNAMENT_KEY = KEYS.arcadeTournament;

/** The three rounds, as the bracket board names them. */
export const ROUND_NAMES = ['QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'] as const;
const ROUNDS = ROUND_NAMES.length;
/** The player's name on the bracket. */
export const YOU = 'YOU';

/** One match of the bracket: its two entrants, their scores once played, and who went through. */
export interface Match {
  a: string;
  b: string;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
}

/** Everything the bracket board and the Session need to know about today's tournament. */
export interface TournamentView {
  /** Whether today is a tournament day (a Saturday). */
  on: boolean;
  /** The game it is played on today. */
  gameId: string;
  /** Eight entrants, the player first. */
  entrants: readonly string[];
  /** Quarter-finals, semi-finals, final: filled in as far as they are known. */
  rounds: readonly (readonly Match[])[];
  entered: boolean;
  /** Rounds the player has won (3: champion). */
  wins: number;
  /** Knocked out (lost a round). */
  out: boolean;
  /** The next opponent and the score to beat, while the player is still in. */
  next: { round: number; name: string; score: number } | null;
}

/** What a tournament play did: the round, the opponent's score, and how the player's run ended (if it did) with its reward. */
export interface TournamentOutcome {
  round: number;
  opponent: string;
  opponentScore: number;
  score: number;
  won: boolean;
  /** 'champion' after the final won, 'out' after a round lost, null while still in. */
  finished: 'champion' | 'out' | null;
  /** Tickets paid now (the run ended), and the cup for the champion. */
  tickets: number;
  prize: string | null;
}

/** How a round is announced at the end of the play. */
export function tournamentLine(outcome: TournamentOutcome): string {
  const round = ['quarter-final', 'semi-final', 'final'][outcome.round]!;
  const vs = `${outcome.score.toLocaleString('en-US')} against ${outcome.opponent}'s ${outcome.opponentScore.toLocaleString('en-US')}`;
  if (outcome.finished === 'champion') return `TOURNAMENT CHAMPION! ${vs}. ${outcome.tickets} tickets, and the Saturday cup goes on the prize shelf at home.`;
  if (outcome.finished === 'out') return `Knocked out in the ${round}: ${vs}.${outcome.tickets ? ` ${outcome.tickets} tickets for getting this far.` : ''} Next Saturday!`;
  return `${round[0]!.toUpperCase()}${round.slice(1)} won: ${vs}. Next round: play again.`;
}

interface TournamentFile {
  /** Local date (YYYY-MM-DD) of the Saturday this entry is for. */
  day: string;
  entered: boolean;
  /** The player's score in each round played, in order. */
  scores: number[];
}

export interface ArcadeTournamentOptions {
  /** The cabinets the tournament may be played on. */
  games: readonly string[];
  /** Regulars who always enter (the hall's own, by initials); the rest of the eight are drawn from the other regulars. */
  names?: readonly string[];
  /** Every day is tournament day; default: `?tournament` in the URL (to try it on a weekday). */
  force?: boolean;
  now?: () => Date;
  storage?: Storage | null;
}

/**
 * THE SATURDAY TOURNAMENT at the arcade, on the real calendar (local time): every Saturday one
 * cabinet (seeded by the date, the same for everyone) hosts an eight-entrant knock-out, the player
 * against seven regulars. Signing the sheet costs `TOURNAMENT.entry` coins, once a Saturday; then
 * each paid play on the day's cabinet is the player's next round, won by beating the opponent's
 * score (drawn per regular and round from the hall of fame's starting scores: harder each round).
 * The other matches are decided the same way and shown as the player's round reaches them (all of
 * them once the player is out). Going out after n wins pays `TOURNAMENT.reward[n]` tickets, the
 * champion also takes the cup home. Persisted by date: a new Saturday starts a new bracket.
 */
export class ArcadeTournament {
  private readonly games: readonly string[];
  private readonly names: readonly string[];
  private readonly force: boolean;
  private readonly now: () => Date;
  private readonly store: PersistedStore<TournamentFile>;
  private state: TournamentFile;
  private readonly listeners = new Set<() => void>();
  private readonly roundListeners = new Set<(outcome: TournamentOutcome) => void>();

  constructor(options: ArcadeTournamentOptions) {
    this.games = options.games.length ? options.games : ['stacker'];
    this.names = options.names ?? [];
    // `?tournament` in the URL makes any day a Saturday, to try it out (like `?debug`, read here so no wiring is needed).
    this.force = options.force ?? (typeof location !== 'undefined' && new URLSearchParams(location.search).has('tournament'));
    this.now = options.now ?? (() => new Date());
    this.store = new PersistedStore<TournamentFile>({
      key: ARCADE_TOURNAMENT_KEY,
      version: 1,
      storage: options.storage,
      defaults: () => ({ day: '', entered: false, scores: [] }),
      read: readTournament,
    });
    this.state = this.store.load();
  }

  /** Whether today is tournament day. */
  get isOn(): boolean {
    return this.force || this.now().getDay() === 6;
  }

  /** Today's cabinet (whatever the day: the board says which game next Saturday's is not, only today's). */
  get gameId(): string {
    const rng = seeded(`${this.today()}:tournament`);
    return this.games[Math.floor(rng() * this.games.length)]!;
  }

  /** Whether the player signed today's sheet. */
  get entered(): boolean {
    return this.isOn && this.current().entered;
  }

  /** Whether the player is still in today's tournament (signed, not out, not yet champion). */
  get running(): boolean {
    const v = this.view();
    return v.entered && !v.out && v.wins < ROUNDS;
  }

  /** Signs today's sheet (the coins are the caller's to take); false when it is not a tournament day or already signed. */
  enter(): boolean {
    if (!this.isOn || this.current().entered) return false;
    this.state = { day: this.today(), entered: true, scores: [] };
    this.commit();
    return true;
  }

  /** A play on today's cabinet ended with `score`: the player's next round, or null when they are not in the tournament. */
  play(score: number): TournamentOutcome | null {
    const before = this.view();
    if (!before.entered || before.out || before.wins >= ROUNDS || !before.next) return null;
    const { round, name, score: opponentScore } = before.next;
    this.state = { ...this.current(), scores: [...this.current().scores, score] };
    this.commit();
    const won = score > opponentScore;
    const wins = round + (won ? 1 : 0);
    const finished = !won ? 'out' : wins >= ROUNDS ? 'champion' : null;
    const outcome: TournamentOutcome = {
      round,
      opponent: name,
      opponentScore,
      score,
      won,
      finished,
      tickets: finished ? (TOURNAMENT.reward[wins] ?? 0) : 0,
      prize: finished === 'champion' ? TOURNAMENT.prize : null,
    };
    for (const cb of this.roundListeners) cb(outcome);
    return outcome;
  }

  /** Hears every round played (the watchers round the cabinet cheer or groan); returns the unsubscribe. */
  onRound(cb: (outcome: TournamentOutcome) => void): () => void {
    this.roundListeners.add(cb);
    return () => this.roundListeners.delete(cb);
  }

  /** Today's bracket as far as it is known. */
  view(): TournamentView {
    const on = this.isOn;
    const gameId = this.gameId;
    const entrants = this.entrants();
    const file = this.current();
    const entered = on && file.entered;
    const rounds: Match[][] = [];
    // Who goes through, round by round; the player's matches use their scores, every other match the drawn ones.
    let field = entrants.slice();
    let wins = 0;
    let out = false;
    let next: TournamentView['next'] = null;
    for (let r = 0; r < ROUNDS; r++) {
      const matches: Match[] = [];
      const through: string[] = [];
      for (let m = 0; m < field.length; m += 2) {
        const a = field[m]!;
        const b = field[m + 1]!;
        const scoreB = this.npcScore(b, r);
        if (a === YOU) {
          const played = file.scores[r];
          if (entered && played !== undefined) {
            const winner = played > scoreB ? YOU : b;
            if (winner === YOU) wins++;
            else out = true;
            matches.push({ a, b, scoreA: played, scoreB, winner });
            through.push(winner);
          } else {
            // The first round not yet played is the next one (the player stands in the later ones until then).
            if (entered && !out && next === null) next = { round: r, name: b, score: scoreB };
            matches.push({ a, b, scoreA: null, scoreB: null, winner: null });
            through.push(entered ? YOU : this.npcWinner(a, b, r));
          }
          continue;
        }
        const scoreA = this.npcScore(a, r);
        const winner = scoreA >= scoreB ? a : b;
        matches.push({ a, b, scoreA, scoreB, winner });
        through.push(winner);
      }
      rounds.push(matches);
      field = through;
    }
    // A match is shown once the player's own run reaches its round (the whole bracket once they are out or have won); unsigned, nothing is played yet.
    const shown = !entered ? 0 : out || wins >= ROUNDS ? ROUNDS : wins;
    const visible = rounds.map((matches, r) =>
      matches.map((match) => {
        const mine = match.a === YOU || match.b === YOU;
        if (mine || (r < shown && on)) return match;
        return { ...match, scoreA: null, scoreB: null, winner: null };
      }),
    );
    // Later rounds only know their entrants once the round before them is decided.
    for (let r = 1; r < ROUNDS; r++) {
      visible[r] = visible[r]!.map((match, i) => {
        const left = visible[r - 1]![i * 2]!.winner;
        const right = visible[r - 1]![i * 2 + 1]!.winner;
        return { ...match, a: left ?? '???', b: right ?? '???' };
      });
    }
    return { on, gameId, entrants, rounds: visible, entered, wins, out, next };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** A player who never signed is counted as if a regular stood in: the bracket still plays out. */
  private npcWinner(a: string, b: string, round: number): string {
    return this.npcScore(a, round) >= this.npcScore(b, round) ? a : b;
  }

  /** What `name` scores in `round` today: between the hall of fame's fifth and fourth score in the quarter-finals, climbing to its second in the final. */
  private npcScore(name: string, round: number): number {
    const gameId = this.gameId;
    const rng = seeded(`${this.today()}:tournament:${name}:${round}`);
    const low = rivalScore(gameId, 4 - round);
    const high = rivalScore(gameId, 3 - round);
    const raw = (low + (high - low) * rng()) * (0.9 + 0.2 * rng());
    const step = raw >= 10000 ? 100 : 10;
    return Math.max(step, Math.round(raw / step) * step);
  }

  /** The eight names on today's sheet: the player, the hall's regulars, then others from the hall of fame's. */
  private entrants(): string[] {
    const rng = seeded(`${this.today()}:tournament:entrants`);
    const others = REGULARS.filter((n) => n !== 'KID' && !this.names.includes(n));
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [others[i], others[j]] = [others[j]!, others[i]!];
    }
    const field = [...this.names, ...others].slice(0, 7);
    // Shuffle the seven so a different regular meets the player first each Saturday.
    for (let i = field.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [field[i], field[j]] = [field[j]!, field[i]!];
    }
    return [YOU, ...field];
  }

  /** Today's entry, or a blank one when the saved one is for another day. */
  private current(): TournamentFile {
    const day = this.today();
    return this.state.day === day ? this.state : { day, entered: false, scores: [] };
  }

  private today(): string {
    return dayKey(this.now());
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

function readTournament(data: unknown): TournamentFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<TournamentFile>;
  if (typeof d.day !== 'string') return null;
  return {
    day: d.day,
    entered: d.entered === true,
    scores: Array.isArray(d.scores) ? d.scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s)).slice(0, ROUNDS) : [],
  };
}
