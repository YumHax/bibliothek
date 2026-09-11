import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatReleaseDate } from '@/catalog/format';
import { CONTROLS } from './controls';
import { escapeHtml } from './html';

const HOLDING_HINTS = CONTROLS.filter((c) => c.whileHolding).map((c) => c.html).join(' · ');

/** Side panel with the details of the game currently held by the Inspector. */
export class GamePanel {
  private readonly root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'game-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(game: Game): void {
    const platform = getPlatform(game.platform);
    const rows: Array<[string, string | undefined]> = [
      ['Platform', platform.name],
      ['Released', formatReleaseDate(game.releaseDate)],
      ['Developer', game.developer],
      ['Publisher', game.publisher],
      ['Genre', game.genre],
      ['Region', game.region],
    ];
    this.root.innerHTML = `
      <h2>${escapeHtml(game.title)}</h2>
      <dl>
        ${rows
          .filter(([, v]) => v)
          .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v!)}</dd>`)
          .join('')}
      </dl>
      ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}
      <footer>${HOLDING_HINTS}</footer>`;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
