import { CardPanel, type PanelAction } from './panel/CardPanel';
import { attr, html, paint, raw, type Html } from './panel/html';
import { renderKeys } from './keys';
import { SCRATCH_SYMBOLS, type ScratchCard, type ScratchSymbol } from '@/world/street/shops/scratchCard';
import { formatCoins } from '@/text/money';
import './ScratchCardPanel.css';
import { random } from '@/random';
import { playScratch, playScratchWin } from '@/audio/dealSounds';

/**
 * The pictures printed under the silver, in the ticket's inks (no emoji: those differ on every system): cherries on
 * their stems, a pad, a cartridge, a gold star, a red seven. 40 × 40, for the cells and, small, the prize table.
 */
const PICTURES: Record<ScratchSymbol['id'], string> = {
  cherries:
    '<path d="M20 6c-2 6-6 11-11 15M20 6c1 7 4 12 10 16" fill="none" stroke="#2f7a34" stroke-width="2.4" stroke-linecap="round"/><path d="M20 6c4-3 9-2 11 1-4 2-8 2-11-1z" fill="#3f9a44"/><circle cx="10" cy="27" r="7.5" fill="#d1232a"/><circle cx="30" cy="28" r="7.5" fill="#b81c24"/><circle cx="7.5" cy="24.5" r="2" fill="#ff8a8a"/><circle cx="27.5" cy="25.5" r="2" fill="#ff8a8a"/>',
  pad: '<rect x="3" y="11" width="34" height="18" rx="4" fill="#d9d6cf" stroke="#3a3a42" stroke-width="1.6"/><rect x="5.5" y="13.5" width="29" height="13" rx="2" fill="#2b2b33"/><path d="M10 17h3v-2.5h3V17h3v3h-3v2.5h-3V20h-3z" fill="#e7e4dc"/><circle cx="26.5" cy="21.5" r="2.4" fill="#d1232a"/><circle cx="31.5" cy="18.5" r="2.4" fill="#d1232a"/><rect x="18.5" y="22.5" width="3" height="1.4" rx=".7" fill="#8a8a92"/>',
  cartridge:
    '<path d="M8 5h24v26l-3 4H11l-3-4z" fill="#6a6a74" stroke="#2a2a32" stroke-width="1.6"/><rect x="11" y="9" width="18" height="14" rx="1.5" fill="#f2c84a"/><path d="M13 13h14M13 16.5h10" stroke="#7a3b10" stroke-width="1.6" stroke-linecap="round"/><path d="M12 27h16M12 30h16" stroke="#3a3a42" stroke-width="1.2"/>',
  star: '<path d="M20 3l5 10.5 11.5 1.5-8.4 8 2.1 11.4L20 29l-10.2 5.4 2.1-11.4-8.4-8L15 13.5z" fill="#ffd23a" stroke="#a86a10" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 15l3-6" stroke="#fff3b8" stroke-width="1.6" stroke-linecap="round"/>',
  seven:
    '<path d="M9 7h23v5L21 35h-7l10.5-22H9z" fill="#d92a2a" stroke="#ffd23a" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 9.5h17" stroke="#ff8a7a" stroke-width="1.4" stroke-linecap="round"/>',
};

function picture(symbol: ScratchSymbol, className: string): Html {
  return raw(`<svg class="${className}" viewBox="0 0 40 40" role="img" aria-label="${symbol.name}">${PICTURES[symbol.id]}</svg>`);
}

/** The coin's rasp is played at most this often while scratching (ms). */
const RASP_EVERY_MS = 90;

/** How much of a cell's silver must be gone before it counts as scratched. */
const CLEARED = 0.5;
const CELL_PX = 96;
/** The coin's radius as it scratches (canvas pixels). */
const COIN = 13;

/** What the panel is dealt with a card: what to do once all is showing, and whether another card may be bought from it. */
interface ScratchDeal {
  card: ScratchCard;
  /** Every cell is showing: pays out (or not) and returns the line to print under the card. */
  done: (win: ScratchSymbol | null) => string;
  /** Buys the next card, or returns why not (null = dealt). */
  again: () => string | null;
  /** What the next card costs (on the "Another card" button). */
  price?: number;
  /** Cells already scratched (a card taken up again after a reload), by index. */
  revealed?: readonly boolean[];
  /** A cell was scratched clear (its index): for keeping the card in progress. */
  onReveal?: (index: number) => void;
}

interface Cell {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  symbol: ScratchSymbol;
  revealed: boolean;
}

/**
 * The newsagent's scratch card, PIXEL SCRATCH, held in hand: six silver cells over their symbols,
 * scratched off with the pointer (drag, or a tap reveals a cell at once; Enter or the pad's A
 * reveals the next one). Three alike win that symbol's coins, paid when the last cell shows. A
 * `ModalLike` the Session opens through `SessionActions.openPanel`: Close, Esc or a click outside
 * puts it down; "Another" buys the next card on the spot.
 */
export class ScratchCardPanel extends CardPanel {
  private deal: ScratchDeal | null = null;
  /** Cards laid since the game started: the how-to line is printed on the first only. */
  private laid = 0;
  /** The ticket's serial, new with each card. */
  private serial = '';
  private cells: Cell[] = [];
  private finished = false;
  private scratching: HTMLCanvasElement | null = null;
  private raspAt = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'scratch-panel', cardClass: 'scratch-panel__card ui-card', title: 'A scratch card', header: false });
    this.listen(this.root, 'pointerup', () => this.stopScratching());
    this.listen(this.root, 'pointerleave', () => this.stopScratching());
  }

  /** Lays a fresh card (call before the Session opens the panel, or from "Another"). */
  show(deal: ScratchDeal): void {
    this.deal = deal;
    this.finished = false;
    this.laid++;
    this.serial = `${String(Math.floor(random() * 900) + 100)}-${String(Math.floor(random() * 90000) + 10000)}`;
    if (this.isOpen) this.refresh();
  }

  protected render(): Html {
    const win = this.finished ? this.deal?.card.win : undefined;
    const table = SCRATCH_SYMBOLS.map(
      (symbol) => html`<li class="scratch-panel__prize${win === symbol ? ' is-won' : ''}">${picture(symbol, 'scratch-panel__mini')}${picture(symbol, 'scratch-panel__mini')}${picture(symbol, 'scratch-panel__mini')}<span class="scratch-panel__pays">${formatCoins(symbol.prize)}</span></li>`,
    );
    const result = !this.finished ? '' : win ? html`<p class="scratch-panel__stamp">Winner · ${formatCoins(win.prize)}</p>` : html`<p class="scratch-panel__lost">Not a winner this time</p>`;
    return html`<header class="scratch-panel__band"><h2>PIXEL SCRATCH</h2><span class="scratch-panel__serial">No ${this.serial}</span></header>
      <div class="scratch-panel__play">
        <div class="scratch-panel__cells"></div>
        ${result}
      </div>
      <section class="scratch-panel__table" aria-label="Match three to win"><h3>Match 3 to win</h3><ul>${table}</ul></section>
      <p class="scratch-panel__hint"${attr('hidden', this.laid > 1)}>${raw(renderKeys('Scratch with the mouse or a finger, or {Enter} for the next one'))}</p>`;
  }

  protected override actions(): PanelAction[] {
    if (!this.finished) return [{ action: 'reveal', label: 'Scratch it all' }];
    const price = this.deal?.price;
    return [{ action: 'again', label: price !== undefined ? `Another card · ${formatCoins(price)}` : 'Another card', primary: true }];
  }

  /** The cells are canvases with their silver and their pointer handlers: built after the markup, from the deal. */
  protected override repaint(): void {
    super.repaint();
    const box = this.body.querySelector<HTMLElement>('.scratch-panel__cells');
    const deal = this.deal;
    if (!box || !deal) return;
    const before = this.cells;
    this.cells = deal.card.cells.map((symbol, index) => {
      const cell = document.createElement('div');
      cell.className = 'scratch-panel__cell';
      paint(cell, html`<span class="scratch-panel__symbol">${picture(symbol, 'scratch-panel__picture')}</span>`);
      const canvas = document.createElement('canvas');
      canvas.width = CELL_PX;
      canvas.height = CELL_PX;
      const ctx = canvas.getContext('2d')!;
      // A repaint mid-card (the status line changed) keeps what was scratched so far.
      const revealed = before[index]?.symbol === symbol ? before[index]!.revealed : (deal.revealed?.[index] ?? false);
      if (!revealed) paintSilver(ctx);
      if (this.finished && deal.card.win && symbol === deal.card.win) cell.classList.add('scratch-panel__cell--win');
      cell.appendChild(canvas);
      box.appendChild(cell);
      const entry: Cell = { canvas, ctx, symbol, revealed };
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
    if (!this.finished && this.cells.every((c) => c.revealed)) this.finish();
  }

  protected override onOpened(): void {
    this.cells = [];
    super.onOpened();
  }

  protected override onAction(action: string): void {
    if (action === 'reveal') this.revealAll();
    else if (action === 'again') this.buyAnother();
  }

  override close(): void {
    // Walking off with a half-scratched card: it is scratched anyway, and paid.
    if (this.isOpen) this.revealAll();
    super.close();
  }

  /** Enter (off a button) scratches the next cell. */
  protected override onEnter(): boolean {
    this.revealNext();
    return true;
  }

  /** Space too, off a button. */
  protected override onKey(e: KeyboardEvent): void {
    if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.revealNext();
    }
  }

  private stopScratching(): void {
    this.scratching = null;
  }

  private scratch(cell: Cell, e: PointerEvent): void {
    if (cell.revealed) return;
    const rect = cell.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CELL_PX;
    const y = ((e.clientY - rect.top) / rect.height) * CELL_PX;
    const ctx = cell.ctx;
    const now = performance.now();
    if (now - this.raspAt > RASP_EVERY_MS) {
      this.raspAt = now;
      playScratch();
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, COIN, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (cleared(ctx) >= CLEARED) this.reveal(cell);
  }

  private reveal(cell: Cell): void {
    if (cell.revealed) return;
    cell.revealed = true;
    cell.ctx.clearRect(0, 0, CELL_PX, CELL_PX);
    playScratch(0.08);
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
    if (win) playScratchWin();
    this.setStatus(this.deal.done(win), win ? 'ok' : 'info');
    // "Another card" joins the footer.
    if (this.isOpen) this.refresh();
  }

  private buyAnother(): void {
    const deal = this.deal;
    if (!deal) return;
    const refused = deal.again();
    if (refused) this.setStatus(refused, 'error');
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
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(60,64,72,0.25)';
    ctx.fillRect(random() * CELL_PX, random() * CELL_PX, 1.5, 1.5);
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
