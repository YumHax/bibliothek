import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { TABLE_SIZE, rivalTable, type ScoreEntry } from './rivals';

export const ARCADE_SCORES_KEY = KEYS.arcadeScores;
/** The first version kept only the player's best per game; it is read once and folded in. */
const LEGACY_KEY = KEYS.arcadeScoresLegacy;

interface ScoresFile {
  /** The player's own best per game (whether or not it made the table). */
  best: Record<string, number>;
  /**
   * Per game, the entries that are not the table's starting rivals (`rivals.ts`): the player's, and
   * the regulars' live games (`submitRival`), best first, at most a table's worth. The starting rivals
   * are merged in on read, so retuning them reaches every save.
   */
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
 * screen) and a top-five table per game: the starting rivals (`rivals.ts`, read live) merged with the
 * scores made since, the player's initials among them once a score beats the fifth. Consumers
 * `subscribe` and re-read.
 */
export class ArcadeScores {
  private state: ScoresFile;
  private readonly listeners = new Set<Listener>();
  private readonly store: PersistedStore<ScoresFile>;

  constructor(
    private readonly storage: Storage | null = safeStorage(),
    key: string = ARCADE_SCORES_KEY,
  ) {
    // Version 2: `tables` hold only the entries made since (version 1 saved whole tables, starting rivals included).
    this.store = new PersistedStore<ScoresFile>({
      key,
      version: 2,
      storage,
      defaults: () => ({ best: {}, tables: {}, initials: 'YOU' }),
      read: readScores,
      migrate: { 1: dropStartingRivals },
    });
    this.state = this.store.tryLoad() ?? this.legacy();
  }

  bestOf(gameId: string): number {
    return this.state.best[gameId] ?? 0;
  }

  /** The table for `gameId`, best first (a copy): the starting rivals and the entries made since. */
  table(gameId: string): ScoreEntry[] {
    return merged(gameId, this.state.tables[gameId] ?? []).map((e) => ({ ...e }));
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
    let tables = this.state.tables;
    if (this.qualifies(gameId, score)) {
      const entry: ScoreEntry = { name, score, you: true };
      tables = this.enter(gameId, entry);
      rank = merged(gameId, tables[gameId]!).indexOf(entry);
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
    const entry: ScoreEntry = { name: sanitise(name), score };
    const tables = this.enter(gameId, entry);
    this.state = { ...this.state, tables };
    this.commit();
    return merged(gameId, tables[gameId]!).indexOf(entry);
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** The tables with `entry` among `gameId`'s entries made since (best first, a table's worth kept). */
  private enter(gameId: string, entry: ScoreEntry): Record<string, ScoreEntry[]> {
    const entries = [...(this.state.tables[gameId] ?? []), entry].sort((a, b) => b.score - a.score).slice(0, TABLE_SIZE);
    return { ...this.state.tables, [gameId]: entries };
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }

  /** Version 1 of the scores (another key): bests only. They go on the tables under YOU. */
  private legacy(): ScoresFile {
    const state: ScoresFile = { best: {}, tables: {}, initials: 'YOU' };
    try {
      state.best = numbers(JSON.parse(this.storage?.getItem(LEGACY_KEY) ?? 'null'));
    } catch {
      return state;
    }
    for (const [id, score] of Object.entries(state.best)) state.tables[id] = [{ name: 'YOU', score, you: true }];
    return state;
  }
}

/** The starting rivals and `entries`, best first (a rival keeps a tie: a score must beat one to pass it), a table's worth. */
function merged(gameId: string, entries: readonly ScoreEntry[]): ScoreEntry[] {
  return [...rivalTable(gameId), ...entries].sort((a, b) => b.score - a.score).slice(0, TABLE_SIZE);
}

function readScores(data: unknown): ScoresFile | null {
  const parsed = data as Partial<ScoresFile> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    best: numbers(parsed.best),
    tables: tables(parsed.tables),
    initials: typeof parsed.initials === 'string' ? sanitise(parsed.initials) : 'YOU',
  };
}

/** Version 1 -> 2: a saved table's rows that are its starting rivals (same name, same score, not the player's) go. */
function dropStartingRivals(data: unknown): unknown {
  const file = readScores(data);
  if (!file) return data;
  const out: Record<string, ScoreEntry[]> = {};
  for (const [id, rows] of Object.entries(file.tables)) {
    const starting = rivalTable(id);
    const kept = rows.filter((row) => row.you || !starting.some((r) => r.name === row.name && r.score === row.score));
    if (kept.length) out[id] = kept;
  }
  return { ...file, tables: out };
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
      .sort((a, b) => b.score - a.score)
      .slice(0, TABLE_SIZE);
  }
  return out;
}
