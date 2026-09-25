import './ArcadeScreenPanel.css';

/** What a cabinet whose game runs in a web page needs: open it, hear its score, know when it is shut. */
export interface RemoteScreenLike {
  /**
   * Shows `url` in the big frame. `onScore` hears every score the page reports (`final` when its
   * game is over); `onClose` is called once when the frame shuts, by the page's end, the Done
   * button or Esc.
   */
  open(options: { title: string; url: string; origins: readonly string[]; onScore: (score: number, final: boolean) => void; onClose: () => void }): void;
  close(): void;
  readonly isOpen: boolean;
}

/** How long the frame stays up once the page has said its game is over, so the final score can be seen. */
const CLOSE_AFTER_FINAL_MS = 1800;

/**
 * The big screen for an arcade cabinet whose game is a web page (LexiPunk): a full-window modal
 * with the page in an iframe inside a cabinet-coloured bezel, the live score and a Done button.
 * The page reports its score with `window.parent.postMessage({ type: 'lexipunk:score', score,
 * final }, '*')` (or `{ type: 'lexipunk:over', score }` at the end); messages from any origin not
 * in the cabinet's list are ignored. A modal like the prize counter: the Session releases the
 * mouse while it is up and re-enters the room when it shuts. The iframe is emptied on close so
 * the page's sound stops with it.
 */
export class ArcadeScreenPanel implements RemoteScreenLike {
  private readonly root: HTMLElement;
  private readonly frame: HTMLIFrameElement;
  private readonly titleEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private session: Parameters<RemoteScreenLike['open']>[0] | null = null;
  private closeTimer = 0;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(container: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'arcade-screen';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="arcade-screen__bezel">
        <header class="arcade-screen__header">
          <h2 class="arcade-screen__title"></h2>
          <span class="arcade-screen__score"></span>
          <span class="arcade-screen__status"></span>
          <button type="button" class="arcade-screen__done" data-action="done">Done</button>
        </header>
        <iframe class="arcade-screen__frame" title="Arcade game" allow="autoplay; fullscreen" referrerpolicy="origin"></iframe>
        <p class="arcade-screen__foot">Your score pays out in tickets when you are done. Done steps back from the cabinet (Esc too, once you click outside the game).</p>
      </div>`;
    container.appendChild(this.root);
    this.frame = this.root.querySelector('iframe')!;
    this.titleEl = this.root.querySelector('.arcade-screen__title')!;
    this.scoreEl = this.root.querySelector('.arcade-screen__score')!;
    this.statusEl = this.root.querySelector('.arcade-screen__status')!;
    this.root.querySelector('[data-action="done"]')!.addEventListener('click', () => this.close());
    // Keep keys off the window-level Input (WASD would walk); Escape goes through so the Session can close us.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }
    window.addEventListener('message', (e) => this.onMessage(e));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(options: Parameters<RemoteScreenLike['open']>[0]): void {
    if (this.isOpen) this.close();
    this.session = options;
    this.titleEl.textContent = options.title;
    this.scoreEl.textContent = 'Score: —';
    this.statusEl.textContent = 'Loading…';
    this.frame.src = options.url;
    this.frame.onload = () => {
      if (this.session === options) this.statusEl.textContent = '';
    };
    if (document.pointerLockElement) document.exitPointerLock();
    this.root.hidden = false;
    this.onOpenChange?.(true);
    // The page gets the keyboard straight away.
    window.setTimeout(() => this.frame.focus(), 50);
  }

  close(): void {
    if (!this.isOpen) return;
    window.clearTimeout(this.closeTimer);
    this.root.hidden = true;
    this.frame.src = 'about:blank';
    const session = this.session;
    this.session = null;
    session?.onClose();
    this.onOpenChange?.(false);
  }

  /** ModalLike: the Session only ever closes it (a cabinet opens it). */
  toggle(): void {
    if (this.isOpen) this.close();
  }

  private onMessage(e: MessageEvent): void {
    const session = this.session;
    if (!session || e.source !== this.frame.contentWindow || !session.origins.includes(e.origin)) return;
    const data = e.data as { type?: unknown; score?: unknown; final?: unknown } | null;
    if (!data || typeof data !== 'object' || typeof data.score !== 'number' || !Number.isFinite(data.score)) return;
    if (data.type !== 'lexipunk:score' && data.type !== 'lexipunk:over') return;
    const final = data.type === 'lexipunk:over' || data.final === true;
    const score = Math.max(0, Math.floor(data.score));
    this.scoreEl.textContent = `Score: ${score.toLocaleString('en-US')}`;
    session.onScore(score, final);
    if (final) {
      this.statusEl.textContent = 'Game over!';
      window.clearTimeout(this.closeTimer);
      this.closeTimer = window.setTimeout(() => this.close(), CLOSE_AFTER_FINAL_MS);
    }
  }
}
