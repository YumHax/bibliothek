import type { ScoreTable, TableEntry } from '../arcade/scoreTable';
import { byScore, makesTable, rankOf } from '@/economy/scoreTable';

/** How many lines the party's table keeps. */
const LINES = 8;

/**
 * The party tournament's table (a `ScoreTable` for the old cabinet): the residents' scores of the evening
 * (`building/neighboursParty.residentScores`, seeded by the day) and the player's plays, best first. Kept for the
 * evening only: tomorrow's party is another table. `submit` says whether the player now tops it.
 */
export class PartyScores implements ScoreTable {
  readonly initials = 'YOU';
  private entries: TableEntry[];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly gameId: string,
    residents: readonly { name: string; score: number }[],
  ) {
    this.entries = residents.map((r) => ({ name: r.name, score: r.score }));
    this.sort();
  }

  /** The best the residents have done tonight. */
  get residentsBest(): number {
    return Math.max(0, ...this.entries.filter((e) => !e.you).map((e) => e.score));
  }

  bestOf(gameId: string): number {
    return gameId === this.gameId ? (this.entries[0]?.score ?? 0) : 0;
  }

  topOf(gameId: string): TableEntry {
    return (gameId === this.gameId ? this.entries[0] : undefined) ?? { name: '---', score: 0 };
  }

  table(gameId: string): TableEntry[] {
    return gameId === this.gameId ? this.entries.slice(0, LINES) : [];
  }

  qualifies(gameId: string, score: number): boolean {
    return gameId === this.gameId && makesTable(this.entries.slice(0, LINES), score, LINES);
  }

  submit(gameId: string, score: number, initials = this.initials): { best: boolean; rank: number | null } {
    if (gameId !== this.gameId || score <= 0) return { best: false, rank: null };
    const best = score > (this.entries[0]?.score ?? 0);
    const entry: TableEntry = { name: initials, score, you: true };
    this.entries = byScore([...this.entries, entry]);
    const rank = rankOf(this.entries, entry) ?? LINES;
    for (const cb of this.listeners) cb();
    // 0-based, like `ArcadeScores.submit`: the end screens add the 1.
    return { best, rank: rank < LINES ? rank : null };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private sort(): void {
    this.entries = byScore(this.entries);
  }
}
