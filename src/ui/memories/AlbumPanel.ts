import { CardPanel } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { drawnPrint } from './albumPhotos';
import './AlbumPanel.css';

/** What she wrote on the back of a print. */
interface SlotBack {
  date: string;
  place: string;
  line: string;
}

/**
 * A page's slot: a memory (a film: its print once seen, slipping out of the pages when just found, else empty corners
 * with her pencilled name), a photo (a still with her words: the snapshots, the family's prints, the player's own),
 * or bare corners.
 */
export interface AlbumSlot {
  id: string;
  kind: 'memory' | 'photo' | 'blank';
  /** Her caption: the title under a print, the pencilled name in an empty memory's corners ('' for none). */
  title: string;
  state: 'seen' | 'new' | 'empty';
  /** The print (a data URL); a memory without one gets a drawn sepia print. */
  still: string | null;
  /** The print's back, or null (nothing written). */
  back: SlotBack | null;
  /** What she says looking at it with the player (a photo's), in turn. */
  lines: readonly string[];
}

/** What a print chosen does: a memory plays (`play`), a photo looked at is no longer new (`looked`). */
interface AlbumHandlers {
  play(id: string): void;
  looked(id: string): void;
}

/** Slots on each of the two pages, and on a spread: the spread never changes size, whatever is in it. */
const PER_PAGE = 4;
const PER_SPREAD = PER_PAGE * 2;
/** Seconds between two of her lines over a photo. */
const LINE_GAP = 2.4;

/**
 * MÉMÉ'S ALBUM, open on the table (docs/story.md "Mémé", docs/grandma.md "The album's other photos"): spreads of two
 * cream pages in a cloth cover, turned a spread at a time, Félix's years first, then the player's prints. A memory seen
 * is a print with its title in her hand; the one she has just found slips out of the pages, back up, and plays when
 * clicked; one not found yet is empty corners with its name pencilled in. A photo opens close: the print large on the
 * left page (clicked, it turns over: the date, the place, her line), her words a line at a time on the right. Nothing
 * says how a page fills.
 */
export class AlbumPanel extends CardPanel {
  private slots: readonly AlbumSlot[] = [];
  private handlers: AlbumHandlers | null = null;
  private spread = 0;
  /** The print looked at close, or null for the pages. */
  private closeUp: AlbumSlot | null = null;
  private flipped = false;
  /** Her lines shown so far over the print looked at. */
  private said = 0;
  private timer: number | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'album', cardClass: 'album__cover', title: 'Mémé’s album', dismiss: 'Close the album', header: false, buttonClass: 'album__button' });
  }

  /** What the pages hold this time (a whole number of spreads), and what a print chosen does; read when the album opens. */
  setPages(slots: readonly AlbumSlot[], handlers: AlbumHandlers): void {
    this.slots = slots;
    this.handlers = handlers;
    this.leaveClose();
    // Open where something new waits, else where the album was left.
    const fresh = slots.findIndex((slot) => slot.state === 'new');
    const spreads = Math.max(1, Math.ceil(slots.length / PER_SPREAD));
    this.spread = fresh >= 0 ? Math.floor(fresh / PER_SPREAD) : Math.min(this.spread, spreads - 1);
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    return this.closeUp ? this.closeHtml(this.closeUp) : this.spreadHtml();
  }

  protected override onClosed(): void {
    this.leaveClose();
    super.onClosed();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const slot = this.slots.find((s) => s.id === el.dataset.id);
    if (action === 'pick' && slot) this.pickSlot(slot);
    else if (action === 'turn') this.turn(Number(el.dataset.by) === -1 ? -1 : 1);
    else if (action === 'flip') {
      this.flipped = !this.flipped;
      this.refresh();
    } else if (action === 'watch' && this.closeUp) {
      const id = this.closeUp.id;
      this.leaveClose();
      this.handlers?.play(id);
    } else if (action === 'pages') {
      this.leaveClose();
      this.refresh();
    }
  }

  protected override onBack(): boolean {
    if (!this.closeUp) return false;
    this.leaveClose();
    this.refresh();
    return true;
  }

  protected override onSide(direction: 1 | -1): boolean {
    if (this.closeUp) return false;
    return this.turn(direction);
  }

  /** A print chosen: a memory just found plays; any other print opens close. */
  private pickSlot(slot: AlbumSlot): void {
    if (slot.kind === 'memory' && slot.state === 'new') {
      this.handlers?.play(slot.id);
      return;
    }
    if (slot.state === 'empty' || slot.kind === 'blank') return;
    if (slot.state === 'new') this.handlers?.looked(slot.id);
    this.closeUp = slot.state === 'new' ? { ...slot, state: 'seen' } : slot;
    this.slots = this.slots.map((s) => (s.id === slot.id ? { ...s, state: 'seen' } : s));
    this.flipped = false;
    this.said = slot.lines.length ? 1 : 0;
    this.refresh();
    this.sayNext();
  }

  /** Turns `by` a spread; false at either end. */
  private turn(by: 1 | -1): boolean {
    const spreads = Math.ceil(this.slots.length / PER_SPREAD);
    const next = this.spread + by;
    if (next < 0 || next >= spreads) return false;
    this.spread = next;
    this.refresh();
    return true;
  }

  /** Her next line over the print looked at, a moment after the last. */
  private sayNext(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    const close = this.closeUp;
    if (!close || this.said >= close.lines.length) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.closeUp !== close) return;
      this.said++;
      this.refresh();
      this.sayNext();
    }, LINE_GAP * 1000);
  }

  private leaveClose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.closeUp = null;
    this.flipped = false;
    this.said = 0;
  }

  private spreadHtml(): Html {
    const from = this.spread * PER_SPREAD;
    const spreads = Math.max(1, Math.ceil(this.slots.length / PER_SPREAD));
    const pages = [this.slots.slice(from, from + PER_PAGE), this.slots.slice(from + PER_PAGE, from + PER_SPREAD)];
    return html`<div class="album__spread">${pages.map(
        (page, i) => html`<div class="album__page album__page--${i ? 'right' : 'left'}">${page.map((slot) => this.slotHtml(slot))}</div>`,
      )}</div>
      <div class="album__nav">
        <button type="button" class="album__turn ${this.spread === 0 ? 'album__turn--away' : ''}" data-action="turn" data-by="-1" ${attr('disabled', this.spread === 0)}>Back a page</button>
        <button type="button" class="album__turn ${this.spread >= spreads - 1 ? 'album__turn--away' : ''}" data-action="turn" data-by="1" ${attr('disabled', this.spread >= spreads - 1)}>Turn the page</button>
      </div>`;
  }

  private slotHtml(slot: AlbumSlot): Html {
    if (slot.state === 'empty' || slot.kind === 'blank')
      return html`<div class="album__slot"><span class="album__corners" aria-hidden="true"></span>${slot.title && html`<span class="album__pencil">${slot.title}</span>`}</div>`;
    if (slot.state === 'new')
      return html`<div class="album__slot"><button type="button" class="album__photo album__photo--new" data-action="pick" data-id="${slot.id}" data-autofocus aria-label="Look at it: ${slot.title}">
          <span class="album__back">${slot.title}</span>
        </button></div>`;
    const verb = slot.kind === 'memory' ? 'Look again' : 'Look';
    return html`<div class="album__slot"><button type="button" class="album__photo" data-action="pick" data-id="${slot.id}" aria-label="${verb}: ${slot.title}">
        <span class="album__corners" aria-hidden="true"></span>
        <img class="album__print" src="${this.printOf(slot)}" alt="" />
        <span class="album__caption">${slot.title}</span>
      </button></div>`;
  }

  /** The print looked at close: large on the left page (front or back), her words and the ways on, right. */
  private closeHtml(slot: AlbumSlot): Html {
    const back = slot.back;
    return html`<div class="album__spread">
        <div class="album__page album__page--left album__page--close">
          <button type="button" class="album__big ${this.flipped ? 'album__big--back' : ''}" data-action="flip" aria-label="${this.flipped ? 'Turn it back' : 'Turn it over'}">
            <img class="album__big-print" src="${this.printOf(slot)}" alt="" />
            <span class="album__big-back">
              ${back ? html`<span class="album__back-date">${back.date}</span><span class="album__back-place">${back.place}</span><span class="album__back-line">${back.line}</span>` : ''}
            </span>
          </button>
        </div>
        <div class="album__page album__page--right album__page--close"><div class="album__close-side">
          <div class="album__words">
            <p class="album__words-title">${slot.title}</p>
            ${slot.lines.map((line, i) => html`<p class="album__line ${i < this.said ? 'album__line--said' : ''}">${line}</p>`)}
          </div>
          <div class="album__close-actions">
            <button type="button" class="album__turn" data-action="flip">${this.flipped ? 'Turn it back' : 'Turn it over'}</button>
            ${slot.kind === 'memory' && html`<button type="button" class="album__turn" data-action="watch">Watch it again</button>`}
            <button type="button" class="album__turn" data-action="pages" data-autofocus>Back to the pages</button>
          </div>
        </div></div>
      </div>
      <div class="album__nav" aria-hidden="true"></div>`;
  }

  private printOf(slot: AlbumSlot): string {
    return slot.still ?? drawnPrint(slot.id);
  }
}
