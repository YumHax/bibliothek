import type { Game } from '@/catalog/types';
import type { Views } from './Fame';
import type { Milestones } from './Milestones';
import type { ValueHistory } from './ValueHistory';
import type { CollectorFacts, Milestone } from './milestoneList';
import { collectionValue, mostValuable, valuedGames } from './collectionValue';

/** Something that changes and says so. */
interface Watched {
  subscribe(cb: () => void): () => void;
}

export interface CollectorWatchDeps {
  /** The whole collection (owned, lent, wishlist): the parcel's games are the player's too. */
  collection: Watched & { readonly games: readonly Game[] };
  fame: { peek(game: Pick<Game, 'id'>): Views; lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
  medals?: Watched & { readonly total: number };
  standing?: Watched & { deedCount(deed: 'deal' | 'sell' | 'wanted'): number };
  league?: Watched & { readonly pennants: number };
  milestones: Milestones;
  history: ValueHistory;
}

/** Fame lookups in flight at once while the collection's values are filled in. */
const LOOKUPS_AT_ONCE = 2;
/** Changes are gathered for this long before the facts are taken again (a job lot adds five games at once). */
const SETTLE_MS = 300;

/**
 * Keeps the collector's book up to date behind the scenes: whenever the collection, the arcade's
 * medals and league, or the market's standing change, it takes the facts again, marks the
 * milestones they reach (`onReached` hears of new ones, for a toast) and writes today's value in
 * the history. The collection's fame is looked up in the background, a couple at a time, so the
 * value is priced like the market prices it; `subscribe` fires when the value moves.
 */
export class CollectorWatch {
  /** New milestones reached, in the book's order (a toast in `main.ts`). */
  onReached?: (milestones: readonly Milestone[]) => void;
  private readonly listeners = new Set<() => void>();
  private readonly queue: Game[] = [];
  private readonly asked = new Set<string>();
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: CollectorWatchDeps) {
    for (const source of [deps.collection, deps.medals, deps.standing, deps.league]) source?.subscribe(() => this.soon());
    this.soon();
  }

  /** What the fame of `game` is, as far as is known now. */
  viewsOf = (game: Game): Views => this.deps.fame.peek(game);

  /** The collection's value now: the market's estimate, the desk's offer, and how many games are not priced yet. */
  value(): { market: number; desk: number; pending: number } {
    return collectionValue(this.deps.collection.games, this.viewsOf);
  }

  /** The `count` most valuable copies at home or lent, best first. */
  showpieces(count: number, among: readonly Game[] = this.deps.collection.games): { game: Game; value: number }[] {
    return mostValuable(among, this.viewsOf, count);
  }

  /** The facts the milestones are judged on, now. */
  facts(): CollectorFacts {
    const { collection, medals, standing, league } = this.deps;
    return {
      games: valuedGames(collection.games),
      medals: medals?.total ?? 0,
      deals: standing?.deedCount('deal') ?? 0,
      sales: (standing?.deedCount('sell') ?? 0) + (standing?.deedCount('wanted') ?? 0),
      pennants: league?.pennants ?? 0,
      value: this.value().market,
    };
  }

  /** Hears the value move (fame arriving, the collection changing). */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Takes the facts again now (the book does on opening). */
  refresh(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const facts = this.facts();
    this.deps.history.record(facts.value);
    const fresh = this.deps.milestones.update(facts);
    if (fresh.length) this.onReached?.(fresh);
    this.askFame();
    for (const cb of [...this.listeners]) cb();
  }

  private soon(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.refresh(), SETTLE_MS);
  }

  /** Queues the fame of every copy not known yet, and keeps `LOOKUPS_AT_ONCE` going. */
  private askFame(): void {
    for (const game of valuedGames(this.deps.collection.games)) {
      if (this.asked.has(game.id) || this.deps.fame.peek(game) !== undefined) continue;
      this.asked.add(game.id);
      this.queue.push(game);
    }
    while (this.inFlight < LOOKUPS_AT_ONCE && this.queue.length) {
      const game = this.queue.shift()!;
      this.inFlight++;
      void this.deps.fame.lookup(game).then((views) => {
        this.inFlight--;
        if (views !== undefined) this.soon();
        this.askFame();
      });
    }
  }
}
