import type { Game } from '@/catalog/types';
import type { PersonId } from '@/social/types';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { Speaker } from './panel/speaker';
import { coverImg } from './panel/widgets';
import './BorrowPanel.css';

/** A friend's request: who asks for what, for how long, and what each answer does. */
interface BorrowRequest {
  friend: string;
  /** The friend in the social roster: their painted face asks. */
  person?: PersonId;
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
 * A friend on a visit asks to borrow a game: their face and the ask in a balloon, the box held between you with a
 * calendar leaf for when it comes back, "Take it" or "Not this one" (their answer is said in the room, by them,
 * once the card is down). A `ModalLike` the Session opens through `SessionActions.openPanel` (the friend's click);
 * closing it without an answer leaves the question open, so the friend can be clicked again.
 */
export class BorrowPanel extends CardPanel {
  private request: BorrowRequest | null = null;
  private readonly asker = new Speaker({ name: 'A friend' });

  constructor(container: HTMLElement) {
    super(container, { className: 'borrow-panel', cardClass: 'borrow-panel__card ui-card', title: 'Can I borrow it?', dismiss: 'Think about it' });
    this.asker.mountAbove(this.body);
  }

  /** Deals the question (call before the Session opens the panel). */
  show(request: BorrowRequest): void {
    this.request = request;
    this.setTitle(`${request.friend} asks a favour`);
    this.asker.setWho({ name: request.friend, person: request.person });
    this.asker.say(`“Can I take ${request.title} home for a few days? I’ll look after it, promise.”`, 'smile');
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
        : html`<span class="borrow-panel__cover borrow-panel__cover--none" aria-hidden="true"></span>`;
    return html`<div class="borrow-panel__game">
      <span class="borrow-panel__box">${cover}</span>
      <div class="borrow-panel__about">
        <p class="borrow-panel__title">${request.title}</p>
        <p class="borrow-panel__detail">${request.detail}</p>
        <p class="borrow-panel__back"><span class="borrow-panel__leaf" aria-hidden="true"><span class="borrow-panel__leaf-days">${request.days}</span><span class="borrow-panel__leaf-unit">${request.days === 1 ? 'day' : 'days'}</span></span>Back in ${request.days === 1 ? 'a day' : `${request.days} days`}</p>
      </div>
    </div>`;
  }

  protected override actions(): PanelAction[] {
    if (!this.request) return [];
    return [
      { action: 'refuse', label: 'Not this one' },
      { action: 'lend', label: 'Take it', primary: true, autofocus: true },
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
