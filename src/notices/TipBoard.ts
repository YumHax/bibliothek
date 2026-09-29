import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { TipOptions } from './types';
import { hudSlot } from '@/ui/hudSlot';

const MIN_MS = 12000;
const MAX_TIPS = 3;
const FADE_MS = 300;

interface Tip {
  id: string;
  el: HTMLDivElement;
  until?: () => boolean;
  left: number;
}

let serial = 0;

/**
 * THE TIPS: how to do something, pinned top left under the wallet, a card each, until it is done
 * (`until`), replaced by a tip of the same id, taken down by its caller, or after a long while. At
 * most three; a fourth pushes the oldest out. A soft chime and a slide-in when one arrives.
 */
export class TipBoard {
  private readonly root: HTMLDivElement;
  private readonly tips: Tip[] = [];
  /** Settings > Game > Show tips. */
  private shown = true;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tip-board';
    this.root.setAttribute('role', 'status');
    // Under the wallet chip, in one column with it: the chip coming and going moves the tips, never leaves a gap.
    hudSlot(container, 'top-left').appendChild(this.root);
  }

  /** Settings > Game > Show tips. */
  get isShown(): boolean {
    return this.shown;
  }

  /** Off: the tips up now go, and new ones are dropped. */
  setShown(shown: boolean): void {
    this.shown = shown;
    if (!shown) for (const tip of [...this.tips]) this.remove(tip);
  }

  show(text: string, options: TipOptions = {}): () => void {
    if (!this.shown) return () => {};
    const id = options.id ?? `tip:${serial++}`;
    const same = this.tips.find((t) => t.id === id);
    if (same && same.el.querySelector('.tip__text')?.textContent === text) {
      same.left = options.ms ?? Math.max(MIN_MS, readMs(text) * 2);
      same.until = options.until;
      return () => this.remove(same);
    }
    if (same) this.remove(same, true);
    const el = document.createElement('div');
    // The first day's steps ("To do") are a note in pen, like the to-do list they come from.
    el.className = (options.look ?? (options.head === 'To do' ? 'note' : 'card')) === 'note' ? 'tip tip--note' : 'tip';
    const head = document.createElement('div');
    head.className = 'tip__head';
    head.textContent = options.head ?? 'Tip';
    const body = document.createElement('div');
    body.className = 'tip__text';
    body.textContent = text;
    el.append(head, body);
    this.root.appendChild(el);
    const tip: Tip = { id, el, until: options.until, left: options.ms ?? Math.max(MIN_MS, readMs(text) * 2) };
    this.tips.push(tip);
    while (this.tips.length > MAX_TIPS) this.remove(this.tips[0]!, true);
    playNoticeSound('tip');
    return () => this.remove(tip);
  }

  update(dt: number, attending: boolean): void {
    for (const tip of [...this.tips]) {
      if (attending) tip.left -= dt * 1000;
      if (tip.left <= 0 || tip.until?.()) this.remove(tip);
    }
  }

  private remove(tip: Tip, now = false): void {
    const i = this.tips.indexOf(tip);
    if (i < 0) return;
    this.tips.splice(i, 1);
    if (now) {
      tip.el.remove();
      return;
    }
    tip.el.classList.add('tip--out');
    window.setTimeout(() => tip.el.remove(), FADE_MS);
  }
}
