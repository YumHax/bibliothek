import { escapeHtml } from '@/ui/html';
import { renderKeys } from '@/ui/keys';
import { keyMarkup } from '@/input/actions';
import { reduceMotion } from '@/settings/motion';
import { lastDevice } from '@/input/lastDevice';
import type { PhotoFrame } from './frames';
import './PhotoMode.css';

/** The keys, in `renderKeys` markup (named for the player's layout and bindings). */
const k = keyMarkup;
const HELP = [
  `${k('forward')}${k('left')}${k('back')}${k('right')} fly · ${k('photoUp')} up · ${k('photoDown')} down`,
  `[Wheel] zoom · ${k('photoFocusNear')} / ${k('photoFocusFar')} focus · ${k('photoBlurLess')} / ${k('photoBlurMore')} blur · ${k('photoDarker')} / ${k('photoBrighter')} exposure`,
  `${k('photoLook')} look · ${k('photoFrame')} frame · ${k('photoReset')} reset · ${k('photoHelp')} hide this`,
  `${k('photoCapture')} or [Click]: take the photo · ${k('photoMode')} back`,
];
/** A controller or a touchscreen takes the photo and goes back; flying and the lens are the keyboard's. */
const HELP_PAD = ['[A]: take the photo · [Start]: back', 'Flying, zoom and the lens need a keyboard and mouse.'];
const HELP_TOUCH = ['Tap: take the photo · [Menu]: back', 'Flying, zoom and the lens need a keyboard and mouse.'];

/** The help for the device in hand now. */
function help(): readonly string[] {
  const device = lastDevice();
  return device === 'gamepad' ? HELP_PAD : device === 'touch' ? HELP_TOUCH : HELP;
}

/** What the settings card shows. */
export interface PhotoReadout {
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
    container.append(this.guides, this.card, this.flashEl);
  }

  show(on: boolean): void {
    if (on) this.saved = null;
    document.body.classList.toggle('photo-mode', on);
    this.guides.hidden = !on;
    this.card.hidden = !on || !this.helpShown;
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
    const lens = r.lens
      ? `<dt>Focus</dt><dd>${r.blur > 0 ? `${r.focus.toFixed(1)} m` : 'all sharp'}</dd>
         <dt>Blur</dt><dd>${r.blur > 0 ? r.blur.toFixed(0) : 'off'}</dd>
         <dt>Exposure</dt><dd>${r.exposure >= 0 ? '+' : ''}${r.exposure.toFixed(2)} EV</dd>`
      : '<dt>Lens</dt><dd>needs Medium graphics or better</dd>';
    this.card.innerHTML = `
      <h2>Photo mode</h2>
      <dl>
        ${lens}
        <dt>Zoom</dt><dd>${Math.round(r.fov)}°</dd>
        <dt>Look</dt><dd>${escapeHtml(r.look)}</dd>
        <dt>Frame</dt><dd>${escapeHtml(r.frame)}</dd>
      </dl>
      <ul>${help().map((line) => `<li>${renderKeys(line)}</li>`).join('')}</ul>
      ${this.saved ? `<p class="photo-card__saved${this.saved.failed ? ' photo-card__saved--failed' : ''}" role="status">${escapeHtml(this.saved.text)}</p>` : ''}`;
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
