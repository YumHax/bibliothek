import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import { plannedFilm, putOnFilm } from '@/building/yardCinema';
import { compareTitles, matchesSearch } from '@/text/strings';
import { playUiSound } from '@/audio/uiSounds';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { coverImg, emptyState } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import './ScreeningPanel.css';

/** How long the pick stays lit on the sheet before the panel goes. */
const PICKED_MS = 1400;

/**
 * The film night's pick (the sheet in the courtyard, `building/yardCinema`): a night yard with the bedsheet strung
 * up at the top, the projector's beam on it showing the game pointed at as a poster, and the player's games under
 * it as ticket stubs. Picking one puts it on (the board says so): its poster flickers up on the sheet with
 * "Tonight, at dusk", then the panel goes.
 */
export class ScreeningPanel extends SheetPanel {
  private readonly stage: HTMLElement;
  /** The game picked, while its poster holds on the sheet before closing. */
  private picked: Game | null = null;
  private closeTimer: number | undefined;

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly today: { readonly gameDay: number },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, {
      title: 'Film night in the yard',
      blurb: 'The sheet is up on the workshop wall. Which of your games goes on it? It plays at dusk, the first dry evening.',
      className: 'screening',
      search: { placeholder: 'Look through your games…' },
      dismiss: 'Not tonight',
    });
    this.stage = document.createElement('div');
    this.stage.className = 'screening__stage';
    this.root.querySelector('.catalogue__status')?.before(this.stage);
    // The game pointed at goes up on the sheet as a poster.
    const point = (e: Event): void => {
      const stub = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-id]');
      if (stub?.dataset.id && !this.picked) this.paintStage(this.store.find(stub.dataset.id) ?? null);
    };
    this.listen(this.body, 'focusin', point);
    this.listen(this.body, 'pointerover', point);
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onOpened(): void {
    window.clearTimeout(this.closeTimer);
    this.picked = null;
    super.onOpened();
    const on = plannedFilm();
    this.paintStage(on ? (this.store.find(on.id) ?? null) : null);
  }

  protected override onClosed(): void {
    window.clearTimeout(this.closeTimer);
    this.picked = null;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'show' || !el.dataset.id || this.picked) return;
    const game = this.store.find(el.dataset.id);
    if (!game) return;
    putOnFilm(game, this.today.gameDay);
    this.picked = game;
    this.paintStage(game, true);
    this.render();
    playUiSound('pick');
    this.setStatus(`Up on the board in the hall: ${game.title}, tonight at dusk.`, 'ok');
    this.closeTimer = window.setTimeout(() => this.close(), PICKED_MS);
  }

  /** The bedsheet: the game's poster in the beam (its title under it), or the blank sheet waiting. */
  private paintStage(game: Game | null, picked = false): void {
    const on = plannedFilm()?.id;
    const tonight = picked || (!!game && game.id === on);
    paint(
      this.stage,
      html`<div class="screening__sheet${picked ? ' screening__sheet--picked' : ''}${game ? '' : ' screening__sheet--blank'}">
        ${game
          ? html`<span class="screening__poster">${coverImg(this.coverUrl?.(game), game, 'screening__poster-img')}</span>
              <span class="screening__billing"><span class="screening__bill-title">${game.title}</span>${tonight ? html`<span class="screening__tonight">Tonight, at dusk</span>` : html`<span class="screening__bill-meta">${getPlatform(game.platform).shortName}${game.releaseDate ? `, ${game.releaseDate.slice(0, 4)}` : ''}</span>`}</span>`
          : html`<span class="screening__blank-line">Point at a game to see it on the sheet</span>`}
      </div>
      <span class="screening__beam" aria-hidden="true"></span>`,
    );
  }

  protected render(): void {
    const query = this.query;
    const games = this.store.games.filter((g) => g.status !== 'wishlist' && matchesSearch(g.title, query)).sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) {
      paint(
        this.body,
        query
          ? emptyState('Nothing by that name on your shelves.', { pictogram: 'magnifier', title: 'No such film' })
          : emptyState('Bring a game home first: its longplay is the film.', { pictogram: 'film', title: 'Nothing to show yet' }),
      );
      return;
    }
    const on = plannedFilm()?.id;
    const restoreFocus = rememberFocus(this.body);
    paint(this.body, html`<ul class="screening__stubs">${games.map((game, i) => this.stub(game, game.id === on, i === 0))}</ul>`);
    restoreFocus();
  }

  /** A ticket stub: the cover, the title and console, and the press that puts it on (the one on tonight says so). */
  private stub(game: Game, on: boolean, first: boolean): Html {
    return html`<li class="screening__stub${on ? ' screening__stub--on' : ''}" data-id="${game.id}">
      <button type="button" class="screening__stub-btn" data-action="${on ? 'noop' : 'show'}" data-id="${game.id}"${attr('data-autofocus', first)}${on ? html` aria-current="true"` : ''}>
        ${coverImg(this.coverUrl?.(game), game, 'screening__stub-cover catalogue__cover')}
        <span class="screening__stub-text"><span class="screening__stub-title">${game.title}</span><span class="screening__stub-meta">${getPlatform(game.platform).shortName}${game.genre ? ` · ${game.genre}` : ''}</span></span>
        <span class="screening__stub-verb">${on ? 'Tonight’s film' : 'Show this one'}</span>
      </button>
    </li>`;
  }
}
