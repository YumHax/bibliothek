import type { Game } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { MarketStock } from '@/economy/MarketStock';
import type { MarketLedger } from '@/economy/MarketLedger';
import type { MarketStanding } from '@/economy/MarketStanding';
import type { MarketNotices, NoticeAd } from '@/economy/MarketNotices';
import type { Transactions } from '@/economy/Transactions';
import { COLLECTOR_SETS, setProgress, type CollectorSet } from '@/economy/collectorSets';
import { themeOf } from '@/economy/marketDays';
import { ARM_ABOVE, FOR_SALE_AD, LOYALTY, WANTED_AD, describeCondition, wantedPay } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { loanOf } from '@/collection/loans';
import { findPerson } from '@/social/people';
import { stallPerson } from '@/social/market';
import { weekdayName } from '@/social/life/due';
import { Arming, armedLine } from '../confirmTwice';
import { FACE_PAPER, portrait } from '../social/portrait';
import { MarketPanel } from './MarketPanel';
import { html, paint, type Html } from '../panel/html';
import { inlinePictogram } from '../panel/pictograms';
import { coverImg, emptyState, nextTab, priceHtml, tabs } from '../panel/widgets';
import { formatCoins } from '@/text/money';

/** What each standing at a stall looks like from the other side of the table, in a few words. */
const STANDING_WORDS = ['hasn’t placed you yet', 'knows your face', 'keeps an eye out for you', 'would mind the stall for you'] as const;
/** A stallholder's polaroid face (CSS px), on the cream `FACE_PAPER`. */
const FACE_SIZE = 64;

type Tab = 'notices' | 'sets' | 'standing' | 'week';
const TABS: { id: Tab; label: string }[] = [
  { id: 'notices', label: 'Cards' },
  { id: 'sets', label: "Collectors' club" },
  { id: 'standing', label: 'Stallholders' },
  { id: 'week', label: 'This week' },
];
const TAB_IDS = TABS.map((t) => t.id);

interface NoticeBoardDeps {
  wallet: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void; subscribe(cb: () => void): () => void };
  collection: CollectionStore;
  market: MarketStock;
  ledger: MarketLedger;
  standing: MarketStanding;
  notices: MarketNotices;
  /** Every sale, purchase and reward goes through it (checked first, saved as one). */
  tx: Transactions;
  /** Front cover for a game (the polaroid on a card, a pocket on a club card). */
  coverUrl?: (game: Game) => string | undefined;
}

/** A card answered while the board is open: the thank-you note pinned where the card was. */
interface PinnedNote {
  from: string;
  line: string;
  paid: number;
  /** What it says under the line (the collector would have paid more with the box). */
  aside?: string;
}

/**
 * The notice board by the way in, a stall scene (`MarketPanel` `scene`) of four tabs, all on the cork.
 * Cards: collectors' WANTED cards (sell them the game, straight from the collection, for well over the WE BUY desk's
 * offer) and private sellers' FOR SALE cards (a copy delivered to the parcel), each with the game's polaroid pinned on;
 * one answered becomes the other side's thank-you note in its place. Collectors' club: a membership card per set
 * (`collectorSets`), a pocket per piece (the copy's cover when it is home, its name pencilled in an empty pocket when
 * not), Claim once complete, then PAID stamped with what the club paid (never shown before). Stallholders: each one's
 * polaroid (face, stall, how they take the player in their hand, a ribbon for the standing) under the clipping of what
 * the market calls the player. This week: the market's programme poster, today ringed. Selling to a card and buying a
 * dear one are pressed twice; what is out of reach (a lent game, a card dearer than the pocket) stays pressable and says why.
 */
export class NoticeBoardPanel extends MarketPanel {
  private tab: Tab = 'notices';
  private ads: NoticeAd[] = [];
  private loading = false;
  /** Selling to a WANTED card, or buying a FOR SALE one past `ARM_ABOVE`: the first press arms, the second goes through. */
  private readonly arming = new Arming<string>(() => this.refresh());
  /** Cards answered since the board was opened, by id: their notes stay pinned until it closes. */
  private readonly notes = new Map<string, PinnedNote>();
  /** The set just claimed: its PAID stamp comes down once. */
  private justPaid: string | null = null;

  constructor(container: HTMLElement, private readonly deps: NoticeBoardDeps) {
    super(container, deps.wallet, { title: 'Notice board', className: 'notices', scene: true });
    deps.collection.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
    deps.standing.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
  }

  /** The cards up today (drawn on first look), for the board's own face. */
  async cards(): Promise<NoticeAd[]> {
    const { market, collection, notices } = this.deps;
    const day = market.day;
    const stock = await market.todays().catch(() => []);
    return notices.onBoard(day, { collection: collection.games, stock, pool: () => market.randomGames(`${day}:ads`, FOR_SALE_AD.perDay * 3) });
  }

  protected render(): void {
    const content = this.tab === 'notices' ? this.noticesHtml() : this.tab === 'sets' ? this.setsHtml() : this.tab === 'standing' ? this.standingHtml() : this.weekHtml();
    paint(
      this.body,
      html`${tabs({ tabs: TABS, active: this.tab, className: 'notices__tabs', label: 'Notice board', idPrefix: 'notices-tab', controls: 'notices-tabpanel' })}
      <div class="notices__panel" role="tabpanel" id="notices-tabpanel" aria-labelledby="notices-tab-${this.tab}">${content}</div>`,
    );
    if (this.tab === 'standing') this.paintFaces();
    if (this.tab === 'notices' && !this.loading) this.refreshCards();
    this.justPaid = null;
  }

  /** D-pad left / right (or the arrow keys) flip through the tabs, the focus following the one shown. */
  protected override onSide(direction: 1 | -1): boolean {
    this.showTab(nextTab(TAB_IDS, this.tab, direction));
    this.body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return true;
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    this.setStatus('');
    this.refresh();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'tab' && el.dataset.tab) this.showTab(el.dataset.tab as Tab);
    else if (action === 'answer' && el.dataset.id) this.answer(el.dataset.id);
    else if (action === 'buy' && el.dataset.id) this.buy(el.dataset.id);
    else if (action === 'claim' && el.dataset.id) this.claim(el.dataset.id);
  }

  protected override onClosed(): void {
    this.notes.clear();
    this.arming.reset();
  }

  private refreshCards(): void {
    this.loading = true;
    void this.cards().then((ads) => {
      this.loading = false;
      const changed = ads.length !== this.ads.length || ads.some((ad, i) => ad.id !== this.ads[i]?.id);
      this.ads = ads;
      if (changed && this.isOpen && this.tab === 'notices') this.refresh();
    }, () => {
      this.loading = false;
    });
  }

  /** The game's polaroid, pinned in the card's corner. */
  private polaroid(game: Game): Html {
    const cover = coverImg(this.deps.coverUrl?.(game), game, 'notices__photo-img');
    return html`<span class="notices__photo" aria-hidden="true">${cover}</span>`;
  }

  private noticesHtml(): Html {
    const { market, collection, ledger } = this.deps;
    const ads = this.ads.filter((ad) => this.notes.has(ad.id) || !ledger.cardDone(ad.id));
    if (!ads.length) {
      return html`<div class="notices__cork notices__cork--bare">${emptyState(this.loading ? 'Reading the cards…' : 'Nothing pinned up today. The regulars put new cards up every morning.', { pictogram: 'letter', title: this.loading ? '' : 'Just the pins', className: 'notices__bare' })}</div>`;
    }
    const onStalls = new Set((market.peekToday() ?? []).map((item) => item.game.id));
    return html`<div class="notices__cork">${ads.map((ad) => {
      const note = this.notes.get(ad.id);
      if (note) return this.noteHtml(ad, note);
      const platform = getPlatform(ad.game.platform).shortName;
      if (ad.kind === 'wanted') {
        const mine = collection.games.find((g) => g.id === ad.game.id && g.status !== 'wishlist');
        const lent = mine?.status === 'lent';
        // What they would pay for the player's own copy: the card's price is for a complete one.
        const yours = mine && !lent ? wantedPay(ad.pay, mine) : ad.pay;
        const loan = lent ? loanOf(ad.game.id) : null;
        const hint = mine ? (lent ? (loan ? `yours, but ${loan.who} has it till ${loan.back}` : 'yours, but lent out') : yours < ad.pay ? `you have it: ${formatCoins(yours)} for your copy` : 'you have it') : onStalls.has(ad.game.id) ? `on the ${platform} stall today` : 'not yours yet';
        const daysLeft = WANTED_AD.days - (market.day - ad.day);
        const armed = this.arming.isArmed(ad.id);
        return html`<div class="notices__card notices__card--wanted">
            <span class="notices__pin" aria-hidden="true"></span>
            ${this.polaroid(ad.game)}
            <span class="notices__kind">WANTED</span>
            <span class="notices__game">${ad.game.title}</span>
            <span class="notices__by">${platform} · ${ad.from} · ${daysLeft > 1 ? `${daysLeft} days left` : 'last day'}</span>
            <span class="notices__hint">${hint}</span>
            <span class="notices__foot"><span class="catalogue__meta">pays</span>${priceHtml(ad.pay)}
            <button type="button" class="ui-btn notices__act${armed ? ' ui-btn--armed' : ''}" data-action="answer" data-id="${ad.id}" aria-disabled="${!(mine && !lent)}">${armed ? `Sell for ${formatCoins(yours)}?` : 'Sell it'}</button></span>
          </div>`;
      }
      const state = describeCondition(ad.game.condition);
      const owned = collection.owns(ad.game.id);
      const short = Math.max(0, ad.price - this.deps.wallet.coins);
      const armed = this.arming.isArmed(ad.id);
      const label = owned ? 'Yours already' : short ? `${formatCoins(short)} short` : armed ? `Pay ${formatCoins(ad.price)}?` : 'Buy';
      return html`<div class="notices__card notices__card--sale">
          <span class="notices__pin" aria-hidden="true"></span>
          ${this.polaroid(ad.game)}
          <span class="notices__kind">FOR SALE</span>
          <span class="notices__game">${ad.game.title}</span>
          <span class="notices__by">${platform}${state ? ` · ${state}` : ''} · ${ad.from} · today only</span>
          <span class="notices__foot">${priceHtml(ad.price)}
          <button type="button" class="ui-btn notices__act${armed ? ' ui-btn--armed' : ''}" data-action="buy" data-id="${ad.id}" aria-disabled="${owned || short > 0}">${label}</button></span>
        </div>`;
    })}</div>`;
  }

  /** An answered card turned over: the other side's thank-you in their hand, what changed hands, signed. */
  private noteHtml(ad: NoticeAd, note: PinnedNote): Html {
    return html`<div class="notices__card notices__card--note">
        <span class="notices__pin notices__pin--green" aria-hidden="true"></span>
        <span class="notices__kind">${ad.kind === 'wanted' ? 'THANK YOU' : 'SOLD'}</span>
        <span class="notices__note-line">${note.line}</span>
        ${note.aside ? html`<span class="notices__hint">${note.aside}</span>` : ''}
        <span class="notices__foot"><span class="catalogue__meta">${ad.kind === 'wanted' ? 'paid you' : 'you paid'}</span>${priceHtml(note.paid)}<span class="notices__sign">${note.from}</span></span>
      </div>`;
  }

  /** The club's membership cards, one per set: its pockets, then Claim, PAID, or how many to go, pencilled. */
  private setsHtml(): Html {
    return html`<div class="notices__cork notices__cork--club">
      <p class="club__letterhead">${inlinePictogram('star', 'club__emblem')}<span>The Collectors’ Club</span><small>Complete a set, bring the card, the club pays.</small></p>
      ${COLLECTOR_SETS.map((set) => this.clubCardHtml(set))}
    </div>`;
  }

  private clubCardHtml(set: CollectorSet): Html {
    const { collection, standing } = this.deps;
    const progress = setProgress(set, collection.games);
    const missing = progress.filter((p) => !p.have).length;
    const complete = missing === 0;
    const claimed = standing.hasClaimed(set.id);
    const pockets = progress.map(({ piece, have, game }, i) => {
      const shown: Game = game ?? { id: `club-${set.id}-${i}`, title: piece.name, platform: piece.platform };
      return html`<li class="club__pocket${have ? ' club__pocket--filled' : ''}">
          <span class="club__sleeve">${coverImg(this.deps.coverUrl?.(shown), shown, 'club__cover')}</span>
          <span class="club__name">${piece.name}</span>
          <span class="club__platform">${getPlatform(piece.platform).shortName}</span>
        </li>`;
    });
    const foot = claimed
      ? html`<span class="club__stamp${this.justPaid === set.id ? ' club__stamp--fresh' : ''}">PAID</span><span class="club__note">the club paid ${formatCoins(set.reward)}</span>`
      : complete
        ? html`<span class="club__note">complete!</span><button type="button" class="ui-btn ui-btn--primary" data-action="claim" data-id="${set.id}">Claim</button>`
        : html`<span class="club__note">${missing === 1 ? 'one to go' : `${missing} to go`}</span>`;
    return html`<article class="club__card${complete ? ' club__card--complete' : ''}${claimed ? ' club__card--paid' : ''}">
        <h4 class="club__set">${set.name}</h4>
        <ul class="club__pockets">${pockets}</ul>
        <div class="club__foot">${foot}</div>
      </article>`;
  }

  private standingHtml(): Html {
    const { standing } = this.deps;
    const rep = standing.reputation;
    const holders = PLATFORM_LIST.map((p) => {
      const id = stallPerson(p.id);
      const card = findPerson(id);
      const tier = standing.loyalty(p.id);
      return html`<figure class="notices__polaroid">
          <span class="notices__pin" aria-hidden="true"></span>
          <span class="notices__face" data-face="${id}"></span>
          <figcaption>
            <b class="notices__holder-name">${card?.short ?? card?.name ?? `The ${p.shortName} stall`}</b>
            <span class="notices__holder-stall">${p.shortName} stall</span>
            <span class="notices__words">${STANDING_WORDS[tier] ?? STANDING_WORDS[0]}</span>
          </figcaption>
          <span class="notices__ribbon${tier ? '' : ' notices__ribbon--none'}">${tier ? LOYALTY.names[tier - 1]! : 'Stranger'}</span>
        </figure>`;
    });
    return html`<div class="notices__cork notices__cork--people">
      <p class="notices__clipping"><small>Round the market they call you</small><b>${rep.name}</b></p>
      ${holders}
    </div>`;
  }

  /** The market's programme for the week, a printed poster pinned on the cork: a day a column, today ringed in marker. */
  private weekHtml(): Html {
    const { market } = this.deps;
    const days = Array.from({ length: 7 }, (_, i) => {
      const theme = themeOf(market.day + i);
      const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayName(market.day + i);
      return html`<li class="week__day${i === 0 ? ' week__day--today' : ''}${theme.kind === 'ordinary' ? '' : ' week__day--special'}">
          <span class="week__name">${name}</span>
          <b class="week__title">${theme.title}</b>
          <span class="week__blurb">${theme.blurb}</span>
        </li>`;
    });
    return html`<div class="notices__cork notices__cork--week">
      <section class="week__poster">
        <span class="notices__pin" aria-hidden="true"></span>
        <h4 class="week__head">This week at the market</h4>
        <ol class="week__days">${days}</ol>
      </section>
    </div>`;
  }

  /** The stallholders' painted faces, into their places once the tab is painted. */
  private paintFaces(): void {
    this.body.querySelectorAll<HTMLElement>('[data-face]').forEach((el) => {
      if (el.dataset.face && findPerson(el.dataset.face)) el.append(portrait(el.dataset.face, FACE_SIZE, FACE_PAPER));
    });
  }

  /** A wanted card answered: the game leaves the collection, the collector pays, their thanks go up in its place. */
  private answer(id: string): void {
    const ad = this.ads.find((a) => a.id === id);
    if (!ad || ad.kind !== 'wanted' || this.notes.has(id)) return;
    const mine = this.deps.collection.games.find((g) => g.id === ad.game.id && g.status !== 'wishlist');
    if (!mine) {
      this.setStatus(`You don’t have ${ad.game.title} yet.`, 'error');
      return;
    }
    if (mine.status === 'lent') {
      const loan = loanOf(ad.game.id);
      this.setStatus(loan ? `${loan.who} has your ${ad.game.title} till ${loan.back}.` : `Your ${ad.game.title} is lent out.`, 'error');
      return;
    }
    if (!this.arming.press(ad.id)) {
      this.setStatus(armedLine(`sell ${ad.game.title} to ${ad.from}`));
      return;
    }
    const done = this.deps.tx.answerWanted(ad);
    if (!done.ok) {
      if (done.reason === 'notOwned') this.setStatus(`You don’t have ${ad.game.title} to sell.`, 'error');
      return;
    }
    playCoins();
    this.setStatus('');
    this.notes.set(id, {
      from: ad.from,
      line: `${ad.game.title}! Just what I was after. Thank you ever so.`,
      paid: done.pay,
      aside: done.pay < ad.pay ? 'they’d have paid more with the box and the manual' : undefined,
    });
    this.refresh();
  }

  /** A private seller's copy bought (pressed twice past `ARM_ABOVE`): it goes to the parcel like any purchase. */
  private buy(id: string): void {
    const ad = this.ads.find((a) => a.id === id);
    if (!ad || ad.kind !== 'forSale' || this.notes.has(id)) return;
    if (this.deps.collection.owns(ad.game.id)) {
      this.setStatus(`${ad.game.title} is on your shelves already.`);
      return;
    }
    const short = ad.price - this.deps.wallet.coins;
    if (short > 0) {
      this.setStatus(`${formatCoins(short)} short for ${ad.game.title}.`, 'error');
      return;
    }
    if (ad.price > ARM_ABOVE && !this.arming.press(ad.id)) {
      this.setStatus(armedLine(`pay ${formatCoins(ad.price)} for ${ad.game.title}`));
      return;
    }
    const bought = this.deps.tx.buyForSale(ad);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`${formatCoins(ad.price - this.deps.wallet.coins)} short for ${ad.game.title}.`, 'error');
      return;
    }
    playCoins();
    this.setStatus('');
    this.notes.set(id, { from: ad.from, line: `It’s yours. I’ll drop it round: look for a parcel in your hallway.`, paid: ad.price });
    this.refresh();
  }

  private claim(id: string): void {
    const set = COLLECTOR_SETS.find((s) => s.id === id);
    if (!set || this.deps.standing.hasClaimed(set.id)) return;
    if (setProgress(set, this.deps.collection.games).some((p) => !p.have)) return;
    if (!this.deps.tx.claimSet(set).ok) return;
    playCoins(5);
    this.justPaid = set.id;
    this.setStatus(`The club pays ${formatCoins(set.reward)} for "${set.name}". Well done!`);
    this.refresh();
  }
}
