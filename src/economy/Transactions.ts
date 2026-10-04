import type { Game, PlatformId } from '@/catalog/types';
import { batch } from '@/persistence';
import type { CollectorSet } from './collectorSets';
import { setProgress } from './collectorSets';
import type { ForSaleAd, WantedAd } from './MarketNotices';
import type { Deed } from './MarketStanding';
import type { JobLot } from './MarketStock';
import { lotOffer } from './JobLot';
import type { Prize } from './Prizes';
import type { StockItem } from './StockItem';
import { PRIZE_WHERE, SWAP_WHERE_PREFIX, wantedPay } from './pricing';

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

interface TxCollection {
  owns(id: string): boolean;
  add(game: Game): void;
  addMany?(games: readonly Game[]): void;
  remove?(id: string): void;
  update?(id: string, patch: Partial<Omit<Game, 'id'>>): void;
  find?(id: string): Game | undefined;
  readonly games?: readonly Game[];
}

interface TxMarket {
  readonly day: number;
  /** `item` changed hands: holds, orders and loyalty are brought up to date. */
  sold(item: StockItem): void;
  consign(game: Game): void;
  holdDeposit?(item: StockItem): number;
  hold?(item: StockItem, deposit: number): void;
  /** Whether `item` was laid out on a market day gone by (no hold on it any more). */
  isStale?(item: StockItem): boolean;
  /** Today's job lot (`JobLotDraw`). */
  readonly lot?: { readonly sold: boolean; sell(): void };
  /** The counter's orders (`MarketOrders`). */
  readonly orders?: { place(game: Game, quote: { price: number; deposit: number; day: number }): void };
}

interface TxStanding {
  record(deed: Deed, platform?: PlatformId): void;
  undo?(deed: 'buy', platform: PlatformId): void;
  claimSet?(setId: string): boolean;
  hasClaimed?(setId: string): boolean;
}

interface TxLedger {
  cardDone(id: string): boolean;
  recordCard(day: number, id: string): void;
  /** Holds of a day gone by, never collected: taken off the ledger (their deposits are owed back). */
  takeLapsedHolds?(day: number): { title: string; deposit: number }[];
}

interface TxPrizes {
  add(id: string): void;
}

interface TransactionDeps {
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

/**
 * A one-of-a-kind story item (the lost prototype, `story/prototype.PROTOTYPE_ID`, ids prefixed `proto:`): never sold,
 * swapped or traded away; every desk and stall refuses it (`notOwned`, the panels say why).
 */
export function isKeepsake(game: Pick<Game, 'id'>): boolean {
  return game.id.startsWith('proto:');
}

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
        // The first print is a fresh copy: nothing of the old one's state (cleaned, stickered, an import) carries over.
        collection.update(item.game.id, { edition: 'firstPrint', condition: undefined, repro: undefined, restored: undefined, sticker: undefined, variant: item.game.variant, variantNote: item.game.variantNote, past: item.game.past, region: item.game.region, acquired: game.acquired });
      } else {
        collection.add(game);
      }
      market?.sold(item);
    });
    return { ok: true, game, paid: due, upgrade };
  }

  /**
   * U just after a purchase: `game` goes back, `refund` coins come back, the stall forgets the sale. A copy that was
   * held (`hold`) goes back on hold with its deposit; `alsoDo` runs in the same save (a perk the purchase used, given back).
   */
  undoPurchase(game: Game, refund: number, hold?: { item: StockItem; deposit: number }, alsoDo?: () => void): TxResult {
    const { wallet, collection, standing, market } = this.deps;
    if (!wallet || !collection?.remove) return fail('unavailable');
    if (!collection.owns(game.id)) return fail('notOwned');
    batch(() => {
      collection.remove!(game.id);
      wallet.earnCoins(refund);
      standing?.undo?.('buy', game.platform);
      if (hold && hold.deposit > 0) market?.hold?.(hold.item, hold.deposit);
      alsoDo?.();
    });
    return { ok: true };
  }

  /**
   * Holds of a market day gone by that were never collected: their deposits come back (the stallholder kept the copy
   * till closing, then put it out again). The titles and the coins, or `done` when none lapsed.
   */
  refundLapsedHolds(day: number): TxResult<{ titles: string[]; coins: number }> {
    const { wallet, ledger } = this.deps;
    if (!wallet || !ledger?.takeLapsedHolds) return fail('unavailable');
    let lapsed: { title: string; deposit: number }[] = [];
    batch(() => {
      lapsed = ledger.takeLapsedHolds!(day);
      wallet.earnCoins(lapsed.reduce((sum, h) => sum + h.deposit, 0));
    });
    if (!lapsed.length) return fail('done');
    return { ok: true, titles: lapsed.map((h) => h.title), coins: lapsed.reduce((sum, h) => sum + h.deposit, 0) };
  }

  /**
   * Something for the flat bought on the spot (a shop's tag or till, the household stall, the bookcase kit, a coffee):
   * the coins and `offer.bought()` (the piece counted at home) saved as one.
   */
  buyHomeGood(offer: { readonly price: number; bought(): void }): TxResult<{ paid: number }> {
    const { wallet } = this.deps;
    if (!wallet) return fail('unavailable');
    if (wallet.coins < offer.price) return fail('short', offer.price, wallet.coins);
    let paid = false;
    batch(() => {
      paid = wallet.spend(offer.price);
      if (paid) offer.bought();
    });
    return paid ? { ok: true, paid: offer.price } : fail('short', offer.price, wallet.coins);
  }

  /** R at a stall: a deposit holds `item` for the day. */
  holdCopy(item: StockItem): TxResult<{ deposit: number }> {
    const { wallet, market } = this.deps;
    if (!wallet || !market?.holdDeposit || !market.hold) return fail('unavailable');
    if (!item.priced) return fail('pricing');
    if (item.reserved || market.isStale?.(item)) return fail('done');
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
    // A game lent to a friend is not on the shelf to hand over (the panel hides it; this keeps it so).
    if (!collection.owns(mine.id) || mine.status === 'lent' || isKeepsake(mine)) return fail('notOwned');
    if (collection.owns(item.game.id)) return fail('owned');
    const topUp = Math.max(0, item.due - value);
    if (wallet.coins < topUp) return fail('short', topUp, wallet.coins);
    const game = bought(item.game, topUp, `${SWAP_WHERE_PREFIX}${where}`, market.day);
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
    if (!collection.owns(game.id) || game.status === 'lent' || isKeepsake(game)) return fail('notOwned');
    batch(() => {
      market.consign({ ...game, status: 'owned', addedAt: undefined });
      wallet.earnCoins(offer);
      collection.remove!(game.id);
      standing?.record('sell');
    });
    return { ok: true };
  }

  /** The neighbours' party (`building/neighboursParty`): a resident buys `game` for `offer` coins and takes it home (not to the market). */
  sellToNeighbour(game: Game, offer: number): TxResult {
    const { wallet, collection } = this.deps;
    if (!wallet || !collection?.remove) return fail('unavailable');
    if (!collection.owns(game.id) || game.status === 'lent' || isKeepsake(game)) return fail('notOwned');
    batch(() => {
      wallet.earnCoins(offer);
      collection.remove!(game.id);
    });
    return { ok: true };
  }

  /**
   * A wanted card answered: the player's copy goes to the collector, who pays the card's price for a complete copy,
   * less for a worse one (`wantedPay`: its state, printing, a fake, a flat-price receipt).
   */
  answerWanted(ad: WantedAd): TxResult<{ game: Game; pay: number }> {
    const { wallet, collection, market, ledger, standing } = this.deps;
    if (!wallet || !collection?.remove || !market || !ledger) return fail('unavailable');
    if (ledger.cardDone(ad.id)) return fail('done');
    const mine = collection.find?.(ad.game.id) ?? collection.games?.find((g) => g.id === ad.game.id);
    if (!mine || (mine.status ?? 'owned') !== 'owned') return fail('notOwned');
    const pay = wantedPay(ad.pay, mine);
    batch(() => {
      collection.remove!(mine.id);
      market.consign(mine);
      wallet.earnCoins(pay);
      ledger.recordCard(market.day, ad.id);
      standing?.record('wanted');
    });
    return { ok: true, game: mine, pay };
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
    const lotDraw = market?.lot;
    if (!wallet || !collection || !market || !lotDraw) return fail('unavailable');
    if (lotDraw.sold) return fail('done');
    // Games bought elsewhere since the crate was drawn come out of it, and out of the price.
    const offer = lotOffer(lot, (id) => collection.owns(id));
    if (!offer.games.length) return fail('owned');
    if (wallet.coins < offer.price) return fail('short', offer.price, wallet.coins);
    const games = offer.games.map((g, i) => bought(g, offer.prices[i] ?? 0, 'a job lot', market.day));
    batch(() => {
      wallet.spend(offer.price);
      if (collection.addMany) collection.addMany(games);
      else for (const game of games) collection.add(game);
      lotDraw.sell();
    });
    return { ok: true, games };
  }

  /** The mail-order catalogue: a new copy at `price`, into the parcel. */
  buyMailOrder(game: Game, price: number): TxResult<{ game: Game }> {
    const { wallet, collection, market, standing } = this.deps;
    if (!wallet || !collection) return fail('unavailable');
    if (collection.owns(game.id)) return fail('owned');
    if (wallet.coins < price) return fail('short', price, wallet.coins);
    const copy = bought(game, price, 'mail order', market?.day ?? 0);
    batch(() => {
      wallet.spend(price);
      collection.add(copy);
      standing?.record('buy', game.platform);
    });
    return { ok: true, game: copy };
  }

  /** The counter's used-copy order: the deposit now, the copy on its stall from `quote.day`. */
  orderUsed(game: Game, quote: { price: number; deposit: number; day: number }): TxResult {
    const { wallet, market } = this.deps;
    const orders = market?.orders;
    if (!wallet || !orders) return fail('unavailable');
    if (wallet.coins < quote.deposit) return fail('short', quote.deposit, wallet.coins);
    batch(() => {
      wallet.spend(quote.deposit);
      orders.place(game, quote);
    });
    return { ok: true };
  }

  /** The prize counter: `prize` for its tickets; the mystery game (`game`, drawn by the caller) goes into the collection instead of on the shelf. */
  takePrize(prize: Prize, game: Game | null = null): TxResult {
    const { wallet, collection, prizes, market } = this.deps;
    if (!wallet?.spendTickets || prize.tickets === null) return fail('unavailable');
    if (prize.game ? !game || !collection : !prizes) return fail('unavailable');
    if (game && collection?.owns(game.id)) return fail('owned');
    const have = wallet.tickets ?? 0;
    if (have < prize.tickets) return fail('short', prize.tickets, have);
    batch(() => {
      wallet.spendTickets!(prize.tickets!);
      // The mystery game comes with its receipt, like anything else that joins the collection.
      if (game) collection!.add(bought(game, 0, PRIZE_WHERE, market?.day ?? 0));
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
    if (!mine || mine.status === 'lent' || mine.status === 'wishlist' || isKeepsake(mine)) return fail('notOwned');
    if (collection.owns(get.id)) return fail('owned');
    const game = bought(get, 0, who, market?.day ?? 0);
    batch(() => {
      collection.remove!(give.id);
      collection.add(game);
      alsoDo?.();
    });
    return { ok: true, game };
  }

  /** The saleroom's hammer fell for the player: `price` for a game lot, into the parcel; `alsoDo` (the lot's result) in the same save. */
  winAuctionLot(lotGame: Game, price: number, where: string, alsoDo?: () => void): TxResult<{ game: Game }> {
    const { wallet, collection, market, standing } = this.deps;
    if (!wallet || !collection) return fail('unavailable');
    if (collection.owns(lotGame.id)) return fail('owned');
    if (wallet.coins < price) return fail('short', price, wallet.coins);
    const game = bought(lotGame, price, where, market?.day ?? 0);
    batch(() => {
      wallet.spend(price);
      collection.add(game);
      standing?.record('buy', lotGame.platform);
      alsoDo?.();
    });
    return { ok: true, game };
  }

  /** A sealed carton bought (the market's corner, the saleroom's hammer): the coins go, `takeHome` puts it in the hallway, in one save. */
  buySealedLot(price: number, takeHome: () => void): TxResult<{ paid: number }> {
    const { wallet } = this.deps;
    if (!wallet) return fail('unavailable');
    if (wallet.coins < price) return fail('short', price, wallet.coins);
    batch(() => {
      wallet.spend(price);
      takeHome();
    });
    return { ok: true, paid: price };
  }

  /**
   * The next thing out of a sealed carton at home (`take`: `SealedLots.takeNext`): a game into the collection with its
   * share of the carton's price on the receipt (one the player has already: `duplicateCoins` for it instead), loose
   * coins pocketed, junk just looked at; all in one save.
   */
  unpackCarton<T extends { item: { kind: 'game'; game: Game } | { kind: 'junk'; coins: number } }>(
    take: () => T | null,
    receipt: (carton: T) => { price: number; where: string },
    duplicateCoins: (game: Game, carton: T) => number,
  ): TxResult<{ taken: T; game?: Game; coins: number; duplicate: boolean }> {
    const { wallet, collection, market } = this.deps;
    if (!wallet || !collection) return fail('unavailable');
    type Unpacked = { taken: T; game?: Game; coins: number; duplicate: boolean };
    // Set inside the batch (`as`: not narrowed to null by the assignment).
    let out = null as Unpacked | null;
    batch(() => {
      const taken = take();
      if (!taken) return;
      const { item } = taken;
      if (item.kind === 'junk') {
        if (item.coins > 0) wallet.earnCoins(item.coins);
        out = { taken, coins: item.coins, duplicate: false };
        return;
      }
      if (collection.owns(item.game.id)) {
        const coins = Math.max(1, duplicateCoins(item.game, taken));
        wallet.earnCoins(coins);
        out = { taken, coins, duplicate: true };
        return;
      }
      const { price, where } = receipt(taken);
      const game = bought(item.game, price, where, market?.day ?? 0);
      collection.add(game);
      out = { taken, game, coins: 0, duplicate: false };
    });
    return out ? { ok: true, ...out } : fail('done');
  }
}
