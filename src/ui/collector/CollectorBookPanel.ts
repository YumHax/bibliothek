import { milestoneReward } from '@/economy/milestoneList';
import { playCoins } from '@/audio/coins';
import { CardPanel } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { formatCoins, formatTickets } from '@/text/money';
import { bindBook, type BoundBook } from './bookPages';
import { SECTION_NAMES } from './frontPages';
import type { BookData, BookPage, SectionId } from './bookTypes';
import './collector.css';

const SECTIONS: readonly SectionId[] = ['contents', 'stamps', 'sets', 'consoles', 'worth'];

interface CollectorBookDeps extends BookData {
  /** The purse an envelope an older save left behind is paid into. */
  wallet: { earnCoins(coins: number): void; addTickets(tickets: number): void };
}

/**
 * THE COLLECTOR'S BOOK, Félix's binder on the living room's sideboard: a cloth-bound ring binder open on two facing
 * pages, its coloured dividers standing out on the right. The contents and the bookplate first; then the stamps
 * (the milestones, stuck in as they are reached), the club's sets and each console's list as sleeve pages with the
 * covers in their pockets, and the worth as a ledger. The pages are written afresh on every paint (`bindBook`);
 * Left / Right (and the D-pad, the corners' links) turn a spread, the dividers, Page Up / Page Down and the contents
 * open a section, Home goes back to the contents. Pointing at a stamp writes its caption at the page's foot.
 */
export class CollectorBookPanel extends CardPanel {
  /** The spread open now: pages `2 * spread` and `2 * spread + 1`. */
  private spread = 0;
  /** Which way the last turn went, for the pages' entrance (0: none). */
  private turned: 1 | -1 | 0 = 0;
  private book: BoundBook | null = null;

  constructor(container: HTMLElement, private readonly deps: CollectorBookDeps) {
    super(container, { className: 'collector-book', cardClass: 'book-binder', title: 'Collector’s book', dismiss: 'Close the book', dismissAutofocus: true, header: false, buttonClass: '' });
    const repaint = () => {
      if (this.isOpen) this.refresh();
    };
    deps.collection.subscribe(repaint);
    deps.milestones.subscribe(repaint);
    deps.history.subscribe(repaint);
    deps.standing?.subscribe(repaint);
    // A stamp pointed at or reached by the keys writes its caption at its page's foot (no repaint: nothing moves).
    const caption = (e: Event) => {
      const stamp = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-caption]') : null;
      const foot = stamp?.closest('.book-page')?.querySelector('.book-caption');
      if (stamp && foot) foot.textContent = stamp.dataset.caption ?? '';
    };
    this.listen(this.body, 'mouseover', caption);
    this.listen(this.body, 'focusin', caption);
  }

  protected override onOpened(): void {
    this.deps.watch.refresh();
    this.turned = 0;
    // An envelope waiting behind a stamp: the book falls open there.
    if (this.deps.milestones.unclaimed) this.spread = this.spreadOf('stamps');
    super.onOpened();
  }

  protected render(): Html {
    this.book = bindBook(this.deps);
    const pages = this.book.pages;
    this.spread = Math.min(this.spread, Math.max(0, Math.ceil(pages.length / 2) - 1));
    const left = pages[this.spread * 2];
    const right = pages[this.spread * 2 + 1];
    const open = left?.section ?? 'contents';
    const turning = this.turned ? ` book-page--turned-${this.turned > 0 ? 'on' : 'back'}` : '';
    this.turned = 0;
    return html`<div class="book-spread">
        ${this.pageHtml(left, this.spread * 2, 'left', turning)}
        ${this.pageHtml(right, this.spread * 2 + 1, 'right', turning)}
      </div>
      <nav class="book-tabs" aria-label="The dividers">${SECTIONS.map((id) => html`<button type="button" class="book-tab${id === open ? ' book-tab--open' : ''}" data-section="${id}" data-action="section"${id === open ? html` aria-current="true"` : ''}>
          <span>${SECTION_NAMES[id]}</span>${id === 'stamps' && this.deps.milestones.unclaimed ? html`<span class="book-tab__slip">for you</span>` : ''}
        </button>`)}</nav>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'prev') this.turnTo(this.spread - 1);
    else if (action === 'next') this.turnTo(this.spread + 1);
    else if (action === 'section' && el.dataset.section) this.turnTo(this.spreadOf(el.dataset.section as SectionId));
    else if (action === 'claim' && el.dataset.id) this.claim(el.dataset.id);
  }

  /** Left / Right (and the D-pad) turn a spread. */
  protected override onSide(direction: 1 | -1): boolean {
    return this.turnTo(this.spread + direction);
  }

  /** Home: the contents; End: the last spread; Page Up / Page Down: the section before or after. */
  protected override onKey(e: KeyboardEvent): void {
    const spreads = Math.ceil((this.book?.pages.length ?? 2) / 2);
    let to: number | null = null;
    if (e.code === 'Home') to = 0;
    else if (e.code === 'End') to = spreads - 1;
    else if (e.code === 'PageUp' || e.code === 'PageDown') {
      const here = SECTIONS.indexOf(this.book?.pages[this.spread * 2]?.section ?? 'contents');
      const next = SECTIONS[Math.min(SECTIONS.length - 1, Math.max(0, here + (e.code === 'PageDown' ? 1 : -1)))]!;
      to = this.spreadOf(next);
    }
    if (to === null) return;
    e.preventDefault();
    this.turnTo(to);
  }

  /** Opens the spread `index` (held between the covers); false when it is already open. */
  private turnTo(index: number): boolean {
    const spreads = Math.ceil((this.book?.pages.length ?? 2) / 2);
    const next = Math.min(spreads - 1, Math.max(0, index));
    if (next === this.spread) return false;
    this.turned = next > this.spread ? 1 : -1;
    this.spread = next;
    this.setStatus('');
    this.refresh();
    return true;
  }

  /** The spread a section opens on. */
  private spreadOf(section: SectionId): number {
    return (this.book ?? bindBook(this.deps)).starts[section] / 2;
  }

  /** A page: its paper (by section), what is on it, the folio, and the corner link to the next spread on that side. */
  private pageHtml(page: BookPage | undefined, index: number, side: 'left' | 'right', turning: string): Html {
    const pages = this.book?.pages ?? [];
    const neighbour = pages[side === 'left' ? index - 2 : index + 1];
    const corner = neighbour
      ? html`<button type="button" class="book-corner book-corner--${side}" data-nav data-action="${side === 'left' ? 'prev' : 'next'}">${side === 'left' ? `← ${SECTION_NAMES[neighbour.section]}` : `${SECTION_NAMES[neighbour.section]} →`}</button>`
      : '';
    return html`<section class="book-page book-page--${side} book-page--${page?.section ?? 'blank'}${turning}" aria-label="Page ${index + 1}">
        <div class="book-page__body">${page?.body ?? ''}</div>
        <footer class="book-page__foot">${side === 'left' ? corner : ''}<span class="book-page__folio">${index + 1}</span>${side === 'right' ? corner : ''}</footer>
      </section>`;
  }

  /** An envelope an older save left behind a stamp: what it holds goes in the pocket. */
  private claim(id: string): void {
    const { milestones, wallet } = this.deps;
    const { coins, tickets } = milestoneReward(id);
    if (!milestones.claim(id, wallet)) return;
    playCoins(coins ? 3 : 1);
    this.setStatus(`${coins ? formatCoins(coins, { sign: true }) : formatTickets(tickets ?? 0, { sign: true })} in your pocket.`, 'ok');
  }
}
