import type { QuizQuestion } from '@/grandma/quizBank';
import { random } from '@/random';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import './pastimes.css';

/** Her blurt comes this long after a question is up, unless the player answers first (ms). */
const BLURT_MS: readonly [number, number] = [2600, 5600];

/** What the panel is dealt: the round, and her side of it (`world/grandma/visit/pastimes`). */
interface QuizDeal {
  questions: readonly QuizQuestion[];
  /** What she blurts at `question`: the answer she picks and her words, or null (she keeps quiet). */
  blurt(question: QuizQuestion): { answer: number; line: string } | null;
  /** The player answered `question`, right or not: her words. */
  answered(question: QuizQuestion, right: boolean): string;
  /** The round is over (`you` and `her`: the good answers): her words. */
  finished(you: number, her: number): string;
}

/**
 * THE AFTERNOON QUIZ on Mémé's set (docs/grandma.md "Things to do with her"): the show's question and its answers, her
 * blurting one out a moment later unless the player is quicker, then the good answer shown. Five questions, and at the
 * end how each did, in words. A `ModalLike` the conversation's entry opens.
 */
export class QuizPanel extends CardPanel {
  private deal: QuizDeal | null = null;
  private index = 0;
  /** The player's pick for the question up, her blurt for it, the good answers each. */
  private picked: number | null = null;
  private herPick: number | null = null;
  private herLine = '';
  private you = 0;
  private her = 0;
  private over = false;
  private timer = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-quiz', title: 'The Golden Question', dismiss: 'Back to her' });
  }

  /** Deals a round (before the Session opens the panel). */
  show(deal: QuizDeal): void {
    this.deal = deal;
    this.index = 0;
    this.you = 0;
    this.her = 0;
    this.over = false;
    this.ask();
  }

  protected render(): Html {
    const deal = this.deal;
    const question = deal?.questions[this.index];
    if (!deal || !question) return html``;
    if (this.over) {
      return html`<p class="meme-quiz__count">The end of the show</p>
        <p class="meme-quiz__question">You got ${this.you} right. Mémé got ${this.her}.</p>
        <p class="meme-pastime__her">${this.herLine}</p>`;
    }
    const answered = this.picked !== null;
    return html`<p class="meme-quiz__count">Question ${this.index + 1} of ${deal.questions.length}</p>
      <p class="meme-quiz__question">${question.question}</p>
      <div class="meme-quiz__answers">${question.answers.map((answer, i) => {
        const state = !answered ? '' : i === question.right ? ' meme-quiz__answer--right' : i === this.picked ? ' meme-quiz__answer--wrong' : '';
        const hers = this.herPick === i ? html`<span class="meme-quiz__hers">Mémé</span>` : '';
        return html`<button type="button" class="ui-btn meme-quiz__answer${state}" data-action="answer" data-index="${i}"${attr('disabled', answered)}${attr('data-autofocus', i === 0 && !answered)}>${answer}${hers}</button>`;
      })}</div>
      <p class="meme-pastime__her">${this.herLine}</p>`;
  }

  protected override actions(): PanelAction[] {
    if (this.over || this.picked === null) return [];
    const last = this.index + 1 >= (this.deal?.questions.length ?? 0);
    return [{ action: 'next', label: last ? 'The end of the show' : 'Next question', primary: true, autofocus: true }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'answer') this.answer(Number(el.dataset.index));
    else if (action === 'next') this.next();
  }

  protected override onKey(e: KeyboardEvent): void {
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (!digit || this.picked !== null || this.over) return;
    e.preventDefault();
    this.answer(Number(digit[1]) - 1);
  }

  protected override onEnter(): boolean {
    if (this.picked === null || this.over) return false;
    this.next();
    return true;
  }

  protected override onClosed(): void {
    window.clearTimeout(this.timer);
  }

  /** The question up: nothing picked, her blurt on its way. */
  private ask(): void {
    this.picked = null;
    this.herPick = null;
    this.herLine = '';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.blurt(), BLURT_MS[0] + random() * (BLURT_MS[1] - BLURT_MS[0]));
    if (this.isOpen) this.refresh();
  }

  private blurt(): void {
    const question = this.deal?.questions[this.index];
    if (!question || this.picked !== null || this.over) return;
    const said = this.deal?.blurt(question);
    if (!said) return;
    this.herPick = said.answer;
    this.herLine = said.line;
    this.refresh();
  }

  private answer(index: number): void {
    const deal = this.deal;
    const question = deal?.questions[this.index];
    if (!deal || !question || this.picked !== null || !(index >= 0 && index < question.answers.length)) return;
    window.clearTimeout(this.timer);
    this.picked = index;
    const right = index === question.right;
    if (right) this.you++;
    if (this.herPick === question.right) this.her++;
    this.herLine = deal.answered(question, right);
    this.refresh();
  }

  private next(): void {
    const deal = this.deal;
    if (!deal) return;
    if (this.index + 1 < deal.questions.length) {
      this.index++;
      this.ask();
      return;
    }
    this.over = true;
    this.herLine = deal.finished(this.you, this.her);
    this.refresh();
  }
}
