import type { HomeUpgrade } from '@/economy/homeGoods';
import { homeGoodPhoto } from '@/thumbnails/homeGoodPhotos';
import { CardPanel } from './panel/CardPanel';
import { attr, html, type Html } from './panel/html';
import { inlinePictogram } from './panel/pictograms';
import { emptyState } from './panel/widgets';
import { actionCap } from './verb';
import './StoragePanel.css';

/** A piece of furniture put away: what it is, the room it was put away in. */
interface StoredEntry {
  name: string;
  room: string;
  /** The good it was bought as: its shop photo shows on its tag. */
  good?: HomeUpgrade;
}

/** Identical pieces put away in one room, shown as one tag ("Armchair ×2"); a press takes the first out. */
interface StoredGroup {
  name: string;
  good?: HomeUpgrade;
  indices: number[];
}

/**
 * The box room (docs/furnishing.md), from the pause menu: the pieces put away, under the room each was put away
 * in, as luggage tags with the shop's photo (a sofa drawn for a piece with no photo); twins share a tag with
 * their count. Pressing a tag brings that piece out in front of the player in the room they are in, carried (the
 * carry's own prompt says where it fits). Every photo slot is sized before its picture lands, so nothing moves.
 * The list is read each time it opens (`show`).
 */
export class StoragePanel extends CardPanel {
  private entries: readonly StoredEntry[] = [];
  private pick: ((index: number) => void) | null = null;
  /** The shop photos asked for so far, by good (the studio shoots each once). */
  private readonly photos = new Map<HomeUpgrade, string>();
  /** The goods whose photo was asked for (landed or still being shot, or failed): each is asked once. */
  private readonly asked = new Set<HomeUpgrade>();

  constructor(container: HTMLElement) {
    super(container, { className: 'storage-panel', cardClass: 'storage-panel__card ui-card', title: 'The box room', dismiss: 'Back' });
  }

  /** Deals the list (call before the Session opens the panel); `pick` hears the index of the piece taken out. */
  show(entries: readonly StoredEntry[], pick: (index: number) => void): void {
    this.entries = entries;
    this.pick = pick;
    if (this.isOpen) this.refresh();
  }

  /** The pieces by room (in the order rooms first appear), twins in a room merged. */
  private rooms(): { room: string; groups: StoredGroup[] }[] {
    const rooms: { room: string; groups: StoredGroup[] }[] = [];
    this.entries.forEach((entry, i) => {
      let room = rooms.find((r) => r.room === entry.room);
      if (!room) rooms.push((room = { room: entry.room, groups: [] }));
      const twin = room.groups.find((g) => g.name === entry.name && g.good === entry.good);
      if (twin) twin.indices.push(i);
      else room.groups.push({ name: entry.name, good: entry.good, indices: [i] });
    });
    return rooms;
  }

  protected render(): Html {
    if (!this.entries.length) {
      return emptyState(`Carrying a piece, ${actionCap('storePiece')} puts it away; it waits here until a room has space for it.`, { pictogram: 'sofa', title: 'The box room is empty' });
    }
    let first = true;
    return html`<p class="storage-panel__lede">${this.entries.length === 1 ? 'One piece waits under a dust sheet.' : `${this.entries.length} pieces wait under dust sheets.`} Pick one to carry it out.</p>
      ${this.rooms().map(
        ({ room, groups }) => html`<section class="storage-panel__room">
          <h3 class="storage-panel__room-name">Put away from the ${room.toLowerCase()}</h3>
          <ul class="storage-panel__tags">${groups.map((group) => {
            const tag = html`<li><button type="button" class="storage-panel__tag" data-action="take" data-index="${group.indices[0]!}"${attr('data-autofocus', first)} aria-label="Take out the ${group.name}${group.indices.length > 1 ? ` (${group.indices.length} put away)` : ''}">
              <span class="storage-panel__photo">${this.photoHtml(group.good)}</span>
              <span class="storage-panel__name">${group.name}</span>
              ${group.indices.length > 1 ? html`<span class="storage-panel__count">×${group.indices.length}</span>` : ''}
              <span class="storage-panel__verb" aria-hidden="true">Take out</span>
            </button></li>`;
            first = false;
            return tag;
          })}</ul>
        </section>`,
      )}`;
  }

  /** The shop's photo when shot (an empty square till then, already its size), a drawn sofa for a piece with none. */
  private photoHtml(good: HomeUpgrade | undefined): Html {
    if (!good) return inlinePictogram('sofa', 'storage-panel__pictogram');
    const url = this.photos.get(good);
    return html`<img data-photo="${good}" alt=""${url ? html` src="${url}"` : ''} />`;
  }

  /** Each piece's photo, shot the first time and dropped into its (already sized) slot as it comes. */
  protected override repaint(): void {
    super.repaint();
    for (const entry of this.entries) {
      const good = entry.good;
      if (!good || this.photos.has(good) || this.asked.has(good)) continue;
      this.asked.add(good);
      homeGoodPhoto(good).then(
        (url) => {
          this.photos.set(good, url);
          for (const img of this.body.querySelectorAll<HTMLImageElement>(`img[data-photo="${CSS.escape(good)}"]`)) img.src = url;
        },
        () => {},
      );
    }
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
