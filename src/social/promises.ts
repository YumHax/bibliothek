import { conflictSave } from './conflicts/conflictStore';
import { life } from './life/lifeStore';
import { espressoOwed } from './street/wager';
import type { PersonId } from './types';

/*
 * The player's promises to someone, read in one place (docs/social.md "Promises"): the favours said yes to
 * (`life/favours`), the votes promised before a co-owners' meeting (`conflicts/votes`), the espresso owed Victor on a
 * lost wager (`street/wager`). Kept ones are the stamps of trust; broken ones the crossings-out. Read only: each
 * feature keeps its own.
 */

/** One promise, however it was made. */
interface PromiseRecord {
  person: PersonId;
  kind: 'favour' | 'vote' | 'wager';
  /** The game day it was made, and the last day it can be kept on. */
  made: number;
  due: number;
  state: 'open' | 'kept' | 'broken';
}

const VICTOR = 'victor';

/** Every promise made to `id`, newest first. */
function promisesOf(id: PersonId): PromiseRecord[] {
  const out: PromiseRecord[] = [];
  for (const f of life().favours) {
    if (f.person !== id || f.accepted === null) continue;
    out.push({ person: id, kind: 'favour', made: f.accepted, due: f.due, state: f.done !== undefined ? 'kept' : f.failed !== undefined ? 'broken' : 'open' });
  }
  for (const v of conflictSave().votes) {
    if (v.person !== id) continue;
    out.push({ person: id, kind: 'vote', made: v.made, due: v.meeting, state: v.kept === null ? 'open' : v.kept ? 'kept' : 'broken' });
  }
  if (id === VICTOR) {
    const owed = espressoOwed();
    if (owed) out.push({ person: id, kind: 'wager', made: owed.made, due: owed.due, state: owed.state });
  }
  return out.sort((a, b) => b.made - a.made);
}

/** How many promises to `id` were kept, broken, and are still open. */
export function promiseCounts(id: PersonId): { kept: number; broken: number; open: number } {
  const counts = { kept: 0, broken: 0, open: 0 };
  for (const p of promisesOf(id)) counts[p.state]++;
  return counts;
}
