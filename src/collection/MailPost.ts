import type { Game } from '@/catalog/types';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { GameSource } from './GameSource';

/** The postman's rounds, in hours of the game's clock. */
export const POST_ROUNDS = [10, 15];
/** An order takes at least this long (game hours) to come: the next round after that brings it. */
const LEAD_HOURS = 2;
/** Never further off than this (game hours): a clock put back on a reload must not lose a parcel for days. */
const LONGEST_HOURS = 30;
/** Where the catalogue's copies come from (`Acquisition.where`, see `Transactions.buyMailOrder`). */
const MAIL_ORDER = 'mail order';

/** A mail order on its way: the game and the game hour (market day x 24 + hours) it is due. */
interface Posted {
  id: string;
  due: number;
}

/** What the post needs of the parcel: which games wait, and a word when the post brings some. */
export interface PostDeliveries {
  isPending(id: string): boolean;
  setInPost(test: (id: string) => boolean): void;
  postChanged(): void;
}

export interface MailPostOptions {
  collection: GameSource;
  deliveries: PostDeliveries;
  /** The market calendar's in-game day (a day starts at midnight on the game's clock). */
  calendar: { readonly day: number };
  /** The game clock's hour, 0..24. */
  hours: () => number;
  /** Whether the player is in the flat (or on its stairs) to hear the bell. */
  home: () => boolean;
  storage?: Storage | null;
}

/**
 * The mail-order catalogue's copies in the post. A copy bought from the catalogue joins the
 * collection at once (paid for, off the shelves: `Deliveries`) but stays out of the parcel until
 * the postman's next round at least `LEAD_HOURS` later (`POST_ROUNDS`). Then it is `due`: the
 * stairwell's postman rings when the player is home (`home`) and hands it over at the door
 * (`deliver`); coming home after a round, the concierge took it in (`deliver` too). Stall buys,
 * the job lot and swaps never go through the post. What is in the post persists.
 */
export class MailPost {
  private posted: Posted[];
  private known: Set<string>;
  private readonly store: PersistedStore<Posted[]>;

  constructor(private readonly options: MailPostOptions) {
    this.store = new PersistedStore<Posted[]>({ key: KEYS.post, version: 1, storage: options.storage === undefined ? safeStorage() : options.storage, defaults: () => [], read: readPosted });
    const { collection, deliveries } = options;
    this.known = new Set(collection.games.map((g) => g.id));
    this.posted = this.store.load().filter((p) => this.known.has(p.id) && deliveries.isPending(p.id));
    // A mail order the parcel hears of before the post does (`Deliveries` listens first) is in the post already.
    deliveries.setInPost((id) => this.posted.some((p) => p.id === id) || (!this.known.has(id) && collection.games.find((g) => g.id === id)?.acquired?.where === MAIL_ORDER));
    collection.subscribe(() => this.onCollectionChange());
  }

  /** The game hour now: market day x 24 + the clock's hours. */
  now(): number {
    return this.options.calendar.day * 24 + this.options.hours();
  }

  /** Whether the player is home to answer the door. */
  get isHome(): boolean {
    return this.options.home();
  }

  /** Games in the post, due or not. */
  get count(): number {
    return this.posted.length;
  }

  /** The mail orders the postman carries now (their round has come). */
  due(): Game[] {
    const now = this.now();
    const ids = new Set(this.posted.filter((p) => p.due <= now).map((p) => p.id));
    return this.options.collection.games.filter((g) => ids.has(g.id));
  }

  /** Hands over everything due: it goes into the parcel. Returns what came. */
  deliver(): Game[] {
    const games = this.due();
    if (!games.length) return games;
    const ids = new Set(games.map((g) => g.id));
    this.posted = this.posted.filter((p) => !ids.has(p.id));
    this.commit();
    return games;
  }

  /** The game hour of the round that brings an order placed at `now`. */
  static roundAfter(now: number): number {
    const earliest = now + LEAD_HOURS;
    for (let day = Math.floor(earliest / 24); ; day++) {
      for (const hour of POST_ROUNDS) {
        const at = day * 24 + hour;
        if (at >= earliest) return at;
      }
    }
  }

  private onCollectionChange(): void {
    const { collection, deliveries } = this.options;
    const games = collection.games;
    const ids = new Set(games.map((g) => g.id));
    const now = this.now();
    let changed = false;
    for (const game of games) {
      if (this.known.has(game.id) || game.acquired?.where !== MAIL_ORDER || !deliveries.isPending(game.id)) continue;
      this.posted.push({ id: game.id, due: MailPost.roundAfter(now) });
      changed = true;
    }
    this.known = ids;
    // Handed back, sold, or unpacked by some other way: out of the post.
    const before = this.posted.length;
    this.posted = this.posted.filter((p) => ids.has(p.id) && deliveries.isPending(p.id));
    // A clock that went back (a reload starts the day afresh) must not hold a parcel for days.
    for (const p of this.posted) if (p.due - now > LONGEST_HOURS) {
      p.due = MailPost.roundAfter(now);
      changed = true;
    }
    if (changed || before !== this.posted.length) this.commit();
  }

  private commit(): void {
    this.store.save(this.posted);
    this.options.deliveries.postChanged();
  }
}

function readPosted(data: unknown): Posted[] | null {
  if (!Array.isArray(data)) return null;
  return data.filter((p): p is Posted => !!p && typeof (p as Posted).id === 'string' && typeof (p as Posted).due === 'number' && Number.isFinite((p as Posted).due));
}
