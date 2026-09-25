import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatReleaseDate } from '@/catalog/format';
import { describeEdition } from '@/economy/pricing';
import { CONTROLS } from './controls';
import { escapeHtml } from './html';

const HOLDING_HINTS = CONTROLS.filter((c) => c.whileHolding).map((c) => c.html).join(' · ');

/** What the panel adds for a copy that is not the player's yet (a market box): rows on top, a line of text, and its own key hints. */
export interface PanelExtra {
  rows?: Array<[string, string]>;
  /** Plain text, shown highlighted under the rows. */
  note?: string;
  /** HTML (trusted, built from constants) replacing the usual holding hints. */
  hints?: string;
}

/** Side panel with the details of the game currently held by the Inspector. */
export class GamePanel {
  private readonly root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'game-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  show(game: Game, extra: PanelExtra = {}): void {
    const platform = getPlatform(game.platform);
    // A copy of the player's own (no market rows): its edition, its receipt, and the truth about a fake.
    const own = !extra.rows;
    const edition = own ? describeEdition(game.edition, game.platform) : '';
    const bought = own && game.acquired ? `${game.acquired.price} coins, ${game.acquired.where} (market day ${game.acquired.day})` : undefined;
    const note = extra.note ?? (own && game.repro ? 'A reproduction, sadly: the label is a print. Worth next to nothing.' : undefined);
    const rows: Array<[string, string | undefined]> = [
      ...(extra.rows ?? []),
      ['Edition', edition ? edition[0]!.toUpperCase() + edition.slice(1) : undefined],
      ['Bought for', bought],
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
      ${note ? `<p class="game-panel__note">${escapeHtml(note)}</p>` : ''}
      ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}
      <footer>${extra.hints ?? HOLDING_HINTS}</footer>`;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
