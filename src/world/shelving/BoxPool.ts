import type { Game } from '@/catalog/types';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { GameBox } from '../GameBox';

interface Entry {
  box: GameBox;
  /** The shelvings showing it now (one, bar the instant it passes from one to the next). */
  owners: Set<object>;
}

/**
 * The flat's GameBoxes, one per game, shared by every Shelving: a game passing from the collection
 * room's shelves to the bedroom's (the overflow, or the player carrying it there) keeps its box and
 * its art. A box no shelving holds any more is disposed at the end of the task, so one let go by a
 * shelving and taken by the next in the same rebuild chain survives the hand-over.
 */
export class BoxPool {
  private readonly entries = new Map<string, Entry>();
  private sweepQueued = false;

  constructor(private readonly covers: BoxArtLoader) {}

  /**
   * The box of `game` for `owner`: the one there is (its status restyled by the caller), or a new one when
   * there is none or the game's art-relevant data changed (the old one is removed and disposed).
   */
  take(owner: object, game: Game): GameBox {
    let entry = this.entries.get(game.id);
    if (entry && !sameExceptStatus(entry.box.game, game)) {
      entry.box.removeFromParent();
      entry.box.dispose();
      entry = undefined;
    }
    if (!entry) {
      entry = { box: new GameBox(game, this.covers), owners: new Set() };
      this.entries.set(game.id, entry);
    }
    entry.owners.add(owner);
    return entry.box;
  }

  /** Whether some shelving shows `box` now (after the one asking has let it go: another one took it). */
  isHeld(box: GameBox): boolean {
    const entry = this.entries.get(box.game.id);
    return entry !== undefined && entry.box === box && entry.owners.size > 0;
  }

  /** `owner` no longer shows the game `id`; nobody taking it by the end of the task, its box is disposed. */
  letGo(owner: object, id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.owners.delete(owner) || entry.owners.size) return;
    if (this.sweepQueued) return;
    this.sweepQueued = true;
    queueMicrotask(() => this.sweep());
  }

  private sweep(): void {
    this.sweepQueued = false;
    for (const [id, entry] of this.entries) {
      if (entry.owners.size) continue;
      entry.box.removeFromParent();
      entry.box.dispose();
      this.entries.delete(id);
    }
  }
}

/**
 * Everything about a game but its status, as a string; computed once per Game object. A copy's past (found on
 * opening it) and its variant (the seal broken in hand: the box takes its wrap off itself, `GameBox.unseal`) change
 * while the box is open in the player's hand: they keep the box too.
 */
const signatures = new WeakMap<Game, string>();
const LIVE_KEYS = new Set(['status', 'past', 'variant']);
const withoutStatus = (key: string, value: unknown) => (LIVE_KEYS.has(key) ? undefined : value);

function signature(game: Game): string {
  let sig = signatures.get(game);
  if (sig === undefined) {
    sig = JSON.stringify(game, withoutStatus);
    signatures.set(game, sig);
  }
  return sig;
}

/** A status change alone must not rebuild the box (its textures would be refetched). */
export function sameExceptStatus(a: Game, b: Game): boolean {
  return a === b || (a.id === b.id && signature(a) === signature(b));
}
