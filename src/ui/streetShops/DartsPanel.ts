import { afterDart, checkoutRoute, dartScore, RINGS, sectorNumbers } from '@/streetShops/darts';
import { createCanvas } from '@/graphics/canvas';
import { random } from '@/random';
import { clamp } from '@/math/scalar';
import { capitalise } from '@/text/strings';
import { formatCoins } from '@/text/money';
import { reduceMotion } from '@/settings/motion';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { BAR_STAFF, barFace } from './barFace';
import './darts.css';

/** How a go ends: checked out, bust (below nought, at one, or nought off a double), or three darts short. */
type GoEnd = 'out' | 'bust' | 'short';

/** What the barman says when a go ends, and what happens at the bar. */
interface GoVerdict {
  says: string;
  aside: string;
}

/** What a go at THE LOCAL's dartboard is dealt by the bar's door (`world/street/shops/counters`). */
export interface DartsGo {
  /** Tonight's checkout on the chalkboard: three darts to take it to nought exactly, the last in a double or the bull. */
  checkout: number;
  /** What three darts cost (on the "Another go" button). */
  fee: number;
  /** The go is over (`left` still to score): the barman's words (and the prize, paid by the deal). */
  over(end: GoEnd, left: number): GoVerdict;
  /** Another go: paid (null) or why not, in the barman's words. */
  again(): string | null;
  /** A dart thrown: its thud in the bar (the street's cue). */
  thrown?(): void;
  /** Walked off before a single dart of a paid go: its fee back. */
  refund?(): void;
}

/** One dart in the board: where (board units), when it landed (the panel's clock), what it scored. */
interface Dart {
  x: number;
  y: number;
  at: number;
  points: number;
  call: string;
}

/** The canvas (px): the board on the left, its scoring radius `R` round (`CX`, `CX`), the throw's gauge on the right. */
const W = 360;
const H = 320;
const CX = 160;
const R = 128;
const GAUGE = { x: 332, w: 14, top: 40, bottom: 280 } as const;
const DARTS = 3;
/** The hand's wander round the aim (board units): steady for `STEADY` s after a dart, then tiring by `TIRE` a second up to `SWAY_MAX`. */
const SWAY = 0.09;
const STEADY = 2.5;
const TIRE = 0.04;
const SWAY_MAX = 0.18;
/** The arm drawn back: the gauge fills in `RISE` s and empties again; let go at `SWEET` the dart flies true, else it lands `DROP` per unit off low or high. */
const RISE = 0.6;
const SWEET = 0.8;
const SWEET_BAND = 0.03;
const DROP = 1;
/** The throw's own scatter (board units, one standard deviation). */
const SCATTER = 0.03;
/** The board's paints: the singles' black and cream, the rings' red and green, the wire, the numbers, the darts. */
const PAINT = {
  black: '#1d1a17', cream: '#efe3c4', red: '#b3262e', green: '#2e7a3c', wire: '#c9c2b0', back: '#121010', number: '#f2ead6',
  barrel: '#c8ccd2', flight: '#d9a441', flightEdge: '#7a5512', tag: '#f2ead6', tagInk: '#1d1a17', shadow: 'rgba(0, 0, 0, 0.45)',
  aim: '#ffffff', gauge: '#3a332c', fill: '#d9a441', mark: '#7fd18b',
};
/** How far an arrow or D-pad press moves the aim, how fast the stick sweeps it (board units a second), how far out it may go. */
const STEP = 0.03;
const STICK_SPEED = 0.9;
const STICK_DEAD = 0.2;
const AIM_REACH = 1.15;
/** A dart flying in (s), and its shaft's shiver once it sticks (s). */
const FLY = 0.16;
const SHIVER = 0.6;
/** The barman's face on the pub's wall. */
const FACE = 60;
const FACE_WALL = '#3b2a20';
const ORDINALS = ['1st dart', '2nd dart', '3rd dart'];

/**
 * THE LOCAL's dartboard (docs/economy.md "Front Street's shops and finds"): the regulation board on the pub's wall, the
 * night's checkout chalked up beside it with a line per dart, and Sean behind the bar calling each one in a balloon. The
 * aim follows the pointer, the arrows, the D-pad or the stick; a press (the mouse button, Space, a finger, A) draws the
 * arm back and the gauge fills and empties; letting go throws: on the mark the dart flies true, early it drops, late it
 * climbs. The hand wanders round the aim all the while, and tires when the player dithers. Three darts a go to take the
 * checkout to nought exactly, the last in a double. A `ModalLike` the bar's door opens.
 */
export class DartsPanel extends CardPanel {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private go: DartsGo | null = null;
  private aim = { x: 0, y: 0.3 };
  private thrown: Dart[] = [];
  private left = 0;
  private end: GoEnd | null = null;
  private says = '';
  private aside = '';
  /** "Another go" refused (the night's goes are up, or the purse is empty): the button goes. */
  private noMore = false;
  /** When the arm was drawn back (the clock `t`), null while aiming. */
  private drawnAt: number | null = null;
  /** Since when the hand has been held up (the clock `t`): the go's start or the last dart. */
  private heldSince = 0;
  /** A controller's A held at the last frame: its press draws back, its release throws. */
  private padA = false;
  private frame = 0;
  private t = 0;
  private last = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'pub-darts', cardClass: 'ui-card dt__card', title: 'Darts at THE LOCAL', dismiss: 'Back to the bar', header: false });
    const [canvas, ctx] = createCanvas(W, H);
    this.canvas = canvas;
    this.ctx = ctx;
    canvas.className = 'dt__canvas';
    canvas.tabIndex = 0;
    canvas.dataset.autofocus = '';
    // Found again by `rememberFocus` after a repaint (a data key, not an action: a press here throws, it picks nothing).
    canvas.dataset.index = 'board';
    canvas.setAttribute('aria-label', 'The dartboard');
    this.listen(canvas, 'pointermove', (e) => {
      if (this.drawnAt === null) this.pointAt(e);
    });
    this.listen(canvas, 'pointerdown', (e) => {
      if (this.done || e.button !== 0) return;
      this.pointAt(e);
      canvas.setPointerCapture(e.pointerId);
      this.drawBack();
    });
    this.listen(canvas, 'pointerup', () => this.letGo());
    this.listen(canvas, 'pointercancel', () => {
      this.drawnAt = null;
    });
    this.listen(this.root, 'keyup', (e) => {
      if (e.code === 'Space') this.letGo();
    });
  }

  private get done(): boolean {
    return this.end !== null;
  }

  /** Deals a go (before the Session opens the panel). */
  show(go: DartsGo): void {
    this.go = go;
    this.noMore = false;
  }

  protected override onOpened(): void {
    this.start();
    super.onOpened();
    this.last = performance.now();
    this.padA = true; // the A that opened the panel is not a throw
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  protected override onClosed(): void {
    cancelAnimationFrame(this.frame);
    this.drawnAt = null;
    // Walked off mid-go: not a dart thrown, the fee back; some thrown, the go counts as it stands.
    const go = this.go;
    if (!go || this.done) return;
    this.end = 'short';
    if (!this.thrown.length) go.refund?.();
    else go.over('short', this.left);
  }

  protected render(): Html {
    const go = this.go;
    if (!go) return html``;
    const { name, role } = BAR_STAFF.barman;
    return html`<div class="dt${this.end ? ` dt--${this.end}` : ''}">
      <div class="dt__host">
        <div class="dt__face"></div>
        <div class="dt__balloon"><span class="dt__name">${name}, ${role}</span><p class="dt__says">${this.says}</p></div>
      </div>
      <div class="dt__wall">
        <div class="dt__board"></div>
        ${this.chalkHtml(go)}
      </div>
      <p class="dt__how"><span class="dt__how-keys">Aim with the mouse or the arrows, hold the button or <kbd>Space</kbd> to draw back, let go on the green mark</span><span class="dt__how-touch">Hold a finger on the board, let go on the green mark</span></p>
      <p class="dt__aside">${this.aside}</p>
    </div>`;
  }

  /** The chalkboard beside the board: tonight's checkout, a line per dart, what is left (or how the go ended). */
  private chalkHtml(go: DartsGo): Html {
    const stamp = this.end === 'out' ? 'Game shot' : this.end === 'bust' ? 'Bust' : null;
    return html`<div class="dt__chalk">
      <p class="dt__chalk-head">Tonight’s checkout</p>
      <p class="dt__checkout">${go.checkout}</p>
      <ol class="dt__throws">${ORDINALS.map((label, i) => {
        const dart = this.thrown[i];
        return html`<li class="dt__throw${dart ? ' is-thrown' : ''}${i === this.thrown.length - 1 ? ' is-last' : ''}">
          <span class="dt__dart-no">${label}</span><span class="dt__call">${dart?.call ?? ''}</span><span class="dt__points">${dart ? dart.points : ''}</span>
        </li>`;
      })}</ol>
      ${stamp ? html`<p class="dt__left"><span class="dt__stamp">${stamp}</span></p>` : html`<p class="dt__left"><span>Left</span><span class="dt__left-n">${this.left}</span></p>`}
    </div>`;
  }

  protected override repaint(): void {
    super.repaint();
    this.body.querySelector('.dt__board')?.append(this.canvas);
    this.body.querySelector('.dt__face')?.append(barFace('barman', FACE, FACE_WALL, this.expression()));
  }

  private expression(): Expression {
    if (this.end === 'out') return 'surprise';
    if (this.end === 'bust') return 'frown';
    const last = this.thrown[this.thrown.length - 1];
    return last && last.points >= 40 ? 'smile' : 'rest';
  }

  protected override actions(): PanelAction[] {
    if (!this.done || this.noMore || !this.go) return [];
    return [{ action: 'again', label: `Another go · ${formatCoins(this.go.fee)}`, primary: true, autofocus: true }];
  }

  protected override onAction(action: string): void {
    if (action !== 'again' || !this.go) return;
    const refused = this.go.again();
    if (refused) {
      this.noMore = true;
      this.says = refused;
      this.aside = '';
      this.refresh();
      this.root.querySelector<HTMLElement>('[data-action="close"]')?.focus();
      return;
    }
    this.start();
    this.refresh();
    this.canvas.focus();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (e.code !== 'Space' || this.done) return;
    e.preventDefault();
    if (!e.repeat) this.drawBack();
  }

  /** The arrows and the D-pad aim while a go is on (the focus walks only once it is over). */
  protected override onMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (this.done) return false;
    if (this.drawnAt === null) {
      const [dx, dy] = direction === 'left' ? [-STEP, 0] : direction === 'right' ? [STEP, 0] : direction === 'up' ? [0, STEP] : [0, -STEP];
      this.aim = { x: onBoard(this.aim.x + dx), y: onBoard(this.aim.y + dy) };
    }
    return true;
  }

  private start(): void {
    const checkout = this.go?.checkout ?? 0;
    this.thrown = [];
    this.left = checkout;
    this.end = null;
    this.drawnAt = null;
    this.heldSince = this.t;
    this.says = `${checkout} on the board tonight, finishing on a double. ${wayOut(checkout, DARTS)}`;
    this.aside = 'The regulars at the bar turn round to watch.';
    this.setStatus('');
  }

  private pointAt(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    this.aim = { x: onBoard((px - CX) / R), y: onBoard(-(py - CX) / R) };
  }

  private drawBack(): void {
    if (this.done || this.drawnAt !== null) return;
    this.drawnAt = this.t;
  }

  private letGo(): void {
    if (this.drawnAt === null) return;
    const power = this.power();
    this.drawnAt = null;
    this.throwDart(power);
  }

  /** How far back the arm is (0..1): it fills in `RISE`, empties again, and so on while held. */
  private power(): number {
    if (this.drawnAt === null) return 0;
    const phase = ((this.t - this.drawnAt) / RISE) % 2;
    return phase < 1 ? phase : 2 - phase;
  }

  /** Where the hand points now: the aim, and its wander round it (wider once the arm tires). */
  private hand(): { x: number; y: number } {
    const t = this.t;
    const sway = Math.min(SWAY_MAX, SWAY + Math.max(0, t - this.heldSince - STEADY) * TIRE);
    return {
      x: this.aim.x + (sway * (Math.sin(t * 3.1) + 0.6 * Math.sin(t * 5.3 + 1) + 0.35 * Math.sin(t * 8.9 + 2))) / 1.95,
      y: this.aim.y + (sway * (Math.cos(t * 2.7) + 0.6 * Math.cos(t * 4.9 + 2) + 0.35 * Math.cos(t * 9.7 + 1))) / 1.95,
    };
  }

  private throwDart(power: number): void {
    const go = this.go;
    if (!go || this.done) return;
    const at = this.hand();
    const x = at.x + spread() * SCATTER;
    const y = at.y + (power - SWEET) * DROP + spread() * SCATTER;
    const hit = dartScore(x, y);
    go.thrown?.();
    this.thrown.push({ x, y, at: this.t, points: hit.points, call: hit.call });
    this.heldSince = this.t;
    const after = afterDart(this.left, hit);
    if (after.state === 'out') this.finish('out', 0);
    // Bust: the go's darts count for nothing, the checkout stands.
    else if (after.state === 'bust') this.finish('bust', go.checkout);
    else if (this.thrown.length >= DARTS) this.finish('short', after.left);
    else {
      this.left = after.left;
      this.says = `${hit.call}! ${this.left} left. ${wayOut(this.left, DARTS - this.thrown.length)}`;
      this.aside = hit.points === 0 ? 'A regular winces.' : hit.points >= 40 ? 'Somebody at the bar whistles.' : '';
    }
    this.refresh();
    // The go over: the focus goes to "Another go" (or the way out), the board takes no more darts.
    if (this.done) (this.root.querySelector<HTMLElement>('[data-action="again"]') ?? this.root.querySelector<HTMLElement>('[data-action="close"]'))?.focus();
  }

  private finish(end: GoEnd, left: number): void {
    this.end = end;
    this.left = left;
    const verdict = this.go?.over(end, left);
    this.says = verdict?.says ?? '';
    this.aside = verdict?.aside ?? '';
  }

  private tick(now: number): void {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.t += dt;
    this.last = now;
    this.readPad(dt);
    this.draw();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** A controller: the left stick sweeps the aim, A held draws the arm back and its release throws. */
  private readPad(dt: number): void {
    const pad = firstPad();
    if (!pad) return;
    const a = pad.buttons[0]?.pressed ?? false;
    if (!this.done) {
      const sx = pad.axes[0] ?? 0;
      const sy = pad.axes[1] ?? 0;
      if (this.drawnAt === null && Math.hypot(sx, sy) > STICK_DEAD) this.aim = { x: onBoard(this.aim.x + sx * STICK_SPEED * dt), y: onBoard(this.aim.y - sy * STICK_SPEED * dt) };
      if (a && !this.padA && document.activeElement === this.canvas) this.drawBack();
    }
    if (!a && this.padA) this.letGo();
    this.padA = a;
  }

  private draw(): void {
    const { ctx } = this;
    const c = CX;
    ctx.clearRect(0, 0, W, H);
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
    this.thrown.forEach((dart, i) => this.drawDart(dart, i + 1));
    this.drawGauge();
    if (this.done) return;
    const at = this.hand();
    const hx = c + at.x * R;
    const hy = c - at.y * R;
    ctx.strokeStyle = PAINT.aim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.moveTo(hx - 11, hy);
    ctx.lineTo(hx + 11, hy);
    ctx.moveTo(hx, hy - 11);
    ctx.lineTo(hx, hy + 11);
    ctx.stroke();
  }

  /** A dart in the board: its point at the hit, barrel and flight standing out towards the thrower's right, its number on a tag. */
  private drawDart(dart: Dart, n: number): void {
    const { ctx } = this;
    const age = this.t - dart.at;
    const still = reduceMotion();
    // Flying in: bigger and fainter until it sticks; then the shaft shivers and settles.
    const fly = still ? 1 : Math.min(1, age / FLY);
    const scale = 1 + (1 - fly) * 1.8;
    const shiver = still || age > SHIVER ? 0 : Math.sin(age * 55) * Math.exp(-age * 7) * 0.22;
    const x = CX + dart.x * R;
    const y = CX - dart.y * R;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * fly;
    ctx.translate(x, y);
    ctx.rotate(-0.75 + shiver);
    ctx.scale(scale, scale);
    // Its shadow on the board, then the barrel, then the flight.
    ctx.strokeStyle = PAINT.shadow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1, 2);
    ctx.lineTo(19, 6);
    ctx.stroke();
    ctx.strokeStyle = PAINT.barrel;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.fillStyle = PAINT.flight;
    ctx.strokeStyle = PAINT.flightEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(24, -6);
    ctx.lineTo(25, 0);
    ctx.lineTo(24, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (fly < 1) return;
    // Its number on a little chalk tag beside the flight.
    const tx = x + 22;
    const ty = y - 16;
    ctx.fillStyle = PAINT.tag;
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAINT.tagInk;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), tx, ty + 0.5);
  }

  /** The arm's gauge beside the board: how far back it is, and the green mark to let go on. */
  private drawGauge(): void {
    const { ctx } = this;
    const { x, w, top, bottom } = GAUGE;
    const span = bottom - top;
    const level = (p: number): number => bottom - p * span;
    ctx.fillStyle = PAINT.gauge;
    ctx.fillRect(x, top, w, span);
    ctx.fillStyle = PAINT.mark;
    ctx.fillRect(x - 3, level(SWEET + SWEET_BAND), w + 6, SWEET_BAND * 2 * span);
    const p = this.power();
    if (p > 0) {
      ctx.fillStyle = PAINT.fill;
      ctx.fillRect(x + 2, level(p), w - 4, p * span);
    }
  }
}

/** The usual way out of `left` in `darts` darts, as the barman says it. */
function wayOut(left: number, darts: number): string {
  const route = checkoutRoute(left, darts);
  if (!route) return `No way out of that in ${darts === 1 ? 'one' : darts === 2 ? 'two' : 'three'}, mind.`;
  const spoken = route.map((d) => (d === 'Bull' ? 'the bull' : d.startsWith('T') ? `treble ${d.slice(1)}` : d.startsWith('D') ? `double ${d.slice(1)}` : d));
  return `${capitalise(spoken.join(', '))} does it.`;
}

/** A draw of about one standard deviation round 0 (three uniforms summed). */
function spread(): number {
  return (random() + random() + random() - 1.5) * 2;
}

/** The aim stays over the board and its surround (board units). */
function onBoard(v: number): number {
  return clamp(v, -AIM_REACH, AIM_REACH);
}

/** The first connected controller, if the page may read one. */
function firstPad(): Gamepad | null {
  try {
    for (const pad of navigator.getGamepads?.() ?? []) if (pad?.connected) return pad;
  } catch {
    // a permissions policy or an insecure page: no controller
  }
  return null;
}
