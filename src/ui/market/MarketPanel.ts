import { SheetPanel, type PanelWallet, type SheetPanelOptions } from '../panel/SheetPanel';
import './market.css';

export type { PanelWallet };

/**
 * A market panel: a sheet (`panel/SheetPanel`) with the coins in the pocket in its header, on the market's look
 * (market.css). The haggle, the job lot, the swap, the notice board, the home shop, the collector's book and the
 * neighbours' trade are market panels; what they share beyond the wallet is the sheet's.
 */
export abstract class MarketPanel extends SheetPanel {
  constructor(container: HTMLElement, protected readonly wallet: PanelWallet, options: Pick<SheetPanelOptions, 'title' | 'className' | 'blurb' | 'search'>) {
    super(container, { ...options, wallet, className: `market-panel ${options.className}` });
  }
}
