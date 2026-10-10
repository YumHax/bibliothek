import './IntroScreen.css';
import { html, paint } from '@/ui/panel/html';
import { actionKeyLabel } from '@/ui/keys';

/** What the screen's buttons do: the director's (`intro/IntroCutscene`). */
interface IntroScreenHandlers {
  onSkip(): void;
  onGetUp(): void;
}

/**
 * THE OPENING'S SCREEN: what is drawn over the 3D view while the film plays (docs/story.md "The opening"). The black
 * it dips through, the cinema bars, the narration on the bottom bar, the title and "Get up" over the morning, and a
 * Skip in the corner. The director writes it every frame (`setBlack`, `setBars`) and at its beats (`say`,
 * `showTitle`); the HUD hides under `body.intro` meanwhile.
 */
export class IntroScreen {
  private readonly root: HTMLDivElement;
  private readonly black: HTMLElement;
  private readonly line: HTMLElement;
  private readonly title: HTMLElement;
  private readonly getUp: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly skipLabel: HTMLElement;
  private readonly tagline: HTMLElement;
  private said: string | null = null;

  constructor(container: HTMLElement, handlers: IntroScreenHandlers, words: { name: string; line: string; getUp: string }) {
    this.root = document.createElement('div');
    this.root.className = 'intro';
    this.root.hidden = true;
    paint(
      this.root,
      html`
        <div class="intro__black" data-role="black"></div>
        <div class="intro__bar intro__bar--top"></div>
        <div class="intro__bar intro__bar--bottom">
          <p class="intro__line" data-role="line"></p>
        </div>
        <div class="intro__title" data-role="title" aria-hidden="true">
          <h1 class="intro__name" aria-label=${words.name}>${[...words.name].map((letter, i) => html`<span class="intro__letter" style="--i: ${i}" aria-hidden="true">${letter}</span>`)}</h1>
          <p class="intro__tagline" data-role="tagline">${words.line}</p>
          <button type="button" class="ui-btn ui-btn--primary intro__get-up" data-role="get-up" data-nav>${words.getUp}</button>
        </div>
        <button type="button" class="intro__skip" data-role="skip"><span data-role="skip-label">Skip</span> <kbd data-role="skip-key"></kbd></button>
      `,
    );
    const q = <E extends HTMLElement>(role: string) => this.root.querySelector<E>(`[data-role="${role}"]`)!;
    this.black = q('black');
    this.line = q('line');
    this.title = q('title');
    this.getUp = q<HTMLButtonElement>('get-up');
    this.skip = q<HTMLButtonElement>('skip');
    this.skipLabel = q('skip-label');
    this.tagline = q('tagline');
    q('skip-key').textContent = actionKeyLabel('close');
    this.skip.addEventListener('click', () => handlers.onSkip());
    this.getUp.addEventListener('click', () => handlers.onGetUp());
    container.appendChild(this.root);
  }

  /** Up over the view (the HUD hidden), or gone. */
  show(shown: boolean): void {
    this.root.hidden = !shown;
    document.body.classList.toggle('intro-playing', shown);
  }

  /** The black over the view: 0 clear .. 1 black. */
  setBlack(amount: number): void {
    this.black.style.opacity = amount.toFixed(3);
  }

  /** The cinema bars: 0 open (none) .. 1 closed to the film's frame. */
  setBars(amount: number): void {
    this.root.style.setProperty('--intro-bars', amount.toFixed(3));
  }

  /** The narration's line (null: none); a new line fades in as the old one fades out. */
  say(text: string | null): void {
    if (text === this.said) return;
    this.said = text;
    this.line.classList.remove('intro__line--on');
    if (text === null) return;
    // Restart the fade: the class off, a style flush, the text, the class on.
    void this.line.offsetWidth;
    this.line.textContent = text;
    this.line.classList.add('intro__line--on');
  }

  /** The title over the morning; with `getUp`, its button too (focused, so Enter or a pad's A presses it). */
  showTitle(shown: boolean, getUp = false): void {
    this.title.classList.toggle('intro__title--on', shown);
    this.title.setAttribute('aria-hidden', String(!shown));
    this.getUp.classList.toggle('intro__get-up--on', getUp);
    this.getUp.disabled = !getUp;
    if (getUp) this.getUp.focus({ preventScroll: true });
  }

  /** The Skip button (gone once the morning's title is up). */
  setSkippable(skippable: boolean): void {
    this.skip.hidden = !skippable;
  }

  /** The line under the title (a skipped film puts the narration's hook there). */
  setTagline(text: string): void {
    this.tagline.textContent = text;
  }

  /** A first key press asked to skip (a second one skips): the button says so, lit. */
  armSkip(armed: boolean): void {
    this.skip.classList.toggle('intro__skip--armed', armed);
    this.skipLabel.textContent = armed ? 'Again to skip' : 'Skip';
  }

  /** The button that ends the film, for a key that presses it. */
  pressGetUp(): void {
    if (!this.getUp.disabled) this.getUp.click();
  }

  dispose(): void {
    this.show(false);
    this.root.remove();
  }
}
