import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import { renderKeys } from './keys';
import type { ScratchCard, ScratchSymbol } from '@/world/street/shops/scratchCard';
import './ScratchCardPanel.css';

/** How much of a cell's silver must be gone before it counts as scratched. */
const CLEARED = 0.5;
const CELL_PX = 96;
/** The coin's radius as it scratches (canvas pixels). */
const COIN = 13;

/** What the panel is dealt with a card: what to do once all is showing, and whether another card may be bought from it. */
export interface ScratchDeal {
  card: ScratchCard;
  /** Every cell is showing: pays out (or not) and returns the line to print under the card. */
  done: (win: ScratchSymbol | null) => string;
  /** Buys the next card, or returns why not (null = dealt). */
  again: () => string | null;
  /** Cells already scratched (a card taken up again after a reload), by index. */
  revealed?: readonly boolean[];
  /** A cell was scratched clear (its index): for keeping the card in progress. */
  onReveal?: (index: number) => void;
}

/**
 * The tabac's scratch card, GRATTE-PIXEL, held in hand: six silver cells over their symbols,
 * scratched off with the pointer (drag, or a tap reveals a cell at once; Enter or the pad's A
 * reveals the next one). Three alike win that symbol's coins, paid when the last cell shows. A
 * `ModalLike` the Session opens through `SessionActions.openPanel`: Close, Esc or a click outside
 * puts it down; "Another" buys the next card on the spot.
 */
export class ScratchCardPanel extends ModalPanel {
  private readonly cellsBox: HTMLElement;
  private readonly result: HTMLElement;
  private readonly againButton: HTMLButtonElement;
  private deal: ScratchDeal | null = null;
  private cells: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; symbol: ScratchSymbol; revealed: boolean }[] = [];
  private finished = false;
  private scratching: HTMLCanvasElement | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre scratch-panel' });
    this.root.innerHTML = `
      <article class="scratch-panel__card ui-card" role="dialog" aria-modal="true" aria-label="A scratch card">
        <header><h2>GRATTE-PIXEL</h2><p>Three alike win. 🍒 2 · 🎮 3 · 💾 5 · ⭐ 10 · 7 25 coins</p></header>
        <div class="scratch-panel__cells"></div>
        <p class="scratch-panel__result" aria-live="polite"></p>
        <p class="scratch-panel__hint">${renderKeys('Scratch with the mouse, tap a cell, or {Enter} for the next one')}</p>
        <footer>
          <button type="button" class="ui-btn" data-action="reveal">Scratch it all</button>
          <button type="button" class="ui-btn" data-action="again" hidden>Another card</button>
          <button type="button" class="ui-btn" data-action="close" aria-label="Close">Close</button>
        </footer>
      </article>`;
    this.cellsBox = this.root.querySelector('.scratch-panel__cells')!;
    this.result = this.root.querySelector('.scratch-panel__result')!;
    this.againButton = this.root.querySelector('button[data-action="again"]')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) this.close();
      else if (target.closest('button[data-action="reveal"]')) this.revealAll();
      else if (target.closest('button[data-action="again"]')) this.buyAnother();
    });
    this.root.addEventListener('pointerup', () => this.stopScratching());
    this.root.addEventListener('pointerleave', () => this.stopScratching());
  }

  /** Lays a fresh card (call before the Session opens the panel, or from "Another"). */
  show(deal: ScratchDeal): void {
    this.deal = deal;
    this.finished = false;
    this.result.textContent = '';
    this.againButton.hidden = true;
    this.cellsBox.innerHTML = '';
    this.cells = deal.card.cells.map((symbol, index) => {
      const cell = document.createElement('div');
      cell.className = 'scratch-panel__cell';
      cell.innerHTML = `<span class="scratch-panel__symbol${symbol.glyph === '7' ? ' scratch-panel__symbol--seven' : ''}" aria-label="${escapeHtml(symbol.name)}">${escapeHtml(symbol.glyph)}</span>`;
      const canvas = document.createElement('canvas');
      canvas.width = CELL_PX;
      canvas.height = CELL_PX;
      const ctx = canvas.getContext('2d')!;
      const revealed = deal.revealed?.[index] ?? false;
      if (!revealed) paintSilver(ctx);
      cell.appendChild(canvas);
      this.cellsBox.appendChild(cell);
      const entry = { canvas, ctx, symbol, revealed };
      canvas.addEventListener('pointerdown', (e) => {
        this.scratching = canvas;
        canvas.setPointerCapture(e.pointerId);
        this.scratch(entry, e);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (this.scratching === canvas) this.scratch(entry, e);
      });
      canvas.addEventListener('dblclick', () => this.reveal(entry));
      return entry;
    });
    // Taken up again with every cell already scratched (the page went just as the last one cleared): pay it now.
    if (this.cells.every((c) => c.revealed)) this.finish();
  }

  close(): void {
    // Walking off with a half-scratched card: it is scratched anyway, and paid.
    if (this.isOpen) this.revealAll();
    super.close();
  }

  /** Enter or Space (off a button) scratches the next cell. */
  protected onKey(e: KeyboardEvent): void {
    if ((e.code === 'Enter' || e.code === 'Space') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.revealNext();
    }
  }

  /** Takes the panel out of the page (the street unloaded). */
  dispose(): void {
    this.close();
    this.root.remove();
  }

  private stopScratching(): void {
    this.scratching = null;
  }

  private scratch(cell: (typeof this.cells)[number], e: PointerEvent): void {
    if (cell.revealed) return;
    const rect = cell.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CELL_PX;
    const y = ((e.clientY - rect.top) / rect.height) * CELL_PX;
    const ctx = cell.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, COIN, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (cleared(ctx) >= CLEARED) this.reveal(cell);
  }

  private reveal(cell: (typeof this.cells)[number]): void {
    if (cell.revealed) return;
    cell.revealed = true;
    cell.ctx.clearRect(0, 0, CELL_PX, CELL_PX);
    if (this.cells.every((c) => c.revealed)) this.finish();
    else this.deal?.onReveal?.(this.cells.indexOf(cell));
  }

  private revealNext(): void {
    const next = this.cells.find((c) => !c.revealed);
    if (next) this.reveal(next);
  }

  private revealAll(): void {
    for (const cell of this.cells) this.reveal(cell);
  }

  private finish(): void {
    if (this.finished || !this.deal) return;
    this.finished = true;
    const { win } = this.deal.card;
    if (win) for (const cell of this.cells) if (cell.symbol === win) cell.canvas.parentElement?.classList.add('scratch-panel__cell--win');
    this.result.textContent = this.deal.done(win);
    this.againButton.hidden = false;
  }

  private buyAnother(): void {
    const deal = this.deal;
    if (!deal) return;
    const refused = deal.again();
    if (refused) this.result.textContent = refused;
  }
}

/** The silver coating: a metallic gradient, fine speckle, a faint coin pattern. */
function paintSilver(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, CELL_PX, CELL_PX);
  g.addColorStop(0, '#d8dadf');
  g.addColorStop(0.5, '#a9adb5');
  g.addColorStop(1, '#cfd2d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CELL_PX, CELL_PX);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(60,64,72,0.25)';
    ctx.fillRect(Math.random() * CELL_PX, Math.random() * CELL_PX, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(80,84,92,0.35)';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', CELL_PX / 2, CELL_PX / 2);
}

/** Share of the cell whose silver is scratched away (sampled on a coarse grid). */
function cleared(ctx: CanvasRenderingContext2D): number {
  const data = ctx.getImageData(0, 0, CELL_PX, CELL_PX).data;
  let gone = 0;
  let total = 0;
  for (let y = 4; y < CELL_PX; y += 8) {
    for (let x = 4; x < CELL_PX; x += 8) {
      total++;
      if (data[(y * CELL_PX + x) * 4 + 3]! < 40) gone++;
    }
  }
  return gone / total;
}
