import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { MAX_LETTERS, TAPES, TAPE_COLOURS, labelText, type TapeColour } from '@/world/labels/labelTape';
import { playLabelPrint } from '@/audio/labelSounds';
import { playPlasticClick } from '@/audio/furnitureSounds';
import { lastDevice } from '@/input/lastDevice';
import { LetterPad } from './panel/letterPad';
import { formatCount } from '@/text/count';
import './LabelPanel.css';

/** What the panel does with what was typed: print it (a refusal comes back when it cannot be stuck there), or peel the label off. */
interface LabelPanelRequest {
  /** The label stuck where the player aims, when there is one: it may be peeled off, or printed again. */
  existing: { text: string; tape: TapeColour } | null;
  /** Draws a label of `text` on `tape` in `canvas` (`ShelfLabels.preview`). */
  preview(canvas: HTMLCanvasElement, text: string, tape: TapeColour): void;
  /** Prints and sticks it: null once done, else why not (the panel stays open and says it). */
  print(text: string, tape: TapeColour): string | null;
  peel?(): void;
}

/**
 * The label maker (docs/furnishing.md "Shelf labels"): type a few capitals, pick the tape, see it embossed, Print
 * sticks it on the shelf edge the player aimed at (Enter in the text field prints too; on a button, Enter presses
 * that button). Aimed at a label already there: Peel off, or print a new one over it. The last tape is kept for
 * the next label. The letters left show under the field; a controller gets the letters on screen (`panel/letterPad`).
 */
export class LabelPanel extends CardPanel {
  private request: LabelPanelRequest | null = null;
  private tape: TapeColour = 'black';
  private pad: LetterPad | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'label-panel', cardClass: 'label-panel__card ui-card', title: 'Label maker', dismiss: 'Cancel' });
    this.listen(this.root, 'input', () => {
      // The dial turned and the plunger pressed: a click per letter typed.
      playPlasticClick(false, 0.04);
      this.redraw();
    });
  }

  /** Deals the panel for the edge aimed at (call before the Session opens it). */
  show(request: LabelPanelRequest): void {
    this.request = request;
    if (request.existing) this.tape = request.existing.tape;
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const existing = this.request?.existing ?? null;
    const swatches = TAPE_COLOURS.map(
      (id) => html`<button type="button" class="label-panel__tape" data-action="tape" data-tape="${id}" style="--tape:${TAPES[id].vinyl}" aria-label="${TAPES[id].name} tape" aria-pressed="${id === this.tape ? 'true' : 'false'}"></button>`,
    );
    return html`<p class="label-panel__brand" aria-hidden="true">LETTERMATIC <span>3</span></p>
      <p class="label-panel__note">${existing ? html`This edge says <strong>${existing.text}</strong>. Peel it off, or print another over it.` : 'A few capitals embossed on tape, stuck on the edge you aimed at.'}</p>
      <div class="label-panel__window"><input class="label-panel__text" type="text" maxlength="${MAX_LETTERS}" placeholder="RPG, MY FAVOURITES…" autocomplete="off" spellcheck="false" aria-label="Label text" value="${existing?.text ?? ''}" data-autofocus /></div>
      <p class="label-panel__left"></p>
      <div class="label-panel__tapes" role="group" aria-label="Tape">${swatches}</div>
      <div class="label-panel__slot" aria-hidden="true"></div>
      <div class="label-panel__preview"><canvas aria-hidden="true"></canvas></div>`;
  }

  protected override actions(): PanelAction[] {
    const request = this.request;
    return [...(request?.existing && request.peel ? [{ action: 'peel', label: 'Peel off' }] : []), { action: 'print', label: 'Print', primary: true }];
  }

  protected override repaint(): void {
    super.repaint();
    // The letters on screen for a controller, typing into the field just painted.
    const input = this.input;
    this.pad = input ? new LetterPad({ field: input, digits: true, columns: 9 }) : null;
    if (this.pad && input) {
      this.pad.visible = lastDevice() === 'gamepad';
      this.card.querySelector('.label-panel__left')?.after(this.pad.element);
    }
    this.redraw();
  }

  /** The D-pad walks the letters in their grid; down from the field reaches them. */
  protected override onMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    const pad = this.pad;
    if (!pad?.visible) return false;
    if (direction === 'down' && document.activeElement === this.input) {
      pad.focusFirst();
      return true;
    }
    return pad.move(direction);
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'tape' && el.dataset.tape) this.pickTape(el.dataset.tape as TapeColour);
    else if (action === 'print') this.print();
    else if (action === 'peel') {
      const peel = this.request?.peel;
      this.request = null;
      peel?.();
      this.close();
    }
  }

  /** Enter in the text field prints (a button takes its own Enter). */
  protected override onKey(e: KeyboardEvent): void {
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && document.activeElement === this.input) {
      e.preventDefault();
      this.print();
    }
  }

  protected override onClosed(): void {
    this.request = null;
  }

  private get input(): HTMLInputElement | null {
    return this.card.querySelector<HTMLInputElement>('.label-panel__text');
  }

  private pickTape(tape: TapeColour): void {
    this.tape = tape;
    for (const el of this.card.querySelectorAll<HTMLElement>('button[data-tape]')) el.setAttribute('aria-pressed', String(el.dataset.tape === tape));
    this.redraw();
  }

  private redraw(): void {
    const canvas = this.card.querySelector('canvas');
    if (canvas && this.request) this.request.preview(canvas, this.input?.value ?? '', this.tape);
    const left = MAX_LETTERS - labelText(this.input?.value ?? '').length;
    const line = this.card.querySelector('.label-panel__left');
    if (line) line.textContent = left === 0 ? 'The tape is full' : left === MAX_LETTERS ? '' : `${formatCount(left, 'letter')} left`;
    this.setStatus('');
  }

  private print(): void {
    const request = this.request;
    if (!request) return;
    const text = labelText(this.input?.value ?? '');
    const refusal = request.print(text, this.tape);
    if (refusal) {
      this.setStatus(refusal, 'error');
      return;
    }
    playLabelPrint(text.length);
    this.request = null;
    this.close();
  }
}
