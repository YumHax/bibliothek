import type { CrosswordWord } from '@/grandma/crosswordBank';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import './pastimes.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Misses before she sees one more letter. */
const MISSES_FOR_A_LETTER = 2;

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
 * THE MORNING CROSSWORD at Mémé's table (docs/grandma.md "Things to do with her"): the paper's clue, the word's squares
 * with the letters she already has, the player's typed into the blanks (the keys, or the letters under the squares).
 * Wrong, she says it won't fit; twice wrong, she finds one more letter; found, it goes in, in ink.
 */
export class CrosswordPanel extends CardPanel {
  private deal: CrosswordDeal | null = null;
  /** The letters in the squares now: given, found by her, or typed. */
  private squares: (string | null)[] = [];
  private known = new Set<number>();
  private misses = 0;
  private solved = false;
  private left = false;
  private herLine = '';

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-crossword', title: 'The crossword', dismiss: 'Back to her' });
  }

  /** Deals the word (before the Session opens the panel). */
  show(deal: CrosswordDeal): void {
    this.deal = deal;
    this.known = new Set(deal.word.given);
    this.squares = [...deal.word.answer].map((letter, i) => (this.known.has(i) ? letter : null));
    this.misses = 0;
    this.solved = false;
    this.left = false;
    this.herLine = deal.start;
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
    return html`<p class="meme-crossword__clue">${deal.word.clue}</p>
      <div class="meme-crossword__squares${this.solved ? ' meme-crossword__squares--inked' : ''}" aria-label="The word so far">${this.squares.map(
        (letter, i) => html`<span class="meme-crossword__square${this.known.has(i) ? ' meme-crossword__square--given' : ''}">${letter ?? ''}</span>`,
      )}</div>
      <div class="meme-crossword__letters"${attr('hidden', done)}>${[...LETTERS].map(
        (letter) => html`<button type="button" class="ui-btn meme-crossword__letter" data-action="letter" data-letter="${letter}">${letter}</button>`,
      )}<button type="button" class="ui-btn meme-crossword__letter meme-crossword__rub" data-action="rub">Rub out</button></div>
      <p class="meme-pastime__her">${this.herLine}</p>`;
  }

  protected override actions(): PanelAction[] {
    if (this.solved || this.left) return [];
    const full = this.squares.every((letter) => letter !== null);
    return [
      { action: 'leave', label: 'Leave it to her' },
      { action: 'check', label: 'Write it in', primary: true, disabled: !full },
    ];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'letter') this.type(el.dataset.letter ?? '');
    else if (action === 'rub') this.rubOut();
    else if (action === 'check') this.check();
    else if (action === 'leave') this.leave();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (this.solved || this.left) return;
    const letter = /^Key([A-Z])$/.exec(e.code);
    if (letter) {
      e.preventDefault();
      this.type(letter[1]!);
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      this.rubOut();
    }
  }

  protected override onEnter(): boolean {
    if (this.solved || this.left || this.squares.some((letter) => letter === null)) return false;
    this.check();
    return true;
  }

  private type(letter: string): void {
    const blank = this.squares.indexOf(null);
    if (blank < 0 || !LETTERS.includes(letter) || letter.length !== 1) return;
    this.squares[blank] = letter;
    this.refresh();
  }

  /** Takes back the last letter typed (never one she had). */
  private rubOut(): void {
    for (let i = this.squares.length - 1; i >= 0; i--) {
      if (this.squares[i] !== null && !this.known.has(i)) {
        this.squares[i] = null;
        this.refresh();
        return;
      }
    }
  }

  private check(): void {
    const deal = this.deal;
    if (!deal || this.squares.some((letter) => letter === null)) return;
    if (this.squares.join('') === deal.word.answer) {
      this.solved = true;
      this.herLine = deal.solved();
      this.refresh();
      return;
    }
    this.misses++;
    // The typed letters rubbed out; after a few misses she has one more from the word going down.
    let line = deal.wrong();
    if (this.misses % MISSES_FOR_A_LETTER === 0) {
      const unknown = [...deal.word.answer].map((_, i) => i).filter((i) => !this.known.has(i));
      if (unknown.length > 1) {
        this.known.add(unknown[Math.floor(unknown.length / 2)]!);
        line = deal.hint();
      }
    }
    this.squares = [...deal.word.answer].map((letter, i) => (this.known.has(i) ? letter : null));
    this.herLine = line;
    this.refresh();
  }

  private leave(): void {
    if (!this.deal) return;
    this.left = true;
    this.herLine = this.deal.leave();
    this.refresh();
  }
}
