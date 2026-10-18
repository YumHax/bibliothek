import type { Game } from '@/catalog/types';

/*
 * FÉLIX'S HALF ROLL OF STICKERS (docs/grandma.md "What the memories leave behind", the last keepsake): "I think he'd
 * want you to finish it." From the day Mémé gives it, each game that comes home gets one of his round F.A. stickers on
 * its back (`Game.hisSticker`, kept with the collection) until the roll runs out; his own copies already have theirs.
 */

/** Stickers left on the half roll. */
const ROLL_LEFT = 24;

interface RollDeps {
  /** Whether Mémé has given the roll, and a change of what she has given. */
  given(): boolean;
  subscribeGiven(cb: () => void): () => void;
  collection: {
    readonly games: readonly Game[];
    /** What the last change was: an imported list is not games coming home. */
    readonly lastChange?: 'import' | 'edit';
    owns(id: string): boolean;
    subscribe(cb: () => void): () => void;
    update(id: string, patch: Partial<Omit<Game, 'id'>>): void;
  };
}

/** Sticks the roll's stickers on the games that come home once it is given; the unsubscribe. */
export function followStickerRoll(deps: RollDeps): () => void {
  const { collection } = deps;
  const ownedNow = (): Set<string> => new Set(collection.games.filter((g) => collection.owns(g.id)).map((g) => g.id));
  // What was home before: only the games that arrive from now on get a sticker.
  let before = ownedNow();
  let sticking = false;
  const onChange = (): void => {
    if (sticking) return;
    const now = ownedNow();
    const arrived = deps.given() && collection.lastChange !== 'import' ? [...now].filter((id) => !before.has(id)) : [];
    before = now;
    let used = collection.games.filter((g) => g.hisSticker).length;
    sticking = true;
    for (const id of arrived) {
      if (used >= ROLL_LEFT) break;
      const game = collection.games.find((g) => g.id === id);
      if (!game || game.felixLot !== undefined || game.hisSticker) continue;
      collection.update(id, { hisSticker: true });
      used++;
    }
    sticking = false;
  };
  const offs = [collection.subscribe(onChange), deps.subscribeGiven(() => (before = ownedNow()))];
  return () => offs.forEach((off) => off());
}
