import type { Game } from '@/catalog/types';
import { coverAttrs } from './coverPlaceholder';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
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
export class BorrowPanel extends ModalPanel {
  private request: BorrowRequest | null = null;
  private readonly card: HTMLElement;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre borrow-panel' });
    this.root.innerHTML = `<article class="borrow-panel__card ui-card" role="dialog" aria-modal="true" aria-label="A friend asks to borrow a game"></article>`;
    this.card = this.root.querySelector('.borrow-panel__card')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) this.close();
      else if (target.closest('button[data-action="lend"]')) this.answer('lend');
      else if (target.closest('button[data-action="refuse"]')) this.answer('refuse');
    });
  }

  /** Deals the question (call before the Session opens the panel). */
  show(request: BorrowRequest): void {
    this.request = request;
    // A cover that fails is swapped for a made-up box by the shared listener (`installCoverPlaceholders`).
    const attrs = request.game ? coverAttrs(request.game) : ` data-cover-title="${escapeHtml(request.title)}"`;
    const cover = request.cover ? `<img class="borrow-panel__cover catalogue__cover" src="${escapeHtml(request.cover)}" alt=""${attrs}>` : '';
    this.card.innerHTML = `
      <header><h2>${escapeHtml(request.friend)} would like to borrow</h2></header>
      <div class="borrow-panel__game">${cover}<div><p class="borrow-panel__title">${escapeHtml(request.title)}</p><p class="borrow-panel__detail">${escapeHtml(request.detail)}</p></div></div>
      <p class="borrow-panel__terms">Back in ${request.days} days. It stays in your collection meanwhile, but it cannot be sold or swapped while it is out. Friends often bring a little something back with it.</p>
      <footer>
        <button type="button" class="ui-btn ui-btn--primary" data-action="lend" data-autofocus>Lend it</button>
        <button type="button" class="ui-btn" data-action="refuse">Not this one</button>
        <button type="button" class="ui-btn" data-action="close">Think about it</button>
      </footer>`;
  }

  private answer(kind: 'lend' | 'refuse'): void {
    const request = this.request;
    this.request = null;
    this.close();
    if (request) request[kind]();
  }
}
