import { TABLE_SIZE, rivalTable, type ScoreEntry } from './rivals';

export const ARCADE_SCORES_KEY = 'bibliothek.arcade.v2';
/** The first version kept only the player's best per game; it is read once and folded in. */
const LEGACY_KEY = 'bibliothek.arcade.v1';

interface ScoresFile {
  /** The player's own best per game (whether or not it made the table). */
  best: Record<string, number>;
  /** The top five per game, rivals included, best first. */
  tables: Record<string, ScoreEntry[]>;
  /** The initials the player last signed with. */
  initials: string;
}

/** What `submit` reports: a new personal best, and where the score landed on the table (null: off it). */
export interface SubmitResult {
  best: boolean;
  rank: number | null;
}

type Listener = () => void;

/**
 * The arcade's scores, persisted: the player's best per game (the cabinets' NEW BEST, the attract
 * screen) and a top-five table per game that starts full of rivals (`rivals.ts`) and takes the
 * player's initials when a score beats the fifth. Consumers `subscribe` and re-read.
 */
export class ArcadeScores {
  private state: ScoresFile;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = ARCADE_SCORES_KEY,
  ) {
    this.state = this.load();
  }

  bestOf(gameId: string): number {
    return this.state.best[gameId] ?? 0;
  }

  /** The table for `gameId`, best first (a copy). */
  table(gameId: string): ScoreEntry[] {
    return (this.state.tables[gameId] ?? rivalTable(gameId)).map((e) => ({ ...e }));
  }

  /** The top score on the table, whoever holds it. */
  topOf(gameId: string): ScoreEntry {
    return this.table(gameId)[0]!;
  }

  /** Whether `score` would make the table (beats its fifth). */
  qualifies(gameId: string, score: number): boolean {
    const table = this.table(gameId);
    return score > 0 && (table.length < TABLE_SIZE || score > table[table.length - 1]!.score);
  }

  get initials(): string {
    return this.state.initials;
  }

  /**
   * Records a play: the personal best if beaten, and a table entry signed `initials` if the score
   * makes the table. Returns what happened.
   */
  submit(gameId: string, score: number, initials = this.state.initials): SubmitResult {
    const best = score > this.bestOf(gameId);
    const name = sanitise(initials);
    let rank: number | null = null;
    const tables = { ...this.state.tables };
    if (this.qualifies(gameId, score)) {
      const table = this.table(gameId);
      rank = table.findIndex((e) => score > e.score);
      if (rank < 0) rank = table.length;
      table.splice(rank, 0, { name, score, you: true });
      tables[gameId] = table.slice(0, TABLE_SIZE);
    }
    if (!best && rank === null) return { best, rank };
    this.state = {
      best: best ? { ...this.state.best, [gameId]: score } : this.state.best,
      tables,
      initials: rank !== null ? name : this.state.initials,
    };
    this.commit();
    return { best, rank };
  }

  /**
   * A regular's game ended: their score goes on the table under `name` when it makes it, never
   * above `cap` (the regulars' hands are machines' autopilots, far steadier than a person: capped,
   * they shuffle the board without walling it off). Returns the rank taken, or null.
   */
  submitRival(gameId: string, score: number, name: string, cap: number): number | null {
    if (score > cap || !this.qualifies(gameId, score)) return null;
    const table = this.table(gameId);
    let rank = table.findIndex((e) => score > e.score);
    if (rank < 0) rank = table.length;
    table.splice(rank, 0, { name: sanitise(name), score });
    this.state = { ...this.state, tables: { ...this.state.tables, [gameId]: table.slice(0, TABLE_SIZE) } };
    this.commit();
    return rank;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private commit(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[arcade] could not persist scores', err);
    }
    for (const cb of this.listeners) cb();
  }

  private load(): ScoresFile {
    const empty: ScoresFile = { best: {}, tables: {}, initials: 'YOU' };
    try {
      const parsed = JSON.parse(this.storage?.getItem(this.key) ?? 'null') as Partial<ScoresFile> | null;
      if (parsed && typeof parsed === 'object') {
        return {
          best: numbers(parsed.best),
          tables: tables(parsed.tables),
          initials: typeof parsed.initials === 'string' ? sanitise(parsed.initials) : 'YOU',
        };
      }
      // Version 1: bests only. They go on the tables under YOU.
      const legacy = numbers(JSON.parse(this.storage?.getItem(LEGACY_KEY) ?? 'null'));
      const state: ScoresFile = { ...empty, best: legacy };
      for (const [id, score] of Object.entries(legacy)) {
        const table = rivalTable(id);
        const rank = table.findIndex((e) => score > e.score);
        if (rank >= 0) {
          table.splice(rank, 0, { name: 'YOU', score, you: true });
          state.tables[id] = table.slice(0, TABLE_SIZE);
        }
      }
      return state;
    } catch {
      return empty;
    }
  }
}

/** Three capital letters (or digits), padded: what an arcade table takes. */
export function sanitise(initials: string): string {
  const clean = initials.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return clean.padEnd(3, 'A');
}

function numbers(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && v > 0) out[k] = v;
  return out;
}

function tables(value: unknown): Record<string, ScoreEntry[]> {
  const out: Record<string, ScoreEntry[]> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value)) {
    if (!Array.isArray(v)) continue;
    out[k] = v
      .filter((e): e is ScoreEntry => typeof e === 'object' && e !== null && typeof e.name === 'string' && typeof e.score === 'number')
      .map((e) => ({ name: sanitise(e.name), score: e.score, ...(e.you ? { you: true } : {}) }))
      .slice(0, TABLE_SIZE);
  }
  return out;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
