import type { SettingsStore } from '@/settings';
import { REBINDABLE_ACTIONS } from '@/input/actions';
import { rebind } from '@/settings/bindings';
import { RESERVED_KEYS } from '../controls';
import { escapeHtml } from '../html';
import { keyLabel, onKeyLabelsChange, physicalKeyLabel } from '../keys';
import { action, group } from './fields';

/**
 * The Keyboard section: one row per rebindable key of the action table (`input/actions`) with the
 * key it is on. Picking a row waits for the next key; that key takes the action and the key it had
 * moves to the action's old key (a swap, see `settings/bindings`), so nothing ends up unbound. Esc
 * cancels the wait.
 */
export class KeyBindingsForm {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly note: HTMLParagraphElement;
  private waiting: { code: string; button: HTMLButtonElement } | null = null;

  constructor(private readonly store: SettingsStore) {
    this.list = document.createElement('div');
    this.list.className = 'menu__bindings';
    this.list.innerHTML = REBINDABLE_ACTIONS.map(
      (r) => `
        <div class="menu__field">
          <span class="menu__field-label">${escapeHtml(r.label)}</span>
          <button type="button" class="ui-btn menu__key" data-code="${r.code}"></button>
        </div>`,
    ).join('');
    this.note = document.createElement('p');
    this.note.className = 'menu__note';
    this.note.setAttribute('aria-live', 'polite');
    this.element = group(this.list, this.note, action('Reset keys', () => this.reset()));

    this.list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-code]');
      if (button) this.wait(button);
    });
    // Capture phase on the window: the press must reach neither the menu nor the game.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    onKeyLabelsChange(() => this.render());
    this.render();
  }

  private wait(button: HTMLButtonElement): void {
    this.cancel();
    this.waiting = { code: button.dataset.code!, button };
    button.textContent = 'Press a key…';
    button.classList.add('menu__key--waiting');
    this.note.textContent = 'Esc cancels.';
    // Walking away (another button, the menu closing) cancels too: the next key in the room must not be caught.
    button.addEventListener('blur', () => this.waiting?.button === button && this.cancel(), { once: true });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.waiting) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      this.cancel();
      return;
    }
    if (RESERVED_KEYS.has(e.code)) {
      this.note.textContent = `${physicalKeyLabel(e.code)} is kept for the menus. Pick another key, or Esc.`;
      return;
    }
    const { code, button } = this.waiting;
    this.waiting = null;
    button.classList.remove('menu__key--waiting');
    this.store.update({ bindings: rebind(this.store.settings.bindings, code, e.code) });
    this.note.textContent = '';
    button.focus();
  }

  private cancel(): void {
    if (!this.waiting) return;
    this.waiting.button.classList.remove('menu__key--waiting');
    this.waiting = null;
    this.note.textContent = '';
    this.render();
  }

  private reset(): void {
    this.cancel();
    this.store.update({ bindings: {} });
  }

  /** Labels follow the store through `keyLabelsChanged`, which main fires after applying the bindings. */
  private render(): void {
    for (const button of this.list.querySelectorAll<HTMLButtonElement>('[data-code]')) {
      if (this.waiting?.button === button) continue;
      button.textContent = keyLabel(button.dataset.code!);
    }
  }
}
