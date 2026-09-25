import type { Game, PlatformId } from '@/catalog/types';
import { batch } from '@/persistence';
import type { CollectorSet } from './collectorSets';
import { setProgress } from './collectorSets';
import type { ForSaleAd, WantedAd } from './MarketNotices';
import type { Deed } from './MarketStanding';
import type { JobLot } from './MarketStock';
import type { Prize } from './Prizes';
import type { StockItem } from './StockItem';

/*
 * The shapes a transaction needs of each store: structural, so the Session's parts (`SessionParts`)
 * and the concrete stores (`main.ts`) both fit.
 */

export interface TxWallet {
  readonly coins: number;
  readonly tickets?: number;
  spend(coins: number): boolean;
  earnCoins(coins: number): void;
  spendTickets?(tickets: number): boolean;
}

export interface TxCollection {
  owns(id: string): boolean;
  add(game: Game): void;
  addMany?(games: readonly Game[]): void;
  remove?(id: string): void;
  update?(id: string, patch: Partial<Omit<Game, 'id'>>): void;
  find?(id: string): Game | undefined;
  readonly games?: readonly Game[];
}

export interface TxMarket {
  readonly day: number;
  /** `item` changed hands: holds, orders and loyalty are brought up to date. */
  sold(item: StockItem): void;
  consign(game: Game): void;
  holdDeposit?(item: StockItem): number;
  hold?(item: StockItem, deposit: number): void;
  readonly lotSold?: boolean;
  sellLot?(): void;
  order?(game: Game, quote: { price: number; deposit: number; day: number }): void;
}

export interface TxStanding {
  record(deed: Deed, platform?: PlatformId): void;
  undo?(deed: 'buy', platform: PlatformId): void;
  claimSet?(setId: string): boolean;
  hasClaimed?(setId: string): boolean;
}

export interface TxLedger {
  cardDone(id: string): boolean;
  recordCard(day: number, id: string): void;
}

export interface TxPrizes {
  add(id: string): void;
}

export interface TransactionDeps {
  wallet?: TxWallet;
  collection?: TxCollection;
  market?: TxMarket;
  standing?: TxStanding;
  ledger?: TxLedger;
  prizes?: TxPrizes;
}

/**
 * Why a transaction was refused; nothing changed. `unavailable`: a store it needs is not wired in;
 * `pricing`: the price is not final yet; `owned`: the player has it already; `notOwned`: they do
 * not have what they would give; `short`: not enough coins (`needed`, `have`); `done`: already
 * dealt with (a card, the lot, a set); `incomplete`: a set still misses pieces.
 */
export type TxFailure = 'unavailable' | 'pricing' | 'owned' | 'notOwned' | 'short' | 'done' | 'incomplete';

export type TxResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: TxFailure; needed?: number; have?: number };

const fail = (reason: TxFailure, needed?: number, have?: number): { ok: false; reason: TxFailure; needed?: number; have?: number } => ({
  ok: false, reason, ...(needed !== undefined ? { needed } : {}), ...(have !== undefined ? { have } : {}),
});

/** A copy as it comes into the collection: the player's, dated, with its receipt. */
function bought(game: Game, price: number, where: string, day: number): Game {
  return { ...game, status: 'owned', addedAt: new Date().toISOString(), acquired: { price, where, day } };
}

/**
 * Every exchange of money for games (and games for money), in one place: each method checks
 * everything first (nothing changes when it refuses, and says why: `TxFailure`), then moves the
 * coins, the games, the ledger and the standing together, their saves written as one (`batch`).
 * The panels and the counter say what happened; the rules are here.
 */
export class Transactions {
  constructor(private readonly deps: TransactionDeps) {}

  /** B at a stall: pays what is still due on `item` (after any deposit); an upgrade replaces the player's copy (the old one goes to the stall). */
  buyCopy(item: StockItem, where: string): TxResult<{ game: Game; paid: number; upgrade: boolean }> {
    const { wallet, collection, market } = this.deps;
    if (!wallet || !collection) return fail('unavailable');
    if (!item.priced) return fail('pricing');
    const upgrade = item.source === 'upgrade';
    if (collection.owns(item.game.id) && !upgrade) return fail('owned');
    const due = item.due;
    if (wallet.coins < due) return fail('short', due, wallet.coins);
    const game = bought(item.game, item.price, where, market?.day ?? 0);
    batch(() => {
      wallet.spend(due);
      if (upgrade && collection.update && collection.find) {
        // The first print takes the old copy's place on the shelf; the old one goes to the stallholder.
        const old = collection.find(item.game.id);
        if (old) market?.consign({ ...old, addedAt: undefined });
        collection.update(item.game.id, { edition: 'firstPrint', condition: undefined, repro: undefined, acquired: game.acquired });
      } else {
        collection.add(game);
      }
      market?.sold(item);
    });
    return { ok: true, game, paid: due, upgrade };
  }

  /** U just after a purchase: `game` goes back, `refund` coins come back, the stall forgets the sale. */
  undoPurchase(game: Game, refund: number): TxResult {
    const { wallet, collection, standing } = this.deps;
    if (!wallet || !collection?.remove) return fail('unavailable');
    if (!collection.owns(game.id)) return fail('notOwned');
    batch(() => {
      collection.remove!(game.id);
      wallet.earnCoins(refund);
      standing?.undo?.('buy', game.platform);
    });
    return { ok: true };
  }

  /** R at a stall: a deposit holds `item` for the day. */
  holdCopy(item: StockItem): TxResult<{ deposit: number }> {
    const { wallet, market } = this.deps;
    if (!wallet || !market?.holdDeposit || !market.hold) return fail('unavailable');
    if (!item.priced) return fail('pricing');
    if (item.reserved) return fail('done');
    const deposit = market.holdDeposit(item);
    if (wallet.coins < deposit) return fail('short', deposit, wallet.coins);
    batch(() => {
      wallet.spend(deposit);
      market.hold!(item, deposit);
    });
    return { ok: true, deposit };
  }

  /** X at a stall: `mine` (worth `value`) goes to the stall, `item` comes home, the difference is paid (no change given). */
  swap(item: StockItem, mine: Game, value: number, where: string): TxResult<{ game: Game; topUp: number }> {
    const { wallet, collection, market, standing } = this.deps;
    if (!wallet || !collection?.remove || !market) return fail('unavailable');
    if (!item.priced) return fail('pricing');
    if (!collection.owns(mine.id)) return fail('notOwned');
    if (collection.owns(item.game.id)) return fail('owned');
    const topUp = Math.max(0, item.due - value);
    if (wallet.coins < topUp) return fail('short', topUp, wallet.coins);
    const game = bought(item.game, topUp, `a swap at ${where}`, market.day);
    batch(() => {
      wallet.spend(topUp);
      collection.remove!(mine.id);
      market.consign(mine);
      collection.add(game);
      market.sold(item);
      standing?.record('swap');
    });
    return { ok: true, game, topUp };
  }

  /** The WE BUY desk: `game` leaves the collection for `offer` coins and goes on its stall from tomorrow. */
  sellToDesk(game: Game, offer: number): TxResult {
    const { wallet, collection, market, standing } = this.deps;
    if (!wallet || !collection?.remove || !market) return fail('unavailable');
    if (!collection.owns(game.id) || game.status === 'lent') return fail('notOwned');
    batch(() => {
      market.consign({ ...game, status: 'owned', addedAt: undefined });
      wallet.earnCoins(offer);
      collection.remove!(game.id);
      standing?.record('sell');
    });
    return { ok: true };
  }

  /** A wanted card answered: the player's copy goes to the collector, who pays the card's price. */
  answerWanted(ad: WantedAd): TxResult<{ game: Game }> {
    const { wallet, collection, market, ledger, standing } = this.deps;
    if (!wallet || !collection?.remove || !market || !ledger) return fail('unavailable');
    if (ledger.cardDone(ad.id)) return fail('done');
    const mine = collection.find?.(ad.game.id) ?? collection.games?.find((g) => g.id === ad.game.id);
    if (!mine || (mine.status ?? 'owned') !== 'owned') return fail('notOwned');
    batch(() => {
      collection.remove!(mine.id);
      market.consign(mine);
      wallet.earnCoins(ad.pay);
      ledger.recordCard(market.day, ad.id);
      standing?.record('wanted');
    });
    return { ok: true, game: mine };
  }

  /** A private seller's card: the copy for its price, into the parcel like any purchase. */
  buyForSale(ad: ForSaleAd): TxResult<{ game: Game }> {
    const { wallet, collection, market, ledger, standing } = this.deps;
    if (!wallet || !collection || !market || !ledger) return fail('unavailable');
    if (ledger.cardDone(ad.id)) return fail('done');
    if (collection.owns(ad.game.id)) return fail('owned');
    if (wallet.coins < ad.price) return fail('short', ad.price, wallet.coins);
    const game = bought(ad.game, ad.price, `${ad.from}, off the notice board`, market.day);
    batch(() => {
      wallet.spend(ad.price);
      collection.add(game);
      ledger.recordCard(market.day, ad.id);
      standing?.record('buy');
    });
    return { ok: true, game };
  }

  /** The collectors' club pays a completed set's reward, once. */
  claimSet(set: CollectorSet): TxResult<{ reward: number }> {
    const { wallet, collection, standing } = this.deps;
    if (!wallet || !collection?.games || !standing?.claimSet) return fail('unavailable');
    if (standing.hasClaimed?.(set.id)) return fail('done');
    if (!setProgress(set, collection.games).every((p) => p.have)) return fail('incomplete');
    let claimed = false;
    batch(() => {
      claimed = standing.claimSet!(set.id);
      if (claimed) wallet.earnCoins(set.reward);
    });
    return claimed ? { ok: true, reward: set.reward } : fail('done');
  }

  /** The day's job lot: every game in it the player lacks comes home in one parcel. */
  buyLot(lot: JobLot): TxResult<{ games: Game[] }> {
    const { wallet, collection, market } = this.deps;
    if (!wallet || !collection || !market?.sellLot) return fail('unavailable');
    if (market.lotSold) return fail('done');
    if (wallet.coins < lot.price) return fail('short', lot.price, wallet.coins);
    const each = Math.round(lot.price / Math.max(1, lot.games.length));
    const games = lot.games.filter((g) => !collection.owns(g.id)).map((g) => bought(g, each, 'a job lot', market.day));
    batch(() => {
      wallet.spend(lot.price);
      if (collection.addMany) collection.addMany(games);
      else for (const game of games) collection.add(game);
      market.sellLot!();
    });
    return { ok: true, games };
  }

  /** The mail-order catalogue: a new copy at `price`, into the parcel. */
  buyMailOrder(game: Game, price: number): TxResult<{ game: Game }> {
    const { wallet, collection, market } = this.deps;
    if (!wallet || !collection) return fail('unavailable');
    if (collection.owns(game.id)) return fail('owned');
    if (wallet.coins < price) return fail('short', price, wallet.coins);
    const copy = bought(game, price, 'mail order', market?.day ?? 0);
    batch(() => {
      wallet.spend(price);
      collection.add(copy);
    });
    return { ok: true, game: copy };
  }

  /** The counter's used-copy order: the deposit now, the copy on its stall from `quote.day`. */
  orderUsed(game: Game, quote: { price: number; deposit: number; day: number }): TxResult {
    const { wallet, market } = this.deps;
    if (!wallet || !market?.order) return fail('unavailable');
    if (wallet.coins < quote.deposit) return fail('short', quote.deposit, wallet.coins);
    batch(() => {
      wallet.spend(quote.deposit);
      market.order!(game, quote);
    });
    return { ok: true };
  }

  /** The prize counter: `prize` for its tickets; the mystery game (`game`, drawn by the caller) goes into the collection instead of on the shelf. */
  takePrize(prize: Prize, game: Game | null = null): TxResult {
    const { wallet, collection, prizes } = this.deps;
    if (!wallet?.spendTickets || prize.tickets === null) return fail('unavailable');
    if (prize.game ? !game || !collection : !prizes) return fail('unavailable');
    if (game && collection?.owns(game.id)) return fail('owned');
    const have = wallet.tickets ?? 0;
    if (have < prize.tickets) return fail('short', prize.tickets, have);
    batch(() => {
      wallet.spendTickets!(prize.tickets!);
      if (game) collection!.add(game);
      else prizes!.add(prize.id);
    });
    return { ok: true };
  }

  /**
   * A swap on the landing with a neighbour (`who`): `give` (owned, not lent out) leaves the
   * collection, `get` comes in (into the parcel, like anything new). No coins change hands;
   * `alsoDo` runs in the same save (the neighbour's offer marked done).
   */
  swapWithNeighbour(give: Game, get: Game, who: string, alsoDo?: () => void): TxResult<{ game: Game }> {
    const { collection, market } = this.deps;
    if (!collection?.remove || !collection.find) return fail('unavailable');
    const mine = collection.find(give.id);
    if (!mine || mine.status === 'lent' || mine.status === 'wishlist') return fail('notOwned');
    if (collection.owns(get.id)) return fail('owned');
    const game = bought(get, 0, who, market?.day ?? 0);
    batch(() => {
      collection.remove!(give.id);
      collection.add(game);
      alsoDo?.();
    });
    return { ok: true, game };
  }
}
