import type { ScoreTable, TableEntry } from '../arcade/scoreTable';
import { TABLE_SIZE } from '@/economy/rivals';
import { byScore, makesTable } from '@/economy/scoreTable';

/**
 * The hall of fame of the collector's cabinet: his own five scores (`ATTIC_PLAN.collector`) and the
 * player's plays on it, kept with the arcade's (`ArcadeScores`, under the cabinet's own game id) so
 * a best survives a reload. The arcade's regulars never played up here: their starting names are left out.
 */
export class CollectorScores implements ScoreTable {
  private readonly his: TableEntry[];

  constructor(
    private readonly scores: ScoreTable,
    collector: { initials: string; scores: readonly number[] },
  ) {
    this.his = collector.scores.map((score) => ({ name: collector.initials, score }));
  }

  get initials(): string {
    return this.scores.initials;
  }

  bestOf(gameId: string): number {
    return this.scores.bestOf(gameId);
  }

  table(gameId: string): TableEntry[] {
    const mine = this.scores.table(gameId).filter((e) => e.you);
    return byScore([...this.his, ...mine]).slice(0, TABLE_SIZE);
  }

  topOf(gameId: string): TableEntry {
    return this.table(gameId)[0]!;
  }

  qualifies(gameId: string, score: number): boolean {
    return makesTable(this.table(gameId), score, TABLE_SIZE);
  }

  submit(gameId: string, score: number, initials?: string): { best: boolean; rank: number | null } {
    const result = this.scores.submit(gameId, score, initials);
    const rank = this.table(gameId).findIndex((e) => e.you && e.score === score);
    return { best: result.best, rank: rank >= 0 ? rank : null };
  }

  /** The best the collector left, the one to beat for his prize. */
  get hisBest(): number {
    return this.his[0]?.score ?? 0;
  }

  subscribe(cb: () => void): () => void {
    return this.scores.subscribe(cb);
  }
}
