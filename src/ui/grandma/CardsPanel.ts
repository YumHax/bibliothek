import { SUITS, cardName, playable, playYours, drawYours, herTurn, rankMark, type Card, type CardsGame, type HerMove, type Suit } from '@/grandma/crazyEights';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import './pastimes.css';

/** She takes this long over her turn (ms). */
const HER_TURN_MS = 1300;

const SUIT_MARK: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

/** What the panel is dealt: a game, and her side of it (`world/grandma/visit/pastimes`). */
interface CardsDeal {
  /** A fresh game. */
  deal(): CardsGame;
  /** Her words as the cards come out. */
  start: string;
  /** Her turn done: her words. */
  played(move: HerMove): string;
  /** A card of the player's that will not go: her words. */
  refused(card: Card, suit: Suit): string;
  /** The game over: her words (the tally is kept by then). */
  over(winner: 'you' | 'her'): string;
  /** The tally on the back of her envelope. */
  tally(): { her: number; you: number };
}

/**
 * MÉMÉ'S CARDS in the evening (docs/grandma.md "Things to do with her"): crazy eights at her table. Her hand face down,
 * the pile, the player's hand to play from or a card to draw; an eight asks which suit. She plays in her turn and says
 * what she put down; at the end, the tally she keeps on the back of an envelope, and another game if the player likes.
 */
export class CardsPanel extends CardPanel {
  private deal: CardsDeal | null = null;
  private game: CardsGame | null = null;
  /** The eight the player is putting down, waiting for a suit. */
  private eight: number | null = null;
  private herLine = '';
  private timer = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-cards', title: 'Cards with Mémé', dismiss: 'Put the cards away' });
  }

  /** Deals a game (before the Session opens the panel). */
  show(deal: CardsDeal): void {
    this.deal = deal;
    this.newGame(deal.start);
  }

  protected render(): Html {
    const game = this.game;
    if (!game) return html``;
    const yourTurn = game.turn === 'you' && !game.winner;
    const asked = game.top.rank === 8 ? html`<span class="meme-cards__asked">She wants ${game.suit}</span>` : '';
    const tally = this.deal?.tally();
    return html`<div class="meme-cards__table">
        <div class="meme-cards__hand meme-cards__hand--hers" aria-label="Mémé’s hand: ${game.her.length} cards">${game.her.map(() => html`<span class="meme-cards__card meme-cards__card--back"></span>`)}</div>
        <div class="meme-cards__middle">
          <span class="meme-cards__card meme-cards__card--stock" aria-label="The stock">${game.stock.length ? '' : 'empty'}</span>
          ${cardHtml(game.top, 'meme-cards__card--top')}
          ${asked}
        </div>
        <div class="meme-cards__hand" aria-label="Your hand">${game.you.map(
          (card, i) => html`<button type="button" class="meme-cards__card meme-cards__card--${card.suit}${this.eight === i ? ' meme-cards__card--lifted' : ''}" data-action="play" data-index="${i}" aria-label="${cardName(card)}"${attr('disabled', !yourTurn)}>${faceHtml(card)}</button>`,
        )}</div>
      </div>
      ${this.eight !== null
        ? html`<div class="meme-cards__suits" role="group" aria-label="Which suit?">${SUITS.map(
            (suit, i) => html`<button type="button" class="ui-btn meme-cards__suit meme-cards__suit--${suit}" data-action="suit" data-suit="${suit}"${attr('data-autofocus', i === 0)}>${SUIT_MARK[suit]} ${suit}</button>`,
          )}</div>`
        : ''}
      <p class="meme-pastime__her">${this.herLine}</p>
      ${tally ? html`<p class="meme-cards__tally">On the back of her envelope: Mémé ${tally.her}, you ${tally.you}</p>` : ''}`;
  }

  protected override actions(): PanelAction[] {
    const game = this.game;
    if (!game) return [];
    if (game.winner) return [{ action: 'again', label: 'Another game', primary: true, autofocus: true }];
    const yourTurn = game.turn === 'you' && this.eight === null;
    return [{ action: 'draw', label: game.stock.length ? 'Draw a card' : 'Pass', disabled: !yourTurn }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const game = this.game;
    const deal = this.deal;
    if (!game || !deal) return;
    if (action === 'again') {
      this.newGame('');
      return;
    }
    if (game.winner || game.turn !== 'you') return;
    if (action === 'play') {
      const index = Number(el.dataset.index);
      const card = game.you[index];
      if (!card) return;
      if (!playable(game, card)) {
        this.herLine = deal.refused(card, game.suit);
        this.refresh();
        return;
      }
      if (card.rank === 8) {
        this.eight = index;
        this.refresh();
        return;
      }
      playYours(game, index);
      this.afterYours();
    } else if (action === 'suit' && this.eight !== null) {
      const suit = el.dataset.suit as Suit;
      if (!SUITS.includes(suit)) return;
      playYours(game, this.eight, suit);
      this.eight = null;
      this.afterYours();
    } else if (action === 'draw') {
      drawYours(game);
      this.afterYours();
    }
  }

  protected override onBack(): boolean {
    if (this.eight === null) return false;
    this.eight = null;
    this.refresh();
    return true;
  }

  protected override onClosed(): void {
    window.clearTimeout(this.timer);
  }

  private newGame(line: string): void {
    if (!this.deal) return;
    window.clearTimeout(this.timer);
    this.game = this.deal.deal();
    this.eight = null;
    this.herLine = line;
    if (this.isOpen) this.refresh();
  }

  /** The player's turn done: the end, or hers after a moment. */
  private afterYours(): void {
    const game = this.game;
    const deal = this.deal;
    if (!game || !deal) return;
    if (game.winner) {
      this.herLine = deal.over(game.winner);
      this.refresh();
      return;
    }
    this.refresh();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.isOpen || this.game !== game) return;
      const move = herTurn(game);
      this.herLine = deal.played(move);
      if (game.winner) this.herLine = `${this.herLine} ${deal.over(game.winner)}`;
      this.refresh();
    }, HER_TURN_MS);
  }
}

/** A card face up, as an element of its own (the pile's top). */
function cardHtml(card: Card, extra: string): Html {
  return html`<span class="meme-cards__card meme-cards__card--${card.suit} ${extra}" aria-label="${cardName(card)}">${faceHtml(card)}</span>`;
}

/** A card's face: its rank and suit in the corner, the suit large in the middle. */
function faceHtml(card: Card): Html {
  return html`<span class="meme-cards__rank">${rankMark(card)}${SUIT_MARK[card.suit]}</span><span class="meme-cards__pip" aria-hidden="true">${SUIT_MARK[card.suit]}</span>`;
}
