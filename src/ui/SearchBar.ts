import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { fuzzyMatch, highlightHtml } from './fuzzy';
import { escapeHtml } from './html';
import './SearchBar.css';

const MAX_RESULTS = 6;

export interface SearchBarEvents {
  /** The user picked a game (Enter or click). The bar closes itself first. */
  onSelect?(game: Game): void;
  /** The bar was closed without a selection (Esc, or `close()`). */
  onCancel?(): void;
}

interface Result {
  game: Game;
  titleHtml: string;
  meta: string;
}

/**
 * Quick search field at the top of the screen. Fuzzy-matches the title and platform of the games
 * handed to `open()`, shows up to 6 results; ArrowUp/Down moves, Enter selects, Esc closes.
 * Keyboard events are read on the input itself (the only place raw `keydown` is allowed).
 */
export class SearchBar {
  readonly events: SearchBarEvents = {};

  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private games: readonly Game[] = [];
  private results: Result[] = [];
  private active = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'search-bar';
    this.root.hidden = true;
    this.root.innerHTML = `
      <input class="search-bar__input" type="text" placeholder="Search a game or a platform…" autocomplete="off" spellcheck="false" />
      <ul class="search-bar__results"></ul>
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
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Opens the bar over `games` and focuses the field. Calling it while open just refreshes the list. */
  open(games: readonly Game[]): void {
    this.games = games;
    this.root.hidden = false;
    this.input.value = '';
    this.refresh();
    // Focus after the opening key's default action would have typed into the field.
    requestAnimationFrame(() => this.input.focus());
  }

  /** Closes without selecting (fires onCancel when it was open). */
  close(): void {
    if (!this.isOpen) return;
    this.hide();
    this.events.onCancel?.();
  }

  private hide(): void {
    this.root.hidden = true;
    this.input.blur();
    this.results = [];
    this.list.replaceChildren();
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
    if (!query) {
      this.list.replaceChildren();
      return;
    }
    if (!this.results.length) {
      this.list.innerHTML = `<li class="search-bar__empty">No game matches “${escapeHtml(query)}”</li>`;
      return;
    }
    this.list.innerHTML = this.results
      .map(
        (r, i) => `<li class="search-bar__item${i === this.active ? ' search-bar__item--active' : ''}" data-index="${i}">
          <span>${r.titleHtml}</span><span class="search-bar__meta">${escapeHtml(r.meta)}</span></li>`,
      )
      .join('');
  }

  private move(delta: number): void {
    if (!this.results.length) return;
    this.active = (this.active + delta + this.results.length) % this.results.length;
    this.list
      .querySelectorAll<HTMLLIElement>('li[data-index]')
      .forEach((li, i) => li.classList.toggle('search-bar__item--active', i === this.active));
  }

  private select(index: number): void {
    const result = this.results[index];
    if (!result) return;
    this.hide();
    this.events.onSelect?.(result.game);
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
