import { SUITS, cardName, playable, playYours, drawYours, herTurn, rankMark, type Card, type CardsGame, type HerMove, type Suit } from '@/grandma/crazyEights';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { playCardDraw, playCardLay } from '@/audio/cardSounds';
import { lastDevice } from '@/input/lastDevice';
import { reduceMotion } from '@/settings/motion';
import type { Expression } from '../social/face';
import { memeSaysHtml, paintMemeFace } from './memeSays';
import './pastimes.css';

/** A card's flight from where it was to where it lands (ms). */
const FLY_MS = 260;

/** Where a card in flight lands after the repaint: the pile, or the end of a hand. */
type Landing = 'pile' | 'yours' | 'hers';

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
 * MÉMÉ'S CARDS in the evening (docs/grandma.md "Things to do with her"): crazy eights at her table. Mémé at the top, her
 * words in her balloon (a thought's cloud while she weighs her turn, one of her cards lifted, the player's hand dimmed);
 * on the green felt her hand face down, the stock and the pile, the player's hand fanned (tighter as it grows, the
 * table never taller). On the player's turn the cards that would go stand a little proud, an eight glows. An eight
 * asks which suit. At the end, the tally she keeps on the back of an envelope in five-bar gates, and another game if
 * the player likes. A card played or drawn flies from where it was to where it lands, with its sound. Keys: 1 to 9
 * play a card of the hand, D draws.
 */
export class CardsPanel extends CardPanel {
  private deal: CardsDeal | null = null;
  private game: CardsGame | null = null;
  /** The eight the player is putting down, waiting for a suit. */
  private eight: number | null = null;
  private herLine = '';
  private face: Expression = 'smile';
  /** Her turn under way (the moment she takes over it). */
  private thinking = false;
  private timer = 0;
  /** A card about to fly: where it starts (the screen box it had) and where it lands once repainted. */
  private flight: { from: DOMRect; to: Landing } | null = null;

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
    const yourTurn = game.turn === 'you' && !game.winner && !this.thinking;
    const asked = game.top.rank === 8 ? html`<span class="meme-cards__asked">She wants <b class="meme-cards__asked-suit meme-cards__suit--${game.suit}">${SUIT_MARK[game.suit]}</b> ${game.suit}</span>` : '';
    const tally = this.deal?.tally();
    const caps = lastDevice() === 'keyboard';
    return html`${memeSaysHtml(this.thinking ? 'Let me see… let me see…' : this.herLine, { thinking: this.thinking })}
      <div class="meme-cards__table">
        <div class="meme-cards__hand meme-cards__hand--hers" style="--n: ${game.her.length}" aria-label="Mémé’s hand: ${game.her.length} cards">${game.her.map(
          (_, i) => html`<span class="meme-cards__card meme-cards__card--back${this.thinking && i === game.her.length - 1 ? ' meme-cards__card--weighing' : ''}"></span>`,
        )}</div>
        <div class="meme-cards__middle">
          ${game.stock.length
            ? html`<span class="meme-cards__card meme-cards__card--stock" aria-label="The stock"></span>`
            : html`<span class="meme-cards__card meme-cards__card--gone" aria-label="The stock is used up"></span>`}
          ${cardHtml(game.top, 'meme-cards__card--top')}
          <span class="meme-cards__asked-slot">${asked}</span>
        </div>
        <div class="meme-cards__hand meme-cards__hand--yours${yourTurn ? '' : ' meme-cards__hand--waiting'}" style="--n: ${game.you.length}" aria-label="Your hand">${game.you.map((card, i) => {
          const goes = yourTurn && playable(game, card);
          const classes = ['meme-cards__card', `meme-cards__card--${card.suit}`, this.eight === i ? 'meme-cards__card--lifted' : '', goes ? 'meme-cards__card--goes' : '', goes && card.rank === 8 ? 'meme-cards__card--eight' : ''].filter(Boolean).join(' ');
          return html`<button type="button" class="${classes}" style="--i: ${i}" data-action="play" data-index="${i}" aria-label="${cardName(card)}${goes ? '' : ', won’t go now'}"${attr('disabled', !yourTurn)}>${faceHtml(card)}${caps && i < 9 ? html`<kbd class="meme-cards__cap">${i + 1}</kbd>` : ''}</button>`;
        })}</div>
      </div>
      <div class="meme-cards__under">
        ${this.eight !== null
          ? html`<div class="meme-cards__suits" role="group" aria-label="Which suit?">${SUITS.map(
              (suit, i) => html`<button type="button" class="ui-btn meme-cards__suit meme-cards__suit--${suit}" data-action="suit" data-suit="${suit}"${attr('data-autofocus', i === 0)}><b>${SUIT_MARK[suit]}</b> ${suit}</button>`,
            )}</div>`
          : tally
            ? html`<div class="meme-cards__envelope" aria-label="On the back of her envelope: Mémé ${tally.her}, you ${tally.you}">
                <span class="meme-cards__envelope-name">Mémé</span>${tallyMarks(tally.her)}
                <span class="meme-cards__envelope-name">You</span>${tallyMarks(tally.you)}
              </div>`
            : ''}
      </div>`;
  }

  protected override repaint(): void {
    super.repaint();
    paintMemeFace(this.body, this.face);
    this.fly();
  }

  protected override actions(): PanelAction[] {
    const game = this.game;
    if (!game) return [];
    if (game.winner) return [{ action: 'again', label: 'Another game', primary: true, autofocus: true }];
    const yourTurn = game.turn === 'you' && this.eight === null && !this.thinking;
    const words = game.stock.length ? 'Draw a card' : 'Pass';
    return [{ action: 'draw', label: lastDevice() === 'keyboard' ? html`${words} <kbd>D</kbd>` : words, disabled: !yourTurn }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const game = this.game;
    const deal = this.deal;
    if (!game || !deal) return;
    if (action === 'again') {
      this.newGame('');
      return;
    }
    if (game.winner || game.turn !== 'you' || this.thinking) return;
    if (action === 'play') {
      const index = Number(el.dataset.index);
      const card = game.you[index];
      if (!card) return;
      if (!playable(game, card)) {
        this.herLine = deal.refused(card, game.suit);
        this.face = 'frown';
        this.refresh();
        return;
      }
      if (card.rank === 8) {
        this.eight = index;
        this.refresh();
        return;
      }
      this.launch(el, 'pile');
      playYours(game, index);
      this.afterYours();
    } else if (action === 'suit' && this.eight !== null) {
      const suit = el.dataset.suit as Suit;
      if (!SUITS.includes(suit)) return;
      const lifted = this.body.querySelector<HTMLElement>(`[data-action="play"][data-index="${this.eight}"]`);
      if (lifted) this.launch(lifted, 'pile');
      playYours(game, this.eight, suit);
      this.eight = null;
      this.afterYours();
    } else if (action === 'draw') {
      const stock = this.body.querySelector<HTMLElement>('.meme-cards__card--stock');
      if (stock && game.stock.length) this.launch(stock, 'yours');
      drawYours(game);
      this.afterYours();
    }
  }

  /** 1 to 9 play the hand's card of that place, D draws (or passes). */
  protected override onKey(e: KeyboardEvent): void {
    const game = this.game;
    if (!game || game.winner || game.turn !== 'you' || this.thinking) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit && this.eight === null) {
      const el = this.body.querySelector<HTMLElement>(`[data-action="play"][data-index="${Number(digit[1]) - 1}"]`);
      if (!el) return;
      e.preventDefault();
      this.onAction('play', el);
    } else if (e.code === 'KeyD' && this.eight === null) {
      e.preventDefault();
      this.onAction('draw', this.body);
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
    this.thinking = false;
    this.flight = null;
  }

  /** The card now at `from` is about to move: its box is kept, and it flies from there once the table is repainted. */
  private launch(from: HTMLElement, to: Landing): void {
    this.flight = { from: from.getBoundingClientRect(), to };
  }

  /** The card in flight, if any, from where it was to where it landed in the repaint. */
  private fly(): void {
    const flight = this.flight;
    this.flight = null;
    if (!flight) return;
    if (flight.to === 'pile') playCardLay();
    else playCardDraw();
    const hand = flight.to === 'hers' ? '.meme-cards__hand--hers .meme-cards__card' : '.meme-cards__hand:not(.meme-cards__hand--hers) .meme-cards__card';
    const landed = flight.to === 'pile' ? this.body.querySelector<HTMLElement>('.meme-cards__card--top') : [...this.body.querySelectorAll<HTMLElement>(hand)].pop();
    if (!landed || reduceMotion() || typeof landed.animate !== 'function') return;
    const at = landed.getBoundingClientRect();
    const dx = flight.from.left - at.left;
    const dy = flight.from.top - at.top;
    landed.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${flight.to === 'pile' ? -8 : 6}deg)`, zIndex: 2 },
        { transform: 'translate(0, 0) rotate(0deg)', zIndex: 2 },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
  }

  private newGame(line: string): void {
    if (!this.deal) return;
    window.clearTimeout(this.timer);
    this.game = this.deal.deal();
    this.eight = null;
    this.thinking = false;
    this.herLine = line;
    this.face = 'smile';
    if (this.isOpen) this.refresh();
  }

  /** The player's turn done: the end, or hers after a moment. */
  private afterYours(): void {
    const game = this.game;
    const deal = this.deal;
    if (!game || !deal) return;
    if (game.winner) {
      this.herLine = deal.over(game.winner);
      this.face = game.winner === 'her' ? 'smile' : 'surprise';
      this.refresh();
      return;
    }
    this.thinking = true;
    this.face = 'rest';
    this.refresh();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.thinking = false;
      if (!this.isOpen || this.game !== game) return;
      const hers = this.body.querySelectorAll<HTMLElement>('.meme-cards__hand--hers .meme-cards__card');
      const stock = this.body.querySelector<HTMLElement>('.meme-cards__card--stock');
      const move = herTurn(game);
      if ((move.kind === 'play' || move.kind === 'cheat') && hers.length) this.launch(hers[hers.length - 1]!, 'pile');
      else if (move.kind === 'draw' && stock) this.launch(stock, 'hers');
      this.herLine = deal.played(move);
      this.face = move.kind === 'cheat' ? 'surprise' : move.kind === 'draw' ? 'frown' : 'smile';
      if (game.winner) {
        this.herLine = `${this.herLine} ${deal.over(game.winner)}`;
        this.face = game.winner === 'her' ? 'smile' : 'surprise';
      }
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

/** A score in five-bar gates, the way she keeps it on the back of her envelope: four strokes and one across, then the rest. */
function tallyMarks(n: number): Html {
  const gates = Math.floor(n / 5);
  const rest = n % 5;
  return html`<span class="meme-cards__marks">${[...Array(gates).keys()].map(() => html`<span class="meme-cards__gate"><i></i><i></i><i></i><i></i><s></s></span>`)}${rest ? html`<span class="meme-cards__gate">${[...Array(rest).keys()].map(() => html`<i></i>`)}</span>` : ''}${n === 0 ? html`<span class="meme-cards__nil">none yet</span>` : ''}</span>`;
}
