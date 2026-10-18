import { ModalPanel } from './ModalPanel';
import { html, paint, raw } from './panel/html';
import { renderKeys } from './keys';
import './ArcadeScreenPanel.css';

/** What a cabinet whose game runs in a web page needs: open it, hear its score, know when it is shut. */
interface RemoteScreenLike {
  /**
   * Shows `url` in the big frame. `onScore` hears every score the page reports (`final` when its
   * game is over); `onClose` is called once when the frame shuts, by the page's end, the Done
   * button or Esc.
   */
  open(options: { title: string; url: string; origins: readonly string[]; freePlay?: boolean; onScore: (score: number, final: boolean) => void; onClose: () => void }): void;
  close(): void;
  readonly isOpen: boolean;
}

type RemoteGame = Parameters<RemoteScreenLike['open']>[0];

/** How long the frame stays up once the page has said its game is over, so the final score can be seen. */
const CLOSE_AFTER_FINAL_MS = 1800;
/** How long the machine is given to boot (the page to load) before the screen says it will not start. */
const BOOT_TIMEOUT_MS = 12_000;
/** The score's digits on the marquee's LED strip. */
const SCORE_DIGITS = 6;

/**
 * The big screen for an arcade cabinet whose game is a web page (LexiPunk): a full-window modal, the page in an
 * iframe inside the cabinet's bezel, the marquee over it with the game's name lit and the score in LED digits, a
 * DONE button like the cabinet's own. While the page loads the glass shows the machine booting; one that never
 * answers says so, and stepping back gives the coin back (the cabinet refunds a game that reported nothing). The page
 * reports its score with `window.parent.postMessage({ type: 'lexipunk:score', score, final }, '*')` (or
 * `{ type: 'lexipunk:over', score }` at the end); messages from any origin not in the cabinet's list are ignored. A
 * modal like the prize counter: the Session releases the mouse while it is up and re-enters the room when it shuts.
 * The iframe is emptied on close so the page's sound stops with it.
 */
export class ArcadeScreenPanel extends ModalPanel<[RemoteGame]> implements RemoteScreenLike {
  private readonly frame: HTMLIFrameElement;
  private readonly titleEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly bootEl: HTMLElement;
  private readonly footEl: HTMLElement;
  private session: RemoteGame | null = null;
  private closeTimer = 0;
  private bootTimer = 0;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre ui-panel arcade-screen' });
    paint(
      this.root,
      html`<div class="arcade-screen__bezel" role="dialog" aria-modal="true" aria-label="Arcade game">
        <header class="arcade-screen__marquee">
          <h2 class="arcade-screen__title"></h2>
          <p class="arcade-screen__score" aria-label="Score"><span class="arcade-screen__score-label">SCORE</span><span class="arcade-screen__digits"></span></p>
          <button type="button" class="arcade-screen__done" data-action="close">DONE</button>
        </header>
        <div class="arcade-screen__glass">
          <iframe class="arcade-screen__frame" title="Arcade game" allow="autoplay; fullscreen" referrerpolicy="origin"></iframe>
          <div class="arcade-screen__boot" role="status" aria-live="polite"></div>
        </div>
        <p class="arcade-screen__foot"></p>
        <span class="arcade-screen__status" role="status"></span>
      </div>`,
    );
    this.frame = this.root.querySelector('iframe')!;
    this.titleEl = this.root.querySelector('.arcade-screen__title')!;
    this.scoreEl = this.root.querySelector('.arcade-screen__digits')!;
    this.bootEl = this.root.querySelector('.arcade-screen__boot')!;
    this.footEl = this.root.querySelector('.arcade-screen__foot')!;
    this.statusEl = this.root.querySelector('.arcade-screen__status')!;
    this.listen(window, 'message', (e) => this.onMessage(e));
  }

  /** A cabinet opening it while it is up (a second coin) starts afresh. */
  override open(options: RemoteGame): void {
    if (this.isOpen) this.close();
    super.open(options);
  }

  protected override onOpened(options: RemoteGame): void {
    this.session = options;
    this.titleEl.textContent = options.title;
    this.showScore(null);
    paint(this.footEl, html`${raw(renderKeys(`${options.freePlay ? 'Free play, on the house' : 'Your score pays out in tickets'} · DONE or {Escape} steps back (click outside the game first)`))}`);
    this.setStatus('');
    this.boot('booting');
    this.frame.src = options.url;
    this.frame.onload = () => {
      if (this.session !== options) return;
      window.clearTimeout(this.bootTimer);
      this.boot(null);
    };
    window.clearTimeout(this.bootTimer);
    this.bootTimer = window.setTimeout(() => {
      if (this.session === options) this.boot('dead');
    }, BOOT_TIMEOUT_MS);
    // The page gets the keyboard straight away.
    window.setTimeout(() => this.frame.focus(), 50);
  }

  protected override onClosed(): void {
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.bootTimer);
    this.root.classList.remove('arcade-screen--over');
    this.frame.src = 'about:blank';
    const session = this.session;
    this.session = null;
    session?.onClose();
  }

  /** While the game page has the focus its keys and pad are its own (B must not close it); click outside to reach Done. */
  protected override navigable(): boolean {
    return this.isOpen && document.activeElement !== this.frame;
  }

  /** ModalLike: the Session only ever closes it (a cabinet opens it). */
  override toggle(): void {
    if (this.isOpen) this.close();
  }

  /** The glass while the page is not playing: booting (the machine's self-test), dead (it never answered), or clear. */
  private boot(state: 'booting' | 'dead' | null): void {
    this.bootEl.hidden = state === null;
    this.bootEl.dataset.state = state ?? '';
    if (state === 'booting') {
      paint(this.bootEl, html`<p class="arcade-screen__boot-line">SELF TEST</p><p class="arcade-screen__boot-line arcade-screen__boot-line--blink">LOADING…</p>`);
    } else if (state === 'dead') {
      const coin = this.session?.freePlay ? 'It was on the house: nothing lost.' : 'Your coin comes back when you step away.';
      paint(
        this.bootEl,
        html`<p class="arcade-screen__boot-line">NO SIGNAL</p><p class="arcade-screen__boot-say">The machine will not start.</p><p class="arcade-screen__boot-say">${coin}</p><button type="button" class="arcade-screen__done" data-action="close" data-autofocus>STEP BACK</button>`,
      );
      this.bootEl.querySelector<HTMLElement>('button')?.focus();
    }
  }

  private showScore(score: number | null): void {
    this.scoreEl.textContent = score === null ? '-'.repeat(SCORE_DIGITS) : String(Math.min(score, 10 ** SCORE_DIGITS - 1)).padStart(SCORE_DIGITS, '0');
  }

  private onMessage(e: MessageEvent): void {
    const session = this.session;
    if (!session || e.source !== this.frame.contentWindow || !session.origins.includes(e.origin)) return;
    const data = e.data as { type?: unknown; score?: unknown; final?: unknown } | null;
    if (!data || typeof data !== 'object' || typeof data.score !== 'number' || !Number.isFinite(data.score)) return;
    if (data.type !== 'lexipunk:score' && data.type !== 'lexipunk:over') return;
    const final = data.type === 'lexipunk:over' || data.final === true;
    const score = Math.max(0, Math.floor(data.score));
    // A page that speaks has started, whatever its load event said.
    window.clearTimeout(this.bootTimer);
    this.boot(null);
    this.showScore(score);
    this.scoreEl.classList.remove('is-up');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('is-up');
    session.onScore(score, final);
    if (final) {
      this.setStatus('GAME OVER', 'ok');
      this.root.classList.add('arcade-screen--over');
      window.clearTimeout(this.closeTimer);
      this.closeTimer = window.setTimeout(() => this.close(), CLOSE_AFTER_FINAL_MS);
    }
  }
}
