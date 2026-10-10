import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { SlipNotice } from './types';
import { hudSlot } from '@/ui/hudSlot';
import { moneyChips } from './chips';
import { closeOnPress } from './dismissHint';

const FADE_MS = 220;

/**
 * THE SLIP: something that changed hands with no fanfare (a game bought, a parcel come, a copy held, a debt
 * settled), a small slip of paper under the crosshair and its reaction, with its coin or ticket chip and a soft
 * tick. One at a time, the latest wins (like the reaction); it stays its reading time, or goes at a press.
 */
export class SlipLine {
  private readonly el: HTMLDivElement;
  private left = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'slip';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    // After the reaction in the column under the crosshair (`hudSlot`).
    hudSlot(container, 'crosshair').appendChild(this.el);
    closeOnPress(this.el, () => this.dismiss());
  }

  show(notice: SlipNotice): void {
    const el = this.el;
    el.replaceChildren();
    const title = document.createElement('div');
    title.className = 'slip__title';
    title.textContent = notice.title;
    el.appendChild(title);
    if (notice.detail) {
      const detail = document.createElement('div');
      detail.className = 'slip__detail';
      detail.textContent = notice.detail;
      el.appendChild(detail);
    }
    const chips = moneyChips(notice.coins, notice.tickets, 'slip__chips');
    if (chips) el.appendChild(chips);
    el.className = 'slip';
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    this.left = readMs(`${notice.title} ${notice.detail ?? ''}`);
    playNoticeSound('slip');
  }

  /** Put away by hand (docs/notices.md). False when none was up. */
  dismiss(): boolean {
    if (this.el.hidden || this.left <= 0) return false;
    this.left = 0;
    this.fade();
    return true;
  }

  update(dt: number, attending: boolean): void {
    if (this.left <= 0) return;
    if (attending) this.left -= dt * 1000;
    if (this.left <= 0) this.fade();
  }

  private fade(): void {
    this.el.classList.add('slip--out');
    window.setTimeout(() => {
      if (this.left <= 0) this.el.hidden = true;
    }, FADE_MS);
  }
}
