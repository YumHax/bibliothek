import { CardPanel } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { playIntercomLine } from '@/audio/furnitureSounds';
import './NewsPanel.css';

/** A made-up local number for an ad, the same every time it is printed. */
function phoneNumber(id: string): string {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const digits = String(h % 1_000_000).padStart(6, '0');
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
}

/** What the panel prints: the paper's masthead, dateline, lead and tips (see `street/gamingWeekly`). */
interface NewsIssue {
  masthead: string;
  dateline: string;
  headline: string;
  blurb: string;
  hints: readonly string[];
  prices: string | null;
  /** The small ads: who and where, then the ad's words, and the ad's id to ring it (none: no column). */
  classifieds?: readonly { id?: string; head: string; text: string }[];
}

interface NewsPanelOptions {
  /** Rings a small ad's seller from the kiosk's phone: what they say (`ui/household/phoneAds`). Absent: ring from home. */
  ring?: (adId: string) => string;
}

/**
 * The newsstand's paper, THE GAMING WEEKLY, held up to read: a newsprint card over the view with
 * the day's lead and a few tips about the flea market. A `ModalLike` the Session opens through
 * `SessionActions.openPanel` (the mouse is released while it is up, the room re-entered when it
 * closes): "Put it back", Esc or a click outside puts it down.
 */
export class NewsPanel extends CardPanel {
  private issue: NewsIssue | null = null;
  /** The ad rung last and what its seller said, pencilled under it. */
  private rung: { id: string; said: string } | null = null;

  constructor(container: HTMLElement, private readonly options: NewsPanelOptions = {}) {
    super(container, { className: 'news-panel', cardClass: 'news-panel__paper', title: 'The newspaper', dismiss: 'Put it back', header: false, buttonClass: '' });
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'ring' && el.dataset.id && this.options.ring) {
      this.rung = { id: el.dataset.id, said: this.options.ring(el.dataset.id) };
      playIntercomLine(0.9, 0.06);
      this.refresh();
    }
  }

  /** Prints `issue` (call before the Session opens the panel). */
  print(issue: NewsIssue): void {
    this.issue = issue;
    this.rung = null;
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
        ? html`<section class="news-panel__ads"><h4>Small ads</h4>${issue.classifieds.map((ad) => this.ad(ad))}${this.options.ring ? '' : html`<p class="news-panel__ads-note">Their numbers go in your phone at home.</p>`}</section>`
        : ''}`;
  }

  /** A small ad: who and where, the words, its number to ring (from the kiosk's phone), and the seller's answer pencilled under it once rung. */
  private ad(ad: { id?: string; head: string; text: string }): Html {
    const ring = this.options.ring && ad.id;
    const said = ad.id && this.rung?.id === ad.id ? this.rung.said.split('\n') : null;
    return html`<div class="news-panel__ad"><p><b>${ad.head}</b> ${ad.text}${ring ? html` <button type="button" class="news-panel__ring" data-action="ring" data-id="${ad.id!}" aria-label="Ring ${ad.head} from the kiosk’s phone">Tel. ${phoneNumber(ad.id!)}</button>` : ''}</p>
      ${said ? html`<p class="news-panel__answer"><span class="news-panel__answer-head">On the phone:</span> ${said.map((line, i) => (i === 0 ? html`<span class="news-panel__answer-said">${line}</span>` : html`<span class="news-panel__answer-note">${line}</span>`))}</p>` : ''}
    </div>`;
  }
}
