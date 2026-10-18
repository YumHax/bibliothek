import { downWordsOf, type CrosswordWord } from '@/grandma/crosswordBank';
import { playPenStroke, playPencil, playRubOut } from '@/audio/pastimeSounds';
import { lastDevice } from '@/input/lastDevice';
import { reduceMotion } from '@/settings/motion';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { memeSay, memeSaysHtml, paintMemeFace, shake } from './memeSays';
import './pastimes.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** The letter tray's columns: 26 letters and the rubber, three rows of nine. */
const TRAY_COLUMNS = 9;
/** Misses before she sees one more letter. */
const MISSES_FOR_A_LETTER = 2;
/** A wrong word: how long the rubber works before the squares are clean (ms; `--mp-rub` in pastimes.css). */
const RUB_MS = 520;

/** What the panel is dealt: the word she is stuck on, and her side of it (`world/grandma/visit/pastimes`). */
interface CrosswordDeal {
  word: CrosswordWord;
  /** Her words as the paper comes out. */
  start: string;
  /** A wrong word: her words. */
  wrong(): string;
  /** After a few misses, one more letter: her words. */
  hint(): string;
  /** The word found: her words. */
  solved(): string;
  /** Left to her: her words. */
  leave(): string;
}

/**
 * THE MORNING CROSSWORD at Mémé's table (docs/grandma.md "Things to do with her"): Mémé at the top with her words in her
 * balloon; under her the evening paper folded open at the crossword (masthead, column rule, her coffee's ring), the clue
 * in print with its letter count, its patch of the grid: the word across, the words going down that she has done in
 * ink, the black squares round them. The square the next letter goes into is marked (a pencil's blinking stroke under
 * it; a click on a square moves it). Letters go in in pencil, from the keys or the letter tray under the paper. Wrong,
 * the row shudders and the rubber clears it; twice wrong, she finds one more letter; found, the pen goes over it in ink.
 */
export class CrosswordPanel extends CardPanel {
  private deal: CrosswordDeal | null = null;
  /** The letters in the squares now: given, found by her, or typed. */
  private squares: (string | null)[] = [];
  private known = new Set<number>();
  /** The square the next letter goes into. */
  private cursor = 0;
  private misses = 0;
  private solved = false;
  private left = false;
  /** The rubber at work on a wrong word: no typing until it is done. */
  private rubbing = false;
  private herLine = '';
  private face: Expression = 'rest';
  private timer = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-crossword', title: 'The crossword', dismiss: 'Back to her' });
  }

  /** Deals the word (before the Session opens the panel). */
  show(deal: CrosswordDeal): void {
    this.deal = deal;
    this.known = new Set(deal.word.given);
    this.squares = [...deal.word.answer].map((letter, i) => (this.known.has(i) ? letter : null));
    this.cursor = this.nextBlank(0);
    this.misses = 0;
    this.solved = false;
    this.left = false;
    this.rubbing = false;
    this.herLine = deal.start;
    this.face = 'rest';
    if (this.isOpen) this.refresh();
  }

  /** Whether the word went in (read when the panel closes). */
  get found(): boolean {
    return this.solved;
  }

  protected render(): Html {
    const deal = this.deal;
    if (!deal) return html``;
    const done = this.solved || this.left;
    const word = deal.word;
    // The grid's patch: as many rows as the words going down reach above and below the word across.
    const downs = downWordsOf(word);
    const above = Math.max(0, ...downs.map((d) => d.at));
    const below = Math.max(0, ...downs.map((d) => d.letters.length - 1 - d.at));
    const rows = [...Array(above + 1 + below).keys()].map((r) => r - above);
    const number = 10 + (word.answer.length * 7 + word.clue.length) % 30;
    const cell = (row: number, col: number): Html => {
      if (row === 0) {
        const letter = this.squares[col];
        const given = this.known.has(col);
        const here = !done && !given && col === this.cursor;
        const classes = ['meme-crossword__square', 'meme-crossword__square--across', given ? 'meme-crossword__square--given' : '', here ? 'meme-crossword__square--here' : '', letter && !given ? 'meme-crossword__square--pencil' : ''].filter(Boolean).join(' ');
        const n = col === 0 ? html`<span class="meme-crossword__num">${number}</span>` : '';
        return given || done
          ? html`<span class="${classes}" style="--i: ${col}">${n}<span class="meme-crossword__glyph">${letter ?? ''}</span></span>`
          : html`<button type="button" class="${classes}" style="--i: ${col}" data-action="square" data-col="${col}" aria-label="Square ${col + 1}${letter ? `: ${letter}` : ', empty'}">${n}<span class="meme-crossword__glyph">${letter ?? ''}</span></button>`;
      }
      const down = downs.find((d) => d.col === col);
      const letter = down?.letters[down.at + row];
      return letter ? html`<span class="meme-crossword__square meme-crossword__square--down"><span class="meme-crossword__glyph">${letter}</span></span>` : html`<span class="meme-crossword__square meme-crossword__square--black"></span>`;
    };
    const caps = lastDevice() === 'keyboard';
    return html`${memeSaysHtml(this.herLine)}
      <div class="meme-crossword__paper">
        <p class="meme-crossword__masthead"><span>The Evening Post</span><span>Crossword</span></p>
        <span class="meme-crossword__ring" aria-hidden="true"></span>
        <p class="meme-crossword__clue"><b>${number} across.</b> ${word.clue} <span class="meme-crossword__count">(${word.answer.length})</span></p>
        <div class="meme-crossword__grid${this.solved ? ' meme-crossword__grid--inked' : ''}${this.rubbing ? ' meme-crossword__grid--rubbing' : ''}" style="--cols: ${this.squares.length}" role="group" aria-label="The word so far">${rows.map((row) =>
          this.squares.map((_, col) => cell(row, col)),
        )}</div>
        <p class="meme-crossword__hint">${done ? (this.solved ? 'In ink now.' : 'She’ll get it, in the end.') : caps ? html`Type the word · <kbd>⌫</kbd> rubs out · <kbd>Enter</kbd> writes it in` : 'Pick the letters from the tray'}</p>
      </div>
      <div class="meme-crossword__tray" role="group" aria-label="Letters"${attr('hidden', done)}>${[...LETTERS].map(
        (letter) => html`<button type="button" class="meme-crossword__tile" data-action="letter" data-letter="${letter}" aria-disabled="${this.rubbing}">${letter}</button>`,
      )}<button type="button" class="meme-crossword__tile meme-crossword__tile--rub" data-action="rub" aria-label="Rub out the last letter"><span class="meme-crossword__rubber" aria-hidden="true"></span>Rub out</button></div>`;
  }

  protected override repaint(): void {
    super.repaint();
    paintMemeFace(this.body, this.face);
  }

  protected override actions(): PanelAction[] {
    if (this.solved || this.left) return [];
    const full = this.squares.every((letter) => letter !== null);
    return [
      { action: 'leave', label: 'Leave it to her' },
      { action: 'check', label: 'Write it in', primary: true, disabled: !full || this.rubbing },
    ];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'letter') this.type(el.dataset.letter ?? '');
    else if (action === 'rub') this.rubOut();
    else if (action === 'square') this.moveTo(Number(el.dataset.col));
    else if (action === 'check') this.check();
    else if (action === 'leave') this.leave();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (this.solved || this.left) return;
    const letter = /^Key([A-Z])$/.exec(e.code);
    if (letter) {
      e.preventDefault();
      this.type(letter[1]!);
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      e.preventDefault();
      this.rubOut();
    }
  }

  /** The letter tray walks in two dimensions on the D-pad and the arrows; elsewhere the focus walks as usual. */
  protected override onMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    const tiles = [...this.body.querySelectorAll<HTMLElement>('.meme-crossword__tile')];
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return false;
    let next = at;
    if (direction === 'left') next = at - 1;
    else if (direction === 'right') next = at + 1;
    else if (direction === 'up') next = at - TRAY_COLUMNS;
    else next = at + TRAY_COLUMNS;
    if (direction === 'down' && next >= tiles.length && Math.floor(at / TRAY_COLUMNS) < Math.floor((tiles.length - 1) / TRAY_COLUMNS)) next = tiles.length - 1;
    if (next < 0 || next >= tiles.length) return false;
    tiles[next]!.focus({ preventScroll: true });
    return true;
  }

  protected override onEnter(): boolean {
    if (this.solved || this.left || this.rubbing || this.squares.some((letter) => letter === null)) return false;
    this.check();
    return true;
  }

  protected override onClosed(): void {
    window.clearTimeout(this.timer);
    this.rubbing = false;
  }

  /** The first square from `from` on that is neither hers nor filled, else the last of hers not given, else `from`. */
  private nextBlank(from: number): number {
    for (let i = from; i < this.squares.length; i++) if (this.squares[i] === null) return i;
    for (let i = 0; i < from; i++) if (this.squares[i] === null) return i;
    return Math.min(from, this.squares.length - 1);
  }

  private moveTo(col: number): void {
    if (!(col >= 0 && col < this.squares.length) || this.known.has(col)) return;
    this.cursor = col;
    this.refresh();
  }

  private type(letter: string): void {
    if (this.rubbing || !LETTERS.includes(letter) || letter.length !== 1) return;
    // The letter goes where the mark is (a filled square the player clicked is written over), never on one of hers.
    let at = this.cursor;
    if (this.known.has(at)) at = this.nextBlank(at);
    if (this.known.has(at)) return;
    this.squares[at] = letter;
    this.cursor = this.nextBlank(at + 1);
    playPencil();
    this.refresh();
  }

  /** Takes back the letter at the mark, else the last one typed before it (never one she had). */
  private rubOut(): void {
    if (this.rubbing) return;
    const start = this.squares[this.cursor] !== null && !this.known.has(this.cursor) ? this.cursor : this.cursor - 1;
    for (let i = start; i >= 0; i--) {
      if (this.squares[i] !== null && !this.known.has(i)) {
        this.squares[i] = null;
        this.cursor = i;
        playRubOut();
        this.refresh();
        return;
      }
    }
  }

  private check(): void {
    const deal = this.deal;
    if (!deal || this.rubbing || this.squares.some((letter) => letter === null)) return;
    if (this.squares.join('') === deal.word.answer) {
      this.solved = true;
      this.herLine = deal.solved();
      this.face = 'smile';
      playPenStroke();
      this.refresh();
      return;
    }
    this.misses++;
    // The row shudders, the rubber clears the typed letters; after a few misses she has one more from the word going down.
    let line = deal.wrong();
    let found = false;
    if (this.misses % MISSES_FOR_A_LETTER === 0) {
      const unknown = [...deal.word.answer].map((_, i) => i).filter((i) => !this.known.has(i));
      if (unknown.length > 1) {
        this.known.add(unknown[Math.floor(unknown.length / 2)]!);
        line = deal.hint();
        found = true;
      }
    }
    this.herLine = line;
    this.face = found ? 'surprise' : 'frown';
    memeSay(this.body, line, this.face);
    playRubOut();
    this.rubbing = true;
    this.refresh();
    shake(this.body.querySelector('.meme-crossword__grid'));
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.rubbed(), reduceMotion() ? 0 : RUB_MS);
  }

  /** The rubber done: the squares clean but for hers, the mark on the first blank. */
  private rubbed(): void {
    const deal = this.deal;
    this.rubbing = false;
    if (!deal || !this.isOpen) return;
    this.squares = [...deal.word.answer].map((letter, i) => (this.known.has(i) ? letter : null));
    this.cursor = this.nextBlank(0);
    this.refresh();
  }

  private leave(): void {
    if (!this.deal) return;
    window.clearTimeout(this.timer);
    this.rubbing = false;
    this.left = true;
    this.herLine = this.deal.leave();
    this.face = 'smile';
    this.refresh();
  }
}
