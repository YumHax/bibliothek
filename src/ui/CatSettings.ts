import { COATS, type CatSettings } from '@/world/cat/types';
import type { CatSettingsStore } from '@/world/cat/catSettings';
import { escapeHtml } from './html';
import './CatSettings.css';

const COAT_LABELS: Record<CatSettings['coat'], string> = {
  tabby: 'Tabby',
  tuxedo: 'Tuxedo',
  ginger: 'Ginger',
  grey: 'Grey',
  calico: 'Calico',
};

/**
 * A one-line form for the cat: its name and coat. Hosted by the collection editor (see
 * `CollectionEditor.addPanel`), writes straight into the `CatSettingsStore`.
 */
export class CatSettingsForm {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly coatSelect: HTMLSelectElement;

  constructor(store: CatSettingsStore) {
    this.element = document.createElement('form');
    this.element.className = 'cat-settings';
    this.element.innerHTML = `
      <label class="cat-settings__field">
        <span>Name</span>
        <input type="text" name="name" maxlength="24" autocomplete="off" spellcheck="false" />
      </label>
      <label class="cat-settings__field">
        <span>Coat</span>
        <select name="coat">
          ${COATS.map((c) => `<option value="${c}">${escapeHtml(COAT_LABELS[c])}</option>`).join('')}
        </select>
      </label>`;
    this.nameInput = this.element.querySelector('input[name="name"]')!;
    this.coatSelect = this.element.querySelector('select[name="coat"]')!;

    this.element.addEventListener('submit', (e) => e.preventDefault());
    this.nameInput.addEventListener('change', () => store.update({ name: this.nameInput.value }));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.nameInput.blur();
    });
    this.coatSelect.addEventListener('change', () => store.update({ coat: this.coatSelect.value as CatSettings['coat'] }));

    this.render(store.settings);
    store.subscribe((s) => this.render(s));
  }

  private render(settings: CatSettings): void {
    if (document.activeElement !== this.nameInput) this.nameInput.value = settings.name;
    this.coatSelect.value = settings.coat;
  }
}
