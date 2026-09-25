import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import './NewsPanel.css';

/** What the panel prints: the paper's masthead, dateline, lead and tips (see `street/gamingWeekly`). */
export interface NewsIssue {
  masthead: string;
  dateline: string;
  headline: string;
  blurb: string;
  hints: readonly string[];
  prices: string | null;
}

/**
 * The newsstand's paper, THE GAMING WEEKLY, held up to read: a newsprint card over the view with
 * the day's lead and a few tips about the flea market. A `ModalLike` the Session opens through
 * `SessionActions.openPanel` (the mouse is released while it is up, the room re-entered when it
 * closes): Close, Esc or a click outside puts it down.
 */
export class NewsPanel extends ModalPanel {
  private readonly card: HTMLElement;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre news-panel' });
    this.root.innerHTML = '<article class="news-panel__paper" role="dialog" aria-modal="true" aria-label="The newspaper"></article>';
    this.card = this.root.querySelector('.news-panel__paper')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) this.close();
    });
  }

  /** Prints `issue` (call before the Session opens the panel). */
  print(issue: NewsIssue): void {
    this.card.innerHTML = `
      <header>
        <h2>${escapeHtml(issue.masthead)}</h2>
        <p class="news-panel__dateline">${escapeHtml(issue.dateline)}</p>
      </header>
      <h3>${escapeHtml(issue.headline)}</h3>
      <p class="news-panel__blurb">${escapeHtml(issue.blurb)}</p>
      <ul>${issue.hints.map((hint) => `<li>${escapeHtml(hint)}</li>`).join('')}</ul>
      ${issue.prices ? `<p class="news-panel__prices">${escapeHtml(issue.prices)}</p>` : ''}
      <footer><button type="button" data-action="close" aria-label="Close">Put it back</button></footer>`;
  }

  /** Takes the panel out of the page (the street unloaded). */
  dispose(): void {
    this.close();
    this.root.remove();
  }
}
