import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { TABLE_SIZE, rivalTable, scoreRules, type ScoreEntry } from './rivals';

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
  /** Per game, the rules its best and entries were made under (`SCORE_RULES`; absent: 1). */
  rules: Record<string, number>;
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
      defaults: () => ({ best: {}, tables: {}, initials: 'YOU', rules: {} }),
      read: readScores,
      migrate: { 1: dropStartingRivals },
    });
    const loaded = this.store.tryLoad() ?? this.legacy();
    this.state = underTodaysRules(loaded);
    if (this.state !== loaded) this.store.save(this.state);
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
      ...this.state,
      best: best ? { ...this.state.best, [gameId]: score } : this.state.best,
      tables,
      initials: rank !== null ? name : this.state.initials,
      rules: { ...this.state.rules, [gameId]: scoreRules(gameId) },
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
    this.state = { ...this.state, tables, rules: { ...this.state.rules, [gameId]: scoreRules(gameId) } };
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
    const state: ScoresFile = { best: {}, tables: {}, initials: 'YOU', rules: {} };
    try {
      state.best = numbers(JSON.parse(this.storage?.getItem(LEGACY_KEY) ?? 'null'));
    } catch {
      return state;
    }
    for (const [id, score] of Object.entries(state.best)) state.tables[id] = [{ name: 'YOU', score, you: true }];
    return state;
  }
}

/**
 * `file` without the bests and entries of the games whose rules changed since they were made
 * (`SCORE_RULES`): an old score is not comparable, and a best made under easier rules would stand
 * for ever. The same object when nothing changed.
 */
function underTodaysRules(file: ScoresFile): ScoresFile {
  const ids = new Set([...Object.keys(file.best), ...Object.keys(file.tables)]);
  const stale = [...ids].filter((id) => (file.rules[id] ?? 1) !== scoreRules(id));
  if (!stale.length) return file;
  const best = { ...file.best };
  const tables = { ...file.tables };
  const rules = { ...file.rules };
  for (const id of stale) {
    delete best[id];
    delete tables[id];
    rules[id] = scoreRules(id);
  }
  return { ...file, best, tables, rules };
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
    rules: numbers(parsed.rules),
  };
}

/**
 * Version 1 -> 2: a saved table's rows that are its starting rivals go (by name, not the player's: their scores
 * have been retuned since, so a v1 row may hold an old starting score).
 */
function dropStartingRivals(data: unknown): unknown {
  const file = readScores(data);
  if (!file) return data;
  const out: Record<string, ScoreEntry[]> = {};
  for (const [id, rows] of Object.entries(file.tables)) {
    const starting = rivalTable(id);
    const kept = rows.filter((row) => row.you || !starting.some((r) => r.name === row.name));
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
