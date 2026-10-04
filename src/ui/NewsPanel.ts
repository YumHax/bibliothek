import { CardPanel } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import './NewsPanel.css';

/** What the panel prints: the paper's masthead, dateline, lead and tips (see `street/gamingWeekly`). */
interface NewsIssue {
  masthead: string;
  dateline: string;
  headline: string;
  blurb: string;
  hints: readonly string[];
  prices: string | null;
  /** The small ads: who and where, then the ad's words (none: no column). */
  classifieds?: readonly { head: string; text: string }[];
}

/**
 * The newsstand's paper, THE GAMING WEEKLY, held up to read: a newsprint card over the view with
 * the day's lead and a few tips about the flea market. A `ModalLike` the Session opens through
 * `SessionActions.openPanel` (the mouse is released while it is up, the room re-entered when it
 * closes): "Put it back", Esc or a click outside puts it down.
 */
export class NewsPanel extends CardPanel {
  private issue: NewsIssue | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'news-panel', cardClass: 'news-panel__paper', title: 'The newspaper', dismiss: 'Put it back', header: false, buttonClass: '' });
  }

  /** Prints `issue` (call before the Session opens the panel). */
  print(issue: NewsIssue): void {
    this.issue = issue;
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const issue = this.issue;
    if (!issue) return html``;
    return html`<header>
        <h2>${issue.masthead}</h2>
        <p class="news-panel__dateline">${issue.dateline}</p>
      </header>
      <h3>${issue.headline}</h3>
      <p class="news-panel__blurb">${issue.blurb}</p>
      <ul>${issue.hints.map((hint) => html`<li>${hint}</li>`)}</ul>
      ${issue.prices ? html`<p class="news-panel__prices">${issue.prices}</p>` : ''}
      ${issue.classifieds?.length
        ? html`<section class="news-panel__ads"><h4>Small ads</h4>${issue.classifieds.map((ad) => html`<p><b>${ad.head}</b> ${ad.text}</p>`)}<p class="news-panel__ads-note">Ring from your phone at home.</p></section>`
        : ''}`;
  }
}
