import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import { plannedFilm, putOnFilm } from '@/building/yardCinema';
import { compareTitles, matchesSearch } from '@/text/strings';
import { SheetPanel } from './panel/SheetPanel';
import { html, paint, type Html } from './panel/html';
import { coverImg, emptyState, gameRow } from './panel/widgets';
import { rememberFocus } from './rememberFocus';

/**
 * The film night's pick (the sheet in the courtyard, `building/yardCinema`): the player's games, one of which goes
 * on the sheet; its longplay is the film. Picking one puts it on (the board says so) and closes the sheet.
 */
export class ScreeningPanel extends SheetPanel {
  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly today: { readonly gameDay: number },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, {
      title: 'Film night',
      blurb: 'Which of your games goes up on the sheet?',
      className: 'screening',
      search: { placeholder: 'Filter your collection…' },
    });
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'show' || !el.dataset.id) return;
    const game = this.store.find(el.dataset.id);
    if (!game) return;
    putOnFilm(game, this.today.gameDay);
    this.close();
  }

  protected render(): void {
    const query = this.query;
    const games = this.store.games.filter((g) => g.status !== 'wishlist' && matchesSearch(g.title, query)).sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) {
      paint(this.body, emptyState(query ? 'Nothing by that name in your collection.' : 'No games yet to show.'));
      return;
    }
    const on = plannedFilm()?.id;
    const restoreFocus = rememberFocus(this.body);
    paint(this.body, html`${games.map((game) => this.row(game, game.id === on))}`);
    restoreFocus();
  }

  private row(game: Game, on: boolean): Html {
    return gameRow({
      id: game.id,
      cover: coverImg(this.coverUrl?.(game)),
      title: game.title,
      metas: [getPlatform(game.platform).shortName, game.releaseDate?.slice(0, 4)],
      tail: on ? html`<span class="catalogue__meta">Tonight’s film</span>` : html`<button type="button" class="ui-btn" data-action="show" data-id="${game.id}">Show this one</button>`,
    });
  }
}
