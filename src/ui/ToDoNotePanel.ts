import type { FirstDayLike } from '@/onboarding/FirstDay';
import { FIRST_DAY_STEPS, type FirstDayStepId } from '@/onboarding/firstDaySteps';
import { STARTING_COINS } from '@/economy/pricing';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { pictogram, pictogramSprite } from './panel/pictograms';
import { formatCoins } from '@/text/money';
import './ToDoNotePanel.css';

/** The pictogram drawn at each stop of the round. */
const STEP_ICONS: Record<FirstDayStepId, string> = {
  note: 'pen',
  out: 'keys',
  arcade: 'joystick',
  play: 'coin',
  redeem: 'ticket',
  market: 'stall',
  buy: 'box',
  unpack: 'parcel',
  shelf: 'tv',
};

/**
 * The first day's to-do list, held up to read: a friend's note left on the hall console with the round to learn
 * (keys, arcade, prize counter, market, parcel, shelf) drawn as a route, a stop a step: the ones done ticked in
 * green, the next ringed in red felt pen, the rest in pencil; and "no more tips" to do without. A `ModalLike` the
 * Session opens through `SessionActions.openPanel`; opening it counts as reading it (`FirstDay.noteRead`), and a
 * step done while it is held up ticks itself.
 */
export class ToDoNotePanel extends CardPanel {
  constructor(container: HTMLElement, private readonly firstDay: FirstDayLike) {
    super(container, { className: 'todo-note', cardClass: 'todo-note__paper', title: 'A note', dismiss: 'Put it back', dismissAutofocus: true, header: false, buttonClass: '' });
    firstDay.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
  }

  protected override onOpened(): void {
    this.firstDay.noteRead();
    super.onOpened();
  }

  protected render(): Html {
    const next = FIRST_DAY_STEPS.find((step) => !this.firstDay.isDone(step.id))?.id;
    const done = FIRST_DAY_STEPS.filter((step) => this.firstDay.isDone(step.id)).length;
    return html`${pictogramSprite()}
      <p class="todo-note__hello">Welcome to the new flat!</p>
      <p class="todo-note__intro">Bare shelves, so here is the round. The ${formatCoins(STARTING_COINS)} in your pocket are my housewarming present: spend them at the arcade.</p>
      <ol class="todo-note__route" aria-label="The round, ${done} of ${FIRST_DAY_STEPS.length} done">${FIRST_DAY_STEPS.map((step) => {
        const state = this.firstDay.isDone(step.id) ? 'done' : step.id === next ? 'next' : 'ahead';
        return html`<li class="todo-note__step todo-note__step--${state}">
            <span class="todo-note__stop">${pictogram(STEP_ICONS[step.id], 'todo-note__icon')}${state === 'done' ? pictogram('check', 'todo-note__tick') : ''}</span>
            <span class="todo-note__text">${step.todo}${state === 'done' ? html`<span class="visually-hidden"> (done)</span>` : ''}</span>
            ${state === 'next' ? html`<span class="todo-note__next">next</span>` : ''}
          </li>`;
      })}</ol>
      <p class="todo-note__sign"><span class="todo-note__tally">${done} of ${FIRST_DAY_STEPS.length}</span>Have fun! — Alex</p>`;
  }

  protected override actions(): PanelAction[] {
    return [{ action: 'skip', label: 'I know my way around: no more tips' }];
  }

  protected override onAction(action: string): void {
    if (action !== 'skip') return;
    this.firstDay.skip();
    this.close();
  }
}
