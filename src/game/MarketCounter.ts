import type { Game } from '@/catalog/types';
import { grailById } from '@/economy/grails';
import { ARM_ABOVE, UNDO_PURCHASE, describeEdition } from '@/economy/pricing';
import { Transactions } from '@/economy/Transactions';
import type { ForSaleLike, SaleReaction } from './SessionActions';
import type { CollectionLike, CoreParts, HagglePanelLike, MarketLike, ModalLike, PerksLike, StandingLike, TradePanelLike, WalletLike } from './SessionParts';
import type { NoticeActions } from '@/notices';
import type { KeyRoute, SessionHost } from './SessionHost';
import { isAction, keyMarkup } from '@/input/actions';
import { actionKeyLabel, renderKeys } from '@/ui/keys';
import { actionCap } from '@/ui/verb';
import { Arming } from '@/ui/confirmTwice';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import { inTurn, random } from '@/random';

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
  /** What the flat sends the player out with (a bath's calm, the first sale, know-how, clothes): `household/Perks`. */
  perks?: PerksLike;
}

/** What the counter needs from the session: its parts, a way to talk, and the moves it may make. */
interface MarketCounterHost extends Pick<SessionHost, 'pickUp' | 'putBack'> {
  readonly parts: MarketCounterParts;
  readonly notices: NoticeActions;
  /** Opens a DOM panel over the room, the copy staying in hand. */
  showModal(modal: ModalLike): void;
}

/** Asked for a copy whose price is still being looked up: the stallholder says so (a wait, not a refusal), in turn. */
const STILL_PRICING = inTurn(random, [
  'Hang on, let me look that one up…',
  'One second, I’m checking what it goes for.',
  'Give me a moment, I’m looking it up in the guide.',
]);

/** The last purchase, while it can still be undone. */
interface LastPurchase {
  sale: ForSaleLike;
  game: Game;
  /** Coins paid at the stall just now. */
  paid: number;
  /** A hold's deposit paid before (it goes back on hold with the copy), 0 for none. */
  deposit: number;
  /** The purchase used the morning's first sale (given back with the copy). */
  usedPerk: boolean;
  until: number;
}

/**
 * The flea market's rules for a copy in the player's hand, on the session's behalf: the panel
 * (price, deposit, edition, state, the keys), B buys (what is still due after a deposit; the
 * receipt goes with the game), H opens the haggle panel, R holds the copy for the day against a
 * deposit, X opens the swap panel, O finds out a fake (the tell is inside the box), U within a few
 * seconds of a purchase hands it back for most of the money. The glass case is for players the
 * market trusts. Every move is answered by the stallholder (`ForSaleLike.react`). A find (`ForSaleLike.free`: the
 * cellars' cartons, the collector's gifts, the box of cast-offs) is not sold: B takes it, nothing else applies.
 */
export class MarketCounter implements KeyRoute {
  private sale: { item: ForSaleLike; unwatch: () => void } | null = null;
  /** Buy was pressed while this copy's price was still being looked up: it goes through once the price is in. */
  private buyWhenPriced: ForSaleLike['item'] | null = null;
  private last: LastPurchase | null = null;
  /** A hold puts coins down: the first R arms it, the second (in time) pays the deposit, as every other spending press. */
  private readonly holdArming = new Arming<string>(() => {});

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
    const { standing, perks } = this.host.parts;
    if (!sale.behindGlass || !standing || standing.mayHandleGlass) return true;
    if (perks?.mayHandleGlass) {
      this.host.notices.react('The stallholder takes in your Sunday best and unlocks the case.');
      return true;
    }
    sale.react?.('locked');
    this.speak(sale, 'Collectors only, friend. The case stays shut.');
    this.host.notices.refuse('The stallholder doesn’t know you well enough yet to open the case.');
    this.host.notices.tip('Buy, sell and haggle here: the case opens once the market knows you.', { id: 'glass-case', head: 'The glass case', times: 3 });
    return false;
  }

  /** The copy was just taken in hand. */
  private begin(sale: ForSaleLike): void {
    this.end();
    this.sale = { item: sale, unwatch: sale.item.subscribe(() => this.priced()) };
    sale.react?.('pickUp');
    this.show();
  }

  /**
   * The copy in hand changed (its price came back from the guide, a haggle settled): the panel again. Asked to buy while
   * it was still being priced, the purchase goes through now, unless the price turned out dear (past `ARM_ABOVE`, the
   * press-twice line): then the stallholder names it and the next press buys.
   */
  private priced(): void {
    this.show();
    const sale = this.sale?.item;
    if (!sale || this.buyWhenPriced !== sale.item || !sale.item.priced) return;
    this.buyWhenPriced = null;
    if (sale.item.due > ARM_ABOVE) this.speak(sale, `There. ${formatCoins(sale.item.due)} for that one.`);
    else this.buy();
  }

  /** The copy left the hand (put back, bought, swapped). */
  end(putBack = false): void {
    if (!this.sale) return;
    if (putBack) this.sale.item.react?.('putBack');
    this.sale.unwatch();
    this.sale = null;
    this.buyWhenPriced = null;
  }

  /** Routes a key while a copy is in hand (or just after a purchase). True when it was the market's. */
  onKey(code: string): boolean {
    // LT hands back only with empty hands: a copy in hand, it haggles (its own alias, KeyH, comes next).
    if (isAction(code, 'handBack') && !(this.sale && code === 'GamepadLT') && this.undo()) return true;
    if (!this.sale) return false;
    if (isAction(code, 'lookInside')) {
      this.inspectInside();
      return false; // the session still opens the box
    }
    if (isAction(code, 'buy')) this.buy();
    // A find has nothing to haggle, hold or swap over: the keys are swallowed.
    else if (this.sale.item.free) return isAction(code, 'haggle') || isAction(code, 'holdCopy') || isAction(code, 'swap');
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

  /** The money moves of a sale: the market's, or a private seller's (no stall, no standing: `ForSaleLike.dealer`). */
  private txFor(sale: ForSaleLike): Transactions {
    const { dealer } = sale;
    if (!dealer) return this.transactions;
    const { wallet, collection } = this.host.parts;
    return new Transactions({ wallet, collection, market: { day: dealer.day, sold: (item) => dealer.sold(item), consign: () => undefined } });
  }

  /** B: pay what is due, and the box goes into the bag (then off the stall). */
  private buy(): void {
    const sale = this.sale?.item;
    const { wallet, collection, panel, inspector } = this.host.parts;
    if (!sale || !wallet || !collection) return;
    if (sale.free) {
      this.take(sale);
      return;
    }
    const { item } = sale;
    const { game } = item;
    const result = this.txFor(sale).buyCopy(item, sale.where);
    if (!result.ok) {
      if (result.reason === 'pricing') {
        this.speak(sale, STILL_PRICING());
        // Bought as soon as the price is in (`priced`).
        this.buyWhenPriced = item;
      } else if (result.reason === 'owned') this.host.notices.refuse(`You already own ${game.title}`);
      else if (result.reason === 'short') {
        // The seller says it, and offers the hold when there is one to offer.
        const short = formatCoins(Math.max(1, (result.needed ?? 0) - (result.have ?? 0)));
        const holdable = !sale.dealer && item.source !== 'bin' && item.source !== 'ordered' && !item.reserved;
        this.speak(sale, holdable ? `${short} short? Say the word and I’ll keep it under the table for a small deposit.` : `It’s ${formatCoins(result.needed ?? 0)}, I’m afraid. You’re ${short} short.`);
        // The word is the hold's key, on the prompt line (never a key name in a stallholder's mouth).
        if (holdable) this.host.notices.prompt(() => `[${actionCap('holdCopy')}] keep it under the table`, { id: 'hold-offer', until: () => this.sale?.item !== sale });
        this.host.notices.tip('Short of coins? Tickets become coins at the arcade’s prize counter.', { id: 'short-of-coins', head: 'Coins', until: () => !this.sale, times: 3 });
      }
      return;
    }
    const { game: bought, paid: due, upgrade } = result;
    const usedPerk = this.host.parts.perks?.bought(item) === true;
    const thanks = sale.thanks();
    sale.react?.('bought');
    this.end();
    panel.hide();
    inspector.stow(() => sale.sold());
    const undoable = item.source !== 'ordered' && !upgrade;
    this.last = undoable ? { sale, game: bought, paid: due, deposit: item.deposit, usedPerk, until: performance.now() + UNDO_PURCHASE.seconds * 1000 } : null;
    const home = upgrade ? 'Your copy at home is a first print now.' : 'In the parcel in the hall.';
    this.speak(sale, thanks);
    this.host.notices.slip({ title: `Bought ${game.title}`, detail: item.deposit ? `${home} ${formatCoins(item.price)} in all, deposit included.` : home, coins: -due });
    if (undoable) {
      const last = this.last;
      // The seconds left count down on the line (written again each second), the cap follows the device in hand.
      const left = (): number => Math.max(1, Math.ceil(((last?.until ?? 0) - performance.now()) / 1000));
      this.host.notices.prompt(() => `[${actionCap('handBack')}] hand it back · ${left()} s`, { id: 'hand-back', until: () => this.last !== last || performance.now() > (last?.until ?? 0) });
    }
  }

  /** B on a find: nothing changes hands, the box goes into the bag and the find is gone from where it lay. */
  private take(sale: ForSaleLike): void {
    const { panel, inspector } = this.host.parts;
    const { game } = sale.item;
    const result = this.transactions.takeFind(sale.item, sale.where);
    if (!result.ok) {
      if (result.reason === 'owned') this.host.notices.refuse(`You already own ${game.title}`);
      return;
    }
    const said = sale.thanks();
    this.end();
    panel.hide();
    inspector.stow(() => sale.sold());
    this.last = null;
    this.host.notices.reward({ title: `Found ${game.title}`, detail: said });
  }

  /**
   * U just after a purchase (even with another copy in hand): the copy goes back on the stall, the money back less
   * `1 - UNDO_PURCHASE.refund` of its full price (rounded, so a 1-coin copy comes back whole); a copy that was held goes
   * back on hold with its deposit, and a perk the purchase used (the morning's first sale) is given back.
   */
  private undo(): boolean {
    const last = this.last;
    if (!last || performance.now() > last.until) return false;
    const { wallet, collection, perks } = this.host.parts;
    if (!wallet || !collection?.remove || !last.sale.restock) return false;
    this.last = null;
    const keep = Math.round((1 - UNDO_PURCHASE.refund) * (last.paid + last.deposit));
    const refund = Math.max(0, last.paid - keep);
    const hold = last.deposit > 0 ? { item: last.sale.item, deposit: last.deposit } : undefined;
    const givePerkBack = last.usedPerk && perks?.unbought ? () => perks.unbought!() : undefined;
    if (!this.txFor(last.sale).undoPurchase(last.game, refund, hold, givePerkBack).ok) return false;
    last.sale.dealer?.unsold?.(last.sale.item);
    last.sale.restock();
    this.speak(last.sale, 'Changed your mind? No harm done.');
    const held = hold ? ` Still on hold for you: ${formatCoins(last.sale.item.due)} to go.` : '';
    this.host.notices.react(`${last.game.title} is back on the table: ${formatCoins(refund)} of your ${formatCoins(last.paid)} back.${held}`);
    return true;
  }

  /** H: open the haggle over the copy in hand (once per copy per day). */
  private haggle(): void {
    const sale = this.sale?.item;
    const { haggle } = this.host.parts;
    // A private seller haggles on their own terms (`ForSaleLike.dealer`), the stalls on the market's.
    const market = sale?.dealer ?? this.host.parts.market;
    if (!sale || !market) return;
    // Flat-price copies (the bin, a garage sale on the street) are never haggled over.
    if (sale.item.source === 'bin') {
      this.speak(sale, `It’s ${sale.where}, friend. ${formatCoins(sale.item.price)}, that’s the deal.`);
      return;
    }
    const opened = market.negotiate(sale.item);
    if (!('offer' in opened)) {
      this.speak(sale, opened.line);
      return;
    }
    if (!haggle) return;
    // What the player brings along eases it (said as the panel opens).
    const eased = this.host.parts.perks?.ease(sale.item, opened) ?? [];
    if (eased.length) this.host.notices.tip(eased.join('\n'), { id: 'haggle-eased' });
    haggle.start({
      item: sale.item,
      negotiation: opened,
      stall: sale.where,
      seller: sale.seller,
      onClose: ({ insults, outcome, pay }) => {
        if (outcome === 'none') return;
        market.settle(sale.item, opened, insults);
        const reaction: SaleReaction = outcome === 'deal' ? 'haggleWon' : outcome === 'walk' ? 'haggleLost' : 'haggleStopped';
        sale.react?.(insults ? 'insult' : reaction);
        this.show();
        // Paid on the handshake (pressed twice in the panel when dear): bought now, at the price shaken on.
        if (pay && this.sale?.item === sale) this.buy();
      },
    });
    this.host.showModal(haggle);
  }

  /** R twice: hold the copy for the day against a deposit (counted towards the price). */
  private hold(): void {
    const sale = this.sale?.item;
    const { market, wallet } = this.host.parts;
    if (!sale || !market || !wallet) return;
    const { item } = sale;
    if (sale.dealer) {
      this.speak(sale, sale.dealer.noHold);
      return;
    }
    if (item.source === 'bin') {
      this.speak(sale, `No holds at ${sale.where}. Grab it or leave it.`);
      return;
    }
    if (item.reserved) {
      this.speak(sale, item.source === 'ordered' ? `That’s your order, it’s not going anywhere.` : `It’s held for you already. ${formatCoins(item.due)} to go.`);
      return;
    }
    if (market.isStale?.(item)) {
      this.speak(sale, `We’re packing up yesterday’s table, friend. Buy it now or put it back.`);
      return;
    }
    if (item.priced && !this.holdArming.press(item.game.id)) {
      const deposit = market.holdDeposit(item);
      this.host.notices.react(`${actionKeyLabel('holdCopy')} again to put ${deposit ? formatCoins(deposit) : 'a deposit'} down and keep it under the table till closing`);
      return;
    }
    const result = this.transactions.holdCopy(item);
    if (!result.ok) {
      if (result.reason === 'pricing') this.speak(sale, STILL_PRICING());
      else if (result.reason === 'short') this.host.notices.refuse(`A hold costs a deposit of ${formatCoins(result.needed ?? 0)} and you have ${formatCoins(result.have ?? 0)}.`);
      return;
    }
    const { deposit } = result;
    sale.react?.('hold');
    this.speak(sale, `I’ll keep ${item.game.title} under the table for you till closing tonight.`);
    this.host.notices.slip({ title: `${item.game.title} on hold`, detail: `${formatCoins(item.due)} to pay before the market shuts tonight.`, coins: -deposit });
  }

  /** X: offer a game from the collection in part exchange. */
  private swap(): void {
    const sale = this.sale?.item;
    const { trade, market } = this.host.parts;
    if (!sale || !trade || !market) return;
    const { item } = sale;
    if (sale.dealer) {
      this.speak(sale, sale.dealer.noSwap);
      return;
    }
    if (item.source === 'bin' || item.source === 'ordered' || item.source === 'upgrade') {
      this.speak(sale, item.source === 'bin' ? `No swaps at ${sale.where}, friend.` : item.source === 'upgrade' ? 'Your old copy is part of the deal already. Coins for the rest.' : `That’s your order: coins, please.`);
      return;
    }
    if (!item.priced) {
      this.speak(sale, STILL_PRICING());
      return;
    }
    trade.start({ item, stall: sale.where, seller: sale.seller, onSwap: (mine, value) => this.completeSwap(sale, mine, value) });
    this.host.showModal(trade);
  }

  /** The swap is agreed: `mine` goes to the stall, the copy in hand comes home; the difference is paid, or made up in coins (`swapChange`). */
  private completeSwap(sale: ForSaleLike, mine: Game, value: number): string | null {
    const { panel, inspector } = this.host.parts;
    const { item } = sale;
    const result = this.transactions.swap(item, mine, value, sale.where);
    if (!result.ok) return result.reason === 'short' ? `You need ${formatCoins(result.needed ?? 0)} on top and you have ${formatCoins(result.have ?? 0)}.` : 'The swap fell through.';
    const { topUp, change } = result;
    sale.thanks();
    sale.react?.('bought');
    this.end();
    panel.hide();
    inspector.stow(() => sale.sold());
    this.last = null;
    this.host.notices.slip({ title: `Swapped for ${item.game.title}`, detail: `${mine.title} stays on the stall${change ? ', and a few coins come back with the change' : ''}. In the parcel in the hall.`, coins: topUp ? -topUp : change || undefined });
    return null;
  }

  /** O: a careful look inside finds out a fake (once); the stallholder does not argue. */
  private inspectInside(): void {
    const sale = this.sale?.item;
    const { market } = this.host.parts;
    if (!sale || !market || !market.expose(sale.item)) return;
    sale.react?.('caught');
    this.host.notices.read({ title: 'A reproduction', text: 'The label is a glossy print and the board inside is brand new.', effect: `Found out: ${formatCoins(sale.item.price)} now, no questions.` });
    this.speak(sale, `Ah. Well spotted. ${formatCoins(sale.item.price)} and it’s yours, no questions.`);
  }

  /** The stallholder says `line` to the player: over their head, or as a subtitle when nobody stands by (the bargain bin). */
  private speak(sale: ForSaleLike, line: string): void {
    if (sale.speak) sale.speak(line);
    else this.host.notices.say(line, 'Stallholder');
  }

  /** The panel for the copy in hand: price (settled, haggled, deposit), state, edition, and the keys. */
  show(): void {
    const sale = this.sale?.item;
    if (!sale) return;
    const coins = this.host.parts.wallet?.coins ?? 0;
    this.host.parts.panel.show(sale.item.game, { rows: this.panelRows(sale), note: panelNote(sale, coins), hints: this.panelHints(sale) });
  }

  /**
   * The panel's rows: the price (settled, haggled, what is still due after a deposit), the state, an old price sticker,
   * what the player's eye and the morning's luck say, the edition, how the stall knows the player, room at home, a
   * clearance's usual price.
   */
  private panelRows(sale: ForSaleLike): [string, string][] {
    const { item } = sale;
    const { standing, perks } = this.host.parts;
    const price = !item.priced ? 'being priced…'
      : item.haggled ? `${formatCoins(item.price)} (was ${item.tagPrice})`
      : `${formatCoins(item.price)}`;
    const state = item.condition === 'complete' ? 'Complete, with its manual' : item.condition === 'noManual' ? 'No manual' : 'Worn, no manual';
    if (sale.free) return [['State', state]];
    const rows: [string, string][] = [['Price', price]];
    if (item.deposit) rows.push(['Still due', `${formatCoins(item.due)} (${item.deposit} paid down)`]);
    rows.push(['State', state]);
    if (item.sticker) rows.push(['Sticker', 'An old shop’s price sticker on the cover: cheaper for it, and it peels off at home']);
    const tell = perks?.tell(item);
    if (tell) rows.push(['Your eye', tell]);
    const luck = perks?.note(item);
    if (luck) rows.push(['This morning', luck]);
    const edition = describeEdition(item.edition, item.game.platform);
    if (edition) rows.push(['Edition', capitalise(edition)]);
    const loyalty = item.source !== 'bin' && !sale.dealer ? standing?.loyaltyName(item.game.platform) : '';
    if (loyalty) rows.push(['You are', `${loyalty} at this stall`]);
    const room = this.host.parts.shelfRoom?.();
    if (room) rows.push(['At home', room]);
    if (item.beforeSale !== undefined) rows.push(['Usual price', `${formatCoins(item.beforeSale)}`]);
    return rows;
  }

  /**
   * The key hints: buy; haggle only when a haggle would open (not on a clearance, an order, a copy already haggled over
   * today); at a stall, hold for the day (unless reserved) and swap a game (not an order or an upgrade); open the box
   * unless the copy is sealed (`CopyOpening`); and put it back. A find (`ForSaleLike.free`): take it, open it, put it back.
   */
  private panelHints(sale: ForSaleLike): string {
    const { item } = sale;
    const { market } = this.host.parts;
    const canHaggle = (sale.dealer ?? market)?.canNegotiate?.(item) ?? true;
    const open = item.sealed ? '' : `${keyMarkup('lookInside')} open the box`;
    const keys = sale.free
      ? [`${keyMarkup('buy')} take it`, open]
      : item.source === 'bin'
        ? [`${keyMarkup('buy')} buy`, open]
        : sale.dealer
          ? [`${keyMarkup('buy')} buy`, canHaggle ? `${keyMarkup('haggle')} haggle` : '', open]
          : [`${keyMarkup('buy')} buy`, canHaggle ? `${keyMarkup('haggle')} haggle` : '', item.reserved ? '' : `${keyMarkup('holdCopy')} hold for the day`, item.source === 'ordered' || item.source === 'upgrade' ? '' : `${keyMarkup('swap')} swap a game`, open];
    return [...keys.filter(Boolean), `${keyMarkup('putBack')} puts it back`].map(renderKeys).join(' · ');
  }
}

/** The panel's one line about the copy: what kind of find it is, or what stands between the player and it. */
function panelNote(sale: ForSaleLike, coins: number): string | undefined {
  const { item, wanted } = sale;
  return sale.free ? `Free to take.${wanted ? ' ★ On your wishlist.' : ''}`
    : !item.priced ? 'The stallholder is looking it up.'
    : item.exposed ? 'A reproduction, found out: knocked right down.'
    : item.source === 'ordered' ? 'Your order, waiting for you.'
    : item.source === 'keptAside' ? 'Kept aside for you: a regular’s privilege.'
    : item.source === 'upgrade' ? 'A first print of a game you own: buy it and it replaces your copy (the stallholder takes the old one).'
    : item.game.felixLot !== undefined ? `A round sticker on the back, F.A. in Félix’s hand, and a saleroom’s lot number: ${item.game.felixLot}.`
    : item.source === 'grail' ? `A grail. ${grailById(item.game.id)?.lore ?? 'Collectors dream of this one.'} The seller will not budge much.`
    : item.sale < 1 ? `Clearance: ${Math.round((1 - item.sale) * 100)}% off. No haggling.`
    : item.gem ? 'In the bargain bin? Someone did not know what they had.'
    : coins < item.due ? `You have ${formatCoins(coins)}: ${item.due - coins} short.${wanted ? ' ★ On your wishlist.' : ''}`
    : wanted ? '★ On your wishlist.'
    : item.source === 'showpiece' || item.source === 'estate' ? 'The pride of the stall.' : undefined;
}
