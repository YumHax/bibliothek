import type { Game } from '@/catalog/types';
import type { Dream, RoomDream } from '@/household/dreams';
import { capitalise } from '@/text/strings';
import { coverImg } from '../panel/widgets';
import { html, paint } from '../panel/html';
import './household.css';

/** How long the card stays on waking, ms; how long it takes to fade back into waking (`--dur-drift`). */
const SHOWN_MS = 8000;
const FADE_MS = 1100;

/** What the dream card says around a copy dreamt of, a few ways (picked by its title: the same dream reads the same). */
const KICKERS = ['Last night you dreamt of…', 'You woke up still holding…', 'All night, you were looking at…'];
const HINTS = ['It felt like this very morning.', 'The dream is already going. The stall is real, though.', 'You could almost smell the cardboard.'];

/**
 * A night's dream, on waking: a blurred cover, the title half remembered, where it lay; or, some nights, Félix's room
 * as he had it (`household/dreams.roomDreamOf`), one piece put back lit. A HUD card (not a panel: it takes no keys),
 * on a night-blue haze that drifts, fading back into waking after a few seconds or on a click; pointed at, it holds
 * (a long dream on the largest text size is read to the end).
 */
export class DreamCard {
  private readonly root: HTMLElement;
  private timer = 0;
  private fading = 0;

  constructor(container: HTMLElement, private readonly coverUrl: (game: Game) => string | undefined) {
    this.root = document.createElement('aside');
    this.root.className = 'dream-card ui-card';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.hide());
    this.root.addEventListener('pointerenter', () => window.clearTimeout(this.timer));
    this.root.addEventListener('pointerleave', () => {
      if (this.root.hidden || this.fading) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.hide(), SHOWN_MS / 2);
    });
    container.appendChild(this.root);
  }

  show(dream: Dream): void {
    const cover = this.coverUrl(dream.game);
    const turn = [...dream.game.title].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    paint(
      this.root,
      html`${cover ? html`<span class="dream-card__float">${coverImg(cover, dream.game, 'dream-card__cover catalogue__cover')}</span>` : ''}
        <div>
          <p class="dream-card__kicker">${KICKERS[turn % KICKERS.length]!}</p>
          <p class="dream-card__title">${dream.game.title}</p>
          <p class="dream-card__where">${dream.where}. ${dream.line}</p>
          <p class="dream-card__hint">${HINTS[turn % HINTS.length]!}</p>
        </div>`,
    );
    // A cover that fails becomes a made-up box, blurred like the art (`installCoverPlaceholders`).
    this.open();
  }

  /** The dream of Félix's room: what was back, lit; what was still only a pale shape on the parquet. */
  showRoom(dream: RoomDream): void {
    paint(
      this.root,
      html`<span class="dream-card__lamp" aria-hidden="true"></span>
        <div>
          <p class="dream-card__kicker">Last night you dreamt of…</p>
          <p class="dream-card__title">Félix’s room, as he had it</p>
          ${dream.back ? html`<p class="dream-card__where">${capitalise(dream.back)} was back, lit, just where it stood.</p>` : ''}
          ${dream.missing ? html`<p class="dream-card__where">Where ${dream.missing} should be, only a pale shape on the parquet.</p>` : ''}
          <p class="dream-card__hint">${dream.line}</p>
        </div>`,
    );
    this.open();
  }

  hide(): void {
    if (this.root.hidden || this.fading) return;
    window.clearTimeout(this.timer);
    this.root.classList.add('dream-card--out');
    this.fading = window.setTimeout(() => {
      this.fading = 0;
      this.root.hidden = true;
      this.root.classList.remove('dream-card--out');
    }, FADE_MS);
  }

  private open(): void {
    window.clearTimeout(this.fading);
    this.fading = 0;
    this.root.classList.remove('dream-card--out');
    this.root.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), SHOWN_MS);
  }
}
