import { countOf, standing } from './standing';
import type { Memory, PersonId } from './types';

/*
 * Which of their memories someone calls back (docs/social.md "Memories"): at the start of a conversation, on the
 * phone's message. Something particular from a day to twelve ago, never a talk like any other; the least called back
 * first, then the one that mattered most, so the same moment does not come back every time.
 */

/** What a good talk leaves them (mild: it fades, and it is never called back). */
export const GOOD_TALK_MEMORY = 'we had a good talk';

/** How many times `m` was called back. */
function recalls(id: PersonId, m: Memory): number {
  return countOf(id, recallKey(m));
}

/** The memory of `id`'s to call back on `day` (`warm`: a fond one only), or null. */
export function memoryToRecall(id: PersonId, day: number, warm = false): Memory | null {
  const candidates = standing(id).memories.filter((m) => day - m.day >= 1 && day - m.day <= 12 && Math.abs(m.weight) >= 3 && m.text !== GOOD_TALK_MEMORY && (!warm || m.weight > 0));
  candidates.sort((a, b) => recalls(id, a) - recalls(id, b) || Math.abs(b.weight) - Math.abs(a.weight));
  return candidates[0] ?? null;
}

/** The key a recall of `m` is counted under (`standing.bumpCount`). */
export function recallKey(m: Memory): string {
  return `recall:${m.day}:${m.text}`;
}
