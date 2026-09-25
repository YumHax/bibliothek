import type { Game } from '@/catalog/types';
import type { GameSource } from '@/collection/GameSource';
import { seeded } from '@/economy/seeded';
import type { GameBox } from '../GameBox';

interface Claim {
  gameId: string;
  /** Called when the game stops being a stray without being picked up (sold, lent out). */
  onLost: () => void;
}

/**
 * The games left lying about the flat (one on the kitchen table, one on a nightstand): a filter
 * over what the shelves show. Each `StrayBox` slot claims an owned game for the day (seeded by the
 * day and the slot, so it is the same game until tomorrow), and while claimed it is off its shelf:
 * the shelves read `games` from here and leave its gap. Picked up, the slot `release`s it and its
 * shelf takes it back (rebuilt synchronously, so `homeBox` finds the new box at once). Lent or
 * wishlisted games are never left out; a claimed game that leaves the collection or gets lent
 * empties its slot.
 */
export class StrayGames implements GameSource {
  private readonly claims = new Map<string, Claim>();
  private readonly listeners = new Set<() => void>();
  private shown: readonly Game[] = [];
  /**
   * The box a game has on the flat's shelves right now, ready to take in hand (culling undone);
   * set in `main.ts` once the shelves exist. Without it a stray stays a box of its own.
   */
  homeBox: ((gameId: string) => GameBox | undefined) | null = null;

  constructor(private readonly source: GameSource) {
    this.recompute();
    source.subscribe(() => this.sourceChanged());
  }

  get games(): readonly Game[] {
    return this.shown;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Takes a game off the shelves for `slot` (the day's pick, or `gameId` to put a given one back
   * there); null when nothing is left to take. The slot's current game when it already has one.
   */
  claim(slot: string, day: number, onLost: () => void, gameId?: string): Game | null {
    const current = this.claims.get(slot);
    if (current) return this.source.games.find((g) => g.id === current.gameId) ?? null;
    const taken = new Set([...this.claims.values()].map((c) => c.gameId));
    const candidates = this.source.games.filter((g) => eligible(g) && !taken.has(g.id) && (gameId === undefined || g.id === gameId));
    if (!candidates.length) return null;
    const game = candidates[Math.floor(seeded(`${slot}:${day}`)() * candidates.length)]!;
    this.claims.set(slot, { gameId: game.id, onLost });
    this.changed();
    return game;
  }

  /** The slot's game goes back to its shelf. */
  release(slot: string): void {
    if (!this.claims.delete(slot)) return;
    this.changed();
  }

  private sourceChanged(): void {
    for (const [slot, claim] of [...this.claims]) {
      const game = this.source.games.find((g) => g.id === claim.gameId);
      if (game && eligible(game)) continue;
      this.claims.delete(slot);
      claim.onLost();
    }
    this.changed();
  }

  private changed(): void {
    this.recompute();
    for (const cb of [...this.listeners]) cb();
  }

  private recompute(): void {
    const out = new Set([...this.claims.values()].map((c) => c.gameId));
    this.shown = out.size ? this.source.games.filter((g) => !out.has(g.id)) : this.source.games;
  }
}

/** Only a game at home can be left out: not one on the wishlist, not one lent to a friend. */
function eligible(game: Game): boolean {
  return (game.status ?? 'owned') === 'owned';
}
