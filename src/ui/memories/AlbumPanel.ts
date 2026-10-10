import { CardPanel } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { drawnPrint } from './albumPhotos';
import './AlbumPanel.css';

/** A page's slot: a memory seen (its print), one just found (slipping out of the pages), or empty photo corners. */
export interface AlbumSlot {
  id: string;
  title: string;
  state: 'seen' | 'new' | 'empty';
  /** The still taken when it played this session (a data URL), else null: a drawn print stands in. */
  still: string | null;
}

/** Slots on each of the two pages: the spread never changes size, whatever is in it. */
const PER_PAGE = 4;

/**
 * MÉMÉ'S ALBUM, open on the table (docs/story.md "Mémé"): a spread of two cream pages in a cloth cover, a print a
 * memory seen (the frame the film showed, or a drawn sepia print), its title in her hand under it; the memory she has
 * just found slips out of the pages, its back up with the title in pen; the rest are empty photo corners, nothing
 * written. A print clicked plays its memory (`pick`). No word on how a page fills.
 */
export class AlbumPanel extends CardPanel {
  private slots: readonly AlbumSlot[] = [];
  private pick: ((id: string) => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'album', cardClass: 'album__cover', title: 'Mémé’s album', dismiss: 'Close the album', header: false, buttonClass: 'album__button' });
  }

  /** What the pages hold this time, and what a print clicked does; read when the album opens. */
  setPages(slots: readonly AlbumSlot[], pick: (id: string) => void): void {
    this.slots = slots;
    this.pick = pick;
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const pages = [this.slots.slice(0, PER_PAGE), this.slots.slice(PER_PAGE, PER_PAGE * 2)];
    return html`<div class="album__spread">${pages.map(
      (page, i) => html`<div class="album__page album__page--${i ? 'right' : 'left'}">${page.map((slot) => this.slotHtml(slot))}</div>`,
    )}</div>`;
  }

  private slotHtml(slot: AlbumSlot): Html {
    if (slot.state === 'empty') return html`<div class="album__slot"><span class="album__corners" aria-hidden="true"></span></div>`;
    if (slot.state === 'new')
      return html`<div class="album__slot"><button type="button" class="album__photo album__photo--new" data-action="play" data-id="${slot.id}" data-autofocus aria-label="Look at it: ${slot.title}">
          <span class="album__back">${slot.title}</span>
        </button></div>`;
    return html`<div class="album__slot"><button type="button" class="album__photo" data-action="play" data-id="${slot.id}" aria-label="Watch again: ${slot.title}">
        <span class="album__corners" aria-hidden="true"></span>
        <img class="album__print" src="${slot.still ?? drawnPrint(slot.id)}" alt="" />
        <span class="album__caption">${slot.title}</span>
      </button></div>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const id = el.dataset.id;
    if (action !== 'play' || !id) return;
    this.pick?.(id);
  }
}
