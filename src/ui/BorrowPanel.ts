import type { Game } from '@/catalog/types';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { coverImg } from './panel/widgets';
import './BorrowPanel.css';

/** A friend's request: who asks for what, for how long, and what each answer does. */
interface BorrowRequest {
  friend: string;
  title: string;
  /** "SNES, 1995": what the card says under the title. */
  detail: string;
  days: number;
  /** A front cover to show, if any. */
  cover?: string;
  /** The game asked for: a cover that fails to load becomes its made-up box (`ui/coverPlaceholder`). */
  game?: Game;
  lend: () => void;
  refuse: () => void;
}

/**
 * A friend on a visit asks to borrow a game: the box, how long, "Lend it" or "Not this one". A
 * `ModalLike` the Session opens through `SessionActions.openPanel` (the friend's click); closing it
 * without an answer leaves the question open, so the friend can be clicked again.
 */
export class BorrowPanel extends CardPanel {
  private request: BorrowRequest | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'borrow-panel', cardClass: 'borrow-panel__card ui-card', title: 'A friend asks to borrow a game', dismiss: 'Think about it' });
  }

  /** Deals the question (call before the Session opens the panel). */
  show(request: BorrowRequest): void {
    this.request = request;
    this.setTitle(`${request.friend} would like to borrow`);
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const request = this.request;
    if (!request) return html``;
    // A cover that fails is swapped for a made-up box by the shared listener (`installCoverPlaceholders`).
    const cover = request.game
      ? coverImg(request.cover, request.game, 'borrow-panel__cover catalogue__cover')
      : request.cover
        ? html`<img class="borrow-panel__cover catalogue__cover" src="${request.cover}" alt="" data-cover-title="${request.title}">`
        : '';
    return html`<div class="borrow-panel__game">${cover}<div><p class="borrow-panel__title">${request.title}</p><p class="borrow-panel__detail">${request.detail}</p></div></div>
      <p class="borrow-panel__terms">Back in ${request.days} days. It stays in your collection meanwhile, but it cannot be sold or swapped while it is out. Friends often bring a little something back with it.</p>`;
  }

  protected override actions(): PanelAction[] {
    if (!this.request) return [];
    return [
      { action: 'refuse', label: 'Not this one' },
      { action: 'lend', label: 'Lend it', primary: true, autofocus: true },
    ];
  }

  protected override onAction(action: string): void {
    if (action === 'lend' || action === 'refuse') this.answer(action);
  }

  private answer(kind: 'lend' | 'refuse'): void {
    const request = this.request;
    this.request = null;
    this.close();
    if (request) request[kind]();
  }
}
