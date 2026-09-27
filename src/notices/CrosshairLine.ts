import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';

const FADE_MS = 220;

/**
 * THE REACTION: what the click just did, or why it did nothing, written right under the crosshair
 * and its caption, where the player's eyes already are. One at a time: a new click's answer
 * replaces the last. A refusal is red, shakes and buzzes.
 */
export class CrosshairLine {
  private readonly el: HTMLDivElement;
  private left = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'reaction';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(text: string, tone: 'ok' | 'no'): void {
    if (!text) return;
    const el = this.el;
    el.textContent = text;
    el.className = `reaction reaction--${tone}`;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    this.left = readMs(text);
    if (tone === 'no') playNoticeSound('deny');
  }

  update(dt: number, attending: boolean): void {
    if (this.left <= 0) return;
    if (attending) this.left -= dt * 1000;
    if (this.left > 0) return;
    this.el.classList.add('reaction--out');
    window.setTimeout(() => {
      if (this.left <= 0) this.el.hidden = true;
    }, FADE_MS);
  }
}
