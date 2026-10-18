import type { PubQuestion } from '@/streetShops/quizBank';
import { playAnswer } from '@/audio/dealSounds';
import { fnv1a } from '@/random';
import { playPaperRustle } from '@/audio/householdSounds';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, raw, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { BAR_STAFF, barFace } from './barFace';
import './pubQuiz.css';

/** What the quiz is dealt by THE LOCAL's door (`world/street/shops/counters`): the round, the rivals' night, how it ends. */
export interface QuizNight {
  questions: readonly PubQuestion[];
  /** How many THE USUAL SUSPECTS get right tonight (`rivalsRight`): chalked up beside the team's as the answers are read. */
  rivals: number;
  /** The sheet handed in with `right` good answers: the quizmaster's verdict, what happens round the room, whether the kitty came over (paid by the deal). */
  finished(right: number): QuizVerdict;
}

/** How the night ends: what the quizmaster says into the microphone, what the room does, whether the team won the kitty. */
export interface QuizVerdict {
  says: string;
  aside: string;
  won: boolean;
}

/** The quizmaster's word on an answer, and what happens at the tables. */
const RIGHT: readonly { says: string; aside: string }[] = [
  { says: 'Correct!', aside: 'Somebody at the next table swears.' },
  { says: 'That is the right answer.', aside: 'Your team mate thumps the table.' },
  { says: 'Yes! Well done, that table.', aside: 'The barman rings the bell.' },
];
const WRONG: readonly { says: string; aside: string }[] = [
  { says: 'Oh, so close. No.', aside: 'A groan from your table.' },
  { says: 'I’m afraid not.', aside: 'Your team mate puts their head in their hands.' },
  { says: 'No! But a good guess.', aside: 'Somebody at the bar whistles.' },
];
/** THE USUAL SUSPECTS, as their answer is read out. */
const RIVALS_HAD_IT = ['THE USUAL SUSPECTS nod: they had it.', 'THE USUAL SUSPECTS high-five.', 'A smug cheer from THE USUAL SUSPECTS.'];
const RIVALS_MISSED = ['THE USUAL SUSPECTS argue over theirs.', 'THE USUAL SUSPECTS groan: not them either.', 'One of THE USUAL SUSPECTS blames another.'];

const LETTERS = ['A', 'B', 'C', 'D'];
const SPOKEN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** The quizmaster's face on the pub's dark wall. */
const FACE = 68;
const FACE_WALL = '#3b2a20';

/** A pencil tick, a cross and a ring as one stroke each (`pathLength` 1, so the CSS draws them in). */
const TICK = '<svg class="pq__mark pq__mark--tick" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M3 13 L9 19 L21 4"/></svg>';
const CROSS = '<svg class="pq__mark pq__mark--cross" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 5 L19 19 M19 5 L5 19"/></svg>';
const RING = '<svg class="pq__ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M8 22 C 6 8, 40 3, 62 5 C 88 7, 98 16, 93 27 C 87 37, 40 39, 18 34 C 6 31, 3 22, 14 14"/></svg>';
/** The kitty: a pint glass of coins, handed over once the night is won. */
const KITTY = `<svg class="pq__kitty" viewBox="0 0 48 64" aria-hidden="true">
  <path class="pq__kitty-glass" d="M8 6 H40 L36 58 Q24 62 12 58 Z"/>
  <ellipse class="pq__kitty-coin" cx="18" cy="52" rx="7" ry="3"/><ellipse class="pq__kitty-coin" cx="29" cy="50" rx="7" ry="3"/>
  <ellipse class="pq__kitty-coin" cx="23" cy="45" rx="7" ry="3"/><ellipse class="pq__kitty-coin" cx="16" cy="41" rx="6" ry="2.6"/>
  <ellipse class="pq__kitty-coin" cx="30" cy="39" rx="6" ry="2.6"/><ellipse class="pq__kitty-coin" cx="23" cy="34" rx="6" ry="2.6"/>
  <path class="pq__kitty-shine" d="M13 10 L15 54"/>
</svg>`;

/**
 * QUIZ NIGHT at THE LOCAL (docs/economy.md "Front Street's shops and finds"): the pub's chalkboard with both teams'
 * scores, Dennis the quizmaster reading each question out in a balloon, and the team's answer sheet on the table, its
 * four answers written in pencil (A to D: a press, or the keys 1 to 4). The answer picked is ringed in pencil, the
 * right one read out and ringed in red, a tick or a cross goes down the sheet's margin, and THE USUAL SUSPECTS' score
 * goes up on the board as theirs is read. At the end the sheet is handed in and marked, both totals chalked up, the
 * quizmaster's verdict in the balloon and, only when it was won, the kitty on the table. A `ModalLike` the bar's door opens.
 */
export class PubQuizPanel extends CardPanel {
  private night: QuizNight | null = null;
  private index = 0;
  private picked: number | null = null;
  /** The answer picked for each question asked so far. */
  private picks: number[] = [];
  /** Which questions THE USUAL SUSPECTS get right (as many as `night.rivals`, spread over the round). */
  private rivalHits: boolean[] = [];
  private verdict: QuizVerdict | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'pub-quiz', cardClass: 'ui-card pq__card', title: 'Quiz night at THE LOCAL', dismiss: 'Back to the bar', header: false });
  }

  /** Deals tonight's round (before the Session opens the panel). */
  show(night: QuizNight): void {
    this.night = night;
    this.index = 0;
    this.picked = null;
    this.picks = [];
    this.verdict = null;
    this.rivalHits = spreadHits(night.questions, night.rivals);
  }

  private get right(): number {
    const questions = this.night?.questions ?? [];
    return this.picks.filter((pick, i) => questions[i]?.right === pick).length;
  }

  /** THE USUAL SUSPECTS' score as far as the answers have been read out. */
  private get rivalsSoFar(): number {
    if (this.verdict) return this.night?.rivals ?? 0;
    return this.rivalHits.slice(0, this.picks.length).filter(Boolean).length;
  }

  protected render(): Html {
    const night = this.night;
    const question = night?.questions[this.index];
    if (!night || !question) return html``;
    const over = this.verdict !== null;
    return html`<div class="pq${over ? ' pq--over' : ''}">
      ${this.boardHtml(night)}
      ${this.hostHtml(question)}
      <div class="pq__table">
        <div class="pq__sheet">
          <span class="pq__clip" aria-hidden="true"></span>
          <p class="pq__sheet-head"><span>Team sheet</span><span>${over ? '' : `Question ${this.index + 1}`}</span></p>
          <div class="pq__sheet-body" style="--pq-rows: ${Math.max(6, night.questions.length)}">${this.marginHtml(night)}${over ? this.markedHtml(night) : this.answersHtml(question)}</div>
        </div>
        ${over && this.verdict?.won ? html`<div class="pq__kitty-wrap">${raw(KITTY)}<span>The kitty</span></div>` : ''}
      </div>
      <p class="pq__aside">${this.aside()}</p>
    </div>`;
  }

  /** The chalkboard: QUIZ NIGHT, the round, both teams' scores. */
  private boardHtml(night: QuizNight): Html {
    const over = this.verdict !== null;
    const progress = over ? 'Final scores' : `Question ${SPOKEN[this.index] ?? this.index + 1} of ${SPOKEN[night.questions.length - 1] ?? night.questions.length}`;
    return html`<header class="pq__board">
      <h2 class="pq__title">Quiz night</h2>
      <p class="pq__round">${progress}</p>
      <div class="pq__scores">
        <p class="pq__team pq__team--you"><span class="pq__team-name">Your table</span><span class="pq__score">${this.right}</span></p>
        <p class="pq__team"><span class="pq__team-name">The Usual Suspects</span><span class="pq__score">${this.rivalsSoFar}</span></p>
      </div>
    </header>`;
  }

  /** Dennis at the microphone: the question read out, then his word on the answer; at the end, the verdict. */
  private hostHtml(question: PubQuestion): Html {
    const { name, role } = BAR_STAFF.quizmaster;
    const verdict = this.verdict;
    let says: Html;
    if (verdict) says = html`<span class="pq__verdict">${verdict.says}</span>`;
    else {
      const intro = this.index === 0 ? 'Pens ready? Question one. ' : `Question ${SPOKEN[this.index] ?? this.index + 1}. `;
      const word = this.picked === null ? null : this.word();
      says = html`${intro}${question.question}${word ? html`<span class="pq__verdict">${word.says}</span>` : ''}`;
    }
    return html`<div class="pq__host">
      <div class="pq__face"></div>
      <div class="pq__balloon"><span class="pq__name">${name}, ${role}</span><p class="pq__says">${says}</p></div>
    </div>`;
  }

  /** The sheet's margin: a line per question, ticked or crossed once read out, the one being asked pointed at. */
  private marginHtml(night: QuizNight): Html {
    return html`<ol class="pq__margin" aria-label="Your answers so far">${night.questions.map((q, i) => {
      const pick = this.picks[i];
      const state = pick === undefined ? (i === this.index && !this.verdict ? ' pq__line--now' : '') : pick === q.right ? ' pq__line--right' : ' pq__line--wrong';
      const mark = pick === undefined ? '' : raw(pick === q.right ? TICK : CROSS);
      return html`<li class="pq__line${state}"><span class="pq__num">${i + 1}</span>${mark}</li>`;
    })}</ol>`;
  }

  /** The four answers written on the sheet: the one picked ringed in pencil, the right one in red once read out. */
  private answersHtml(question: PubQuestion): Html {
    const answered = this.picked !== null;
    return html`<div class="pq__current">
      <ol class="pq__answers">${question.answers.map((answer, i) => {
        const picked = this.picked === i;
        const right = answered && i === question.right;
        const classes = ['pq__answer', picked && 'is-picked', right && 'is-right', answered && picked && !right && 'is-wrong'].filter(Boolean).join(' ');
        return html`<li><button type="button" class="${classes}" data-action="answer" data-index="${i}"${attr('disabled', answered)}${attr('data-autofocus', i === 0 && !answered)}>
          <span class="pq__letter">${LETTERS[i] ?? i + 1}</span><span class="pq__text">${answer}</span><kbd class="pq__key">${i + 1}</kbd>
          ${picked || right ? raw(RING) : ''}
        </button></li>`;
      })}</ol>
    </div>`;
  }

  /** The sheet handed back marked: each answer as written, ticked or crossed in red, the right one beside a wrong one. */
  private markedHtml(night: QuizNight): Html {
    return html`<div class="pq__current pq__marked">
      <ol class="pq__marked-list">${night.questions.map((q, i) => {
        const pick = this.picks[i];
        const answer = pick === undefined ? null : q.answers[pick];
        const good = pick === q.right;
        return html`<li class="pq__marked-row${good ? '' : ' is-wrong'}">
          <span class="pq__marked-answer">${answer ?? 'left blank'}</span>
          ${good ? '' : html`<span class="pq__marked-fix">${q.answers[q.right]}</span>`}
        </li>`;
      })}</ol>
      <p class="pq__marked-total">${this.right} out of ${night.questions.length}</p>
    </div>`;
  }

  /** What happens round the room: the table and THE USUAL SUSPECTS once an answer is read, the room at the end. */
  private aside(): string {
    if (this.verdict) return this.verdict.aside;
    if (this.picked === null) return this.index === 0 ? 'Your team mates huddle over the sheet. THE USUAL SUSPECTS are at their usual table.' : 'Pencils hover over the sheets.';
    const rivals = this.rivalHits[this.index] ? RIVALS_HAD_IT : RIVALS_MISSED;
    return `${this.word().aside} ${rivals[this.index % rivals.length]}`;
  }

  /** The quizmaster's word on the answer just picked. */
  private word(): { says: string; aside: string } {
    const question = this.night?.questions[this.index];
    const right = question?.right === this.picked;
    const lines = right ? RIGHT : WRONG;
    return lines[(this.index + (this.picked ?? 0)) % lines.length]!;
  }

  protected override repaint(): void {
    super.repaint();
    const face = this.body.querySelector('.pq__face');
    face?.append(barFace('quizmaster', FACE, FACE_WALL, this.expression()));
  }

  private expression(): Expression {
    if (this.verdict) return this.verdict.won ? 'surprise' : 'smile';
    if (this.picked === null) return 'rest';
    return this.night?.questions[this.index]?.right === this.picked ? 'smile' : 'frown';
  }

  protected override actions(): PanelAction[] {
    if (this.verdict || this.picked === null) return [];
    const last = this.index + 1 >= (this.night?.questions.length ?? 0);
    return [{ action: 'next', label: last ? 'Hand the sheet in' : 'Next question', primary: true, autofocus: true }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'answer') this.answer(Number(el.dataset.index));
    else if (action === 'next') this.next();
  }

  protected override onKey(e: KeyboardEvent): void {
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (!digit || this.picked !== null || this.verdict) return;
    e.preventDefault();
    this.answer(Number(digit[1]) - 1);
  }

  protected override onEnter(): boolean {
    if (this.picked === null || this.verdict) return false;
    this.next();
    return true;
  }

  protected override onClosed(): void {
    // Walked off before the end: the sheet is handed in as it stands (the fee is paid, the night is had).
    if (this.night && !this.verdict) this.finish();
  }

  private answer(index: number): void {
    const question = this.night?.questions[this.index];
    if (!question || this.picked !== null || this.verdict || !(index >= 0 && index < question.answers.length)) return;
    this.picked = index;
    this.picks[this.index] = index;
    playAnswer(index === question.right);
    this.refresh();
    // On to "Next question" (the answers are spent): never the dismiss, which would hand the sheet in.
    this.focusTarget()?.focus();
  }

  private next(): void {
    const night = this.night;
    if (!night) return;
    if (this.index + 1 < night.questions.length) {
      this.index++;
      this.picked = null;
      this.refresh();
      this.focusTarget()?.focus();
      return;
    }
    this.finish();
    playPaperRustle(0.1);
    this.refresh();
  }

  private finish(): void {
    if (!this.night || this.verdict) return;
    this.verdict = this.night.finished(this.right);
  }
}

/**
 * Which questions THE USUAL SUSPECTS get right: `hits` of them, the misses falling on the questions a fixed hash of
 * their wording picks, so the same night reads the same and their misses wander from week to week.
 */
function spreadHits(questions: readonly PubQuestion[], hits: number): boolean[] {
  const misses = new Set(
    questions
      .map((q, i) => ({ i, h: fnv1a(q.question) }))
      .sort((a, b) => a.h - b.h)
      .slice(0, Math.max(0, questions.length - hits))
      .map((q) => q.i),
  );
  return questions.map((_, i) => !misses.has(i));
}
