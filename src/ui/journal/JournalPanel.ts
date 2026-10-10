import type { Game } from '@/catalog/types';
import type { JournalDay, ReadMark } from '@/journal/Journal';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { portrait } from '../social/portrait';
import { glanceHtml } from './glancePage';
import { longDate } from './journalDates';
import { spriteHtml } from './journalSprite';
import type { JournalLike, JournalPanelOptions, PageContext } from './journalTypes';
import { linesHtml, smallHtml, stripHtml } from './linesPage';
import './journal.css';

/**
 * THE JOURNAL, the notebook on the hall console (and the pause menu's Journal): a book open on a day's two facing
 * pages. The left page is the day at a glance (`glancePage`): the sums as counters, the last days' coins as bars,
 * the games come home as snapshots, what is coming and the trails followed. The right page (`linesPage`) is the
 * strip of the last days along the top and the day's lines under it, with covers, faces and stickers pasted beside
 * them, and a dashed rule where the last reading stopped. The strip, the corners' links, Left / Right and the D-pad
 * turn to another day. A `ModalLike` the Session opens through `SessionActions.openPanel`; it repaints on every open
 * (the journal changes while it is shut).
 */
export class JournalPanel extends CardPanel {
  /** The day open now: its index in `pages`. */
  private spread = 0;
  /** The pages open now (oldest first; today last). */
  private pages: JournalDay[] = [];
  /** Where the reading had stopped when the book was opened (the marker's place). */
  private markAtOpen: ReadMark | null = null;
  /** The folds opened by hand ("clues:The lost prototype"). */
  private readonly folds = new Set<string>();
  /** Which way the last turn went, for the pages' entrance (0: none). */
  private turned: 1 | -1 | 0 = 0;

  constructor(container: HTMLElement, private readonly journal: JournalLike, private readonly options: JournalPanelOptions = {}) {
    super(container, { className: 'journal-panel', cardClass: 'journal-panel__book', title: 'Journal', dismiss: 'Close the book', dismissAutofocus: true, header: false, buttonClass: '' });
  }

  protected override onOpened(): void {
    this.markAtOpen = this.journal.readMark;
    this.journal.markRead();
    const today = this.journal.today;
    this.pages = [...this.journal.history.filter((d) => d.day !== today.day)].reverse();
    this.pages.push(today);
    this.spread = this.pages.length - 1;
    this.turned = 0;
    super.onOpened();
  }

  protected render(): Html {
    const day = this.pages[this.spread];
    if (!day) return html``;
    const today = this.spread === this.pages.length - 1;
    const turning = this.turned ? ` journal-page--turned-${this.turned > 0 ? 'on' : 'back'}` : '';
    const ctx = this.context();
    return html`${spriteHtml()}
      <section class="journal-page journal-page--left${turning}" aria-label="${longDate(day.day)}, at a glance">
        <div class="journal-page__body">${glanceHtml(day, today, ctx, this.pages, this.spread)}</div>
        <footer class="journal-page__foot">${this.corner('prev')}</footer>
      </section>
      <section class="journal-page journal-page--right${turning}" aria-label="${longDate(day.day)}, the lines">
        <div class="journal-page__body">
          ${stripHtml(this.pages, this.spread)}
          ${linesHtml(day, today, ctx, today ? this.markCount(day) : null)}
          ${smallHtml(day)}
        </div>
        <footer class="journal-page__foot">${this.corner('next')}</footer>
      </section>`;
  }

  /** The faces are drawn canvases: dropped into their slots (`data-portrait`, `data-size`) after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait!;
      const s = standing(id);
      slot.appendChild(portrait(id, Number(slot.dataset.size ?? 26), tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }

  /** "Back to today" while an earlier day is open (one press instead of a page at a time), then the People book. */
  protected override actions(): PanelAction[] {
    const back: PanelAction[] = this.spread < this.pages.length - 1 ? [{ action: 'today', label: 'Back to today' }] : [];
    return [...back, ...(this.options.people ? [{ action: 'people', label: 'People ›' }] : [])];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'people') this.options.people?.();
    else if (action === 'prev') this.turn(-1);
    else if (action === 'next') this.turn(1);
    else if (action === 'today') this.turnTo(this.pages.length - 1);
    else if (action === 'day') this.turnTo(Number(el.dataset.index));
    else if (action === 'fold') {
      const id = el.dataset.fold ?? '';
      if (this.folds.has(id)) this.folds.delete(id);
      else this.folds.add(id);
      this.refresh();
    }
  }

  /** Left / Right (and the D-pad) turn to another day. */
  protected override onSide(direction: 1 | -1): boolean {
    return this.turn(direction);
  }

  /** Home and End jump to the first day written and to today; Page Up / Page Down turn a week. */
  protected override onKey(e: KeyboardEvent): void {
    const to = e.code === 'Home' ? 0 : e.code === 'End' ? this.pages.length - 1 : e.code === 'PageUp' ? this.spread - 7 : e.code === 'PageDown' ? this.spread + 7 : null;
    if (to === null) return;
    e.preventDefault();
    this.turnTo(to);
  }

  /** What the pages are written with: the options, the folds, and the collection by id (read once a paint). */
  private context(): PageContext {
    const games = new Map<string, Game>((this.options.games?.() ?? []).map((g) => [g.id, g]));
    return { options: this.options, folds: this.folds, gameOf: (id) => games.get(id) };
  }

  /** Turns to the day before or after; false at either cover. */
  private turn(direction: 1 | -1): boolean {
    return this.turnTo(this.spread + direction);
  }

  /** Opens the pages at `index` (held between the covers); false when it is already open. */
  private turnTo(index: number): boolean {
    if (!Number.isFinite(index)) return false;
    const next = Math.min(this.pages.length - 1, Math.max(0, index));
    if (next === this.spread) return false;
    this.turned = next > this.spread ? 1 : -1;
    this.spread = next;
    this.refresh();
    return true;
  }

  /** The link in a page's bottom corner to the day before (left page) or after (right page); none at a cover. */
  private corner(dir: 'prev' | 'next'): Html | '' {
    const to = this.pages[this.spread + (dir === 'prev' ? -1 : 1)];
    if (!to) return '';
    const label = longDate(to.day);
    return html`<button type="button" class="journal-page__corner journal-page__corner--${dir}" data-nav data-action="${dir}" aria-label="${dir === 'prev' ? 'Earlier' : 'Later'}: ${label}">${dir === 'prev' ? `← ${label}` : `${label} →`}</button>`;
  }

  /** How many of `day`'s lines were read before this opening, or null when the mark has nothing to say. */
  private markCount(day: JournalDay): number | null {
    const mark = this.markAtOpen;
    if (!mark) return null;
    const count = mark.day === day.day ? mark.count : mark.day < day.day ? 0 : null;
    return count !== null && count < day.entries.length ? count : null;
  }
}
