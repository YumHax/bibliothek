import { html, paint } from './html';

/*
 * The letters on screen for a text field a controller cannot type into (the quick search, the label maker): a grid of
 * keys under the field, walked in two dimensions by the D-pad (`move`, fed through `registerPanel`'s `onMove`), A
 * types the focused one. Space and Delete are words, not signs. The field hears an `input` event as if typed.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

interface LetterPadOptions {
  /** The field the keys type into. */
  field: HTMLInputElement;
  /** The digits row too (a label), or letters only (a search). */
  digits?: boolean;
  /** Keys per row. Default 7. */
  columns?: number;
}

export class LetterPad {
  readonly element: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly columns: number;
  private readonly keys: string[];

  constructor(options: LetterPadOptions) {
    this.field = options.field;
    this.columns = options.columns ?? 7;
    this.keys = [...LETTERS, ...(options.digits ? DIGITS : '')];
    this.element = document.createElement('div');
    this.element.className = 'ui-letter-pad';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Letters');
    this.element.style.setProperty('--pad-columns', String(this.columns));
    // Space and Delete share a row: each half of it, rounded down (a CSS `span` takes a whole number).
    this.element.style.setProperty('--pad-span', String(Math.floor(this.columns / 2)));
    paint(
      this.element,
      html`${this.keys.map((k) => html`<button type="button" class="ui-btn ui-letter-pad__key" data-key="${k}">${k}</button>`)}
        <button type="button" class="ui-btn ui-letter-pad__key ui-letter-pad__key--wide" data-key="space">Space</button>
        <button type="button" class="ui-btn ui-letter-pad__key ui-letter-pad__key--wide" data-key="delete">Delete</button>`,
    );
    this.element.addEventListener('click', (e) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key;
      if (key) this.type(key);
    });
  }

  /** Shown or not (only for the controller: a keyboard types, a touchscreen has its own). */
  set visible(on: boolean) {
    this.element.hidden = !on;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  /** The first key, for the focus to land on. */
  focusFirst(): void {
    this.buttons()[0]?.focus({ preventScroll: true });
  }

  /**
   * Moves the focus one key over in the grid when it is on a key; false at the edge it leaves by (the top row going
   * up, the last row going down) or when the focus is elsewhere, so the panel walks on.
   */
  move(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    const buttons = this.buttons();
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at === -1 || !this.visible) return false;
    const letters = this.keys.length;
    // The wide keys sit on a row of their own after the letters: Space under the first half, Delete under the second.
    const rowOf = (i: number) => (i < letters ? Math.floor(i / this.columns) : Math.ceil(letters / this.columns));
    const colOf = (i: number) => (i < letters ? i % this.columns : i === letters ? 0 : Math.ceil(this.columns / 2));
    const lastRow = rowOf(letters);
    const row = rowOf(at);
    const col = colOf(at);
    let next = at;
    if (direction === 'left') next = Math.max(0, at - 1);
    else if (direction === 'right') next = Math.min(buttons.length - 1, at + 1);
    else if (direction === 'up') {
      if (row === 0) return false;
      next = row === lastRow ? Math.min(letters - 1, (lastRow - 1) * this.columns + col) : at - this.columns;
    } else {
      if (row === lastRow) return false;
      const below = at + this.columns;
      next = below < letters ? below : col < Math.ceil(this.columns / 2) ? letters : letters + 1;
    }
    buttons[next]?.focus({ preventScroll: true });
    return true;
  }

  private buttons(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>('[data-key]')];
  }

  private type(key: string): void {
    const field = this.field;
    if (key === 'delete') field.value = field.value.slice(0, -1);
    else {
      const add = key === 'space' ? ' ' : key;
      if (field.maxLength > 0 && field.value.length >= field.maxLength) return;
      field.value += add;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
