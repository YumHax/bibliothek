import type { ScoreTable, TableEntry } from '../arcade/scoreTable';

/** How many lines the party's table keeps. */
const LINES = 8;

/**
 * The party tournament's table (a `ScoreTable` for the old cabinet): the residents' scores of the evening
 * (`building/neighboursParty.residentScores`, seeded by the day) and the player's plays, best first. Kept for the
 * evening only: tomorrow's party is another table. `submit` says whether the player now tops it.
 */
export class PartyScores implements ScoreTable {
  readonly initials = 'YOU';
  private readonly entries: TableEntry[];
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
    return gameId === this.gameId && score > 0 && (this.entries.length < LINES || score > this.entries[LINES - 1]!.score);
  }

  submit(gameId: string, score: number, initials = this.initials): { best: boolean; rank: number | null } {
    if (gameId !== this.gameId || score <= 0) return { best: false, rank: null };
    const best = score > (this.entries[0]?.score ?? 0);
    const entry: TableEntry = { name: initials, score, you: true };
    this.entries.push(entry);
    this.sort();
    const rank = this.entries.indexOf(entry);
    for (const cb of this.listeners) cb();
    return { best, rank: rank < LINES ? rank + 1 : null };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private sort(): void {
    this.entries.sort((a, b) => b.score - a.score);
  }
}
