import { SheetPanel, type PanelWallet, type SheetPanelOptions } from '../panel/SheetPanel';
import { html, paint } from '../panel/html';
import { formatCoins } from '@/text/money';
import './market.css';

export type { PanelWallet };

interface MarketPanelOptions extends Pick<SheetPanelOptions, 'title' | 'className' | 'blurb' | 'search' | 'dismiss'> {
  /**
   * At a stall rather than at a desk: no full-screen sheet but the stall's own moment over the room, lightly dimmed
   * (the crate, the tag, the cork at their own size, centred, under the stall's striped awning with the title painted
   * on it), the coins as a purse chip on the awning's corner that bumps when they change.
   */
  scene?: boolean;
}

/**
 * A market panel: a sheet (`panel/SheetPanel`) with the coins in the pocket in its header, on the market's look
 * (market.css). The haggle, the job lot, the swap and the notice board are stall scenes (`scene`); the home shop,
 * the collector's book and the neighbours' trade are sheets. What they share beyond the purse is the sheet's.
 */
export abstract class MarketPanel extends SheetPanel {
  private purseEl: HTMLElement | null = null;
  private shownCoins: number | null = null;

  constructor(container: HTMLElement, protected readonly wallet: PanelWallet, options: MarketPanelOptions) {
    const { scene, ...sheet } = options;
    // A scene shows the purse itself (a chip, not "N coins in your pocket"): the sheet is given no wallet.
    super(container, { ...sheet, wallet: scene ? undefined : wallet, className: `market-panel${scene ? ' market-panel--scene' : ''} ${options.className}` });
    if (!scene) return;
    const purse = document.createElement('span');
    purse.className = 'market-scene__purse';
    this.root.querySelector('.catalogue__actions')?.before(purse);
    this.purseEl = purse;
    const unsubscribe = wallet.subscribe(() => {
      this.paintPurse();
      if (this.isOpen) this.refresh();
    });
    this.signal.addEventListener('abort', unsubscribe);
    this.paintPurse();
  }

  /** The purse chip: the coin and the count; a change bumps it (a spend dips, a gain lifts). */
  private paintPurse(): void {
    const el = this.purseEl;
    if (!el) return;
    const coins = this.wallet.coins;
    const before = this.shownCoins;
    this.shownCoins = coins;
    paint(el, html`<span class="market-scene__coin" aria-hidden="true"></span><span class="market-scene__coins">${formatCoins(coins)}</span>`);
    el.setAttribute('aria-label', `${formatCoins(coins)} in your pocket`);
    if (before === null || before === coins) return;
    el.classList.remove('market-scene__purse--spent', 'market-scene__purse--earned');
    void el.offsetWidth;
    el.classList.add(coins < before ? 'market-scene__purse--spent' : 'market-scene__purse--earned');
  }
}
