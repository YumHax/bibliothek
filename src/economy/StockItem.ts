import type { BoxCondition, Edition, Game } from '@/catalog/types';

/**
 * Where a copy on sale comes from: an ordinary pick from the index, the stall's showpiece (a
 * well-known title), a game from the player's wishlist the stallholders turned up, a game the
 * player sold at the WE BUY desk, the bargain bin (flat price, worn), a copy the player ordered at
 * the counter, one a stallholder kept aside for a loyal customer, a famous game from an estate
 * sale, or a first print of a game the player owns in an ordinary printing (an upgrade: buying it
 * swaps their copy for it), or a grail (`grails.ts`: a rarity on its day, at a price of its own).
 */
export type StockSource = 'stall' | 'showpiece' | 'wanted' | 'consigned' | 'bin' | 'ordered' | 'keptAside' | 'estate' | 'upgrade' | 'grail';

/** What a copy is, beyond its game and condition. */
export interface StockTraits {
  edition?: Edition;
  /** A reproduction passed off as the real thing (the tell is inside the box). */
  repro?: boolean;
  /** A well-known game hiding in the bargain bin. */
  gem?: boolean;
  /** On sale (a stall's clearance): the list price is already this share of the usual one. */
  sale?: number;
}

/**
 * One copy for sale at the market. Its price is provisional until `priced` (the fame lookup
 * landed, or failed and left it ordinary): nothing may be sold before, or a famous game would go
 * at the ordinary price. A haggle multiplies the list price for the rest of the day (so does a
 * fake found out); a hold's deposit comes off what is still due. Listeners hear about all of it
 * (the tag, the held box's panel repaint).
 */
export class StockItem {
  readonly game: Game;
  readonly edition: Edition;
  readonly repro: boolean;
  readonly gem: boolean;
  /** The share of the usual price a sale asks (1: not on sale). */
  readonly sale: number;
  private listPrice: number;
  private isPriced: boolean;
  private factor = 1;
  private paid = 0;
  private foundOut = false;
  private readonly listeners = new Set<() => void>();
  /** Resolves once `priced` is true. */
  readonly settled: Promise<void>;

  /**
   * `price` is today's list price, `final` false while it waits for `settle`, which resolves to
   * the settled list price (or undefined to keep the provisional one).
   */
  constructor(
    game: Game,
    readonly condition: BoxCondition,
    readonly source: StockSource,
    price: { list: number; final: boolean; settle?: Promise<number | undefined> },
    traits: StockTraits = {},
  ) {
    this.edition = traits.edition ?? 'standard';
    this.repro = traits.repro ?? false;
    this.gem = traits.gem ?? false;
    this.sale = traits.sale ?? 1;
    // A real copy, whatever the source entry was (a wishlist entry would draw as a ghost box).
    this.game = { ...game, condition, status: 'owned', edition: this.edition === 'standard' ? undefined : this.edition, repro: this.repro || undefined };
    this.listPrice = price.list;
    this.isPriced = price.final || !price.settle;
    this.settled = this.isPriced || !price.settle
      ? Promise.resolve()
      : price.settle.then((list) => {
        if (list !== undefined) this.listPrice = list;
        this.isPriced = true;
        this.notify();
      });
  }

  /** What it costs right now, haggle included (before any deposit). */
  get price(): number {
    return Math.max(1, Math.round(this.listPrice * this.factor));
  }

  /** What is left to pay: the price less the deposit already paid. */
  get due(): number {
    return Math.max(0, this.price - this.paid);
  }

  /** The price before any haggle. */
  get tagPrice(): number {
    return this.listPrice;
  }

  /** On sale: the price it would have been (struck through on the tag), else undefined. */
  get beforeSale(): number | undefined {
    return this.sale < 1 ? Math.round(this.listPrice / this.sale) : undefined;
  }

  get priced(): boolean {
    return this.isPriced;
  }

  /** True once a haggle took something off. */
  get haggled(): boolean {
    return this.factor < 1;
  }

  /** The deposit paid on it (a hold, an order), 0 when none. */
  get deposit(): number {
    return this.paid;
  }

  /** Held for (or ordered by) the player: other shoppers leave it alone. */
  get reserved(): boolean {
    return this.paid > 0 || this.source === 'ordered';
  }

  /** Applies a haggle's outcome (1 = refused, nothing changes). */
  setHaggle(factor: number): void {
    if (factor === this.factor) return;
    this.factor = factor;
    this.notify();
  }

  /** A fake the player found out: true once `expose` was called. */
  get exposed(): boolean {
    return this.foundOut;
  }

  /** The player found out the fake: it goes for `factor` of the tag from now on. */
  expose(factor: number): void {
    this.foundOut = true;
    this.factor = factor;
    this.notify();
  }

  /** A deposit was paid on it (a hold for the day, or the order it came from). */
  setDeposit(coins: number): void {
    if (coins === this.paid) return;
    this.paid = coins;
    this.notify();
  }

  /** Called when the price settles, a haggle lands, a deposit is paid. Returns the unsubscribe. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb();
  }
}
