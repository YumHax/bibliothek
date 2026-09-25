import type { PayoutStats } from '@/economy/PayoutStats';
import { escapeHtml } from './html';
import './PayoutOverlay.css';

/**
 * `?payout`: a small table in the corner with the player's real plays per arcade machine (plays,
 * average score, average tickets, tickets a minute, the best earner first), for tuning `PAYOUT`
 * in `pricing.ts`. Follows the stats live; Reset clears them. A developer's tool, not a panel of
 * the game: it never takes the mouse (only its button does).
 */
export class PayoutOverlay {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly stats: PayoutStats,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'payout-overlay';
    this.root.innerHTML = `
      <header><strong>Arcade payout</strong><button type="button" data-action="reset">Reset</button></header>
      <table><thead><tr><th>machine</th><th>plays</th><th>avg score</th><th>avg tix</th><th>tix/min</th></tr></thead><tbody></tbody></table>
      <p>Retune <code>PAYOUT</code> in pricing.ts when one machine pays far more a minute than the rest.</p>`;
    container.appendChild(this.root);
    this.body = this.root.querySelector('tbody')!;
    this.root.querySelector('[data-action="reset"]')!.addEventListener('click', () => stats.clear());
    stats.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const rows = this.stats.rows();
    this.body.innerHTML = rows.length
      ? rows
          .map((r) => `<tr><td>${escapeHtml(r.gameId)}</td><td>${r.plays}</td><td>${Math.round(r.avgScore).toLocaleString('en-US')}</td><td>${r.avgTickets.toFixed(1)}</td><td>${r.ticketsPerMinute.toFixed(0)}</td></tr>`)
          .join('')
      : '<tr><td colspan="5">No plays yet: go and play something.</td></tr>';
  }
}
