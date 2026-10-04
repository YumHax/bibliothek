import type { FirstDayLike } from '@/onboarding/FirstDay';
import { FIRST_DAY_STEPS } from '@/onboarding/firstDaySteps';
import { STARTING_COINS } from '@/economy/pricing';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { formatCoins } from '@/text/money';
import './ToDoNotePanel.css';

/**
 * The first day's to-do list, held up to read: a friend's note left on the hall console with the
 * round to learn (keys, arcade, prize counter, market, parcel, shelf), each line ticked once done,
 * and "no more tips" to do without. A `ModalLike` the Session opens through
 * `SessionActions.openPanel`; opening it counts as reading it (`FirstDay.noteRead`).
 */
export class ToDoNotePanel extends CardPanel {
  constructor(container: HTMLElement, private readonly firstDay: FirstDayLike) {
    super(container, { className: 'todo-note', cardClass: 'todo-note__paper', title: 'A note', dismiss: 'Put it back', dismissAutofocus: true, header: false, buttonClass: '' });
  }

  protected override onOpened(): void {
    this.firstDay.noteRead();
    super.onOpened();
  }

  protected render(): Html {
    const lines = FIRST_DAY_STEPS.map((step) => {
      const done = this.firstDay.isDone(step.id);
      return html`<li class="${done ? 'is-done' : ''}"><span aria-hidden="true">${done ? '☑' : '☐'}</span> ${step.todo}${done ? html` <span class="visually-hidden">(done)</span>` : ''}</li>`;
    });
    return html`<p class="todo-note__hello">Welcome to the new flat!</p>
      <p>The shelves are empty, so here is how to fill them. The ${formatCoins(STARTING_COINS)} in your pocket are my housewarming present: spend them at the arcade.</p>
      <ol>${lines}</ol>
      <p class="todo-note__sign">Have fun! — Alex</p>`;
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
