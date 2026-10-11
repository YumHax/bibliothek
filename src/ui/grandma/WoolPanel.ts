import { random } from '@/random';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import './pastimes.css';

/** How long she knits while the player holds the wool (s), how often she says something (s). */
const SESSION_SECONDS = 32;
const TALK_EVERY = 5.5;
/** How fast the yarn tightens as she pulls (a second's worth, between the two), and what a give of slack takes back. */
const PULL: readonly [number, number] = [0.16, 0.34];
const SLACK = 0.45;
/** Tension past this looks taut; at 1 the yarn snaps. */
const TAUT = 0.72;

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
 * HOLDING THE WOOL for Mémé while she knits (docs/grandma.md "Things to do with her"): the skein over the player's
 * hands, the yarn running to her needles, tightening as she pulls; a give of slack (the button, Space or Enter) keeps
 * it running. Pulled too tight it snaps, she laughs and ties a knot. She talks the while, and the knitting grows.
 */
export class WoolPanel extends CardPanel {
  private deal: WoolDeal | null = null;
  private tension = 0.2;
  private time = 0;
  private talked = 0;
  private herLine = '';
  private done = false;
  private frame = 0;
  private last = 0;
  private pull = PULL[0];

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
    this.herLine = deal.start;
  }

  /** Whether the session ran to its end (read when the panel closes). */
  get finished(): boolean {
    return this.done;
  }

  protected render(): Html {
    return html`<svg class="meme-wool__view" viewBox="0 0 320 120" aria-hidden="true">
        <ellipse class="meme-wool__hand" cx="34" cy="62" rx="16" ry="24"></ellipse>
        <ellipse class="meme-wool__hand" cx="110" cy="62" rx="16" ry="24"></ellipse>
        <ellipse class="meme-wool__skein" cx="72" cy="62" rx="44" ry="10"></ellipse>
        <path class="meme-wool__yarn" d="M 110 60 Q 200 90 296 40"></path>
        <line class="meme-wool__needle" x1="280" y1="22" x2="312" y2="58"></line>
        <line class="meme-wool__needle" x1="312" y1="22" x2="280" y2="58"></line>
      </svg>
      <div class="meme-wool__knitting" aria-hidden="true"><span class="meme-wool__rows"></span></div>
      <p class="meme-pastime__her">${this.herLine}</p>`;
  }

  protected override actions(): PanelAction[] {
    return this.done ? [] : [{ action: 'slack', label: 'Give her some slack', primary: true, autofocus: true }];
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
    this.tension = Math.max(0, this.tension - SLACK);
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
    if (this.tension >= 1 && this.deal) {
      this.tension = 0.2;
      this.say(this.deal.snap);
    }
    if (this.deal && this.time >= (this.talked + 1) * TALK_EVERY && this.deal.talk.length) {
      this.say(this.deal.talk[this.talked % this.deal.talk.length]!);
      this.talked++;
    }
    if (this.time >= SESSION_SECONDS && this.deal) {
      this.done = true;
      this.herLine = this.deal.finished();
      this.refresh();
      this.draw();
      return;
    }
    this.draw();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private say(line: string): void {
    this.herLine = line;
    const her = this.body.querySelector('.meme-pastime__her');
    if (her) her.textContent = line;
  }

  /** The yarn's sag by its tension, taut past `TAUT`; the knitting's length by the time. */
  private draw(): void {
    const yarn = this.body.querySelector<SVGPathElement>('.meme-wool__yarn');
    if (yarn) {
      const sag = 62 + (1 - Math.min(1, this.tension)) * 40;
      yarn.setAttribute('d', `M 110 60 Q 200 ${sag.toFixed(1)} 296 40`);
      yarn.classList.toggle('meme-wool__yarn--taut', this.tension > TAUT);
    }
    const rows = this.body.querySelector<HTMLElement>('.meme-wool__rows');
    if (rows) rows.style.width = `${Math.min(100, (this.time / SESSION_SECONDS) * 100).toFixed(1)}%`;
  }
}
