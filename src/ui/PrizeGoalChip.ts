import './PrizeGoalChip.css';
import type { Prize } from '@/economy/Prizes';
import { html, paint } from './panel/html';

/** The wallet's tickets, and a way to hear them change. */
interface TicketsView {
  readonly tickets: number;
  subscribe(cb: () => void): () => void;
}

/** The pinned prize, and a way to hear it change (`economy/PrizeGoal`). */
interface GoalView {
  readonly prize: Prize | null;
  subscribe(cb: () => void): () => void;
}

/**
 * The prize pinned at the counter, riding the wallet chip after the tickets (`WalletHud.addItem`): its photo, greyed,
 * fills with colour from the bottom as the tickets come in, and glows with a "Ready" once the pocket covers it. No
 * numbers: the picture says how near it is. Gone while nothing is pinned.
 */
export class PrizeGoalChip {
  readonly element: HTMLSpanElement;
  private readonly lit: HTMLImageElement;
  private readonly dim: HTMLImageElement;
  private shown: string | null = null;

  constructor(
    private readonly wallet: TicketsView,
    private readonly goal: GoalView,
    private readonly photo: (prize: Prize) => Promise<string>,
  ) {
    this.element = document.createElement('span');
    this.element.className = 'prize-goal';
    this.element.hidden = true;
    paint(
      this.element,
      html`<span class="wallet-hud__sep"></span>
        <span class="prize-goal__pic"><img class="prize-goal__dim" alt="" /><img class="prize-goal__lit" alt="" /></span>
        <span class="prize-goal__ready">Ready</span>`,
    );
    this.dim = this.element.querySelector('.prize-goal__dim')!;
    this.lit = this.element.querySelector('.prize-goal__lit')!;
    wallet.subscribe(() => this.draw());
    goal.subscribe(() => this.draw());
    this.draw();
  }

  private draw(): void {
    const prize = this.goal.prize;
    this.element.hidden = !prize;
    if (!prize?.tickets) return;
    if (this.shown !== prize.id) {
      this.shown = prize.id;
      this.dim.removeAttribute('src');
      this.lit.removeAttribute('src');
      this.photo(prize).then((url) => {
        if (this.shown !== prize.id) return;
        this.dim.src = url;
        this.lit.src = url;
      }, () => {});
    }
    const fill = Math.min(1, this.wallet.tickets / prize.tickets);
    this.element.style.setProperty('--fill', fill.toFixed(3));
    this.element.classList.toggle('prize-goal--ready', fill >= 1);
    this.element.title = fill >= 1 ? `The ${prize.name}: enough tickets for it at the prize counter` : `Saving up for the ${prize.name}`;
  }
}
