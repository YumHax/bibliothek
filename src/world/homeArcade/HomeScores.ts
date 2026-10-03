import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { ScoreTable, TableEntry } from '../arcade/scoreTable';

/** Places on each game's table at home. */
const PLACES = 5;

interface HomeScoresFile {
  /** Per game id, best first. */
  tables: Record<string, { name: string; score: number }[]>;
  initials: string;
}

/**
 * The home cabinet's hall of fame: a table per game of the scores made on it at home, signed with the player's
 * initials (or a friend's), kept apart from the arcade's (`ArcadeScores`: no regulars, no payout, no medals). Every
 * entry is the household's own, so all of them read as "you".
 */
export class HomeScores implements ScoreTable {
  private readonly store: PersistedStore<HomeScoresFile>;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage()) {
    // Version 1: `{ tables, initials }`.
    this.store = new PersistedStore<HomeScoresFile>({ key: KEYS.homeArcade, version: 1, storage, defaults: () => ({ tables: {}, initials: 'YOU' }), read: readScores });
  }

  private get state(): HomeScoresFile {
    return this.store.load();
  }

  get initials(): string {
    return this.state.initials;
  }

  bestOf(gameId: string): number {
    return this.state.tables[gameId]?.[0]?.score ?? 0;
  }

  topOf(gameId: string): TableEntry {
    const top = this.state.tables[gameId]?.[0];
    return top ? { ...top, you: true } : { name: '---', score: 0 };
  }

  table(gameId: string): TableEntry[] {
    return (this.state.tables[gameId] ?? []).map((e) => ({ ...e, you: true }));
  }

  qualifies(gameId: string, score: number): boolean {
    if (score <= 0) return false;
    const table = this.state.tables[gameId] ?? [];
    return table.length < PLACES || score > table[table.length - 1]!.score;
  }

  submit(gameId: string, score: number, initials?: string): { best: boolean; rank: number | null } {
    const state = this.state;
    const table = state.tables[gameId] ?? [];
    const best = score > (table[0]?.score ?? 0);
    if (!this.qualifies(gameId, score)) return { best, rank: null };
    const name = (initials ?? state.initials).slice(0, 3).toUpperCase() || 'YOU';
    const next = [...table, { name, score }].sort((a, b) => b.score - a.score).slice(0, PLACES);
    const rank = next.findIndex((e) => e.score === score && e.name === name);
    this.store.save({ tables: { ...state.tables, [gameId]: next }, initials: initials ? name : state.initials });
    for (const cb of this.listeners) cb();
    return { best, rank: rank >= 0 ? rank : null };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function readScores(data: unknown): HomeScoresFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Record<keyof HomeScoresFile, unknown>>;
  const tables: HomeScoresFile['tables'] = {};
  if (typeof d.tables === 'object' && d.tables !== null && !Array.isArray(d.tables)) {
    for (const [id, rows] of Object.entries(d.tables)) {
      if (!Array.isArray(rows)) continue;
      const kept = rows
        .filter((r): r is { name: string; score: number } => typeof r === 'object' && r !== null && typeof (r as { name?: unknown }).name === 'string' && Number.isFinite((r as { score?: unknown }).score))
        .map((r) => ({ name: r.name.slice(0, 3), score: Math.max(0, Math.floor(r.score)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, PLACES);
      if (kept.length) tables[id] = kept;
    }
  }
  const initials = typeof d.initials === 'string' && d.initials.length > 0 ? d.initials.slice(0, 3) : 'YOU';
  return { tables, initials };
}
