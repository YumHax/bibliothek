import type { Game, GameStatus, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, PLATFORMS, getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import { Arming } from './confirmTwice';
import { ConfirmDialog } from './panel/ConfirmDialog';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { coverImg, emptyState, gameRow } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { fileStamp } from '@/text/clock';
import { formatCount } from '@/text/count';
import { compareTitles, matchesSearch } from '@/text/strings';
import { formatCoins } from '@/text/money';
import './CollectionEditor.css';

const STATUSES: GameStatus[] = ['owned', 'wishlist', 'lent'];

/** How the list is ordered: by console (in groups), by title, by what was paid (dearest first), by arrival (newest first). */
type SortBy = 'platform' | 'title' | 'paid' | 'added';
const SORTS: ReadonlyArray<{ id: SortBy; label: string }> = [
  { id: 'platform', label: 'Console' },
  { id: 'title', label: 'Title' },
  { id: 'paid', label: 'Price paid' },
  { id: 'added', label: 'Newest' },
];

interface CollectionEditorOptions {
  /**
   * The editor's own powers: games added straight from the index, statuses changed, games removed, the list exported,
   * imported and reset to the built-in one. Off in the game proper (games are bought at the market, the save file is in
   * Settings > Game): the list only reads. On with `?debug` in the URL.
   */
  canAdd?: boolean;
  /** A game's front cover (a thumbnail per row). */
  coverUrl?: (game: Game) => string | undefined;
  /** "Show on shelf": the list closes and the room points at the box (`Browse`'s search). */
  onShow?: (game: Game) => void;
}

/**
 * The collection, as a sheet: every game with its cover, found by the search field, ordered by console, title, price
 * paid or arrival, each with its receipt (where, when, for how much) and "Show on shelf"; a wished-for game can be
 * taken off the wishlist. With `canAdd` (`?debug`) it is the editor: change statuses, remove games (two presses),
 * export and import JSON (the import asks first: it replaces the collection), add new ones from the
 * libretro-thumbnails index through the search field, reset the list to the built-in one (asked first).
 * Plain DOM; binds no global keys — the Session decides which key toggles it (Tab), and Tab inside it closes it too
 * while the search field is empty (the panel keeps its keys from the window, so the Session's Tab never hears that
 * one); in the list Tab moves between the controls.
 */
export class CollectionEditor extends SheetPanel {
  private readonly canAdd: boolean;
  private readonly fileInput: HTMLInputElement;
  private readonly dialog: ConfirmDialog;
  private readonly removing = new Arming(() => this.renderCollection());
  private searchSeq = 0;
  private lastResults: IndexMatch[] = [];
  private sort: SortBy = 'platform';
  private readonly coverUrl: CollectionEditorOptions['coverUrl'];
  private readonly onShow: CollectionEditorOptions['onShow'];

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    { canAdd = false, coverUrl, onShow }: CollectionEditorOptions = {},
  ) {
    super(container, {
      title: 'Collection',
      className: `collection-editor${canAdd ? '' : ' collection-editor--no-add'}`,
      search: { placeholder: canAdd ? 'Search box art by title…' : 'Find a game on your shelves…', platforms: true },
      headerActions: canAdd
        ? [
            { action: 'export', label: 'Export JSON' },
            { action: 'import', label: 'Import JSON' },
            { action: 'reset', label: 'Reset to built-in list' },
          ]
        : [],
    });
    this.canAdd = canAdd;
    this.coverUrl = coverUrl;
    this.onShow = onShow;
    this.dialog = new ConfirmDialog(container);
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.hidden = true;
    this.root.appendChild(this.fileInput);
    this.listen(this.fileInput, 'change', () => void this.importFile());
    this.listen(this.root, 'change', (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-action="status"]');
      if (select) this.store.setStatus(select.dataset.id!, select.value as GameStatus);
    });
    store.subscribe(() => {
      if (this.isOpen) this.renderCollection();
    });
  }

  protected override onOpened(): void {
    this.removing.reset();
    super.onOpened();
  }

  /**
   * Tab closes the list from where it opened (the search field still empty, or the sheet itself), as it opened it (the
   * key stops here, so the Session never sees it); anywhere else Tab moves between the controls like on any panel.
   */
  protected override onKey(e: KeyboardEvent): void {
    if (e.code !== 'Tab' || e.shiftKey) return;
    const at = document.activeElement;
    const fromStart = at === this.root || at === document.body || (at === this.searchInput && !this.query);
    if (!fromStart) return;
    e.preventDefault();
    if (!e.repeat) this.close(); // a Tab still held from opening it must not shut it again
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { id, result } = el.dataset;
    switch (action) {
      case 'export': return this.exportFile();
      case 'import': return void this.askImport();
      case 'reset': return void this.askReset();
      case 'remove': return this.removeGame(id!);
      case 'add': return this.addResult(Number(result));
      case 'sort': return this.sortBy(el.dataset.sort as SortBy);
      case 'show': return this.show(id!);
      case 'drop-wish': return this.dropWish(id!);
      default: return;
    }
  }

  /** With the editor the field searches the index; the list itself follows it either way. */
  protected override onSearch(query: string, platform: PlatformId | undefined): void {
    if (this.canAdd) void this.runSearch(query, platform);
    this.renderCollection();
  }

  private sortBy(sort: SortBy): void {
    if (!SORTS.some((s) => s.id === sort) || sort === this.sort) return;
    this.sort = sort;
    this.renderCollection();
  }

  /** The list closes, and the room points at the box (the search's glow, the player turned towards it). */
  private show(id: string): void {
    const game = this.store.find(id);
    if (!game || !this.onShow) return;
    this.close();
    this.onShow(game);
  }

  private dropWish(id: string): void {
    const game = this.store.find(id);
    if (!game) return;
    this.store.dropWish(id);
    this.setStatus(`"${game.title}" is off your wishlist.`);
  }

  // --- the panes --------------------------------------------------------------------------------

  /** Both panes: the index's results (with `canAdd`) and the collection by platform. */
  protected render(): void {
    paint(
      this.body,
      html`<div class="collection-editor__body">
        <div class="collection-editor__pane ui-card"${attr('hidden', !this.canAdd)}>
          <h3>Add a game</h3>
          <div class="collection-editor__scroll" data-role="results"></div>
          <p class="collection-editor__hint">Names come from libretro-thumbnails; the box art appears on the shelf once added.</p>
        </div>
        <div class="collection-editor__pane ui-card">
          <div class="collection-editor__list-head">
            <h3>Your games</h3>
            <div class="collection-editor__sort" role="radiogroup" aria-label="Order">
              <span class="collection-editor__meta">Order by</span>
              ${SORTS.map((s) => html`<button type="button" class="ui-btn ui-btn--sm" role="radio" data-action="sort" data-sort="${s.id}" aria-checked="${s.id === this.sort}">${s.label}</button>`)}
            </div>
          </div>
          <div class="collection-editor__scroll" data-role="list"></div>
        </div>
      </div>`,
    );
    this.renderCollection();
    if (this.lastResults.length) this.renderResults(this.lastResults);
  }

  private get listEl(): HTMLElement | null {
    return this.body.querySelector<HTMLElement>('[data-role="list"]');
  }

  private get resultsEl(): HTMLElement | null {
    return this.body.querySelector<HTMLElement>('[data-role="results"]');
  }

  private renderCollection(): void {
    const listEl = this.listEl;
    if (!listEl) return;
    const all = this.store.games;
    const owned = all.filter((g) => g.status !== 'wishlist').length;
    const wished = all.length - owned;
    this.setTitle('Collection', `${formatCount(owned, 'game')}${wished ? `, ${wished} wished for` : ''}${this.store.isPersisted || !all.length ? '' : ' (built-in list)'}`);
    for (const button of this.body.querySelectorAll<HTMLElement>('[data-action="sort"]')) button.setAttribute('aria-checked', String(button.dataset.sort === this.sort));

    // The search field narrows the list (with the editor it also searches the index).
    const query = this.query;
    const platform = this.platform;
    const games = all.filter((g) => (!platform || g.platform === platform) && (!query || matchesSearch(g.title, query)));
    if (all.length && !games.length) {
      paint(listEl, emptyState('None of your games matches that.', 'collection-editor__empty'));
      return;
    }
    if (this.sort !== 'platform') {
      const restoreFocus = rememberFocus(listEl);
      paint(listEl, html`${sortGames(games, this.sort).map((g) => this.gameRow(g, true))}`);
      restoreFocus();
      if (this.lastResults.length) this.renderResults(this.lastResults);
      return;
    }

    const groups = new Map<PlatformId, Game[]>();
    for (const g of games) {
      const list = groups.get(g.platform) ?? [];
      list.push(g);
      groups.set(g.platform, list);
    }

    if (games.length === 0) {
      paint(
        listEl,
        emptyState(
          this.canAdd ? 'No games yet. Search above to add some.' : 'No games yet. Go out through the front door: the market sells them, the arcade pays for them.',
          'collection-editor__empty',
        ),
      );
      return;
    }
    const restoreFocus = rememberFocus(listEl);
    paint(
      listEl,
      html`${PLATFORM_LIST.filter((p) => groups.has(p.id)).map((p) => {
        const list = groups.get(p.id)!.slice().sort((a, b) => compareTitles(a.title, b.title));
        return html`<section class="collection-editor__group">
            <h4 class="collection-editor__group-title">
              <span class="collection-editor__swatch" style="background:${hexColor(p.accentColor)}"></span>
              ${p.name} <span class="collection-editor__meta">${list.length}</span>
            </h4>
            ${list.map((g) => this.gameRow(g, false))}
          </section>`;
      })}`,
    );
    restoreFocus();
    // Re-render the results too: their "Add"/"Added" state depends on the collection.
    if (this.lastResults.length) this.renderResults(this.lastResults);
  }

  /** A game in the list: read-only in the game proper (its receipt, "Show on shelf"), the editor's controls with `canAdd`. */
  private gameRow(g: Game, withPlatform: boolean): Html {
    if (!this.canAdd) return this.readRow(g, withPlatform);
    const status = g.status ?? 'owned';
    const armed = this.removing.isArmed(g.id);
    return html`<div class="collection-editor__row">
        ${coverImg(this.coverUrl?.(g), g, 'catalogue__cover collection-editor__cover')}
        <span class="collection-editor__title">${g.title}</span>
        ${g.region ? html`<span class="collection-editor__meta">${g.region}</span>` : ''}
        <span class="collection-editor__badge collection-editor__badge--${status}">${status}</span>
        <select data-action="status" data-id="${g.id}" aria-label="Status">
          ${STATUSES.map((s) => html`<option value="${s}"${attr('selected', s === status)}>${s}</option>`)}
        </select>
        <button type="button" class="ui-btn${armed ? ' ui-btn--danger' : ''}" data-action="remove" data-id="${g.id}" aria-label="Remove ${g.title} from the collection">${armed ? 'Sure? Remove' : 'Remove'}</button>
      </div>`;
  }

  /** The game proper's row: cover, title, where it stands, the receipt; "Show on shelf", "Not wanted" for a wish. */
  private readRow(g: Game, withPlatform: boolean): Html {
    const status = g.status ?? 'owned';
    const paid = g.acquired;
    const receipt = paid ? `${paid.price ? formatCoins(paid.price) : 'free'}, ${paid.where}, day ${paid.day}` : undefined;
    return gameRow({
      id: g.id,
      cover: coverImg(this.coverUrl?.(g), g),
      title: g.title,
      metas: [
        withPlatform && getPlatform(g.platform).shortName,
        g.region,
        status === 'wishlist' && html`<span class="collection-editor__badge collection-editor__badge--wishlist ui-badge">on your wishlist</span>`,
        status === 'lent' && html`<span class="collection-editor__badge collection-editor__badge--lent ui-badge">lent out</span>`,
        receipt,
      ],
      tail: html`${status !== 'lent' && this.onShow ? html`<button type="button" class="ui-btn" data-action="show" data-id="${g.id}">Show on shelf</button>` : ''}${
        status === 'wishlist' ? html`<button type="button" class="ui-btn" data-action="drop-wish" data-id="${g.id}">Not wanted</button>` : ''
      }`,
    });
  }

  /** Two presses: the first arms the row's button, the second takes the game out (`confirmTwice`). */
  private removeGame(id: string): void {
    if (!this.removing.press(id)) return;
    const game = this.store.find(id);
    this.store.remove(id);
    if (game) this.setStatus(`Removed "${game.title}".`);
  }

  /** Destroying what is there asks first (no browser dialog: it would freeze the page and the controller). */
  private async askReset(): Promise<void> {
    const yes = await this.dialog.ask({ title: 'Reset the collection?', text: 'Your changes go; the built-in list comes back.', confirm: 'Reset', danger: true });
    if (!yes) return;
    this.store.resetToSeed();
    this.setStatus('Collection reset to the built-in list.');
  }

  // --- the search pane ------------------------------------------------------------------------

  private async runSearch(query: string, platform: PlatformId | undefined): Promise<void> {
    const resultsEl = this.resultsEl;
    const seq = ++this.searchSeq;
    if (query.length < 2) {
      this.lastResults = [];
      if (resultsEl) paint(resultsEl, html``);
      return;
    }
    if (resultsEl) paint(resultsEl, emptyState('Searching…', 'collection-editor__empty'));
    try {
      const results = await this.index.search(query, platform);
      if (seq !== this.searchSeq) return; // superseded
      this.lastResults = results;
      this.renderResults(results);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.lastResults = [];
      console.warn('[collection] the index could not be read', err);
      if (this.resultsEl) paint(this.resultsEl, emptyState('The box-art index isn’t answering. Try again in a moment.', 'collection-editor__empty'));
    }
  }

  private renderResults(results: IndexMatch[]): void {
    const resultsEl = this.resultsEl;
    if (!resultsEl) return;
    if (results.length === 0) {
      paint(resultsEl, emptyState('No box art matches that title.', 'collection-editor__empty'));
      return;
    }
    const restoreFocus = rememberFocus(resultsEl);
    paint(
      resultsEl,
      html`${results.map((r, i) => {
        const owned = this.store.has(gameIdFor(r.platform, r.name));
        return html`<div class="collection-editor__row">
            <span class="collection-editor__title">${r.title}</span>
            ${r.region ? html`<span class="collection-editor__meta">${r.region}</span>` : ''}
            <span class="collection-editor__meta">${getPlatform(r.platform).shortName}</span>
            <button type="button" class="ui-btn" data-action="add" data-result="${i}"${attr('disabled', owned)}>${owned ? 'Added' : 'Add'}</button>
          </div>`;
      })}`,
    );
    restoreFocus();
  }

  private addResult(i: number): void {
    const r = this.lastResults[i];
    if (!r) return;
    const game: Game = {
      id: gameIdFor(r.platform, r.name),
      title: r.title,
      platform: r.platform,
      region: r.region,
      status: 'owned',
      addedAt: new Date().toISOString(),
      externalIds: { libretroName: r.name },
    };
    this.store.add(game);
    this.setStatus(`Added "${game.title}" (${PLATFORMS[game.platform].shortName}).`);
  }

  // --- import / export ------------------------------------------------------------------------

  private exportFile(): void {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bibliothek-collection-${fileStamp(new Date())}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setStatus(`Exported ${this.store.games.length} games.`);
  }

  /** An import replaces the collection: asked first, then the file picker (the dialog's press is the gesture it needs). */
  private async askImport(): Promise<void> {
    const yes = await this.dialog.ask({ title: 'Import a collection?', text: 'The games in the file replace your collection. Export first to keep a copy.', confirm: 'Choose a file', danger: true });
    if (yes) this.fileInput.click();
  }

  private async importFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    try {
      this.store.importJson(await file.text());
      this.setStatus(`Imported ${this.store.games.length} games from ${file.name}.`);
    } catch (err) {
      this.setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }
}

/** The list in one run, by title, by what was paid (dearest first, gifts last) or by arrival (newest first). */
function sortGames(games: readonly Game[], sort: Exclude<SortBy, 'platform'>): Game[] {
  const byTitle = (a: Game, b: Game): number => compareTitles(a.title, b.title);
  const list = games.slice();
  if (sort === 'title') return list.sort(byTitle);
  if (sort === 'paid') return list.sort((a, b) => (b.acquired?.price ?? -1) - (a.acquired?.price ?? -1) || byTitle(a, b));
  return list.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || byTitle(a, b));
}

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
