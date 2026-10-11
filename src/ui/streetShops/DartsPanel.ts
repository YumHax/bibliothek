import { dartScore, RINGS, sectorNumbers } from '@/streetShops/darts';
import { createCanvas } from '@/graphics/canvas';
import { random } from '@/random';
import { clamp } from '@/math/scalar';
import { ModalPanel } from '../ModalPanel';
import { html, paint } from '../panel/html';
import './streetShops.css';

/** What a go at THE LOCAL's dartboard is dealt by the bar's door (`world/street/shops/counters`). */
export interface DartsGo {
  /** Tonight's best on the chalkboard: three darts to beat it. */
  best: number;
  /** The three darts are thrown, `score` in all: the barman's words (and the prize, paid by the deal). */
  over(score: number): string;
  /** Another go: paid (null) or why not. */
  again(): string | null;
  /** A dart thrown: its thud in the bar (the street's cue). */
  thrown?(): void;
  /** Walked off before a single dart of a paid go: its fee back. */
  refund?(): void;
}

/** The canvas's size (px) and the board's scoring radius on it. */
const SIZE = 320;
const R = 128;
/** How far the hand wanders round the aim (board units), and the throw's own scatter. */
const WOBBLE = 0.085;
const SCATTER = 0.035;
const DARTS = 3;
/** The board's paints: the singles' black and cream, the rings' red and green, the wire, the numbers. */
const PAINT = { black: '#1d1a17', cream: '#efe3c4', red: '#b3262e', green: '#2e7a3c', wire: '#c9c2b0', back: '#121010', number: '#f2ead6', dart: '#f0c040', aim: '#ffffff' };
/** How far an arrow press moves the aim, and how far out it may go (board units). */
const STEP = 0.03;
const AIM_REACH = 1.15;

/**
 * THE LOCAL's dartboard (docs/economy.md "Front Street's shops and finds"): a regulation board on its black surround,
 * the aim under the pointer (or moved with the arrows), the hand wandering round it as a hand does after a lemonade, a
 * click (or Space) throws; three darts a go, each called out, the total against tonight's best on the chalkboard. A
 * `ModalLike` the bar's door opens.
 */
export class DartsPanel extends ModalPanel {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callEl: HTMLElement;
  private readonly againEl: HTMLButtonElement;
  private go: DartsGo | null = null;
  private aim = { x: 0, y: 0.3 };
  private thrown: { x: number; y: number; points: number }[] = [];
  private done = false;
  private frame = 0;
  private t = 0;
  private last = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre ui-panel street-darts', label: 'Darts at THE LOCAL' });
    const [canvas, ctx] = createCanvas(SIZE, SIZE);
    this.canvas = canvas;
    this.ctx = ctx;
    paint(
      this.root,
      html`<article class="ui-card ui-panel__card street-darts__card">
        <header class="ui-panel__header"><h2>Darts at THE LOCAL</h2></header>
        <p class="street-darts__chalk"></p>
        <div class="street-darts__board"></div>
        <p class="street-darts__call"></p>
        <div class="ui-panel__status"></div>
        <footer class="ui-panel__footer"><button type="button" class="ui-btn" data-action="close">Back to the bar</button><button type="button" class="ui-btn ui-btn--primary" data-action="again" hidden>Another go</button></footer>
      </article>`,
    );
    this.statusEl = this.root.querySelector('.ui-panel__status')!;
    this.statusEl.setAttribute('role', 'status');
    this.callEl = this.root.querySelector('.street-darts__call')!;
    this.againEl = this.root.querySelector('[data-action="again"]')!;
    canvas.className = 'street-darts__canvas';
    canvas.tabIndex = 0;
    canvas.dataset.autofocus = '';
    canvas.setAttribute('aria-label', 'The dartboard: aim with the pointer or the arrows, throw with a click or Space');
    this.root.querySelector('.street-darts__board')!.append(canvas);
    this.listen(canvas, 'pointermove', (e) => this.pointAt(e));
    this.listen(canvas, 'pointerdown', (e) => {
      this.pointAt(e);
      this.throwDart();
    });
  }

  /** Deals a go (before the Session opens the panel). */
  show(go: DartsGo): void {
    this.go = go;
  }

  protected override onOpened(): void {
    this.start();
    this.last = performance.now();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  protected override onClosed(): void {
    cancelAnimationFrame(this.frame);
    // Walked off mid-go: not a dart thrown, the fee back; some thrown, the go counts as it stands.
    const go = this.go;
    if (!go || this.done) return;
    this.done = true;
    if (!this.thrown.length) go.refund?.();
    else go.over(this.thrown.reduce((sum, d) => sum + d.points, 0));
  }

  protected override onAction(action: string): void {
    if (action !== 'again' || !this.go) return;
    const refused = this.go.again();
    if (refused) {
      this.setStatus(refused, 'error');
      return;
    }
    this.start();
  }

  protected override onKey(e: KeyboardEvent): void {
    const move: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] };
    const by = move[e.code];
    if (by) {
      e.preventDefault();
      this.aim = { x: onBoard(this.aim.x + by[0]), y: onBoard(this.aim.y + by[1]) };
    } else if (e.code === 'Space' && !this.done) {
      e.preventDefault();
      this.throwDart();
    }
  }

  /** The arrows are the aim's: they never walk the focus. */
  protected override onSide(): boolean {
    return true;
  }

  private start(): void {
    this.thrown = [];
    this.done = false;
    this.againEl.hidden = true;
    this.callEl.textContent = 'Three darts. Aim, and throw.';
    this.root.querySelector('.street-darts__chalk')!.textContent = `Tonight’s best on the chalkboard: ${this.go?.best ?? 0}`;
    this.setStatus('');
  }

  private pointAt(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    this.aim = { x: onBoard((px - SIZE / 2) / R), y: onBoard(-(py - SIZE / 2) / R) };
  }

  /** Where the dart would go now: the aim, and the hand's wander round it. */
  private target(): { x: number; y: number } {
    const t = this.t;
    return {
      x: this.aim.x + WOBBLE * (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 3.1 + 1)) / 1.5,
      y: this.aim.y + WOBBLE * (Math.cos(t * 1.3) + 0.5 * Math.cos(t * 2.9 + 2)) / 1.5,
    };
  }

  private throwDart(): void {
    const go = this.go;
    if (!go || this.done) return;
    const at = this.target();
    const x = at.x + (random() - 0.5) * 2 * SCATTER;
    const y = at.y + (random() - 0.5) * 2 * SCATTER;
    const { points, call } = dartScore(x, y);
    go.thrown?.();
    this.thrown.push({ x, y, points });
    const total = this.thrown.reduce((sum, d) => sum + d.points, 0);
    this.callEl.textContent = `${call}. ${total} so far.`;
    if (this.thrown.length < DARTS) return;
    this.done = true;
    this.callEl.textContent = go.over(total);
    this.againEl.hidden = false;
  }

  private tick(now: number): void {
    if (!this.isOpen) return;
    this.t += Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.draw();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private draw(): void {
    const { ctx } = this;
    const c = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = PAINT.back;
    ctx.beginPath();
    ctx.arc(c, c, R * 1.2, 0, Math.PI * 2);
    ctx.fill();
    const numbers = sectorNumbers();
    const wedge = (from: number, to: number, a0: number, a1: number, colour: string): void => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(c, c, to * R, a0, a1);
      ctx.arc(c, c, from * R, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    };
    for (let i = 0; i < 20; i++) {
      const mid = -Math.PI / 2 + (i * Math.PI * 2) / 20;
      const a0 = mid - Math.PI / 20;
      const a1 = mid + Math.PI / 20;
      const single = i % 2 === 0 ? PAINT.black : PAINT.cream;
      const ring = i % 2 === 0 ? PAINT.red : PAINT.green;
      wedge(RINGS.doubleIn, RINGS.doubleOut, a0, a1, ring);
      wedge(RINGS.trebleOut, RINGS.doubleIn, a0, a1, single);
      wedge(RINGS.trebleIn, RINGS.trebleOut, a0, a1, ring);
      wedge(RINGS.outerBull, RINGS.trebleIn, a0, a1, single);
      ctx.fillStyle = PAINT.number;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(numbers[i]), c + Math.cos(mid) * R * 1.1, c + Math.sin(mid) * R * 1.1);
    }
    ctx.fillStyle = PAINT.green;
    ctx.beginPath();
    ctx.arc(c, c, RINGS.outerBull * R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAINT.red;
    ctx.beginPath();
    ctx.arc(c, c, RINGS.bull * R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAINT.wire;
    ctx.lineWidth = 0.6;
    for (const r of [RINGS.outerBull, RINGS.trebleIn, RINGS.trebleOut, RINGS.doubleIn, RINGS.doubleOut]) {
      ctx.beginPath();
      ctx.arc(c, c, r * R, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const dart of this.thrown) {
      ctx.fillStyle = PAINT.dart;
      ctx.beginPath();
      ctx.arc(c + dart.x * R, c - dart.y * R, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.done) return;
    const at = this.target();
    ctx.strokeStyle = PAINT.aim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c + at.x * R, c - at.y * R, 7, 0, Math.PI * 2);
    ctx.moveTo(c + at.x * R - 11, c - at.y * R);
    ctx.lineTo(c + at.x * R + 11, c - at.y * R);
    ctx.moveTo(c + at.x * R, c - at.y * R - 11);
    ctx.lineTo(c + at.x * R, c - at.y * R + 11);
    ctx.stroke();
  }
}

/** The aim stays over the board and its surround (board units). */
function onBoard(v: number): number {
  return clamp(v, -AIM_REACH, AIM_REACH);
}
