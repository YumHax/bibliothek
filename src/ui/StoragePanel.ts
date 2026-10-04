import { CardPanel } from './panel/CardPanel';
import { attr, html, type Html } from './panel/html';
import { emptyState } from './panel/widgets';
import './StoragePanel.css';

/** A piece of furniture put away: what it is, the room it was put away in. */
interface StoredEntry {
  name: string;
  room: string;
}

/**
 * The furniture the player put away (docs/furnishing.md), from the pause menu: one row per piece, "Take out" brings
 * it out in front of the player in the room they are in, carried, to be set down where it fits (or put away again).
 * The list is read each time it opens (`show`).
 */
export class StoragePanel extends CardPanel {
  private entries: readonly StoredEntry[] = [];
  private pick: ((index: number) => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'storage-panel', cardClass: 'storage-panel__card ui-card', title: 'Stored furniture' });
  }

  /** Deals the list (call before the Session opens the panel); `pick` hears the index of the piece taken out. */
  show(entries: readonly StoredEntry[], pick: (index: number) => void): void {
    this.entries = entries;
    this.pick = pick;
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const rows = this.entries.map(
      (entry, i) =>
        html`<li><span class="storage-panel__name">${entry.name}</span><span class="storage-panel__room">${entry.room}</span><button type="button" class="ui-btn" data-action="take" data-index="${i}"${attr('data-autofocus', i === 0)}>Take out</button></li>`,
    );
    return html`${this.entries.length ? html`<ul class="storage-panel__list">${rows}</ul>` : emptyState('Nothing is put away.', 'storage-panel__empty')}
      <p class="storage-panel__note">A piece comes out in front of you, in the room you are in: set it down where it shows green.</p>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'take') return;
    const pick = this.pick;
    this.pick = null;
    // Picked before the panel closes: closing enters the room at once (a controller, a touchscreen), and the
    // take-out waits for that entry.
    pick?.(Number(el.dataset.index));
    this.close();
  }
}
