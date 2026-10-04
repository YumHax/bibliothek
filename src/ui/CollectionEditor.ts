import type { Game, GameStatus, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, PLATFORMS, getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import { Arming } from './confirmTwice';
import { ConfirmDialog } from './panel/ConfirmDialog';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { emptyState } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { fileStamp } from '@/text/clock';
import { formatCount } from '@/text/count';
import { compareTitles } from '@/text/strings';
import './CollectionEditor.css';

const STATUSES: GameStatus[] = ['owned', 'wishlist', 'lent'];

interface CollectionEditorOptions {
  /**
   * Whether games can be added straight from the index (and the list reset to the built-in one).
   * Off in the game proper: games are bought at the market. On with `?debug` in the URL.
   */
  canAdd?: boolean;
}

/**
 * The collection, as a sheet: browse by platform, change statuses, remove games (two presses), export and import
 * JSON (the import asks first: it replaces the collection) and, when `canAdd` is on, add new ones from the
 * libretro-thumbnails index through the sheet's search field (and reset the list to the built-in one, asked first).
 * Plain DOM; binds no global keys — the Session decides which key toggles it (Tab), and Tab inside it closes it too
 * (the panel keeps its keys from the window, so the Session's Tab never hears that one).
 */
export class CollectionEditor extends SheetPanel {
  private readonly canAdd: boolean;
  private readonly fileInput: HTMLInputElement;
  private readonly dialog: ConfirmDialog;
  private readonly removing = new Arming(() => this.renderCollection());
  private searchSeq = 0;
  private lastResults: IndexMatch[] = [];

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    { canAdd = false }: CollectionEditorOptions = {},
  ) {
    super(container, {
      title: 'Collection',
      className: `collection-editor${canAdd ? '' : ' collection-editor--no-add'}`,
      search: canAdd ? { placeholder: 'Search box art by title…', platforms: true } : undefined,
      headerActions: [
        { action: 'export', label: 'Export JSON' },
        { action: 'import', label: 'Import JSON' },
        ...(canAdd ? [{ action: 'reset', label: 'Reset to built-in list' }] : []),
      ],
    });
    this.canAdd = canAdd;
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

  /** Tab closes the editor from inside, as it opened it (the key stops here, so the Session never sees it). */
  protected override onKey(e: KeyboardEvent): void {
    if (e.code !== 'Tab') return;
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
      default: return;
    }
  }

  protected override onSearch(query: string, platform: PlatformId | undefined): void {
    void this.runSearch(query, platform);
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
          <h3>Your games</h3>
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
    const games = this.store.games;
    this.setTitle('Collection', `${formatCount(games.length, 'game')}${this.store.isPersisted || !games.length ? '' : ' (built-in list)'}`);

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
            ${list.map((g) => this.gameRow(g))}
          </section>`;
      })}`,
    );
    restoreFocus();
    // Re-render the results too: their "Add"/"Added" state depends on the collection.
    if (this.lastResults.length) this.renderResults(this.lastResults);
  }

  private gameRow(g: Game): Html {
    const status = g.status ?? 'owned';
    const armed = this.removing.isArmed(g.id);
    return html`<div class="collection-editor__row">
        <span class="collection-editor__title">${g.title}</span>
        ${g.region ? html`<span class="collection-editor__meta">${g.region}</span>` : ''}
        <span class="collection-editor__badge collection-editor__badge--${status}">${status}</span>
        <select data-action="status" data-id="${g.id}" aria-label="Status">
          ${STATUSES.map((s) => html`<option value="${s}"${attr('selected', s === status)}>${s}</option>`)}
        </select>
        <button type="button" class="ui-btn${armed ? ' ui-btn--danger' : ''}" data-action="remove" data-id="${g.id}" aria-label="Remove ${g.title} from the collection">${armed ? 'Sure? Remove' : 'Remove'}</button>
      </div>`;
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
      if (this.resultsEl) paint(this.resultsEl, emptyState(`Could not load the index: ${String(err)}`, 'collection-editor__empty'));
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

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
