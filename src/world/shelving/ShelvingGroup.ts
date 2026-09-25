import type { GameBox } from '../GameBox';
import type { Shelving } from './Shelving';
import type { SortMode } from './sort';

/**
 * Several Shelvings seen as one by the session: the collection room's and the bedroom's bought
 * bookcases (which hold what the first had no room for). Search, the random pick and the sort key
 * reach every box wherever it stands; sorting sorts them all the same way.
 */
export class ShelvingGroup {
  private readonly members: Shelving[];

  constructor(first: Shelving, ...others: (Shelving | null)[]) {
    this.members = [first, ...others.filter((s): s is Shelving => s !== null)];
  }

  get boxes(): readonly GameBox[] {
    return this.members.flatMap((s) => s.boxes);
  }

  findBox(gameId: string): GameBox | undefined {
    for (const shelving of this.members) {
      const box = shelving.findBox(gameId);
      if (box) return box;
    }
    return undefined;
  }

  cycleSort(): SortMode {
    const [first, ...rest] = this.members;
    const mode = first!.cycleSort();
    for (const shelving of rest) shelving.setSort(mode);
    return mode;
  }
}
