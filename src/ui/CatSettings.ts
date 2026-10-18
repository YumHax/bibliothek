import type { CatSettings } from '@/world/cat/types';
import type { CatSettingsStore } from '@/world/cat/catSettings';
import { html, paint } from './panel/html';
import { homeGoodPhoto } from '@/thumbnails/homeGoodPhotos';
import './CatSettings.css';

/** The rescue's coat in words, as the Settings row says it (fixed once she came home: the cat is who she is). */
export const COAT_WORDS: Record<CatSettings['coat'], string> = {
  tabby: 'a tabby coat',
  tuxedo: 'a black-and-white coat',
  ginger: 'a ginger coat',
  grey: 'a grey coat',
  calico: 'a calico coat',
};

/**
 * The cat's row of the Settings screen (see `Overlay.addSetting`): her name, which can be changed, and her coat in
 * words, which cannot (she came with it). Writes straight into the `CatSettingsStore`. The section only shows once a
 * cat lives in the flat (`adopted`): before that there is nobody to name (the name is first given at the pet shop).
 */
export class CatSettingsForm {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly coatLine: HTMLElement;

  constructor(store: CatSettingsStore, adopted: { has(): boolean; subscribe(cb: () => void): () => void }) {
    this.element = document.createElement('form');
    this.element.className = 'cat-settings';
    paint(
      this.element,
      html`<span class="cat-settings__photo"><img alt="" /></span>
        <div class="cat-settings__about">
          <label class="cat-settings__field">
            <span>Her name</span>
            <input type="text" name="name" maxlength="24" autocomplete="off" spellcheck="false" />
          </label>
          <p class="cat-settings__coat"></p>
        </div>`,
    );
    this.nameInput = this.element.querySelector('input[name="name"]')!;
    this.coatLine = this.element.querySelector('.cat-settings__coat')!;

    // Enter in the field submits the one-field form: the name is kept and the field let go.
    this.element.addEventListener('submit', (e) => {
      e.preventDefault();
      store.update({ name: this.nameInput.value });
      this.nameInput.blur();
    });
    this.nameInput.addEventListener('change', () => store.update({ name: this.nameInput.value }));

    this.render(store.settings);
    store.subscribe((s) => this.render(s));
    // The whole section (heading included) waits for the cat; `addSetting` wraps the form in it.
    const showSection = (): void => {
      const section = this.element.closest<HTMLElement>('section') ?? this.element;
      section.hidden = !adopted.has();
      if (adopted.has()) this.loadPhoto();
    };
    adopted.subscribe(showSection);
    queueMicrotask(showSection);
  }

  /** Her photo from the pet shop's card, shot once she is home (the slot keeps its size till then). */
  private loadPhoto(): void {
    const img = this.element.querySelector<HTMLImageElement>('.cat-settings__photo img');
    if (!img || img.src) return;
    homeGoodPhoto('cat').then((url) => (img.src = url), () => img.closest('.cat-settings__photo')?.classList.add('cat-settings__photo--none'));
  }

  private render(settings: CatSettings): void {
    if (document.activeElement !== this.nameInput) this.nameInput.value = settings.name;
    this.coatLine.textContent = `She came with ${COAT_WORDS[settings.coat]}.`;
  }
}
