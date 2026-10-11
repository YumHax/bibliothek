import type { PubQuestion } from '@/streetShops/quizBank';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import './streetShops.css';

/** What the quiz is dealt by THE LOCAL's door (`world/street/shops/counters`): the round, and how the night ends. */
export interface QuizNight {
  questions: readonly PubQuestion[];
  /** The round is over with `right` good answers: the quizmaster's words (and the prize, paid by the deal). */
  finished(right: number): string;
}

/** What the quizmaster says when an answer is called, right or wrong. */
const RIGHT = ['“Correct!” Somebody at the next table swears.', '“That is the right answer.” Your team mate thumps the table.', '“Yes!” The barman rings the bell.'];
const WRONG = ['“Oh, so close. No.”', '“I’m afraid not.” A groan from your table.', '“No! But a good guess.”'];

/**
 * QUIZ NIGHT at THE LOCAL (docs/economy.md "Front Street's shops and finds"): the quizmaster's question on the
 * chalkboard, four answers to pick from (or the keys 1 to 4), the good one shown, then the next; at the end, how the
 * team did against THE USUAL SUSPECTS, in the quizmaster's words. A `ModalLike` the bar's door opens.
 */
export class PubQuizPanel extends CardPanel {
  private night: QuizNight | null = null;
  private index = 0;
  private picked: number | null = null;
  private right = 0;
  private said = '';
  private over = false;

  constructor(container: HTMLElement) {
    super(container, { className: 'street-quiz', title: 'QUIZ NIGHT at THE LOCAL', dismiss: 'Back to the bar' });
  }

  /** Deals tonight's round (before the Session opens the panel). */
  show(night: QuizNight): void {
    this.night = night;
    this.index = 0;
    this.picked = null;
    this.right = 0;
    this.said = '“Pens ready? Round one: video games.”';
    this.over = false;
  }

  protected render(): Html {
    const night = this.night;
    const question = night?.questions[this.index];
    if (!night || !question) return html``;
    if (this.over) return html`<p class="street-quiz__count">Final scores</p><p class="street-quiz__said">${this.said}</p>`;
    const answered = this.picked !== null;
    return html`<p class="street-quiz__count">Question ${this.index + 1} of ${night.questions.length}</p>
      <p class="street-quiz__question">${question.question}</p>
      <div class="street-quiz__answers">${question.answers.map((answer, i) => {
        const state = !answered ? '' : i === question.right ? ' street-quiz__answer--right' : i === this.picked ? ' street-quiz__answer--wrong' : '';
        return html`<button type="button" class="ui-btn street-quiz__answer${state}" data-action="answer" data-index="${i}"${attr('disabled', answered)}${attr('data-autofocus', i === 0 && !answered)}>${answer}</button>`;
      })}</div>
      <p class="street-quiz__said">${this.said}</p>`;
  }

  protected override actions(): PanelAction[] {
    if (this.over || this.picked === null) return [];
    const last = this.index + 1 >= (this.night?.questions.length ?? 0);
    return [{ action: 'next', label: last ? 'Hand the sheet in' : 'Next question', primary: true, autofocus: true }];
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
    // Walked off before the end: the sheet is handed in as it stands (the fee is paid, the night is had).
    if (this.night && !this.over) this.finish();
  }

  private answer(index: number): void {
    const question = this.night?.questions[this.index];
    if (!question || this.picked !== null || !(index >= 0 && index < question.answers.length)) return;
    this.picked = index;
    const right = index === question.right;
    if (right) this.right++;
    const lines = right ? RIGHT : WRONG;
    this.said = lines[(this.index + index) % lines.length]!;
    this.refresh();
  }

  private next(): void {
    const night = this.night;
    if (!night) return;
    if (this.index + 1 < night.questions.length) {
      this.index++;
      this.picked = null;
      this.said = '';
      this.refresh();
      return;
    }
    this.finish();
    this.refresh();
  }

  private finish(): void {
    if (!this.night || this.over) return;
    this.over = true;
    this.said = this.night.finished(this.right);
  }
}
