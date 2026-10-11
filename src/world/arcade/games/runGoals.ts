import type { RunContext, ScoreGoal } from './ArcadeGame';
import type { MedalBook, ScoreTable } from '../scoreTable';
import { TICKET_FLOOR } from '@/economy/pricing';

/**
 * What a player's play on a hall cabinet reaches for and is sure of, for its `RunContext`: their own best and each
 * medal they have not won on that game (in whatever tiers the book keeps), and the floor of a paid play.
 */
export function playExtras(gameId: string, scores: ScoreTable, medals: MedalBook | undefined, paid: boolean): Pick<RunContext, 'goals' | 'ticketFloor'> {
  const goals: ScoreGoal[] = [];
  const best = scores.bestOf(gameId);
  if (best > 0) goals.push({ label: 'BEST', score: best });
  if (medals) {
    const earned = medals.earned(gameId);
    for (const [tier, score] of Object.entries(medals.thresholds(gameId))) {
      if (!earned.includes(tier as never) && score > 0) goals.push({ label: tier.toUpperCase(), score });
    }
  }
  return { goals, ticketFloor: paid ? TICKET_FLOOR : 0 };
}
