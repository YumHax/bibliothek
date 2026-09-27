import { batch } from '@/persistence';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { goodsOf, homeGood, type HomeGood, type HomeShop } from '@/economy/homeGoods';
import { playCoins } from '@/audio/coins';
import { MarketPanel, coinsHtml, escapeHtml } from './market/MarketPanel';

/** The purse a shop takes coins from. */
export interface ShopWallet {
  readonly coins: number;
  spend(coins: number): boolean;
  subscribe(cb: () => void): () => void;
}

/** What each shop's panel says at its top. */
const SHOP_TITLES: Record<HomeShop, { title: string; blurb: string }> = {
  market: { title: 'Household stall', blurb: 'Furniture for the flat.' },
  furniture: { title: 'Second-hand furniture', blurb: 'Everything for a bare flat, carried up the stairs the moment it is paid for.' },
  electronics: { title: 'TV repair', blurb: 'Screens, speakers and the odd appliance, tested on the bench and delivered today.' },
  florist: { title: 'The florist', blurb: 'Plants for every room, and pots for the balcony.' },
  pets: { title: 'The pet shop', blurb: 'A rescue cat looking for a home, and what it needs.' },
};

/**
 * A shop's counter for the flat (`HOME_GOODS` of one `HomeShop`): each piece with its price, how many are at home
 * against how many the flat has room for, and one button. Bought, the coins go and the piece stands at home at once
 * (`HomeUpgrades.add`; the flat's plans place it). `forShop` picks the shop before the Session opens the panel.
 */
export class HomeShopPanel extends MarketPanel {
  private shop: HomeShop = 'furniture';
  private readonly unsubscribe: () => void;

  constructor(container: HTMLElement, private readonly deps: { wallet: ShopWallet; upgrades: HomeUpgrades }) {
    super(container, deps.wallet, { title: SHOP_TITLES.furniture.title, className: 'home-shop', blurb: SHOP_TITLES.furniture.blurb });
    this.unsubscribe = deps.upgrades.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
  }

  /** Takes the panel out of the page (the street unloaded). */
  dispose(): void {
    this.close();
    this.unsubscribe();
    this.root.remove();
  }

  /** The shop whose goods the panel shows next time it opens; returns the panel (for `session.openPanel`). */
  forShop(shop: HomeShop): this {
    this.shop = shop;
    const { title, blurb } = SHOP_TITLES[shop];
    this.setTitle(title, blurb);
    return this;
  }

  protected render(): void {
    const { upgrades, wallet } = this.deps;
    this.body.innerHTML = goodsOf(this.shop).map((good) => {
      const owned = upgrades.count(good.id);
      const status = this.statusOf(good);
      const count = good.max > 1 ? `<span class="catalogue__meta">${owned} / ${good.max} at home</span>` : '';
      const disabled = status !== 'buy' || wallet.coins < good.price;
      const label = status === 'full' ? (good.max > 1 ? 'No more room' : 'At home') : status === 'needs' ? `Needs the ${escapeHtml(homeGood(good.requires!).name.toLowerCase())}` : wallet.coins < good.price ? 'Too dear' : 'Buy';
      return `
        <div class="catalogue__row">
          <span class="catalogue__title"><b>${escapeHtml(good.name)}</b> <span class="catalogue__meta">${escapeHtml(good.blurb)}</span></span>
          ${count}
          ${coinsHtml(good.price)}
          <button type="button" class="ui-btn ui-btn--primary" data-action="buy" data-id="${good.id}" ${disabled ? 'disabled' : ''}>${label}</button>
        </div>`;
    }).join('');
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action !== 'buy') return;
    const good = goodsOf(this.shop).find((g) => g.id === el.dataset.id);
    if (!good || this.statusOf(good) !== 'buy') return;
    const { wallet, upgrades } = this.deps;
    const paid = batch(() => {
      if (!wallet.spend(good.price)) return false;
      upgrades.add(good.id);
      return true;
    });
    if (!paid) {
      this.setStatus(`${good.name}: ${good.price} coins, and you have ${wallet.coins}.`, true);
      return;
    }
    playCoins(Math.min(8, Math.max(2, Math.round(good.price / 20))));
    this.setStatus(good.id === 'cat' ? 'Adopted! The cat is waiting at home, by its bowls.' : `${good.name} bought for ${good.price} coins: it is at home already.`);
    this.refresh();
  }

  /** Whether `good` can be bought: 'buy', 'full' (as many at home as there is room for) or 'needs' (what it goes with first). */
  private statusOf(good: HomeGood): 'buy' | 'full' | 'needs' {
    const { upgrades } = this.deps;
    if (upgrades.count(good.id) >= good.max) return 'full';
    return upgrades.canBuy(good.id) ? 'buy' : 'needs';
  }
}
