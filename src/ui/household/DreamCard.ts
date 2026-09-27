import type { Game } from '@/catalog/types';
import type { Dream } from '@/household/dreams';
import { escapeHtml } from '../html';
import './household.css';

/** How long the card stays on waking, ms. */
const SHOWN_MS = 8000;

/**
 * A night's dream, on waking: a blurred cover, the title half remembered, where it lay. A HUD card
 * (not a panel: it takes neither keys nor the mouse), gone after a few seconds or on a click.
 */
export class DreamCard {
  private readonly root: HTMLElement;
  private timer = 0;

  constructor(container: HTMLElement, private readonly coverUrl: (game: Game) => string | undefined) {
    this.root = document.createElement('aside');
    this.root.className = 'dream-card ui-card';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());
    container.appendChild(this.root);
  }

  show(dream: Dream): void {
    const cover = this.coverUrl(dream.game);
    this.root.innerHTML = `
      ${cover ? `<img class="dream-card__cover" src="${escapeHtml(cover)}" alt="">` : ''}
      <div>
        <p class="dream-card__kicker">Last night you dreamt of…</p>
        <p class="dream-card__title">${escapeHtml(dream.game.title)}</p>
        <p class="dream-card__where">${escapeHtml(dream.where)}. ${escapeHtml(dream.line)}</p>
        <p class="dream-card__hint">It felt like this very morning.</p>
      </div>`;
    this.root.querySelector('img')?.addEventListener('error', (e) => (e.target as HTMLElement).remove());
    this.root.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), SHOWN_MS);
  }

  hide(): void {
    this.root.hidden = true;
  }
}
