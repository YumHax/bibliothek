import { movedOut } from '../rouxMove';
import { findClue, huntOpen } from './BuildingHunt';
import { HUNT } from './huntPlan';

/**
 * What an old neighbour remembers of Albert Vasseur, once the hunt has begun (`Neighbours.says`): the
 * first of `HUNT.rememberers` still in the building, at the first chat after the letter. Null otherwise.
 */
export function huntSays(key: string): string | null {
  if (!huntOpen('memory')) return null;
  const who = HUNT.rememberers.find((k) => !movedOut(k));
  if (key !== who) return null;
  findClue('memory', 'later');
  return HUNT.clues.memory.text;
}
