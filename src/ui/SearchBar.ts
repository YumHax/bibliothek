import type { Game } from '@/catalog/types';
import { Listeners } from '@/core/Listeners';
import { getPlatform } from '@/catalog/platforms';
import { fuzzyMatch, highlightHtml } from './fuzzy';
import { escapeHtml } from './html';
import { fadeIn, fadeOut } from './fade';
import './SearchBar.css';

const MAX_RESULTS = 6;

interface Result {
  game: Game;
  titleHtml: string;
  meta: string;
}

/**
 * Quick search field at the top of the screen. Fuzzy-matches the title and platform of the games
 * handed to `open()`, shows up to 6 results; ArrowUp/Down moves, Enter selects, Esc closes.
 * Keyboard events are read on the input itself (the only place raw `keydown` is allowed). A combobox
 * over a listbox for screen readers (`aria-activedescendant` follows the active line); it fades in and out.
 */
export class SearchBar {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private games: readonly Game[] = [];
  private results: Result[] = [];
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

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'search-bar';
    this.root.hidden = true;
    this.root.innerHTML = `
      <input class="search-bar__input" type="text" placeholder="Search a game or a platform…" autocomplete="off" spellcheck="false"
        role="combobox" aria-label="Search a game or a platform" aria-autocomplete="list" aria-expanded="false" aria-controls="search-bar-results" />
      <ul class="search-bar__results" id="search-bar-results" role="listbox" aria-label="Games found"></ul>
      <p class="search-bar__help"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> go to it · <kbd>Esc</kbd> close</p>`;
    this.input = this.root.querySelector('input')!;
    this.list = this.root.querySelector('ul')!;
    container.appendChild(this.root);

    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', this.onKeyDown);
    this.list.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (!li) return;
      e.preventDefault();
      this.select(Number(li.dataset.index));
    });
    // A free cursor (a touchscreen, a mouse after Esc): the line under it is the active one.
    this.list.addEventListener('mousemove', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-index]');
      if (li && Number(li.dataset.index) !== this.active) this.setActive(Number(li.dataset.index));
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Opens the bar over `games` and focuses the field. Calling it while open just refreshes the list. */
  open(games: readonly Game[]): void {
    this.games = games;
    this.shown = true;
    fadeIn(this.root, 'search-bar--closing');
    this.input.value = '';
    this.refresh();
    // Focus after the opening key's default action would have typed into the field.
    requestAnimationFrame(() => this.input.focus());
  }

  /** Closes without selecting (fires onCancel when it was open). */
  close(): void {
    if (!this.isOpen) return;
    this.hide();
    this.cancelListeners.emit();
  }

  private hide(): void {
    this.shown = false;
    this.input.blur();
    this.results = [];
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
        titleHtml: highlightHtml(game.title, title?.positions ?? []),
        meta: [platform.shortName, game.releaseDate?.slice(0, 4)].filter(Boolean).join(' · '),
      });
    }
    scored.sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title));
    this.results = query ? scored.slice(0, MAX_RESULTS) : [];
    this.active = 0;
    this.render(query);
  }

  private render(query: string): void {
    this.input.setAttribute('aria-expanded', String(!!query && this.results.length > 0));
    this.input.removeAttribute('aria-activedescendant');
    if (!query) {
      this.list.replaceChildren();
      return;
    }
    if (!this.results.length) {
      this.list.innerHTML = `<li class="search-bar__empty" role="option" aria-disabled="true">No game matches “${escapeHtml(query)}”</li>`;
      return;
    }
    this.list.innerHTML = this.results
      .map(
        (r, i) => `<li class="search-bar__item${i === this.active ? ' search-bar__item--active' : ''}" id="search-bar-result-${i}" role="option" aria-selected="${i === this.active}" data-index="${i}">
          <span>${r.titleHtml}</span><span class="search-bar__meta">${escapeHtml(r.meta)}</span></li>`,
      )
      .join('');
    this.input.setAttribute('aria-activedescendant', `search-bar-result-${this.active}`);
  }

  private move(delta: number): void {
    if (!this.results.length) return;
    this.setActive((this.active + delta + this.results.length) % this.results.length);
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

  private select(index: number): void {
    const result = this.results[index];
    if (!result) return;
    this.hide();
    this.selectListeners.emit(result.game);
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
        this.select(this.active);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  };
}
