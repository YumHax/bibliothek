import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { compareTitles, matchesSearch } from '@/text/strings';
import { formatCoins } from '@/text/money';
import { SheetPanel } from '../panel/SheetPanel';
import { html, paint, type Html } from '../panel/html';
import { coverImg, emptyState, gameRow } from '../panel/widgets';
import { rememberFocus } from '../rememberFocus';

/** What the stall's wrapping is dealt before the Session opens it. */
interface WrapDeal {
  /** The games of the collection that may be given (owned, not a keepsake). */
  games(): readonly Game[];
  /** Whether `id` is wrapped already. */
  isWrapped(id: string): boolean;
  /** The paper's price. */
  price: number;
  /** Wraps `game`: null when done, else why not (the wallet short, the paper all used). */
  wrap(game: Game): string | null;
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * The Christmas stall's gift wrapping on Front Street (`street/events/ChristmasStall`, `holidays/giftWrap`): the
 * player's games, one of which goes into paper and ribbon for a friend; given wrapped (a conversation's "A game…"),
 * it means more to them. A wrapped one says so instead of its button.
 */
export class WrapPanel extends SheetPanel {
  private deal: WrapDeal | null = null;

  constructor(container: HTMLElement) {
    super(container, {
      title: 'Gift wrapping',
      blurb: 'Which of your games goes into paper and ribbon, to give to someone?',
      className: 'wrap-panel',
      search: { placeholder: 'Filter your collection…' },
    });
  }

  /** Deals the games (call before the Session opens the panel). */
  show(deal: WrapDeal): void {
    this.deal = deal;
    if (this.isOpen) this.render();
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const deal = this.deal;
    if (action !== 'wrap' || !deal || !el.dataset.id) return;
    const game = deal.games().find((g) => g.id === el.dataset.id);
    if (!game) return;
    const why = deal.wrap(game);
    if (why) {
      this.setStatus(why, 'error');
      return;
    }
    this.setStatus(`${game.title} is wrapped. Give it to someone in a conversation.`, 'ok');
    this.render();
  }

  protected render(): void {
    const deal = this.deal;
    const query = this.query;
    const games = (deal?.games() ?? []).filter((g) => matchesSearch(g.title, query)).sort((a, b) => compareTitles(a.title, b.title));
    if (!deal || !games.length) {
      paint(this.body, emptyState(query ? 'Nothing by that name in your collection.' : 'No games of yours to give yet.'));
      return;
    }
    const restoreFocus = rememberFocus(this.body);
    paint(this.body, html`${games.map((game) => this.row(deal, game))}`);
    restoreFocus();
  }

  private row(deal: WrapDeal, game: Game): Html {
    const wrapped = deal.isWrapped(game.id);
    return gameRow({
      id: game.id,
      cover: coverImg(deal.coverUrl?.(game)),
      title: game.title,
      metas: [getPlatform(game.platform).shortName, game.releaseDate?.slice(0, 4)],
      tail: wrapped ? html`<span class="catalogue__meta">Wrapped</span>` : html`<button type="button" class="ui-btn" data-action="wrap" data-id="${game.id}">Wrap it · ${formatCoins(deal.price)}</button>`,
    });
  }
}
