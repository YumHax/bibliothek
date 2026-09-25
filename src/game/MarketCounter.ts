import type { Game } from '@/catalog/types';
import { grailById } from '@/economy/grails';
import { UNDO_PURCHASE, describeEdition } from '@/economy/pricing';
import { Transactions } from '@/economy/Transactions';
import type { ForSaleLike, SaleReaction } from './SessionActions';
import type { CollectionLike, CoreParts, HagglePanelLike, MarketLike, ModalLike, StandingLike, TradePanelLike, WalletLike } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { isAction, keyMarkup } from '@/input/actions';
import { actionKeyLabel, renderKeys } from '@/ui/keys';

/** What the counter works with: the hands and the panel, the money, the market, its two panels. */
export interface MarketCounterParts extends Pick<CoreParts, 'inspector' | 'panel'> {
  wallet?: WalletLike;
  collection?: CollectionLike;
  market?: MarketLike;
  standing?: StandingLike;
  haggle?: HagglePanelLike;
  trade?: TradePanelLike;
  /** Whether a game bought now finds room on the shelves at home: a warning line, or null when it does. */
  shelfRoom?: () => string | null;
}

/** What the counter needs from the session: its parts, a way to talk, and the moves it may make. */
export interface MarketCounterHost extends Pick<SessionHost, 'notify' | 'pickUp' | 'putBack'> {
  readonly parts: MarketCounterParts;
  /** Opens a DOM panel over the room, the copy staying in hand. */
  showModal(modal: ModalLike): void;
}

/** The last purchase, while it can still be undone. */
interface LastPurchase {
  sale: ForSaleLike;
  game: Game;
  paid: number;
  until: number;
}

/**
 * The flea market's rules for a copy in the player's hand, on the session's behalf: the panel
 * (price, deposit, edition, state, the keys), B buys (what is still due after a deposit; the
 * receipt goes with the game), H opens the haggle panel, R holds the copy for the day against a
 * deposit, X opens the swap panel, O finds out a fake (the tell is inside the box), U within a few
 * seconds of a purchase hands it back for most of the money. The glass case is for players the
 * market trusts. Every move is answered by the stallholder (`ForSaleLike.react`).
 */
export class MarketCounter implements KeyRoute {
  private sale: { item: ForSaleLike; unwatch: () => void } | null = null;
  private last: LastPurchase | null = null;

  constructor(private readonly host: MarketCounterHost) {}

  /** The market copy in hand, if any. */
  get holding(): ForSaleLike | null {
    return this.sale?.item ?? null;
  }

  /**
   * A market copy was clicked: hand it over for a closer look (turn it, open it: a missing manual
   * shows), with its price and state in the panel. Buying takes a second, deliberate key (B), so a
   * stray click never spends anything. Clicking one while holding another puts the held one back.
   */
  offer(sale: ForSaleLike): void {
    if (this.host.parts.inspector.isActive) {
      this.host.putBack();
      return;
    }
    if (!this.mayHandle(sale)) return;
    this.host.pickUp(sale.box);
    this.begin(sale);
  }

  /** Whether the stallholder lets the player take `sale` in hand (the glass case is for trusted players). */
  private mayHandle(sale: ForSaleLike): boolean {
    const { standing } = this.host.parts;
    if (!sale.behindGlass || !standing || standing.mayHandleGlass) return true;
    const { name, points } = standing.reputation;
    sale.react?.('locked');
    this.host.notify(`“Collectors only, friend. The case stays shut.”\nThe market has to know you better: you are a ${name} (${points} reputation).\nBuy, sell and haggle here to earn it.`, 4500);
    return false;
  }

  /** The copy was just taken in hand. */
  private begin(sale: ForSaleLike): void {
    this.end();
    this.sale = { item: sale, unwatch: sale.item.subscribe(() => this.show()) };
    sale.react?.('pickUp');
    this.show();
  }

  /** The copy left the hand (put back, bought, swapped). */
  end(putBack = false): void {
    if (!this.sale) return;
    if (putBack) this.sale.item.react?.('putBack');
    this.sale.unwatch();
    this.sale = null;
  }

  /** Routes a key while a copy is in hand (or just after a purchase). True when it was the market's. */
  onKey(code: string): boolean {
    if (isAction(code, 'handBack') && this.undo()) return true;
    if (!this.sale) return false;
    if (isAction(code, 'lookInside')) {
      this.inspectInside();
      return false; // the session still opens the box
    }
    if (isAction(code, 'buy')) this.buy();
    else if (isAction(code, 'haggle')) this.haggle();
    else if (isAction(code, 'holdCopy')) this.hold();
    else if (isAction(code, 'swap')) this.swap();
    else return false;
    return true;
  }

  /** The money moves (wallet, collection, ledger, standing, saved together), from the session's parts. */
  private get transactions(): Transactions {
    const { wallet, collection, market, standing } = this.host.parts;
    return new Transactions({ wallet, collection, market, standing });
  }

  /** B: pay what is due, and the box goes into the bag (then off the stall). */
  private buy(): void {
    const sale = this.sale?.item;
    const { wallet, collection, panel, inspector } = this.host.parts;
    if (!sale || !wallet || !collection) return;
    const { item } = sale;
    const { game } = item;
    const result = this.transactions.buyCopy(item, sale.where);
    if (!result.ok) {
      if (result.reason === 'pricing') this.host.notify('The stallholder is still working out the price. Give it a moment.');
      else if (result.reason === 'owned') this.host.notify(`You already own ${game.title}`);
      else if (result.reason === 'short') this.host.notify(`${game.title} costs ${result.needed} coins and you have ${result.have}.\n${item.source === 'bin' ? 'Win more at the arcade.' : `${actionKeyLabel('haggle')} to haggle, ${actionKeyLabel('holdCopy')} to hold it for the day, or win more at the arcade.`}`, 3500);
      return;
    }
    const { game: bought, paid: due, upgrade } = result;
    const thanks = sale.thanks();
    sale.react?.('bought');
    this.end();
    panel.hide();
    inspector.stow(() => sale.sold());
    const undoable = item.source !== 'ordered' && !upgrade;
    this.last = undoable ? { sale, game: bought, paid: due, until: performance.now() + UNDO_PURCHASE.seconds * 1000 } : null;
    const paid = item.deposit ? `${due} more coins (${item.price} in all)` : `${due} coin${due === 1 ? '' : 's'}`;
    const undo = undoable ? `\nChanged your mind? ${actionKeyLabel('handBack')} within ${UNDO_PURCHASE.seconds} s hands it back.` : '';
    const home = upgrade ? 'Your copy at home is a first print now.' : 'It will wait for you in a parcel in the hallway.';
    this.host.notify(`Bought ${game.title} for ${paid}. “${thanks}”\n${home}${undo}`, 4000);
  }

  /** U just after a purchase: the copy goes back on the stall, most of the money comes back. */
  private undo(): boolean {
    const last = this.last;
    if (!last || performance.now() > last.until || this.sale) return false;
    const { wallet, collection } = this.host.parts;
    if (!wallet || !collection?.remove || !last.sale.restock) return false;
    this.last = null;
    const refund = Math.floor(last.paid * UNDO_PURCHASE.refund);
    if (!this.transactions.undoPurchase(last.game, refund).ok) return false;
    last.sale.restock();
    this.host.notify(`“Changed your mind? No harm done.” ${last.game.title} is back on the table.\n${refund} of your ${last.paid} coins back.`, 3500);
    return true;
  }

  /** H: open the haggle over the copy in hand (once per copy per day). */
  private haggle(): void {
    const sale = this.sale?.item;
    const { market, haggle } = this.host.parts;
    if (!sale || !market) return;
    // Flat-price copies (the bin, a garage sale on the street) are never haggled over.
    if (sale.item.source === 'bin') {
      this.host.notify(`“It's ${sale.where}, friend. ${sale.item.price} coins, that's the deal.”`, 3500);
      return;
    }
    const opened = market.negotiate(sale.item);
    if (!('offer' in opened)) {
      this.host.notify(`“${opened.line}”`, 3500);
      return;
    }
    if (!haggle) return;
    haggle.start({
      item: sale.item,
      negotiation: opened,
      stall: sale.where,
      onClose: ({ insults, outcome }) => {
        if (outcome === 'none') return;
        market.settle(sale.item, opened, insults);
        const reaction: SaleReaction = outcome === 'deal' ? 'haggleWon' : outcome === 'walk' ? 'haggleLost' : 'haggleStopped';
        sale.react?.(insults ? 'insult' : reaction);
        this.show();
      },
    });
    this.host.showModal(haggle);
  }

  /** R: hold the copy for the day against a deposit (counted towards the price). */
  private hold(): void {
    const sale = this.sale?.item;
    const { market, wallet } = this.host.parts;
    if (!sale || !market || !wallet) return;
    const { item } = sale;
    if (item.source === 'bin') {
      this.host.notify(`“No holds at ${sale.where}. Grab it or leave it.”`);
      return;
    }
    if (item.reserved) {
      this.host.notify(item.source === 'ordered' ? `“That's your order, it's not going anywhere.”` : `“It's held for you already. ${item.due} coins to go.”`);
      return;
    }
    const result = this.transactions.holdCopy(item);
    if (!result.ok) {
      if (result.reason === 'pricing') this.host.notify('The stallholder is still working out the price. Give it a moment.');
      else if (result.reason === 'short') this.host.notify(`A hold costs a ${result.needed}-coin deposit and you have ${result.have}.`);
      return;
    }
    const { deposit } = result;
    sale.react?.('hold');
    this.host.notify(`“I'll keep ${item.game.title} under the table for you till closing.”\n${deposit} coins down, ${item.due} to pay when you come back for it.`, 4000);
  }

  /** X: offer a game from the collection in part exchange. */
  private swap(): void {
    const sale = this.sale?.item;
    const { trade, market } = this.host.parts;
    if (!sale || !trade || !market) return;
    const { item } = sale;
    if (item.source === 'bin' || item.source === 'ordered' || item.source === 'upgrade') {
      this.host.notify(item.source === 'bin' ? `“No swaps at ${sale.where}, friend.”` : item.source === 'upgrade' ? '“Your old copy is part of the deal already. Coins for the rest.”' : `“That's your order: coins, please.”`);
      return;
    }
    if (!item.priced) {
      this.host.notify('The stallholder is still working out the price. Give it a moment.');
      return;
    }
    trade.start({ item, stall: sale.where, onSwap: (mine, value) => this.completeSwap(sale, mine, value) });
    this.host.showModal(trade);
  }

  /** The swap is agreed: `mine` goes to the stall, the copy in hand comes home; the difference is paid (no change given). */
  private completeSwap(sale: ForSaleLike, mine: Game, value: number): string | null {
    const { panel, inspector } = this.host.parts;
    const { item } = sale;
    const result = this.transactions.swap(item, mine, value, sale.where);
    if (!result.ok) return result.reason === 'short' ? `You need ${result.needed} coins on top and you have ${result.have}.` : 'The swap fell through.';
    const { topUp } = result;
    sale.thanks();
    sale.react?.('bought');
    this.end();
    panel.hide();
    inspector.stow(() => sale.sold());
    this.last = null;
    this.host.notify(`Swapped ${mine.title} for ${item.game.title}${topUp ? ` and ${topUp} coins` : ''}.\nIt will wait for you in a parcel in the hallway.`, 4000);
    return null;
  }

  /** O: a careful look inside finds out a fake (once); the stallholder does not argue. */
  private inspectInside(): void {
    const sale = this.sale?.item;
    const { market } = this.host.parts;
    if (!sale || !market || !market.expose(sale.item)) return;
    sale.react?.('caught');
    this.host.notify(`The label is a glossy print and the board inside is brand new: a reproduction.\n“Ah. Well spotted. ${sale.item.price} coins and it's yours, no questions.”`, 5000);
  }

  /** The panel for the copy in hand: price (settled, haggled, deposit), state, edition, and the keys. */
  show(): void {
    const sale = this.sale?.item;
    if (!sale) return;
    const { item, wanted } = sale;
    const { wallet, standing } = this.host.parts;
    const coins = wallet?.coins ?? 0;
    const price = !item.priced ? 'being priced…'
      : item.haggled ? `${item.price} coins (was ${item.tagPrice})`
      : `${item.price} coin${item.price > 1 ? 's' : ''}`;
    const state = item.condition === 'complete' ? 'Complete, with its manual' : item.condition === 'noManual' ? 'No manual' : 'Worn, no manual';
    const rows: [string, string][] = [['Price', price]];
    if (item.deposit) rows.push(['Still due', `${item.due} coins (${item.deposit} paid down)`]);
    rows.push(['State', state]);
    const edition = describeEdition(item.edition, item.game.platform);
    if (edition) rows.push(['Edition', edition[0]!.toUpperCase() + edition.slice(1)]);
    const loyalty = item.source !== 'bin' ? standing?.loyaltyName(item.game.platform) : '';
    if (loyalty) rows.push(['You are', `${loyalty} at this stall`]);
    const room = this.host.parts.shelfRoom?.();
    if (room) rows.push(['At home', room]);
    if (item.beforeSale !== undefined) rows.push(['Usual price', `${item.beforeSale} coins`]);
    const note = !item.priced ? 'The stallholder is looking it up.'
      : item.exposed ? 'A reproduction, found out: knocked right down.'
      : item.source === 'ordered' ? 'Your order, waiting for you.'
      : item.source === 'keptAside' ? 'Kept aside for you: a regular’s privilege.'
      : item.source === 'upgrade' ? 'A first print of a game you own: buy it and it replaces your copy (the stallholder takes the old one).'
      : item.source === 'grail' ? `A grail. ${grailById(item.game.id)?.lore ?? 'Collectors dream of this one.'} The seller will not budge much.`
      : item.sale < 1 ? `Clearance: ${Math.round((1 - item.sale) * 100)}% off. No haggling.`
      : item.gem ? 'In the bargain bin? Someone did not know what they had.'
      : coins < item.due ? `You have ${coins} coins: ${item.due - coins} short.`
      : wanted ? '★ On your wishlist.'
      : item.source === 'showpiece' || item.source === 'estate' ? 'The pride of the stall.' : undefined;
    const keys = item.source === 'bin'
      ? [`${keyMarkup('buy')} buy`, `${keyMarkup('lookInside')} open the box`]
      : [`${keyMarkup('buy')} buy`, `${keyMarkup('haggle')} haggle`, item.reserved ? '' : `${keyMarkup('holdCopy')} hold for the day`, item.source === 'ordered' || item.source === 'upgrade' ? '' : `${keyMarkup('swap')} swap a game`, `${keyMarkup('lookInside')} open the box`];
    const hints = [...keys.filter(Boolean), `${keyMarkup('putBack')} or [Click] elsewhere to put it back`].map(renderKeys).join(' · ');
    this.host.parts.panel.show(item.game, { rows, note, hints });
  }
}
