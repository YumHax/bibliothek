import type { Input } from '@/core/Input';
import { Listeners } from '@/core/Listeners';
import { escapeHtml } from './html';
import { registerPanel } from './menu/MenuNav';
import './TravelMenu.css';

/** Somewhere the player can go from a door; `key` is the physical code that picks it (Digit1...). */
export interface TravelChoice<Id extends string = string> {
  id: Id;
  label: string;
}

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

/**
 * The little panel a door opens: "Where to?" with one button per destination and Stay. Works under
 * pointer lock (press the digit), with a free cursor (click), on a touch screen (tap), and with a
 * controller (the first line has the focus: A goes, the D-pad walks the lines, B stays, through
 * `registerPanel`). The Session freezes walking while it is open and reacts to
 * `onPick` / `onCancel`; Esc under pointer lock unlocks the mouse instead, which the Session treats
 * as a cancel too.
 */
export class TravelMenu<Id extends string = string> {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLUListElement;
  private choices: TravelChoice<Id>[] = [];
  private readonly pickListeners = new Listeners<[id: Id]>();
  private readonly cancelListeners = new Listeners<[]>();

  constructor(container: HTMLElement, input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'travel-menu';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="travel-menu__card ui-card" role="dialog" aria-modal="true" aria-labelledby="travel-menu-title">
        <h2 id="travel-menu-title">Where to?</h2>
        <ul></ul>
        <button type="button" class="ui-btn travel-menu__stay" data-action="stay"><kbd>Esc</kbd> Stay</button>
      </div>`;
    this.list = this.root.querySelector('ul')!;
    container.appendChild(this.root);

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const choice = target.closest<HTMLElement>('[data-id]');
      const picked = choice && this.choices.find((c) => c.id === choice.dataset.id);
      if (picked) this.pick(picked.id);
      else if (target.closest('[data-action="stay"]')) this.cancel();
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
    registerPanel(this.root, { isOpen: () => this.isOpen, onBack: () => this.cancel() });
  }

  /** Calls `listener` with the destination picked; returns the unsubscribe. */
  onPick(listener: (id: Id) => void): () => void {
    return this.pickListeners.add(listener);
  }

  /** Calls `listener` when the player stays (Stay, Esc, B); returns the unsubscribe. */
  onCancel(listener: () => void): () => void {
    return this.cancelListeners.add(listener);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(choices: TravelChoice<Id>[]): void {
    this.choices = choices;
    this.list.innerHTML = choices
      .map((c, i) => `<li><button type="button" class="ui-btn" data-id="${escapeHtml(c.id)}"><kbd>${i + 1}</kbd> ${escapeHtml(c.label)}</button></li>`)
      .join('');
    this.root.hidden = false;
    // The first destination has the focus: a controller's A takes it, the D-pad walks on, a tap picks any.
    this.list.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private pick(id: Id): void {
    this.close();
    this.pickListeners.emit(id);
  }

  private cancel(): void {
    if (!this.isOpen) return;
    this.close();
    this.cancelListeners.emit();
  }
}
