import type { Input } from '@/core/Input';
import './TravelMenu.css';

/** Somewhere the player can go from a door; `key` is the physical code that picks it (Digit1...). */
export interface TravelChoice {
  id: string;
  label: string;
}

export interface TravelMenuEvents {
  onPick?(id: string): void;
  onCancel?(): void;
}

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

/**
 * The little panel a door opens: "Where to?" with one line per destination. Works under pointer
 * lock (press the digit) and with a free cursor (click the line). The Session freezes walking while
 * it is open and reacts to `onPick` / `onCancel`; Esc under pointer lock unlocks the mouse instead,
 * which the Session treats as a cancel too.
 */
export class TravelMenu {
  readonly events: TravelMenuEvents = {};
  private readonly root: HTMLDivElement;
  private readonly list: HTMLUListElement;
  private choices: TravelChoice[] = [];

  constructor(container: HTMLElement, input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'travel-menu';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="travel-menu__card"><h2>Where to?</h2><ul></ul><p><kbd>Esc</kbd> stay</p></div>`;
    this.list = this.root.querySelector('ul')!;
    container.appendChild(this.root);

    this.list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-id]');
      if (li) this.pick(li.dataset.id!);
    });
    input.onPress((code, e) => {
      if (!this.isOpen) return;
      const i = DIGITS.indexOf(code);
      if (i !== -1 && this.choices[i]) {
        e.preventDefault();
        this.pick(this.choices[i]!.id);
      } else if (code === 'Escape') {
        this.cancel();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(choices: TravelChoice[]): void {
    this.choices = choices;
    this.list.innerHTML = choices
      .map((c, i) => `<li data-id="${c.id}"><kbd>${i + 1}</kbd> ${c.label}</li>`)
      .join('');
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private pick(id: string): void {
    this.close();
    this.events.onPick?.(id);
  }

  private cancel(): void {
    if (!this.isOpen) return;
    this.close();
    this.events.onCancel?.();
  }
}
