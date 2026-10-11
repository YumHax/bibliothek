import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { TABLE_SIZE, rivalTable, scoreRules, type ScoreEntry } from './rivals';
import { byScore, makesTable, rankOf, withEntry } from './scoreTable';
import { between, chance, pick, seededRng } from '@/random';

const ARCADE_SCORES_KEY = KEYS.arcadeScores;
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
  /** Per game the player tops, the game day the hall first saw them on top (`settleDay`). */
  held: Record<string, number>;
  /** The last game day `settleDay` ran (-1: never). */
  day: number;
  /** Records the regulars took off the player while they were away, not yet told (`takenNews`). */
  taken: TakenRecord[];
}

/** A record a regular took from the player while they were out: the game, their initials, their score, the game day. */
interface TakenRecord {
  gameId: string;
  name: string;
  score: number;
  day: number;
}

/**
 * The regulars playing while the player is away: each game day missed (counted back `catchUp` days at most) one of
 * the player's records may fall, with these odds, once it has stood `heldDays`; the new top beats it by a few per cent
 * (`over`), rounded to `round`, so it stays within reach. A medal or anything paid is never taken back.
 */
const AWAY = { odds: 0.12, heldDays: 3, catchUp: 7, over: [1.02, 1.08] as const, round: 10 };

/** What `submit` reports: a new personal best, and where the score landed on the table (null: off it). */
interface SubmitResult {
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
  /** Per game, the entries of the past (`setPast`). */
  private readonly past = new Map<string, readonly ScoreEntry[]>();

  constructor(
    private readonly storage: Storage | null = safeStorage(),
    key: string = ARCADE_SCORES_KEY,
  ) {
    // Version 2: `tables` hold only the entries made since (version 1 saved whole tables, starting rivals included).
    this.store = new PersistedStore<ScoresFile>({
      key,
      version: 2,
      storage,
      defaults: emptyFile,
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
    return merged(gameId, [...this.pastOf(gameId), ...(this.state.tables[gameId] ?? [])]).map((e) => ({ ...e }));
  }

  /** The top score on the table, whoever holds it. */
  topOf(gameId: string): ScoreEntry {
    return this.table(gameId)[0]!;
  }

  /** Whether `score` would make the table (beats its fifth). */
  qualifies(gameId: string, score: number): boolean {
    return makesTable(this.table(gameId), score, TABLE_SIZE);
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
      rank = rankOf(merged(gameId, [...this.pastOf(gameId), ...tables[gameId]!]), entry);
    }
    if (!best && rank === null) return { best, rank };
    this.state = {
      ...this.state,
      best: best ? { ...this.state.best, [gameId]: score } : this.state.best,
      tables,
      initials: rank !== null ? name : this.state.initials,
      rules: { ...this.state.rules, [gameId]: scoreRules(gameId) },
      // A record taken (back) today stands from today; one bettered keeps its day.
      held: rank === 0 && this.state.day >= 0 ? { ...this.state.held, [gameId]: this.state.held[gameId] ?? this.state.day } : this.state.held,
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
    return rankOf(merged(gameId, [...this.pastOf(gameId), ...tables[gameId]!]), entry);
  }

  /**
   * A game day's first look at the hall: the records the regulars took off the player meanwhile (any game day missed
   * may see one fall, `AWAY`; `takerOf` names who takes a game's), then the day each record of the player's was first
   * seen standing. Once a game day; the first ever only starts the count.
   */
  settleDay(day: number, takerOf: (gameId: string) => string): void {
    const last = this.state.day;
    if (day <= last) return;
    let tables = this.state.tables;
    const held = { ...this.state.held };
    const taken = [...this.state.taken];
    const topOf = (id: string): ScoreEntry => merged(id, [...this.pastOf(id), ...(tables[id] ?? [])])[0]!;
    for (let d = last < 0 ? day + 1 : Math.max(last + 1, day - AWAY.catchUp + 1); d <= day; d++) {
      const rng = seededRng(`arcade-away:${d}`);
      if (!chance(rng, AWAY.odds)) continue;
      const standing = Object.keys(held)
        .filter((id) => d - held[id]! >= AWAY.heldDays && topOf(id).you)
        .sort();
      if (!standing.length) continue;
      const id = pick(rng, standing);
      const score = Math.ceil((topOf(id).score * between(rng, ...AWAY.over)) / AWAY.round) * AWAY.round;
      const name = sanitise(takerOf(id));
      tables = { ...tables, [id]: withEntry(tables[id] ?? [], { name, score }, TABLE_SIZE) };
      delete held[id];
      taken.push({ gameId: id, name, score, day: d });
    }
    const ids = new Set([...Object.keys(tables), ...this.past.keys()]);
    for (const id of ids) {
      if (!topOf(id).you) delete held[id];
      else held[id] ??= day;
    }
    this.state = { ...this.state, tables, held, day, taken: taken.slice(-TABLE_SIZE) };
    this.commit();
  }

  /** How many game days the player's record on `gameId` has stood (0: since today), or null when they do not hold it. */
  heldDays(gameId: string): number | null {
    const since = this.state.held[gameId];
    return since === undefined || !this.topOf(gameId).you ? null : Math.max(0, this.state.day - since);
  }

  /** The records taken off the player while they were away, not yet told; `told` clears them. */
  get takenNews(): readonly TakenRecord[] {
    return this.state.taken;
  }

  told(): void {
    if (!this.state.taken.length) return;
    this.state = { ...this.state, taken: [] };
    this.commit();
  }

  /**
   * Entries from before the game began, read live like the starting rivals and never saved here: the record the
   * player beat at fourteen in Mémé's memory "Three letters", under the initials typed in it (`memories/playerInitials`).
   */
  setPast(gameId: string, entries: readonly ScoreEntry[]): void {
    this.past.set(gameId, entries);
    for (const cb of this.listeners) cb();
  }

  /** Initials typed elsewhere (that memory's): the initials screens start from them while none were ever signed. */
  offerInitials(initials: string): void {
    if (this.state.initials !== 'YOU') return;
    this.state = { ...this.state, initials: sanitise(initials) };
    this.commit();
  }

  private pastOf(gameId: string): readonly ScoreEntry[] {
    return this.past.get(gameId) ?? [];
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** The tables with `entry` among `gameId`'s entries made since (best first, a table's worth kept). */
  private enter(gameId: string, entry: ScoreEntry): Record<string, ScoreEntry[]> {
    const entries = withEntry(this.state.tables[gameId] ?? [], entry, TABLE_SIZE);
    return { ...this.state.tables, [gameId]: entries };
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }

  /** Version 1 of the scores (another key): bests only. They go on the tables under YOU. */
  private legacy(): ScoresFile {
    const state = emptyFile();
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
  const held = { ...file.held };
  for (const id of stale) {
    delete best[id];
    delete tables[id];
    delete held[id];
    rules[id] = scoreRules(id);
  }
  return { ...file, best, tables, rules, held };
}

function emptyFile(): ScoresFile {
  return { best: {}, tables: {}, initials: 'YOU', rules: {}, held: {}, day: -1, taken: [] };
}

/** The starting rivals and `entries`, best first (a rival keeps a tie: a score must beat one to pass it), a table's worth. */
function merged(gameId: string, entries: readonly ScoreEntry[]): ScoreEntry[] {
  return byScore([...rivalTable(gameId), ...entries]).slice(0, TABLE_SIZE);
}

function readScores(data: unknown): ScoresFile | null {
  const parsed = data as Partial<ScoresFile> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    best: numbers(parsed.best),
    tables: tables(parsed.tables),
    initials: typeof parsed.initials === 'string' ? sanitise(parsed.initials) : 'YOU',
    rules: numbers(parsed.rules),
    held: days(parsed.held),
    day: typeof parsed.day === 'number' ? parsed.day : -1,
    taken: Array.isArray(parsed.taken)
      ? parsed.taken.filter((t): t is TakenRecord => typeof t === 'object' && t !== null && typeof t.gameId === 'string' && typeof t.name === 'string' && typeof t.score === 'number' && typeof t.day === 'number')
      : [],
  };
}

/** Game days by game (day 0 counts, unlike a score). */
function days(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && v >= 0) out[k] = v;
  return out;
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
function sanitise(initials: string): string {
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
