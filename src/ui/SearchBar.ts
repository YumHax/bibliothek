import type { Game } from '@/catalog/types';
import { Listeners } from '@/core/Listeners';
import { getPlatform } from '@/catalog/platforms';
import { fuzzyMatch, highlightHtml } from './fuzzy';
import { fadeIn, fadeOut } from './fade';
import { compareTitles } from '@/text/strings';
import { html, paint, raw, type Html } from './panel/html';
import { coverImg } from './panel/widgets';
import { LetterPad } from './panel/letterPad';
import { registerPanel } from './menu/MenuNav';
import { lastDevice } from '@/input/lastDevice';
import './SearchBar.css';

/** Lines shown at first; "Show N more" opens the rest, up to `MAX_RESULTS`. */
const FIRST_RESULTS = 6;
const MAX_RESULTS = 30;

interface Result {
  game: Game;
  titleHtml: Html;
  meta: string;
}

interface SearchBarOptions {
  /** A game's front cover, for the little picture beside each line (none: the line goes without). */
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * Quick search field at the top of the screen. Fuzzy-matches the title and platform of the games handed to `open()`,
 * shows the best few with their covers ("Show N more" lists the rest); ArrowUp/Down moves, Enter selects, Esc closes.
 * Keyboard events are read on the input itself. A controller gets letters on screen (`panel/letterPad`): the D-pad
 * walks the keys and the lines, A types or picks, B closes. A combobox over a listbox for screen readers
 * (`aria-activedescendant` follows the active line); it fades in and out.
 */
export class SearchBar {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly help: HTMLElement;
  private readonly pad: LetterPad;
  private games: readonly Game[] = [];
  private results: Result[] = [];
  /** Every match, best first; `results` is the share of it shown. */
  private matches: Result[] = [];
  private expanded = false;
  private active = 0;
  private readonly selectListeners = new Listeners<[game: Game]>();
  private readonly cancelListeners = new Listeners<[]>();
  /** Open (the bar fades out after closing, so `hidden` lags behind). */
  private shown = false;

  /** Calls `listener` with the game picked (Enter or click; the bar closes itself first); returns the unsubscribe. */
  onSelect(listener: (game: Game) => void): () => void {
    return this.selectListeners.add(listener);
  }

  /** Calls `listener` when the bar closes without a selection (Esc, or `close()`); returns the unsubscribe. */
  onCancel(listener: () => void): () => void {
    return this.cancelListeners.add(listener);
  }

  constructor(container: HTMLElement, private readonly options: SearchBarOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'search-bar';
    this.root.hidden = true;
    paint(
      this.root,
      html`<input class="search-bar__input" type="text" placeholder="Search a game or a platform…" autocomplete="off" spellcheck="false"
        role="combobox" aria-label="Search a game or a platform" aria-autocomplete="list" aria-expanded="false" aria-controls="search-bar-results" />
      <ul class="search-bar__results" id="search-bar-results" role="listbox" aria-label="Games found"></ul>
      <p class="search-bar__help"></p>`,
    );
    this.input = this.root.querySelector('input')!;
    this.list = this.root.querySelector('ul')!;
    this.help = this.root.querySelector('.search-bar__help')!;
    this.pad = new LetterPad({ field: this.input });
    this.pad.element.classList.add('search-bar__pad');
    this.pad.visible = false;
    this.root.insertBefore(this.pad.element, this.help);
    container.appendChild(this.root);

    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', this.onKeyDown); // convention-ok: a text field's own arrows and Enter
    this.list.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (!li) return;
      e.preventDefault();
      this.choose(Number(li.dataset.index));
    });
    // A controller's A on the focused line arrives as a click.
    this.list.addEventListener('click', (e) => {
      // A real pointer's click was already taken on its mousedown (which may have re-rendered the list under it).
      if (e.detail > 0) return;
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (li) this.choose(Number(li.dataset.index));
    });
    // A free cursor (a touchscreen, a mouse after Esc): the line under it is the active one.
    this.list.addEventListener('mousemove', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (li && Number(li.dataset.index) !== this.active) this.setActive(Number(li.dataset.index));
    });
    registerPanel(this.root, { isOpen: () => this.isOpen, onBack: () => this.close(), onMove: (direction) => this.padMove(direction) });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Opens the bar over `games` and focuses the field (a controller: the first letter). Calling it while open just refreshes the list. */
  open(games: readonly Game[]): void {
    this.games = games;
    this.shown = true;
    fadeIn(this.root, 'search-bar--closing');
    this.input.value = '';
    const pad = lastDevice() === 'gamepad';
    this.pad.visible = pad;
    paint(this.help, pad ? html`<kbd>A</kbd> type · <kbd>B</kbd> close` : html`<kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> go to it · <kbd>Esc</kbd> close`);
    this.refresh();
    // Focus after the opening key's default action would have typed into the field.
    requestAnimationFrame(() => (pad ? this.pad.focusFirst() : this.input.focus()));
  }

  /** Closes without selecting (fires onCancel when it was open). */
  close(): void {
    if (!this.isOpen) return;
    this.hide();
    this.cancelListeners.emit();
  }

  private hide(): void {
    this.shown = false;
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.results = [];
    this.matches = [];
    this.input.removeAttribute('aria-activedescendant');
    this.input.setAttribute('aria-expanded', 'false');
    fadeOut(this.root, 'search-bar--closing', 140, () => this.list.replaceChildren());
  }

  private refresh(): void {
    const query = this.input.value.trim();
    const scored: Array<Result & { score: number }> = [];
    for (const game of this.games) {
      const platform = getPlatform(game.platform);
      const title = fuzzyMatch(query, game.title);
      const plat = fuzzyMatch(query, `${platform.shortName} ${platform.name}`);
      if (!title && !plat) continue;
      const score = Math.max(title?.score ?? -Infinity, (plat?.score ?? -Infinity) * 0.8);
      scored.push({
        game,
        score,
        titleHtml: raw(highlightHtml(game.title, title?.positions ?? [])),
        meta: [platform.shortName, game.releaseDate?.slice(0, 4)].filter(Boolean).join(' · '),
      });
    }
    scored.sort((a, b) => b.score - a.score || compareTitles(a.game.title, b.game.title));
    this.matches = query ? scored.slice(0, MAX_RESULTS) : [];
    this.expanded = false;
    this.active = 0;
    this.render(query);
  }

  private render(query: string): void {
    this.results = this.expanded ? this.matches : this.matches.slice(0, FIRST_RESULTS);
    this.input.setAttribute('aria-expanded', String(!!query && this.results.length > 0));
    this.input.removeAttribute('aria-activedescendant');
    if (!query) {
      this.list.replaceChildren();
      return;
    }
    if (!this.results.length) {
      paint(this.list, html`<li class="search-bar__empty" role="option" aria-disabled="true">No game matches “${query}”</li>`);
      return;
    }
    const hidden = this.matches.length - this.results.length;
    paint(
      this.list,
      html`${this.results.map(
        (r, i) => html`<li class="search-bar__item${i === this.active ? ' search-bar__item--active' : ''}" id="search-bar-result-${i}" role="option" tabindex="-1" aria-selected="${i === this.active ? 'true' : 'false'}" data-index="${i}">
          ${coverImg(this.options.coverUrl?.(r.game), r.game, 'search-bar__cover')}<span class="search-bar__title">${r.titleHtml}</span><span class="search-bar__meta">${r.meta}</span></li>`,
      )}${hidden > 0 ? html`<li class="search-bar__item search-bar__more" id="search-bar-result-${this.results.length}" role="option" tabindex="-1" aria-selected="false" data-index="${this.results.length}">Show ${hidden} more</li>` : ''}`,
    );
    this.input.setAttribute('aria-activedescendant', `search-bar-result-${this.active}`);
  }

  /** How many lines can be the active one: the games shown, and "Show N more" when it is there. */
  private get lines(): number {
    return this.results.length + (this.matches.length > this.results.length ? 1 : 0);
  }

  private move(delta: number): void {
    if (!this.lines) return;
    this.setActive((this.active + delta + this.lines) % this.lines);
  }

  /** The active line: highlighted, told to screen readers, and scrolled into view. */
  private setActive(index: number): void {
    this.active = index;
    this.list.querySelectorAll<HTMLLIElement>('li[data-index]').forEach((li, i) => {
      const on = i === index;
      li.classList.toggle('search-bar__item--active', on);
      li.setAttribute('aria-selected', String(on));
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
    this.input.setAttribute('aria-activedescendant', `search-bar-result-${index}`);
  }

  /** The line `index` pressed: a game goes to its box, "Show N more" lists the rest. */
  private choose(index: number): void {
    if (index === this.results.length && this.matches.length > this.results.length) {
      const focusedLine = this.list.contains(document.activeElement);
      this.expanded = true;
      this.render(this.input.value.trim());
      this.setActive(Math.min(index, this.results.length - 1));
      if (focusedLine) this.lineAt(this.active)?.focus({ preventScroll: true });
      return;
    }
    this.select(index);
  }

  private select(index: number): void {
    const result = this.results[index];
    if (!result) return;
    this.hide();
    this.selectListeners.emit(result.game);
  }

  private lineAt(index: number): HTMLElement | null {
    return this.list.querySelector<HTMLElement>(`li[data-index="${index}"]`);
  }

  /**
   * A controller's D-pad: the keys walk in their grid; up off the top row reaches the lines found (the active one),
   * up and down walk them, down off the last comes back to the keys. False leaves it to the panel's walk.
   */
  private padMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (!this.pad.visible) return false;
    const onLine = this.list.contains(document.activeElement);
    if (onLine) {
      if (direction === 'left' || direction === 'right') return true;
      if (direction === 'down' && this.active >= this.lines - 1) this.pad.focusFirst();
      else if (direction === 'up' && this.active === 0) this.input.focus({ preventScroll: true });
      else {
        this.move(direction === 'down' ? 1 : -1);
        this.lineAt(this.active)?.focus({ preventScroll: true });
      }
      return true;
    }
    if (this.pad.move(direction)) return true;
    if (direction === 'up' && this.pad.element.contains(document.activeElement)) {
      const line = this.lines ? this.lineAt(this.active) : null;
      (line ?? this.input).focus({ preventScroll: true });
      return true;
    }
    if (direction === 'down' && document.activeElement === this.input) {
      const line = this.lines ? this.lineAt(this.active) : null;
      if (line) line.focus({ preventScroll: true });
      else this.pad.focusFirst();
      return true;
    }
    return false;
  }

  /** A game picked elsewhere (the collection list's "Show on shelf"): found on the shelves as if searched here. */
  pick(game: Game): void {
    this.selectListeners.emit(game);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowDown':
        e.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.move(-1);
        break;
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        this.choose(this.active);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  };
}
