import { random } from '@/random';
import { reduceMotion } from '@/settings/motion';
import { playYarnSlack, playYarnSnap } from '@/audio/pastimeSounds';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { memeSay, memeSaysHtml, paintMemeFace, shake } from './memeSays';
import './pastimes.css';

/** How long she knits while the player holds the wool (s), how often she says something (s). */
const SESSION_SECONDS = 32;
const TALK_EVERY = 5.5;
/** How fast the yarn tightens as she pulls (a second's worth, between the two), and what a give of slack takes back. */
const PULL: readonly [number, number] = [0.16, 0.34];
const SLACK = 0.45;
/** Tension past this looks taut; at 1 the yarn snaps. */
const TAUT = 0.72;
/** The rows of her knitting by the session's end: one more every `SESSION_SECONDS / ROWS`. */
const ROWS = 14;
/** The knitted piece: its left edge, width and top under the needles, a row's height (scene units). */
const PIECE = { x: 252, w: 56, top: 104, row: 5.4 } as const;
/** Stitches across a row. */
const STITCHES = 8;
/** Where the yarn leaves the skein and where it reaches her needles. */
const FROM = { x: 136, y: 104 } as const;
const TO = { x: 262, y: 92 } as const;

/** What the panel is dealt (`world/grandma/visit/pastimes`). */
interface WoolDeal {
  /** Her words as the player holds up their hands. */
  start: string;
  /** What she says while she knits, a line at a time. */
  talk: readonly string[];
  /** The yarn snapped: her words. */
  snap: string;
  /** The session to its end: her words (the session is counted by then). */
  finished(): string;
}

/**
 * HOLDING THE WOOL for Mémé while she knits (docs/grandma.md "Things to do with her"): her parlour, the skein looped over
 * the player's two hands, the yarn running across to her needles, her hands working them and the piece hanging under
 * them, a row longer every few seconds. The yarn tightens as she pulls (it straightens, darkens and trembles; the
 * player's hands lean towards her); a give of slack (the button, Space or Enter) dips the hands and lets it run.
 * Pulled too tight it snaps with a twang, she laughs and ties a knot that stays on the yarn. Her face and her words are
 * at the top. At the end the finished piece lies on her lap.
 */
export class WoolPanel extends CardPanel {
  private deal: WoolDeal | null = null;
  private tension = 0.2;
  private time = 0;
  private talked = 0;
  private herLine = '';
  private face: Expression = 'smile';
  private done = false;
  private knots = 0;
  private frame = 0;
  private last = 0;
  private pull = PULL[0];
  /** When the last slack was given and the last snap came (s into the session): the hands' dip, the loose ends' whip. */
  private slackAt = -10;
  private snapAt = -10;

  constructor(container: HTMLElement) {
    super(container, { className: 'meme-pastime meme-wool', title: 'Holding the wool', dismiss: 'Back to her' });
  }

  /** Deals a session (before the Session opens the panel). */
  show(deal: WoolDeal): void {
    this.deal = deal;
    this.tension = 0.2;
    this.time = 0;
    this.talked = 0;
    this.done = false;
    this.knots = 0;
    this.slackAt = this.snapAt = -10;
    this.herLine = deal.start;
    this.face = 'smile';
  }

  /** Whether the session ran to its end (read when the panel closes). */
  get finished(): boolean {
    return this.done;
  }

  protected render(): Html {
    return html`${memeSaysHtml(this.herLine)}
      <svg class="meme-wool__view${this.done ? ' meme-wool__view--done' : ''}" viewBox="0 0 360 200" role="img" aria-label="${this.done ? 'Her knitting, finished, on her lap' : 'The skein over your hands, the yarn running to her needles'}">
        <defs>
          <pattern id="meme-wool-paper" width="18" height="18" patternUnits="userSpaceOnUse">
            <rect width="18" height="18" class="meme-wool__paper"></rect>
            <rect x="8" width="2" height="18" class="meme-wool__paper-stripe"></rect>
            <circle cx="0" cy="9" r="1.6" class="meme-wool__paper-flower"></circle>
            <circle cx="18" cy="9" r="1.6" class="meme-wool__paper-flower"></circle>
          </pattern>
        </defs>
        <rect width="360" height="200" fill="url(#meme-wool-paper)"></rect>
        <path class="meme-wool__chair" d="M 222 200 L 222 70 Q 222 30 262 28 L 330 28 Q 360 30 360 70 L 360 200 Z"></path>
        <path class="meme-wool__lap" d="M 200 200 Q 214 160 260 156 L 360 152 L 360 200 Z"></path>
        <rect class="meme-wool__table" x="0" y="176" width="190" height="24"></rect>
        ${this.done ? finishedPiece() : html`
        <g class="meme-wool__hands">
          ${playerHand(40, false)}${playerHand(130, true)}
          <g class="meme-wool__skein">
            <path d="M 46 94 Q 88 82 128 94 Q 88 108 46 94"></path>
            <path d="M 46 98 Q 88 86 128 98 Q 88 113 46 98"></path>
            <path d="M 46 102 Q 88 91 128 102 Q 88 118 46 102"></path>
            <path d="M 46 106 Q 88 96 128 106 Q 88 122 46 106"></path>
          </g>
        </g>
        <path class="meme-wool__yarn" d="${yarnPath(0.2, 0)}"></path>
        <g class="meme-wool__knots"></g>
        <g class="meme-wool__ends" opacity="0">
          <path class="meme-wool__end" d="M ${FROM.x} ${FROM.y} q 18 26 6 46"></path>
          <path class="meme-wool__end" d="M ${TO.x} ${TO.y} q -16 30 -4 50"></path>
        </g>
        <g class="meme-wool__piece">${[...Array(ROWS).keys()].map((r) => knitRow(r))}</g>
        <g class="meme-wool__needles">
          <line class="meme-wool__needle" x1="236" y1="74" x2="300" y2="104"></line>
          <line class="meme-wool__needle" x1="324" y1="74" x2="258" y2="104"></line>
          <circle class="meme-wool__needle-knob" cx="236" cy="74" r="3.5"></circle>
          <circle class="meme-wool__needle-knob" cx="324" cy="74" r="3.5"></circle>
        </g>
        <g class="meme-wool__her-hands">
          <path class="meme-wool__cuff" d="M 222 98 l 18 -12 l 10 14 l -18 12 Z"></path>
          <ellipse class="meme-wool__her-hand" cx="246" cy="86" rx="11" ry="8" transform="rotate(-30 246 86)"></ellipse>
          <path class="meme-wool__cuff" d="M 346 98 l -18 -12 l -10 14 l 18 12 Z"></path>
          <ellipse class="meme-wool__her-hand" cx="314" cy="86" rx="11" ry="8" transform="rotate(30 314 86)"></ellipse>
        </g>`}
      </svg>`;
  }

  protected override repaint(): void {
    super.repaint();
    paintMemeFace(this.body, this.face);
    this.draw();
  }

  protected override actions(): PanelAction[] {
    return this.done ? [] : [{ action: 'slack', label: 'Give her some slack', primary: true, autofocus: true, className: 'meme-wool__slack' }];
  }

  protected override onAction(action: string): void {
    if (action === 'slack') this.slack();
  }

  protected override onKey(e: KeyboardEvent): void {
    if (e.code !== 'Space' || this.done) return;
    e.preventDefault();
    this.slack();
  }

  protected override onEnter(): boolean {
    if (this.done) return false;
    this.slack();
    return true;
  }

  protected override onOpened(): void {
    super.onOpened();
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  protected override onClosed(): void {
    cancelAnimationFrame(this.frame);
  }

  private slack(): void {
    if (this.done) return;
    const was = this.tension;
    this.tension = Math.max(0, this.tension - SLACK);
    this.slackAt = this.time;
    if (was > 0.05) playYarnSlack();
    const button = this.root.querySelector<HTMLElement>('.meme-wool__slack');
    if (button && !reduceMotion() && typeof button.animate === 'function') button.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    this.draw();
  }

  private tick(now: number): void {
    if (!this.isOpen || this.done) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    // She pulls in spurts: a new pace now and then.
    if (random() < dt * 0.6) this.pull = PULL[0] + random() * (PULL[1] - PULL[0]);
    this.tension += this.pull * dt;
    if (this.tension >= 1 && this.deal) this.snap(this.deal.snap);
    if (this.deal && this.time >= (this.talked + 1) * TALK_EVERY && this.deal.talk.length) {
      this.say(this.deal.talk[this.talked % this.deal.talk.length]!, 'rest');
      this.talked++;
    }
    if (this.time >= SESSION_SECONDS && this.deal) {
      this.done = true;
      this.herLine = this.deal.finished();
      this.face = 'smile';
      this.refresh();
      return;
    }
    this.draw();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** The yarn gone: the twang, the loose ends whipping, the card's jolt, her laugh; a knot stays on the yarn. */
  private snap(line: string): void {
    this.tension = 0.2;
    this.snapAt = this.time;
    this.knots = Math.min(4, this.knots + 1);
    playYarnSnap();
    shake(this.card, 5);
    this.say(line, 'surprise');
    window.setTimeout(() => {
      if (this.isOpen && !this.done && this.face === 'surprise') this.say(this.herLine, 'smile');
    }, 900);
  }

  private say(line: string, face: Expression): void {
    this.herLine = line;
    this.face = face;
    memeSay(this.body, line, face);
  }

  /**
   * The scene by the moment: the yarn's sag by its tension (straight, darker and trembling past `TAUT`), the player's
   * hands leaning in with it and dipping on a slack, her needles rocking as she works, the rows knitted so far, the
   * knots tied, the loose ends of a snap whipping for a moment.
   */
  private draw(): void {
    if (this.done) return;
    const svg = this.body.querySelector('.meme-wool__view');
    if (!svg) return;
    const still = reduceMotion();
    const taut = this.tension > TAUT;
    const tremble = taut && !still ? (random() - 0.5) * 2.2 * (this.tension - TAUT) * 4 : 0;
    const sinceSnap = this.time - this.snapAt;
    const snapped = sinceSnap < 0.7;
    const yarn = svg.querySelector<SVGPathElement>('.meme-wool__yarn');
    if (yarn) {
      yarn.setAttribute('d', yarnPath(this.tension, tremble));
      yarn.classList.toggle('meme-wool__yarn--taut', taut);
      yarn.style.opacity = snapped ? '0' : '1';
    }
    const ends = svg.querySelector<SVGGElement>('.meme-wool__ends');
    if (ends) {
      ends.setAttribute('opacity', snapped ? String(1 - sinceSnap / 0.7) : '0');
      ends.setAttribute('transform', snapped && !still ? `translate(0 ${(sinceSnap * 18).toFixed(1)})` : '');
    }
    // The hands: leaning towards her with the tension, a dip forward on a slack, settling back.
    const sinceSlack = this.time - this.slackAt;
    const dip = sinceSlack < 0.35 && !still ? Math.sin((sinceSlack / 0.35) * Math.PI) * 6 : 0;
    const lean = Math.min(1, this.tension) * 5;
    svg.querySelector('.meme-wool__hands')?.setAttribute('transform', `translate(${(lean + dip).toFixed(2)} ${(dip * 0.6).toFixed(2)})`);
    // Her needles: rocking as she works a stitch, faster when she pulls harder.
    const rock = still ? 0 : Math.sin(this.time * (6 + this.pull * 14)) * 3;
    svg.querySelector('.meme-wool__needles')?.setAttribute('transform', `rotate(${rock.toFixed(2)} 280 92)`);
    svg.querySelector('.meme-wool__her-hands')?.setAttribute('transform', `translate(0 ${(rock * 0.4).toFixed(2)})`);
    // The piece: a row more every so often; the newest row fades in.
    const knitted = (this.time / SESSION_SECONDS) * ROWS;
    svg.querySelectorAll<SVGGElement>('.meme-wool__row').forEach((row, i) => row.setAttribute('opacity', String(Math.max(0, Math.min(1, knitted - i)))));
    const knots = svg.querySelector('.meme-wool__knots');
    if (knots && knots.childElementCount !== this.knots) {
      knots.replaceChildren(
        ...[...Array(this.knots).keys()].map((k) => {
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          const at = 0.3 + k * 0.14;
          dot.setAttribute('cx', (FROM.x + (TO.x - FROM.x) * at).toFixed(1));
          dot.setAttribute('cy', (FROM.y + (TO.y - FROM.y) * at + 6).toFixed(1));
          dot.setAttribute('r', '2.6');
          dot.setAttribute('class', 'meme-wool__knot');
          return dot;
        }),
      );
    }
    // The knots ride on the yarn: lifted with it as it straightens.
    knots?.setAttribute('transform', `translate(0 ${(-Math.min(1, this.tension) * 10 + 8).toFixed(1)})`);
  }
}

/** The yarn from the skein to her needles: a sag of up to 36 units when slack, straight when taut; `tremble` shakes it. */
function yarnPath(tension: number, tremble: number): string {
  const sag = (1 - Math.min(1, tension)) * 36;
  const mid = (FROM.x + TO.x) / 2;
  return `M ${FROM.x} ${FROM.y} Q ${mid} ${((FROM.y + TO.y) / 2 + sag * 1.6 + tremble).toFixed(1)} ${TO.x} ${TO.y}`;
}

/** One of the player's hands held up, palm in, fingers up, a jumper's cuff at the wrist; `mirror` for the right one. */
function playerHand(x: number, mirror: boolean): Html {
  const flip = mirror ? `translate(${2 * x} 0) scale(-1 1)` : '';
  return html`<g class="meme-wool__hand" transform="${flip}">
    <rect class="meme-wool__sleeve" x="${x - 13}" y="132" width="26" height="46" rx="6"></rect>
    <rect class="meme-wool__cuff-rib" x="${x - 14}" y="128" width="28" height="9" rx="3"></rect>
    <rect class="meme-wool__palm" x="${x - 11}" y="96" width="22" height="36" rx="9"></rect>
    <rect class="meme-wool__finger" x="${x - 10}" y="76" width="5.5" height="26" rx="2.75"></rect>
    <rect class="meme-wool__finger" x="${x - 4}" y="72" width="5.5" height="28" rx="2.75"></rect>
    <rect class="meme-wool__finger" x="${x + 2}" y="74" width="5.5" height="27" rx="2.75"></rect>
    <rect class="meme-wool__finger" x="${x + 7}" y="80" width="5" height="22" rx="2.5"></rect>
    <rect class="meme-wool__finger" x="${x + 6}" y="104" width="6" height="18" rx="3" transform="rotate(-38 ${x + 9} 113)"></rect>
  </g>`;
}

/** Row `r` of her knitting under the needles: a line of little V stitches, the rows alternating a shade. */
function knitRow(r: number): Html {
  const y = PIECE.top + r * PIECE.row;
  const step = PIECE.w / STITCHES;
  const vs = [...Array(STITCHES).keys()].map((s) => {
    const x = PIECE.x + s * step;
    return `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + step / 2).toFixed(1)} ${(y + PIECE.row).toFixed(1)} L ${(x + step).toFixed(1)} ${y.toFixed(1)}`;
  });
  return html`<g class="meme-wool__row${r % 2 ? ' meme-wool__row--b' : ''}" opacity="0">
    <rect x="${PIECE.x}" y="${y.toFixed(1)}" width="${PIECE.w}" height="${(PIECE.row + 0.4).toFixed(1)}"></rect>
    <path d="${vs.join(' ')}"></path>
  </g>`;
}

/** The end: the piece done, a scarf laid across her lap with its fringe, the needles put down beside it. */
function finishedPiece(): Html {
  const rows = [...Array(22).keys()];
  return html`<g class="meme-wool__done"><g class="meme-wool__scarf" transform="rotate(-8 270 150)">
    ${rows.map((r) => html`<rect class="meme-wool__scarf-row${r % 2 ? ' meme-wool__scarf-row--b' : ''}" x="${150 + r * 8}" y="128" width="8.4" height="34"></rect>`)}
    <rect class="meme-wool__scarf-band" x="${150 + 3 * 8}" y="128" width="8" height="34"></rect>
    <rect class="meme-wool__scarf-band" x="${150 + 18 * 8}" y="128" width="8" height="34"></rect>
    ${[...Array(6).keys()].map((f) => html`<line class="meme-wool__fringe" x1="150" y1="${131 + f * 5.5}" x2="140" y2="${132 + f * 5.5}"></line><line class="meme-wool__fringe" x1="326" y1="${131 + f * 5.5}" x2="336" y2="${130 + f * 5.5}"></line>`)}
  </g>
  <g class="meme-wool__needles meme-wool__needles--down">
    <line class="meme-wool__needle" x1="60" y1="172" x2="150" y2="184"></line>
    <line class="meme-wool__needle" x1="64" y1="180" x2="154" y2="178"></line>
  </g>
  <g class="meme-wool__ball"><circle cx="120" cy="160" r="15"></circle><path d="M 108 152 Q 120 160 132 150 M 106 162 Q 120 170 134 160 M 112 172 Q 122 160 130 172"></path></g></g>`;
}
