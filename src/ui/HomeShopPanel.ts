import { batch } from '@/persistence';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { goodsOf, homeGood, type HomeGood, type HomeShop } from '@/economy/homeGoods';
import { playCoins } from '@/audio/coins';
import { homeGoodPhoto } from '@/thumbnails/homeGoodPhotos';
import { MarketPanel, escapeHtml } from './market/MarketPanel';
import './HomeShopPanel.css';

/** The purse a shop takes coins from. */
export interface ShopWallet {
  readonly coins: number;
  spend(coins: number): boolean;
  subscribe(cb: () => void): () => void;
}

/** What each shop's leaflet says at its top: its name and a line under it. */
const SHOP_TITLES: Record<HomeShop, { title: string; blurb: string }> = {
  market: { title: 'Household stall', blurb: 'Furniture for the flat.' },
  furniture: { title: 'Second-hand furniture', blurb: 'Everything for a bare flat, carried up the stairs the moment it is paid for.' },
  electronics: { title: 'TV repair', blurb: 'Screens, speakers and the odd appliance, tested on the bench and delivered today.' },
  florist: { title: 'The florist', blurb: 'Plants for every room, and pots for the balcony.' },
  pets: { title: 'The pet shop', blurb: 'A rescue cat looking for a home, and what it needs.' },
};

/**
 * A shop's counter for the flat (`HOME_GOODS` of one `HomeShop`), laid out as the shop's own printed leaflet: a card per
 * piece with a studio photo of it as the flat will have it (`thumbnails/homeGoodPhotos`), its line, how many of its
 * spots at home are filled, its price on a swing tag and one button; a piece at home gets the shop's stamp. Each shop
 * prints on its own paper (`data-shop` on the root). Bought, the coins go and the piece stands at home at once
 * (`HomeUpgrades.add`; the flat's plans place it). `forShop` picks the shop before the Session opens the panel.
 */
export class HomeShopPanel extends MarketPanel {
  private shop: HomeShop = 'furniture';
  private readonly unsubscribe: () => void;
  private readonly photos = new Map<string, string>();

  constructor(container: HTMLElement, private readonly deps: { wallet: ShopWallet; upgrades: HomeUpgrades }) {
    super(container, deps.wallet, { title: SHOP_TITLES.furniture.title, className: 'home-shop', blurb: SHOP_TITLES.furniture.blurb });
    this.root.dataset.shop = this.shop;
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
    this.root.dataset.shop = shop;
    const { title, blurb } = SHOP_TITLES[shop];
    this.setTitle(title, blurb);
    return this;
  }

  protected onOpened(): void {
    super.onOpened();
    this.loadPhotos();
  }

  protected render(): void {
    this.body.innerHTML = goodsOf(this.shop).map((good) => this.cardHtml(good)).join('');
  }

  private cardHtml(good: HomeGood): string {
    const { upgrades, wallet } = this.deps;
    const owned = upgrades.count(good.id);
    const status = this.statusOf(good);
    const dear = wallet.coins < good.price;
    const disabled = status !== 'buy' || dear;
    const needs = status === 'needs' ? homeGood(good.requires!).name.toLowerCase() : null;
    const label = status === 'full' ? (good.max > 1 ? 'No more room' : 'At home') : needs ? `Needs the ${escapeHtml(needs)}` : dear ? `${good.price - wallet.coins} short` : good.id === 'cat' ? 'Adopt' : 'Buy';
    const url = this.photos.get(good.id);
    const stamp = status === 'full' ? (good.id === 'cat' ? 'Adopted' : good.max > 1 ? 'All placed' : 'At home') : '';
    return `
      <article class="shop__item${status === 'full' ? ' shop__item--done' : ''}${needs ? ' shop__item--locked' : ''}">
        <div class="shop__photo${url ? ' shop__photo--ready' : ''}">
          <img data-photo="${good.id}" alt="" ${url ? `src="${url}"` : ''} />
          ${stamp ? `<span class="shop__stamp">${stamp}</span>` : ''}
        </div>
        <div class="shop__text">
          <h3>${escapeHtml(good.name)}</h3>
          <p>${escapeHtml(good.blurb)}</p>
          ${good.max > 1 ? spotsHtml(owned, good.max) : ''}
        </div>
        <div class="shop__buy">
          <span class="shop__tag">${good.price}<span class="shop__coin" aria-label="coins"></span></span>
          <button type="button" class="shop__btn" data-action="buy" data-id="${good.id}" ${disabled ? 'disabled' : ''}>${label}</button>
        </div>
      </article>`;
  }

  /** Asks the studio for each piece's photo; each drops into its card as it comes. */
  private loadPhotos(): void {
    for (const good of goodsOf(this.shop)) {
      if (this.photos.has(good.id)) continue;
      homeGoodPhoto(good.id).then((url) => {
        this.photos.set(good.id, url);
        for (const img of this.body.querySelectorAll<HTMLImageElement>(`img[data-photo="${CSS.escape(good.id)}"]`)) {
          img.src = url;
          img.parentElement?.classList.add('shop__photo--ready');
        }
      }, () => {});
    }
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

/** A dot per spot at home the piece can stand in, filled for those it stands in already. */
function spotsHtml(owned: number, max: number): string {
  const dots = Array.from({ length: max }, (_, i) => `<i${i < owned ? ' class="on"' : ''}></i>`).join('');
  return `<p class="shop__spots" aria-label="${owned} of ${max} at home"><span>${dots}</span>${owned} of ${max} at home</p>`;
}
