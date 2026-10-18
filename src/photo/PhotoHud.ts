import { renderKeys } from '@/ui/keys';
import { html, paint, raw } from '@/ui/panel/html';
import { keyMarkup } from '@/input/actions';
import { reduceMotion } from '@/settings/motion';
import { lastDevice } from '@/input/lastDevice';
import type { PhotoFrame } from './frames';
import './PhotoMode.css';
import './photoPrint.css';

/** How long the print of the last shot stays in the corner (ms), and its slide out. */
const PRINT_MS = 4200;
const PRINT_OUT_MS = 400;

/** The keys, in `renderKeys` markup (named for the player's layout and bindings). */
const k = keyMarkup;
/** One group of the help: what the keys do together (move, the lens, the picture, the shot), as the keys card groups them. */
interface HelpGroup {
  head: string;
  line: string;
}
const HELP: readonly HelpGroup[] = [
  { head: 'Move', line: `${k('forward')}${k('left')}${k('back')}${k('right')} fly · ${k('photoUp')} up · ${k('photoDown')} down` },
  { head: 'Lens', line: `[Wheel] zoom · ${k('photoFocusNear')} / ${k('photoFocusFar')} focus · ${k('photoBlurLess')} / ${k('photoBlurMore')} blur · ${k('photoDarker')} / ${k('photoBrighter')} light` },
  { head: 'Picture', line: `${k('photoLook')} look · ${k('photoFrame')} frame · ${k('photoReset')} reset · ${k('photoHelp')} hide this card` },
  { head: 'Shoot', line: `${k('photoCapture')} or [Click]: take the photo · ${k('photoMode')} back` },
];
/** A controller flies and looks with the sticks, zooms on the triggers, focuses on the bumpers. */
const HELP_PAD: readonly HelpGroup[] = [
  { head: 'Move', line: 'Left stick fly · right stick look' },
  { head: 'Lens', line: '[LT] / [RT] zoom · [LB] / [RB] focus' },
  { head: 'Picture', line: '[X] look · [Y] frame · [Select] reset' },
  { head: 'Shoot', line: '[A]: take the photo · [Start]: back' },
];
/** A touchscreen flies with the stick on the left, looks with a drag on the right, zooms with two fingers; the buttons under the card do the rest. */
const HELP_TOUCH: readonly HelpGroup[] = [
  { head: 'Move', line: 'Left side: fly · right side: drag to look' },
  { head: 'Lens', line: 'Two fingers: spread to zoom in, pinch to zoom out' },
  { head: 'Shoot', line: 'Tap the view: take the photo' },
];

/** The help for the device in hand now. */
function help(): readonly HelpGroup[] {
  const device = lastDevice();
  return device === 'gamepad' ? HELP_PAD : device === 'touch' ? HELP_TOUCH : HELP;
}

/** What the settings card shows. */
interface PhotoReadout {
  focus: number;
  blur: number;
  exposure: number;
  fov: number;
  look: string;
  frame: string;
  /** False on the low quality level: no depth of field, no exposure (no post-processing). */
  lens: boolean;
}

/**
 * Photo mode's DOM: the framing guides over the view (thirds, the cinema bars, the square), the
 * settings and keys card in a corner (H hides it), and the shutter's white flash. While it is up,
 * `body.photo-mode` hides the game's HUD (crosshair, labels, notices, wallet, touch
 * controls). None of it is in a photo: only the canvas is saved.
 */
export class PhotoHud {
  private readonly guides: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly printEl: HTMLElement;
  private readonly touchRow: HTMLDivElement;
  private printTimer: number | undefined;
  private helpShown = true;
  /** The last photo's line on the card ("Saved bibliothek-….png", or why not). */
  private saved: { text: string; failed: boolean } | null = null;

  constructor(container: HTMLElement) {
    this.guides = document.createElement('div');
    this.guides.className = 'photo-guides';
    this.guides.hidden = true;
    this.card = document.createElement('div');
    this.card.className = 'photo-card';
    this.card.hidden = true;
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'photo-flash';
    this.flashEl.hidden = true;
    // The last shot as a print in the corner: what was taken, and that it is kept.
    this.printEl = document.createElement('figure');
    this.printEl.className = 'photo-print';
    this.printEl.hidden = true;
    // A touchscreen's camera buttons along the bottom (shown on a touch device only, `body.touch-device`).
    this.touchRow = document.createElement('div');
    this.touchRow.className = 'photo-touch';
    this.touchRow.hidden = true;
    container.append(this.guides, this.card, this.flashEl, this.printEl, this.touchRow);
  }

  /** The touchscreen's buttons, left to right: each runs its action on the finger's landing (never a photo taken under it). */
  setTouchActions(actions: readonly { label: string; run: () => void }[]): void {
    this.touchRow.replaceChildren(
      ...actions.map(({ label, run }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photo-touch__btn';
        button.textContent = label;
        button.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          run();
        });
        // The compatibility click must not reach the document (a click there takes the photo).
        button.addEventListener('mousedown', (e) => e.stopPropagation());
        return button;
      }),
    );
  }

  /** Slides the shot in as a print in the corner, a caption under it, for a few seconds. */
  showPrint(shot: HTMLCanvasElement, caption: string, failed: boolean): void {
    const thumb = document.createElement('canvas');
    thumb.width = 240;
    thumb.height = Math.max(1, Math.round((shot.height / Math.max(1, shot.width)) * 240));
    thumb.getContext('2d')?.drawImage(shot, 0, 0, thumb.width, thumb.height);
    thumb.className = 'photo-print__shot';
    paint(this.printEl, html`<figcaption class="photo-print__caption${failed ? ' photo-print__caption--failed' : ''}">${caption}</figcaption>`);
    this.printEl.prepend(thumb);
    window.clearTimeout(this.printTimer);
    this.printEl.classList.remove('photo-print--out');
    this.printEl.hidden = false;
    this.printEl.classList.remove('photo-print--in');
    void this.printEl.offsetWidth; // restart the slide
    this.printEl.classList.add('photo-print--in');
    this.printTimer = window.setTimeout(() => {
      this.printEl.classList.add('photo-print--out');
      this.printTimer = window.setTimeout(() => (this.printEl.hidden = true), PRINT_OUT_MS);
    }, PRINT_MS);
  }

  show(on: boolean): void {
    if (on) this.saved = null;
    document.body.classList.toggle('photo-mode', on);
    this.guides.hidden = !on;
    this.touchRow.hidden = !on;
    this.card.hidden = !on || !this.helpShown;
    if (!on) {
      window.clearTimeout(this.printTimer);
      this.printEl.hidden = true;
    }
  }

  /** The last photo's line on the card, until the next one (or leaving photo mode). */
  setSaved(text: string, failed: boolean): void {
    this.saved = { text, failed };
  }

  toggleHelp(): void {
    this.helpShown = !this.helpShown;
    this.card.hidden = !this.helpShown;
  }

  setFrame(frame: PhotoFrame): void {
    this.guides.dataset.frame = frame.id;
    if (frame.aspect) this.guides.style.setProperty('--photo-aspect', String(frame.aspect));
  }

  render(r: PhotoReadout): void {
    if (this.card.hidden) return;
    // In words, as a photographer would say it, not a spec sheet.
    const lens = r.lens
      ? html`<dt>Focus</dt><dd>${r.blur > 0 ? focusWords(r.focus) : 'everything sharp'}</dd>
          <dt>Background</dt><dd>${blurWords(r.blur)}</dd>
          <dt>Light</dt><dd>${exposureWords(r.exposure)}</dd>`
      : html`<dt>Lens</dt><dd>focus and light come with Medium graphics</dd>`;
    paint(
      this.card,
      html`<h2>Photo mode</h2>
        <dl>
          ${lens}
          <dt>Zoom</dt><dd>${zoomWords(r.fov)}</dd>
          <dt>Look</dt><dd>${r.look}</dd>
          <dt>Frame</dt><dd>${r.frame}</dd>
        </dl>
        <dl class="photo-card__keys">${help().map((group) => html`<dt>${group.head}</dt><dd>${raw(renderKeys(group.line))}</dd>`)}</dl>
        ${this.saved ? html`<p class="photo-card__saved${this.saved.failed ? ' photo-card__saved--failed' : ''}" role="status">${this.saved.text}</p>` : ''}`,
    );
  }

  /** The shutter: a white flash that fades (a soft dim instead with reduced motion). */
  flash(): void {
    const el = this.flashEl;
    el.classList.toggle('photo-flash--dim', reduceMotion());
    el.hidden = false;
    el.classList.remove('photo-flash--go');
    void el.offsetWidth; // restart the animation
    el.classList.add('photo-flash--go');
    window.setTimeout(() => (el.hidden = true), 450);
  }
}

/** Where the focus sits, in words (the distance after it, for the careful). */
function focusWords(m: number): string {
  const where = m < 0.8 ? 'up close' : m < 2.5 ? 'near' : m < 8 ? 'across the room' : 'far off';
  return `${where} (${m.toFixed(1)} m)`;
}

function blurWords(blur: number): string {
  return blur <= 0 ? 'sharp' : blur < 4 ? 'a little soft' : blur < 9 ? 'soft' : 'very soft';
}

function exposureWords(ev: number): string {
  if (Math.abs(ev) < 0.15) return 'as it is';
  const much = Math.abs(ev) > 1.2 ? 'much ' : Math.abs(ev) < 0.5 ? 'a touch ' : '';
  return `${much}${ev > 0 ? 'brighter' : 'darker'}`;
}

/** The lens's width in words: wide for a room, close for a box on a shelf. */
function zoomWords(fov: number): string {
  return fov > 62 ? 'wide' : fov > 42 ? 'normal' : fov > 28 ? 'close' : 'very close';
}
