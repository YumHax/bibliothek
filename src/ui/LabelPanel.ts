import { ModalPanel } from './ModalPanel';
import { escapeHtml } from './html';
import { MAX_LETTERS, TAPES, TAPE_COLOURS, labelText, type TapeColour } from '@/world/labels/labelTape';
import './LabelPanel.css';

/** What the panel does with what was typed: print it (a refusal comes back when it cannot be stuck there), or peel the label off. */
export interface LabelPanelRequest {
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
 * sticks it on the shelf edge the player aimed at. Aimed at a label already there: Peel off, or print a new one over it.
 * The last tape is kept for the next label.
 */
export class LabelPanel extends ModalPanel {
  private readonly card: HTMLElement;
  private request: LabelPanelRequest | null = null;
  private tape: TapeColour = 'black';

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre label-panel' });
    this.root.innerHTML = `<article class="label-panel__card ui-card" role="dialog" aria-modal="true" aria-label="Label maker"></article>`;
    this.card = this.root.querySelector('.label-panel__card')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) return this.close();
      const swatch = target.closest<HTMLElement>('button[data-tape]');
      if (swatch) return this.pickTape(swatch.dataset.tape as TapeColour);
      if (target.closest('button[data-action="print"]')) return this.print();
      if (target.closest('button[data-action="peel"]')) {
        const peel = this.request?.peel;
        this.request = null;
        peel?.();
        this.close();
      }
    });
    this.root.addEventListener('input', () => this.redraw());
  }

  /** Deals the panel for the edge aimed at (call before the Session opens it). */
  show(request: LabelPanelRequest): void {
    this.request = request;
    if (request.existing) this.tape = request.existing.tape;
    const existing = request.existing;
    const swatches = TAPE_COLOURS.map(
      (id) => `<button type="button" class="label-panel__tape" data-tape="${id}" style="--tape:${TAPES[id].vinyl}" aria-label="${TAPES[id].name} tape" aria-pressed="${id === this.tape}"></button>`,
    ).join('');
    this.card.innerHTML = `
      <header><h2>Label maker</h2></header>
      <p class="label-panel__note">${existing ? `This edge says <strong>${escapeHtml(existing.text)}</strong>. Peel it off, or print another over it.` : 'Up to sixteen capitals, embossed on tape, stuck on the edge you aimed at.'}</p>
      <input class="label-panel__text" type="text" maxlength="${MAX_LETTERS + 8}" placeholder="RPG, MY FAVOURITES…" autocomplete="off" spellcheck="false" aria-label="Label text" value="${escapeHtml(existing?.text ?? '')}" data-autofocus />
      <div class="label-panel__tapes" role="group" aria-label="Tape">${swatches}</div>
      <div class="label-panel__preview"><canvas aria-hidden="true"></canvas></div>
      <p class="label-panel__error" role="alert" hidden></p>
      <footer>
        ${existing && request.peel ? '<button type="button" class="ui-btn" data-action="peel">Peel off</button>' : ''}
        <span class="label-panel__gap"></span>
        <button type="button" class="ui-btn" data-action="close">Cancel</button>
        <button type="button" class="ui-btn ui-btn--primary" data-action="print">Print</button>
      </footer>`;
    this.redraw();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
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
    const error = this.card.querySelector<HTMLElement>('.label-panel__error');
    if (error) error.hidden = true;
  }

  private print(): void {
    const request = this.request;
    if (!request) return;
    const text = labelText(this.input?.value ?? '');
    const refusal = request.print(text, this.tape);
    if (refusal) {
      const error = this.card.querySelector<HTMLElement>('.label-panel__error');
      if (error) {
        error.textContent = refusal;
        error.hidden = false;
      }
      return;
    }
    this.request = null;
    this.close();
  }
}
