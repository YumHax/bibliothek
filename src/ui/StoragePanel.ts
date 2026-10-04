import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
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
export class StoragePanel extends ModalPanel {
  private readonly card: HTMLElement;
  private pick: ((index: number) => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre storage-panel' });
    this.root.innerHTML = `<article class="storage-panel__card ui-card" role="dialog" aria-modal="true" aria-label="Stored furniture"></article>`;
    this.card = this.root.querySelector('.storage-panel__card')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) return this.close();
      const row = target.closest<HTMLElement>('button[data-action="take"]');
      if (!row) return;
      const pick = this.pick;
      this.pick = null;
      // Picked before the panel closes: closing enters the room at once (a controller, a touchscreen), and the
      // take-out waits for that entry.
      pick?.(Number(row.dataset.index));
      this.close();
    });
  }

  /** Deals the list (call before the Session opens the panel); `pick` hears the index of the piece taken out. */
  show(entries: readonly StoredEntry[], pick: (index: number) => void): void {
    this.pick = pick;
    const rows = entries
      .map((entry, i) => `<li><span class="storage-panel__name">${escapeHtml(entry.name)}</span><span class="storage-panel__room">${escapeHtml(entry.room)}</span><button type="button" class="ui-btn" data-action="take" data-index="${i}"${i === 0 ? ' data-autofocus' : ''}>Take out</button></li>`)
      .join('');
    this.card.innerHTML = `
      <header><h2>Stored furniture</h2></header>
      ${entries.length ? `<ul class="storage-panel__list">${rows}</ul>` : '<p class="storage-panel__empty">Nothing is put away.</p>'}
      <p class="storage-panel__note">A piece comes out in front of you, in the room you are in: set it down where it shows green.</p>
      <footer><button type="button" class="ui-btn" data-action="close">Close</button></footer>`;
  }
}
