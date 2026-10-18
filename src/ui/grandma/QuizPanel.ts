import type { QuizQuestion } from '@/grandma/quizBank';
import { random } from '@/random';
import { playAnswer } from '@/audio/dealSounds';
import { playApplause, playQuizBuzzIn, playQuizJingle } from '@/audio/pastimeSounds';
import { lastDevice } from '@/input/lastDevice';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { memeSay, memeSaysHtml, paintMemeFace } from './memeSays';
import './pastimes.css';

/** Her blurt comes this long after a question is up, unless the player answers first (ms). */
const BLURT_MS: readonly [number, number] = [2600, 5600];
/** The answers' letters, as the show puts them up; the keys A to D (or 1 to 4) pick them. */
const LETTERS = 'ABCD';

/** What the panel is dealt: the round, and her side of it (`world/grandma/visit/pastimes`). */
interface QuizDeal {
  questions: readonly QuizQuestion[];
  /** What she blurts at `question`: the answer she picks (null: she lets the player answer) and her words, or null (she keeps quiet). */
  blurt(question: QuizQuestion): { answer: number | null; line: string } | null;
  /** The player answered `question`, right or not: her words. */
  answered(question: QuizQuestion, right: boolean): string;
  /** The round is over (`you` and `her`: the good answers): her words. */
  finished(you: number, her: number): string;
}

/**
 * THE AFTERNOON QUIZ on Mémé's set (docs/grandma.md "Things to do with her"): Mémé in her armchair at the top, her words
 * in her balloon (a thought's cloud while she puzzles over the question); under her, her walnut set with the show on
 * its curved blue screen: THE GOLDEN QUESTION lit up, the question, four lettered lozenges. A moment later she buzzes in
 * with her pick (a ding, her tag on the lozenge) unless the player is quicker; the good answer lights up with a sweep,
 * the bell or the buzzer. The two scores sit on the set's foot. At the end the screen is the show's last card: the two
 * podiums with their scores, the night's champion, the studio's applause.
 */
export class QuizPanel extends CardPanel {
  private deal: QuizDeal | null = null;
  private index = 0;
  /** The player's pick for the question up, her blurt for it, the good answers each. */
  private picked: number | null = null;
  private herPick: number | null = null;
  private herLine = '';
  private face: Expression = 'rest';
  private you = 0;
  private her = 0;
  private over = false;
  private timer = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-quiz', title: 'On Mémé’s set', dismiss: 'Back to her' });
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
    const thinking = !this.over && this.picked === null && this.herPick === null && !this.herLine;
    const said = memeSaysHtml(thinking ? 'Hmm… wait, wait, I know this one…' : this.herLine, { thinking });
    // Her set: the walnut case round the curved screen, the scores on its foot.
    const set = (inner: Html, foot: Html): Html => html`<div class="meme-quiz__set${this.over ? ' meme-quiz__set--end' : ''}">
        <div class="meme-quiz__screen"><p class="meme-quiz__show">The Golden Question</p>${inner}</div>
        <div class="meme-quiz__foot">${foot}</div>
      </div>`;
    const scores = html`<span class="meme-quiz__score"><b>You</b><span class="meme-quiz__digits">${this.you}</span></span>
      <span class="meme-quiz__knob" aria-hidden="true"></span><span class="meme-quiz__knob" aria-hidden="true"></span>
      <span class="meme-quiz__score"><b>Mémé</b><span class="meme-quiz__digits">${this.her}</span></span>`;
    if (this.over) {
      const champion = this.you > this.her ? 'you' : this.her > this.you ? 'her' : 'both';
      const podium = (who: 'you' | 'her', name: string, score: number): Html =>
        html`<div class="meme-quiz__podium${champion === who || champion === 'both' ? ' meme-quiz__podium--won' : ''}" style="--rise: ${Math.min(5, score)}">
          <span class="meme-quiz__podium-score">${score}</span><span class="meme-quiz__podium-name">${name}</span>
        </div>`;
      return html`${said}${set(
        html`<p class="meme-quiz__count">The end of the show</p>
          <div class="meme-quiz__podiums">${podium('you', 'You', this.you)}${podium('her', 'Mémé', this.her)}</div>
          <p class="meme-quiz__champion">${champion === 'both' ? 'A dead heat! Both champions tonight' : champion === 'you' ? 'Tonight’s champion: you' : 'Tonight’s champion: Mémé'}</p>
          <p class="meme-quiz__credits" aria-hidden="true">See you next week · same time, same channel</p>`,
        scores,
      )}`;
    }
    const answered = this.picked !== null;
    const own = question.kind === 'family' || question.kind === 'shelves';
    const caps = lastDevice() === 'keyboard';
    return html`${said}${set(
      html`<p class="meme-quiz__count">${own ? 'Between two questions, hers' : `Question ${this.index + 1} of ${deal.questions.length}`}</p>
        <p class="meme-quiz__question">${question.question}</p>
        <div class="meme-quiz__answers">${question.answers.map((answer, i) => {
          const state = !answered ? '' : i === question.right ? ' meme-quiz__answer--right' : i === this.picked ? ' meme-quiz__answer--wrong' : ' meme-quiz__answer--out';
          const hers = this.herPick === i ? html`<span class="meme-quiz__hers">Mémé says</span>` : '';
          return html`<button type="button" class="ui-btn meme-quiz__answer${state}" data-action="answer" data-index="${i}"${attr('disabled', answered)}${attr('data-autofocus', i === 0 && !answered)}><span class="meme-quiz__key">${caps ? html`<kbd>${LETTERS[i] ?? ''}</kbd>` : LETTERS[i] ?? ''}</span><span>${answer}</span>${hers}</button>`;
        })}</div>`,
      scores,
    )}`;
  }

  protected override repaint(): void {
    super.repaint();
    paintMemeFace(this.body, this.face);
  }

  protected override actions(): PanelAction[] {
    if (this.over) return [];
    if (this.picked === null) return [];
    const last = this.index + 1 >= (this.deal?.questions.length ?? 0);
    return [{ action: 'next', label: last ? 'The end of the show' : 'Next question', primary: true, autofocus: true }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'answer') this.answer(Number(el.dataset.index));
    else if (action === 'next') this.next();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (this.picked !== null || this.over) return;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    const letter = /^Key([A-D])$/.exec(e.code);
    if (!digit && !letter) return;
    e.preventDefault();
    this.answer(digit ? Number(digit[1]) - 1 : LETTERS.indexOf(letter![1]!));
  }

  protected override onEnter(): boolean {
    if (this.picked === null || this.over) return false;
    this.next();
    return true;
  }

  protected override onOpened(): void {
    super.onOpened();
    playQuizJingle();
  }

  protected override onClosed(): void {
    window.clearTimeout(this.timer);
  }

  /** The question up: nothing picked, her puzzling over it in a thought's cloud, her blurt on its way. */
  private ask(): void {
    this.picked = null;
    this.herPick = null;
    this.herLine = '';
    this.face = 'rest';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.blurt(), BLURT_MS[0] + random() * (BLURT_MS[1] - BLURT_MS[0]));
    if (this.isOpen) this.refresh();
  }

  private blurt(): void {
    const question = this.deal?.questions[this.index];
    if (!question || this.picked !== null || this.over) return;
    const said = this.deal?.blurt(question);
    if (!said) {
      // She keeps quiet: the cloud goes, she waits for the player with a look.
      this.herLine = 'Go on, you say.';
      this.face = 'smile';
      memeSay(this.body, this.herLine, this.face);
      return;
    }
    this.herPick = said.answer;
    this.herLine = said.line;
    this.face = said.answer === null ? 'smile' : 'surprise';
    if (said.answer !== null) playQuizBuzzIn();
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
    playAnswer(right);
    this.herLine = deal.answered(question, right);
    this.face = right ? 'smile' : this.herPick === question.right ? 'smile' : 'frown';
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
    this.face = this.her >= this.you ? 'smile' : 'surprise';
    playApplause();
    this.refresh();
  }
}
