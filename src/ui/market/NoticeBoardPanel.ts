import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { MarketStock } from '@/economy/MarketStock';
import type { MarketLedger } from '@/economy/MarketLedger';
import type { MarketStanding } from '@/economy/MarketStanding';
import type { MarketNotices, NoticeAd } from '@/economy/MarketNotices';
import type { Transactions } from '@/economy/Transactions';
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { themeOf } from '@/economy/marketDays';
import { FOR_SALE_AD, LOYALTY, REPUTATION, WANTED_AD, describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { MarketPanel, coinsHtml, escapeHtml } from './MarketPanel';

type Tab = 'notices' | 'sets' | 'standing';
const TABS: { id: Tab; label: string }[] = [
  { id: 'notices', label: 'Cards' },
  { id: 'sets', label: "Collectors' club" },
  { id: 'standing', label: 'You & the market' },
];

export interface NoticeBoardDeps {
  wallet: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void; subscribe(cb: () => void): () => void };
  collection: CollectionStore;
  market: MarketStock;
  ledger: MarketLedger;
  standing: MarketStanding;
  notices: MarketNotices;
  /** Every sale, purchase and reward goes through it (checked first, saved as one). */
  tx: Transactions;
}

/**
 * The notice board by the way in, as a panel with three tabs. Cards: collectors' WANTED cards
 * (sell them the game, straight from the collection, for well over the WE BUY desk's offer) and
 * private sellers' FOR SALE cards (a copy delivered to the parcel). Collectors' club: the sets
 * (`collectorSets`) with the pieces the collection has, a reward to claim once one is complete.
 * You & the market: reputation and what it opens, loyalty per stall, and the week's market days.
 */
export class NoticeBoardPanel extends MarketPanel {
  private tab: Tab = 'notices';
  private ads: NoticeAd[] = [];
  private loading = false;

  constructor(container: HTMLElement, private readonly deps: NoticeBoardDeps) {
    super(container, deps.wallet, { title: 'Notice board', className: 'notices', blurb: 'Cards pinned up by the regulars, the collectors’ club list, and what the market makes of you.' });
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
    const tabs = TABS.map((t) => {
      const selected = t.id === this.tab;
      return `<button type="button" class="ui-btn" role="tab" id="notices-tab-${t.id}" aria-controls="notices-tabpanel" data-action="tab" data-tab="${t.id}" aria-selected="${selected}" ${selected ? 'data-autofocus' : 'tabindex="-1"'}>${t.label}</button>`;
    }).join('');
    const content = this.tab === 'notices' ? this.noticesHtml() : this.tab === 'sets' ? this.setsHtml() : this.standingHtml();
    this.body.innerHTML = `
      <div class="notices__tabs" role="tablist" aria-label="Notice board">${tabs}</div>
      <div class="notices__panel" role="tabpanel" id="notices-tabpanel" aria-labelledby="notices-tab-${this.tab}">${content}</div>`;
    if (this.tab === 'notices' && !this.loading) this.refreshCards();
  }

  /** D-pad left / right (or the arrow keys) flip through the tabs, the focus following the one shown. */
  protected onSide(direction: 1 | -1): boolean {
    const at = TABS.findIndex((t) => t.id === this.tab);
    this.showTab(TABS[(at + direction + TABS.length) % TABS.length]!.id);
    this.body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return true;
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    this.refresh();
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action === 'tab' && el.dataset.tab) this.showTab(el.dataset.tab as Tab);
    else if (action === 'answer' && el.dataset.id) this.answer(el.dataset.id);
    else if (action === 'buy' && el.dataset.id) this.buy(el.dataset.id);
    else if (action === 'claim' && el.dataset.id) this.claim(el.dataset.id);
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

  private noticesHtml(): string {
    const { market, collection } = this.deps;
    const ads = this.ads.filter((ad) => !this.deps.ledger.cardDone(ad.id));
    if (!ads.length) return `<p class="catalogue__empty">${this.loading ? 'Reading the cards…' : 'Nothing pinned up today. Come back tomorrow.'}</p>`;
    const onStalls = new Set((market.peekToday() ?? []).map((item) => item.game.id));
    return ads.map((ad) => {
      const platform = getPlatform(ad.game.platform).shortName;
      if (ad.kind === 'wanted') {
        const mine = collection.games.find((g) => g.id === ad.game.id && g.status !== 'wishlist');
        const lent = mine?.status === 'lent';
        const hint = mine ? (lent ? 'yours, but lent out' : 'you have it') : onStalls.has(ad.game.id) ? `on the ${platform} stall today` : 'not yours yet';
        const daysLeft = WANTED_AD.days - (market.day - ad.day);
        return `
          <div class="catalogue__row notices__card notices__card--wanted">
            <span class="notices__kind">WANTED</span>
            <span class="catalogue__title">${escapeHtml(ad.game.title)} <span class="catalogue__meta">${platform} · ${escapeHtml(ad.from)} · ${daysLeft > 1 ? `${daysLeft} days left` : 'last day'}</span></span>
            <span class="catalogue__meta">${escapeHtml(hint)}</span>
            <span class="catalogue__meta">pays</span>${coinsHtml(ad.pay)}
            <button type="button" class="ui-btn" data-action="answer" data-id="${escapeHtml(ad.id)}" ${mine && !lent ? '' : 'disabled'}>Sell it</button>
          </div>`;
      }
      const state = describeCondition(ad.game.condition);
      const owned = collection.owns(ad.game.id);
      return `
        <div class="catalogue__row notices__card notices__card--sale">
          <span class="notices__kind">FOR SALE</span>
          <span class="catalogue__title">${escapeHtml(ad.game.title)} <span class="catalogue__meta">${platform}${state ? ` · ${escapeHtml(state)}` : ''} · ${escapeHtml(ad.from)} · today only</span></span>
          ${coinsHtml(ad.price)}
          <button type="button" class="ui-btn" data-action="buy" data-id="${escapeHtml(ad.id)}" ${owned || this.deps.wallet.coins < ad.price ? 'disabled' : ''}>${owned ? 'Owned' : 'Buy'}</button>
        </div>`;
    }).join('');
  }

  private setsHtml(): string {
    const { collection, standing } = this.deps;
    return COLLECTOR_SETS.map((set) => {
      const progress = setProgress(set, collection.games);
      const have = progress.filter((p) => p.have).length;
      const complete = have === progress.length;
      const claimed = standing.hasClaimed(set.id);
      const pieces = progress.map(({ piece, have }) => `<li class="${have ? 'notices__have' : ''}">${have ? '✔' : '○'} ${escapeHtml(piece.name)} <span class="catalogue__meta">${getPlatform(piece.platform).shortName}</span></li>`).join('');
      const button = claimed ? '<button type="button" class="ui-btn" disabled>Claimed</button>'
        : `<button type="button" class="ui-btn${complete ? ' ui-btn--primary' : ''}" data-action="claim" data-id="${set.id}" ${complete ? '' : 'disabled'}>${complete ? 'Claim' : `${have} / ${progress.length}`}</button>`;
      return `
        <div class="notices__set${complete ? ' notices__set--done' : ''}">
          <div class="catalogue__row"><span class="catalogue__title"><b>${escapeHtml(set.name)}</b></span><span class="catalogue__meta">reward</span>${coinsHtml(set.reward)}${button}</div>
          <ul class="notices__pieces">${pieces}</ul>
        </div>`;
    }).join('');
  }

  private standingHtml(): string {
    const { standing, market } = this.deps;
    const rep = standing.reputation;
    const next = rep.next !== null ? `${rep.next - rep.points} more to ${REPUTATION.levels[rep.level + 1]!.name}` : 'as known as anyone can be';
    const perks = [
      `WE BUY desk offers +${Math.round(standing.buyBackBonus * 100)} %`,
      standing.mayHandleGlass ? 'The glass case opens for you' : `The glass case opens at ${REPUTATION.levels[REPUTATION.glassCaseLevel]!.name}`,
    ];
    const loyalty = PLATFORM_LIST.map((p) => {
      const tier = standing.loyalty(p.id);
      const buys = standing.buysAt(p.id);
      const nextAt = LOYALTY.tiers[tier];
      return `<div class="catalogue__row"><span class="catalogue__title">${escapeHtml(p.shortName)} stall</span><span class="catalogue__meta">${buys} bought${nextAt !== undefined ? ` · ${nextAt - buys} to ${LOYALTY.names[tier]}` : ''}</span><span>${tier ? escapeHtml(LOYALTY.names[tier - 1]!) : 'Stranger'}</span></div>`;
    }).join('');
    const week = Array.from({ length: 7 }, (_, i) => {
      const theme = themeOf(market.day + i);
      return `<div class="catalogue__row${i === 0 ? ' notices__today' : ''}"><span class="catalogue__meta">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `In ${i} days`}</span><span class="catalogue__title"><b>${escapeHtml(theme.title)}</b> <span class="catalogue__meta">${escapeHtml(theme.blurb)}</span></span></div>`;
    }).join('');
    return `
      <h3>Reputation: ${escapeHtml(rep.name)} <span class="catalogue__meta">${rep.points} points · ${escapeHtml(next)}</span></h3>
      <p class="catalogue__meta">Buying, selling, haggling a deal, swaps, job lots, answering wanted cards and completing sets all count.</p>
      <ul class="notices__perks">${perks.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      <h3>Regular at the stalls</h3>
      <p class="catalogue__meta">A regular gets wishlist finds more often and better haggles; a friend finds a copy kept aside every day.</p>
      ${loyalty}
      <h3>The week at the market</h3>
      ${week}`;
  }

  /** A wanted card answered: the game leaves the collection, the collector pays. */
  private answer(id: string): void {
    const ad = this.ads.find((a) => a.id === id);
    if (!ad || ad.kind !== 'wanted') return;
    const done = this.deps.tx.answerWanted(ad);
    if (!done.ok) {
      if (done.reason === 'notOwned') this.setStatus(`You don't have ${ad.game.title} to sell.`, true);
      return;
    }
    playCoins();
    this.setStatus(`${ad.from} paid ${ad.pay} coins for ${ad.game.title}. They'll be thrilled.`);
    this.refresh();
  }

  /** A private seller's copy bought: it goes to the parcel like any purchase. */
  private buy(id: string): void {
    const ad = this.ads.find((a) => a.id === id);
    if (!ad || ad.kind !== 'forSale') return;
    const bought = this.deps.tx.buyForSale(ad);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`You need ${ad.price} coins for ${ad.game.title}.`, true);
      return;
    }
    playCoins();
    this.setStatus(`Bought ${ad.game.title} from ${ad.from} for ${ad.price} coins. It will wait for you in a parcel in the hallway.`);
    this.refresh();
  }

  private claim(id: string): void {
    const set = COLLECTOR_SETS.find((s) => s.id === id);
    if (!set || !this.deps.tx.claimSet(set).ok) return;
    playCoins(5);
    this.setStatus(`The collectors' club pays ${set.reward} coins for "${set.name}". Well done!`);
    this.refresh();
  }
}
