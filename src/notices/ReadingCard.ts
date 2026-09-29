import * as THREE from 'three';
import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { ReadingNotice } from './types';

/** Once read, walking this far from where it was opened puts the card away (m). */
const WALK_AWAY = 1.2;
/** Unless the player walks away, it stays this many times its reading time. */
const LINGER = 2.2;
const FADE_MS = 320;
const QUEUE_MAX = 3;

const eye = new THREE.Vector3();

/**
 * THE CARD TO READ: a text the player asked for by clicking (the radio's chronicle, the day's mail,
 * a plaque, what the bath did), on a card of paper in the lower middle of the screen, over the
 * view but under the crosshair's line. It stays at least its reading time whatever the player does;
 * after that, walking away puts it down, else it goes on its own a while later. Cards queue; past
 * `QUEUE_MAX` waiting, the last one is a merged card ("…and 2 more notes"), like the rewards: none is
 * silently lost.
 */
export class ReadingCard {
  private readonly root: HTMLDivElement;
  private readonly queue: Array<ReadingNotice & { more?: number }> = [];
  private current: HTMLElement | null = null;
  /** Between a card put away and the next one out. */
  private opening = false;
  private shownFor = 0;
  private needed = 0;
  private readonly from = { x: 0, z: 0 };

  constructor(container: HTMLElement, private readonly viewer: THREE.Object3D) {
    this.root = document.createElement('div');
    this.root.className = 'reading-stage';
    container.appendChild(this.root);
  }

  show(card: ReadingNotice): void {
    if (!card.text) return;
    if (this.current || this.opening) {
      if (this.queue.length >= QUEUE_MAX) {
        // The last waiting card takes this one in: its own text is shown, the ones after it counted under it.
        const last = this.queue[this.queue.length - 1]!;
        this.queue[this.queue.length - 1] = { ...last, more: (last.more ?? 0) + 1 };
      } else this.queue.push(card);
      // The one up now has been read enough: make way.
      if (this.current && this.shownFor >= this.needed) this.close();
      return;
    }
    this.open(card);
  }

  update(dt: number, attending: boolean): void {
    if (!this.current) return;
    if (attending) this.shownFor += dt * 1000;
    if (this.shownFor < this.needed) return;
    const p = this.viewer.getWorldPosition(eye);
    const walked = Math.hypot(p.x - this.from.x, p.z - this.from.z);
    if (walked > WALK_AWAY || this.shownFor > this.needed * LINGER || this.queue.length) this.close();
  }

  private open(card: ReadingNotice & { more?: number }): void {
    const el = document.createElement('article');
    el.className = 'reading';
    el.dataset.look = card.look ?? 'note';
    if (card.title) {
      const title = document.createElement('h3');
      title.className = 'reading__title';
      title.textContent = card.title;
      el.appendChild(title);
    }
    const text = document.createElement('p');
    text.className = 'reading__text';
    text.textContent = card.text;
    el.appendChild(text);
    if (card.effect) {
      const effect = document.createElement('p');
      effect.className = 'reading__effect';
      effect.textContent = card.effect;
      el.appendChild(effect);
    }
    if (card.more) {
      const more = document.createElement('p');
      more.className = 'reading__more';
      more.textContent = `…and ${card.more} more note${card.more === 1 ? '' : 's'}`;
      el.appendChild(more);
    }
    this.root.appendChild(el);
    this.current = el;
    this.shownFor = 0;
    this.needed = readMs(`${card.title ?? ''} ${card.text} ${card.effect ?? ''}`);
    this.viewer.getWorldPosition(eye);
    this.from.x = eye.x;
    this.from.z = eye.z;
    playNoticeSound('page');
  }

  private close(): void {
    const el = this.current;
    if (!el) return;
    this.current = null;
    el.classList.add('reading--out');
    window.setTimeout(() => el.remove(), FADE_MS);
    const next = this.queue.shift();
    if (!next) return;
    this.opening = true;
    window.setTimeout(() => {
      this.opening = false;
      this.open(next);
    }, FADE_MS);
  }
}
