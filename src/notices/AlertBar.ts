import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';

const MIN_MS = 7000;
const FADE_MS = 300;

/**
 * THE ALERT: the game itself has a problem the player must know about (a save that did not reach
 * storage, another tab on the same save, the mouse lock refused). A red bar at the top of the
 * screen, over everything, the menus included; counted in real time, since it may come while the
 * menu is up. One at a time: a new one replaces it.
 */
export class AlertBar {
  private readonly el: HTMLDivElement;
  private timer: number | undefined;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'alert-bar';
    this.el.setAttribute('role', 'alert');
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(text: string, ms = Math.max(MIN_MS, readMs(text) * 1.5)): void {
    const el = this.el;
    el.textContent = text;
    el.classList.remove('alert-bar--out');
    el.hidden = false;
    playNoticeSound('deny');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      el.classList.add('alert-bar--out');
      this.timer = window.setTimeout(() => (el.hidden = true), FADE_MS);
    }, ms);
  }
}
