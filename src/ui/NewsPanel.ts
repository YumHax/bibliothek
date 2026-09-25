import { escapeHtml } from './html';
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
export class NewsPanel {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(container: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'news-panel';
    this.root.hidden = true;
    this.root.innerHTML = '<article class="news-panel__paper"></article>';
    this.card = this.root.querySelector('.news-panel__paper')!;
    container.appendChild(this.root);
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
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
      <footer><button type="button" data-action="close">Put it back</button></footer>`;
  }

  open(): void {
    if (this.isOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.root.hidden = false;
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Takes the panel out of the page (the street unloaded). */
  dispose(): void {
    this.close();
    this.root.remove();
  }
}
