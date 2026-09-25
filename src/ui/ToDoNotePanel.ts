import type { FirstDayLike } from '@/onboarding/FirstDay';
import { FIRST_DAY_STEPS } from '@/onboarding/firstDaySteps';
import { STARTING_COINS } from '@/economy/pricing';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import './ToDoNotePanel.css';

/**
 * The first day's to-do list, held up to read: a friend's note left on the hall console with the
 * round to learn (keys, arcade, prize counter, market, parcel, shelf), each line ticked once done,
 * and "no more tips" to do without. A `ModalLike` the Session opens through
 * `SessionActions.openPanel`; opening it counts as reading it (`FirstDay.noteRead`).
 */
export class ToDoNotePanel extends ModalPanel {
  private readonly card: HTMLElement;

  constructor(container: HTMLElement, private readonly firstDay: FirstDayLike) {
    super(container, { className: 'ui-modal--centre todo-note' });
    this.root.innerHTML = '<article class="todo-note__paper" role="dialog" aria-modal="true" aria-label="A note"></article>';
    this.card = this.root.querySelector('.todo-note__paper')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('button[data-action]')?.dataset.action;
      if (action === 'skip') {
        this.firstDay.skip();
        this.close();
      } else if (target === this.root || action === 'close') this.close();
    });
  }

  protected override onOpened(): void {
    this.firstDay.noteRead();
    const lines = FIRST_DAY_STEPS.map((step) => {
      const done = this.firstDay.isDone(step.id);
      return `<li class="${done ? 'is-done' : ''}"><span aria-hidden="true">${done ? '☑' : '☐'}</span> ${escapeHtml(step.todo)}${done ? ' <span class="visually-hidden">(done)</span>' : ''}</li>`;
    }).join('');
    this.card.innerHTML = `
      <p class="todo-note__hello">Welcome to the new flat!</p>
      <p>The shelves are empty, so here is how to fill them. The ${STARTING_COINS} coins in your pocket are my housewarming present: spend them at the arcade.</p>
      <ol>${lines}</ol>
      <p class="todo-note__sign">Have fun! — Alex</p>
      <footer>
        <button type="button" data-action="skip">I know my way around: no more tips</button>
        <button type="button" data-action="close" data-autofocus>Put it back</button>
      </footer>`;
  }
}
