import type { Game, GameStatus, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, PLATFORMS, getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import { escapeHtml } from './html';
import './CollectionEditor.css';

const STATUSES: GameStatus[] = ['owned', 'wishlist', 'lent'];
const SEARCH_DEBOUNCE_MS = 250;

export interface CollectionEditorOptions {
  /**
   * Whether games can be added straight from the index (and the list reset to the built-in one).
   * Off in the game proper: games are bought at the market. On with `?debug` in the URL.
   */
  canAdd?: boolean;
}

/**
 * Full-screen overlay to manage the collection: browse by platform, change statuses, remove games,
 * export/import JSON and, when `canAdd` is on, add new ones from the libretro-thumbnails index.
 * Plain DOM; binds no global keys — the Session decides which key toggles it.
 */
export class CollectionEditor {
  private readonly root: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly extrasEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly resultsEl: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly platformSelect: HTMLSelectElement;
  private readonly fileInput: HTMLInputElement;
  private searchTimer: number | undefined;
  private searchSeq = 0;
  private lastResults: IndexMatch[] = [];

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    { canAdd = false }: CollectionEditorOptions = {},
  ) {
    this.root = document.createElement('section');
    this.root.className = 'collection-editor';
    this.root.hidden = true;
    this.root.classList.toggle('collection-editor--no-add', !canAdd);
    this.root.innerHTML = `
      <header class="collection-editor__header">
        <h2>Collection</h2>
        <span class="collection-editor__count"></span>
        <div class="collection-editor__actions">
          <button type="button" data-action="export">Export JSON</button>
          <button type="button" data-action="import">Import JSON</button>
          ${canAdd ? '<button type="button" data-action="reset">Reset to built-in list</button>' : ''}
          <button type="button" data-action="close">Close</button>
        </div>
      </header>
      <div class="collection-editor__status"></div>
      <div class="collection-editor__extras" hidden></div>
      <div class="collection-editor__body">
        <div class="collection-editor__pane" ${canAdd ? '' : 'hidden'}>
          <h3>Add a game</h3>
          <div class="collection-editor__search">
            <input type="search" placeholder="Search box art by title…" autocomplete="off" spellcheck="false" />
            <select data-role="platform">
              <option value="">All platforms</option>
              ${PLATFORM_LIST.map((p) => `<option value="${p.id}">${escapeHtml(p.shortName)}</option>`).join('')}
            </select>
          </div>
          <div class="collection-editor__scroll" data-role="results"></div>
          <p class="collection-editor__hint">Names come from libretro-thumbnails; the box art appears on the shelf once added.</p>
        </div>
        <div class="collection-editor__pane">
          <h3>Your games</h3>
          <div class="collection-editor__scroll" data-role="list"></div>
        </div>
      </div>
      <input type="file" accept="application/json,.json" hidden />`;
    container.appendChild(this.root);

    this.countEl = this.root.querySelector('.collection-editor__count')!;
    this.statusEl = this.root.querySelector('.collection-editor__status')!;
    this.extrasEl = this.root.querySelector('.collection-editor__extras')!;
    this.listEl = this.root.querySelector('[data-role="list"]')!;
    this.resultsEl = this.root.querySelector('[data-role="results"]')!;
    this.searchInput = this.root.querySelector('input[type="search"]')!;
    this.platformSelect = this.root.querySelector('[data-role="platform"]')!;
    this.fileInput = this.root.querySelector('input[type="file"]')!;

    this.bindEvents();
    store.subscribe(() => {
      if (this.isOpen) this.renderCollection();
    });
    this.renderCollection();
  }

  /** Assigned by the Session so closing from the editor's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    // The editor needs a free cursor; leaving pointer lock also makes the Overlay show its start card
    // underneath, which is the expected state once the editor closes.
    if (document.pointerLockElement) document.exitPointerLock();
    this.root.hidden = false;
    this.renderCollection();
    this.searchInput.focus();
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.setStatus('');
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Hosts a small settings block from another feature (e.g. the cat) in a strip under the header. */
  addPanel(title: string, content: HTMLElement): void {
    const panel = document.createElement('section');
    panel.className = 'collection-editor__extra';
    const heading = document.createElement('h3');
    heading.textContent = title;
    panel.append(heading, content);
    this.extrasEl.appendChild(panel);
    this.extrasEl.hidden = false;
  }

  // --- events ---------------------------------------------------------------------------------

  private bindEvents(): void {
    // Typing in the search box must not move the player: keep key events away from the window-level
    // Input. Escape is let through so the Session can close the editor with it.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }

    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const { action, id, result } = button.dataset;
      switch (action) {
        case 'close': return this.close();
        case 'export': return this.exportFile();
        case 'import': return this.fileInput.click();
        case 'reset': return this.resetToSeed();
        case 'remove': return this.removeGame(id!);
        case 'add': return this.addResult(Number(result));
      }
    });

    this.root.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.fileInput) return void this.importFile();
      if (target === this.platformSelect) return this.scheduleSearch(0);
      const select = target.closest<HTMLSelectElement>('select[data-action="status"]');
      if (select) this.store.setStatus(select.dataset.id!, select.value as GameStatus);
    });

    this.searchInput.addEventListener('input', () => this.scheduleSearch(SEARCH_DEBOUNCE_MS));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.scheduleSearch(0);
    });
  }

  // --- collection pane ------------------------------------------------------------------------

  private renderCollection(): void {
    const games = this.store.games;
    this.countEl.textContent = `${games.length} game${games.length === 1 ? '' : 's'}${this.store.isPersisted || !games.length ? '' : ' (built-in list)'}`;

    const groups = new Map<PlatformId, Game[]>();
    for (const g of games) {
      const list = groups.get(g.platform) ?? [];
      list.push(g);
      groups.set(g.platform, list);
    }

    if (games.length === 0) {
      this.listEl.innerHTML = this.root.classList.contains('collection-editor--no-add')
        ? '<p class="collection-editor__empty">No games yet. Go out through the front door: the market sells them, the arcade pays for them.</p>'
        : '<p class="collection-editor__empty">No games yet. Search on the left to add some.</p>';
      return;
    }
    this.listEl.innerHTML = PLATFORM_LIST
      .filter((p) => groups.has(p.id))
      .map((p) => {
        const list = groups.get(p.id)!.slice().sort((a, b) => a.title.localeCompare(b.title));
        return `
          <section class="collection-editor__group">
            <h4 class="collection-editor__group-title">
              <span class="collection-editor__swatch" style="background:${hexColor(p.accentColor)}"></span>
              ${escapeHtml(p.name)} <span class="collection-editor__meta">${list.length}</span>
            </h4>
            ${list.map((g) => this.renderGameRow(g)).join('')}
          </section>`;
      })
      .join('');
    // Re-render the results too: their "Add"/"Added" state depends on the collection.
    if (this.lastResults.length) this.renderResults(this.lastResults);
  }

  private renderGameRow(g: Game): string {
    const status = g.status ?? 'owned';
    return `
      <div class="collection-editor__row">
        <span class="collection-editor__title" title="${escapeHtml(g.externalIds?.libretroName ?? g.title)}">${escapeHtml(g.title)}</span>
        ${g.region ? `<span class="collection-editor__meta">${escapeHtml(g.region)}</span>` : ''}
        <span class="collection-editor__badge collection-editor__badge--${status}">${status}</span>
        <select data-action="status" data-id="${escapeHtml(g.id)}" aria-label="Status">
          ${STATUSES.map((s) => `<option value="${s}"${s === status ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
        <button type="button" data-action="remove" data-id="${escapeHtml(g.id)}" title="Remove from collection">Remove</button>
      </div>`;
  }

  private removeGame(id: string): void {
    const game = this.store.find(id);
    this.store.remove(id);
    if (game) this.setStatus(`Removed "${game.title}".`);
  }

  private resetToSeed(): void {
    if (!window.confirm('Discard your changes and go back to the built-in list?')) return;
    this.store.resetToSeed();
    this.setStatus('Collection reset to the built-in list.');
  }

  // --- search pane ----------------------------------------------------------------------------

  private scheduleSearch(delayMs: number): void {
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.runSearch(), delayMs);
  }

  private async runSearch(): Promise<void> {
    const query = this.searchInput.value.trim();
    const platform = (this.platformSelect.value || undefined) as PlatformId | undefined;
    const seq = ++this.searchSeq;
    if (query.length < 2) {
      this.lastResults = [];
      this.resultsEl.innerHTML = '';
      return;
    }
    this.resultsEl.innerHTML = '<p class="collection-editor__empty">Searching…</p>';
    try {
      const results = await this.index.search(query, platform);
      if (seq !== this.searchSeq) return; // superseded
      this.lastResults = results;
      this.renderResults(results);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.lastResults = [];
      this.resultsEl.innerHTML = `<p class="collection-editor__empty">Could not load the index: ${escapeHtml(String(err))}</p>`;
    }
  }

  private renderResults(results: IndexMatch[]): void {
    if (results.length === 0) {
      this.resultsEl.innerHTML = '<p class="collection-editor__empty">No box art matches that title.</p>';
      return;
    }
    this.resultsEl.innerHTML = results
      .map((r, i) => {
        const id = gameIdFor(r.platform, r.name);
        const owned = this.store.has(id);
        return `
          <div class="collection-editor__row">
            <span class="collection-editor__title" title="${escapeHtml(r.name)}">${escapeHtml(r.title)}</span>
            ${r.region ? `<span class="collection-editor__meta">${escapeHtml(r.region)}</span>` : ''}
            <span class="collection-editor__meta">${escapeHtml(getPlatform(r.platform).shortName)}</span>
            <button type="button" data-action="add" data-result="${i}" ${owned ? 'disabled' : ''}>${owned ? 'Added' : 'Add'}</button>
          </div>`;
      })
      .join('');
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
    a.download = `bibliothek-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setStatus(`Exported ${this.store.games.length} games.`);
  }

  private async importFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    try {
      this.store.importJson(await file.text());
      this.setStatus(`Imported ${this.store.games.length} games from ${file.name}.`);
    } catch (err) {
      this.setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('collection-editor__status--error', isError);
  }
}

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
