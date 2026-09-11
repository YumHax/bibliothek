import type { Input } from '@/core/Input';
import { CONTROLS } from './controls';

/**
 * Start screen + crosshair + status hint.
 * Pointer lock needs a user gesture, hence click (or Enter) to start.
 */
export class Overlay {
  private readonly card: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private hintTimer: number | undefined;
  private playing = false;
  /** While a DOM overlay (collection editor) is up, neither the start card nor the crosshair may show. */
  private modal = false;

  constructor(container: HTMLElement, input: Input, onStart: () => void) {
    this.card = document.createElement('div');
    this.card.className = 'overlay';
    this.card.innerHTML = `
      <div class="overlay__card">
        <h1>Bibliothek</h1>
        <p>Click anywhere, press <kbd>Enter</kbd> or a controller button to enter the room</p>
        <ul>${CONTROLS.map((c) => `<li>${c.html}</li>`).join('')}</ul>
      </div>`;
    this.card.addEventListener('click', onStart);
    input.onPress((code, e) => {
      if (!this.card.hidden && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        onStart();
      }
    });
    container.appendChild(this.card);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    container.appendChild(this.crosshair);

    this.label = document.createElement('div');
    this.label.className = 'hover-label';
    this.label.hidden = true;
    container.appendChild(this.label);

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.hidden = true;
    container.appendChild(this.hint);
  }

  /** Hide the start card and show the crosshair (or the reverse). */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.apply();
  }

  /**
   * A modal DOM overlay is open (or just closed). While modal, the start card stays hidden even
   * when the pointer lock drops, and the crosshair is hidden too.
   */
  setModal(modal: boolean): void {
    this.modal = modal;
    if (modal) this.setHoverLabel(null);
    this.apply();
  }

  private apply(): void {
    this.card.hidden = this.playing || this.modal;
    this.crosshair.hidden = !this.playing || this.modal;
  }

  /** Small caption naming the object being looked at: under the crosshair, or along the top edge so it never covers a playing screen. */
  setHoverLabel(text: string | null, placement: 'crosshair' | 'edge' = 'crosshair'): void {
    this.label.hidden = !text;
    if (text) this.label.textContent = text;
    this.label.classList.toggle('hover-label--edge', placement === 'edge');
  }

  showHint(message: string, durationMs = 2500): void {
    this.hint.textContent = message;
    this.hint.hidden = false;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => (this.hint.hidden = true), durationMs);
  }
}
