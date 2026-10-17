import type { Game } from '@/catalog/types';
import { lookGrew, markSeen, pageLook, seenOf, type PageLook } from '@/social/bookSeen';
import { findPerson } from '@/social/people';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import type { PersonId } from '@/social/types';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { nextTab } from '../panel/widgets';
import { pageItems } from './book/bookParts';
import { listPage, tabsShown, type Filter } from './book/listPage';
import { personPage, type PageFresh } from './book/personPage';
import { portrait } from './portrait';
import './social.css';
import './PeopleBook.css';

/** What the book reads of the game: the day and the hour, a call from a page, the covers of the games remembered. */
interface PeopleBookDeps {
  day(): number;
  hour(): number;
  /** Rings `id` (the phone's contacts): null when they picked up (the conversation opens over the phone), else why not. */
  call?(id: PersonId): string | null;
  game?(id: string): Game | undefined;
  coverUrl?(game: Game): string | undefined;
}

/**
 * THE PEOPLE BOOK (docs/social.md "The People book"): who has something for the player today, then everyone met, by
 * group, each with their badge and one useful line; a page per person (`book/personPage`) with where they are now,
 * what matters to them, what they wait for, your memories, their world, and a Call button. What is new since the page
 * was last opened is marked "new"; the page ages with the tier. Nothing of what is to come. Opened by its key, the
 * journal and the pause menu; D-pad left / right changes the tab; Backspace, Esc or B go back to the list.
 */
export class PeopleBook extends CardPanel {
  private filter: Filter = 'all';
  private page: PersonId | null = null;
  /** What was new on the page shown when it was opened (the seen record is taken then). */
  private fresh: PageFresh = { items: new Set(), grew: false };
  private look: PageLook = 'typed';

  constructor(container: HTMLElement, private readonly deps: PeopleBookDeps) {
    super(container, { className: 'people-book', cardClass: 'people-book__book ui-card', title: 'People', header: false });
  }

  protected override onOpened(): void {
    if (this.page) this.openPage(this.page);
    super.onOpened();
  }

  protected override onClosed(): void {
    this.page = null;
  }

  /** The next opening shows `id`'s page (the conversation's name opens it), on the Everyone tab behind it. */
  showPerson(id: PersonId): void {
    this.filter = 'all';
    this.page = id;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { id } = el.dataset;
    if (action === 'filter' && id) {
      this.filter = id as Filter;
      this.page = null;
      this.refresh();
    } else if (action === 'person' && id) {
      this.openPage(id);
      this.refresh();
    } else if (action === 'call' && id && this.deps.call) {
      // Picked up: the conversation opens over the phone and takes the book's place; else the book says why not.
      const why = this.deps.call(id);
      if (why !== null) this.setStatus(why);
    } else if (action === 'back') this.goBack();
  }

  /** From a person's page, Esc and B go back to the list. */
  protected override onBack(): boolean {
    if (!this.page) return false;
    this.goBack();
    return true;
  }

  protected override onKey(e: KeyboardEvent): void {
    if (e.code === 'Backspace' && this.page) {
      e.preventDefault();
      this.goBack();
    }
  }

  protected override onSide(direction: 1 | -1): boolean {
    if (this.page) return false;
    this.filter = nextTab(tabsShown().map((t) => t.id), this.filter, direction);
    this.refresh();
    return true;
  }

  /** Opens `id`'s page: what is new on it since last time is kept for this visit, and the page counts as seen. */
  private openPage(id: PersonId): void {
    this.page = id;
    this.setStatus('');
    const day = this.deps.day();
    const s = standing(id);
    const look = pageLook(tierOf(s.warmth, s.trust));
    const items = pageItems(id, day);
    const seen = seenOf(id);
    const before = new Set(seen?.items ?? items);
    this.fresh = { items: new Set(items.filter((k) => !before.has(k))), grew: !!seen && lookGrew(seen.look, look) };
    this.look = look;
    if (s.met !== null || findPerson(id)?.listed === 'always') markSeen(id, items, look);
  }

  private goBack(): void {
    this.page = null;
    this.setStatus('');
    this.refresh();
  }

  protected render(): Html {
    const day = this.deps.day();
    const hour = this.deps.hour();
    if (!this.page) return listPage(this.filter, day, hour);
    return personPage(this.page, this.look, this.fresh, { day, hour, canCall: !!this.deps.call, game: this.deps.game, coverUrl: this.deps.coverUrl });
  }

  protected override actions(): PanelAction[] {
    return this.page ? [{ action: 'back', label: html`← All people <kbd>⌫</kbd>`, autofocus: true }] : [];
  }

  /** The portraits are drawn canvases: dropped into their slots (`data-portrait`, `data-size`) after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait!;
      const s = standing(id);
      slot.appendChild(portrait(id, Number(slot.dataset.size ?? 64), tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }
}
