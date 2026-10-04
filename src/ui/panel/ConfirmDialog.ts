import { CardPanel, type PanelAction } from './CardPanel';
import { html, type Html } from './html';

/** What a dialog asks: a title, a line of explanation, the words on the two buttons. `danger` paints the confirm red. */
interface Question {
  title: string;
  text?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
}

/**
 * The one dialog: a small card asking a question with Cancel and the action, usable from inside a panel
 * (`await dialog.ask({...})` resolves true on the action, false on Cancel, Esc, B or the backdrop). The rule for
 * what asks: spending coins or parting with a game takes a second press (`confirmTwice`), destroying data (an
 * import over the collection, a reset) asks here, an error is told through the notices.
 */
export class ConfirmDialog extends CardPanel<[Question]> {
  private question: Question = { title: '', confirm: 'OK' };
  private answer: ((yes: boolean) => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-confirm', cardClass: 'ui-card ui-confirm__card', title: '', dismiss: 'Cancel', backdropCloses: false });
  }

  /** Asks; the panel asking stays open behind. */
  ask(question: Question): Promise<boolean> {
    this.answer?.(false);
    return new Promise((resolve) => {
      this.answer = resolve;
      this.open(question);
    });
  }

  protected override onOpened(question: Question): void {
    this.question = question;
    this.setTitle(question.title);
    super.onOpened(question);
  }

  protected override render(): Html {
    return html`${this.question.text ? html`<p class="ui-confirm__text">${this.question.text}</p>` : ''}`;
  }

  protected override actions(): PanelAction[] {
    return [{ action: 'confirm', label: this.question.confirm, primary: !this.question.danger, danger: this.question.danger }];
  }

  protected override onAction(action: string): void {
    if (action !== 'confirm') return;
    const answer = this.answer;
    this.answer = null;
    this.close();
    answer?.(true);
  }

  /** Closed without the action (Cancel, Esc, B): the answer is no. */
  protected override onClosed(): void {
    const answer = this.answer;
    this.answer = null;
    answer?.(false);
  }
}
