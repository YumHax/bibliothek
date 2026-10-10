import * as THREE from 'three';
import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { ReadingNotice } from './types';
import { closeOnPress, followDismissHints, setDismissVerb } from './dismissHint';
import { buildCard, pagesOf, type CardParts } from './readingLooks';

/** Once read, walking this far from where it was opened puts the card away (m). */
const WALK_AWAY = 1.2;
/** Unless the player walks away, a page stays this many times its reading time (the last page: then the card goes). */
const LINGER = 2.2;
const FADE_MS = 320;
/** Waiting cards past this many are merged into the last one ("…and 2 more notes"); a batch (`of`) is never merged. */
const QUEUE_MAX = 3;
/** A postcard shows its picture this long before turning to the written side. */
const FLIP_MS = 1200;

const eye = new THREE.Vector3();

type Card = ReadingNotice & { more?: number };

/** The card up: its markup, its pages and the one shown, whether a postcard has turned to its written side. */
interface Shown {
  card: Card;
  parts: CardParts;
  pages: string[];
  page: number;
  flipped: boolean;
}

/**
 * THE CARD TO READ: a text the player asked for by clicking (the radio's chronicle, the day's mail,
 * a plaque, what the bath did), on a card of paper in the lower middle of the screen, over the
 * view but under the crosshair's line (the look per kind: `readingLooks`). The view dims a touch
 * behind it. It stays at least its reading time whatever the player does; after that, walking
 * away puts it down, else it goes on its own a while later. A long text is cut into pages: the
 * key (or a click) turns them, the last press puts the card down; a postcard shows its picture
 * first. Cards queue; past `QUEUE_MAX` waiting, the last one is a merged card ("…and 2 more
 * notes"), like the rewards: none is silently lost. A batch (the mailbox's three pieces, `of`)
 * never merges.
 */
export class ReadingCard {
  private readonly root: HTMLDivElement;
  private readonly dim: HTMLDivElement;
  private readonly queue: Card[] = [];
  private current: Shown | null = null;
  /** Between a card put away and the next one out. */
  private opening = false;
  /** The timer bringing the next card out (0: none). */
  private pending = 0;
  private shownFor = 0;
  private needed = 0;
  private readonly from = { x: 0, z: 0 };

  constructor(container: HTMLElement, private readonly viewer: THREE.Object3D) {
    this.dim = document.createElement('div');
    this.dim.className = 'reading-dim';
    this.dim.setAttribute('aria-hidden', 'true');
    container.appendChild(this.dim);
    this.root = document.createElement('div');
    this.root.className = 'reading-stage';
    container.appendChild(this.root);
    followDismissHints(this.root);
  }

  /** A card up, or one on its way. */
  get isUp(): boolean {
    return this.current !== null || this.opening || this.queue.length > 0;
  }

  /**
   * Put down by hand (docs/notices.md): a page left turns over, a picture side turns to the writing; else the card
   * goes at once, read or not, and the next waiting one comes out; `all` takes the waiting ones too. False when there
   * was no card.
   */
  dismiss(all = false): boolean {
    if (!this.isUp) return false;
    if (all) {
      this.queue.length = 0;
      // The next card was already on its way out: it stays in.
      if (this.pending) window.clearTimeout(this.pending);
      this.pending = 0;
      this.opening = false;
      if (this.current) this.close();
      // The next card was on its way (the one before it gone): nothing is up any more, the room comes back.
      else this.clearDim();
      return true;
    }
    if (this.current) this.advance();
    return true;
  }

  show(card: ReadingNotice): void {
    if (!card.text) return;
    if (this.current || this.opening) {
      if (this.queue.length >= QUEUE_MAX && !card.of) {
        // The last waiting card takes this one in: its own text is shown, the ones after it counted under it.
        const last = this.queue[this.queue.length - 1]!;
        this.queue[this.queue.length - 1] = { ...last, more: (last.more ?? 0) + 1 };
      } else this.queue.push(card);
      // The one up now has been read enough: make way.
      if (this.current && this.shownFor >= this.needed && this.onLastPage()) this.close();
      return;
    }
    this.open(card);
  }

  update(dt: number, attending: boolean): void {
    const shown = this.current;
    if (!shown) return;
    if (attending) this.shownFor += dt * 1000;
    if (shown.card.look === 'postcard' && !shown.flipped && this.shownFor >= FLIP_MS) this.flip(shown);
    if (this.shownFor < this.needed) return;
    const p = this.viewer.getWorldPosition(eye);
    const walked = Math.hypot(p.x - this.from.x, p.z - this.from.z);
    if (walked > WALK_AWAY || this.queue.length) this.close();
    else if (this.shownFor > this.needed * LINGER) this.advance();
  }

  /** The key or a click: the picture side turns, a page turns, or the card goes. */
  private advance(): void {
    const shown = this.current;
    if (!shown) return;
    if (shown.card.look === 'postcard' && !shown.flipped) this.flip(shown);
    else if (!this.onLastPage()) this.turn(shown, shown.page + 1);
    else this.close();
  }

  private onLastPage(): boolean {
    const shown = this.current;
    return !shown || shown.page >= shown.pages.length - 1;
  }

  private open(card: Card): void {
    const parts = buildCard(card);
    const shown: Shown = { card, parts, pages: pagesOf(card.text), page: 0, flipped: card.look !== 'postcard' };
    closeOnPress(parts.el, () => {
      if (this.current === shown) this.advance();
    });
    this.root.appendChild(parts.el);
    this.current = shown;
    this.turn(shown, 0);
    this.viewer.getWorldPosition(eye);
    this.from.x = eye.x;
    this.from.z = eye.z;
    this.dim.classList.add('reading-dim--on');
    document.body.classList.add('reading-up');
    playNoticeSound('page');
  }

  /** Page `index` of the card up: its text, the effect on the last one, the stamp and the pill say where it stands. */
  private turn(shown: Shown, index: number): void {
    const { parts, pages, card } = shown;
    shown.page = index;
    const last = index >= pages.length - 1;
    parts.body.textContent = pages[index] ?? '';
    if (parts.effect) parts.effect.hidden = !last;
    if (parts.more) parts.more.hidden = !last;
    const where = [card.of ? `${card.of.index} of ${card.of.count}` : '', pages.length > 1 ? `${index + 1}/${pages.length}` : ''].filter(Boolean).join(' · ');
    parts.stamp.textContent = where;
    parts.stamp.hidden = !where;
    this.shownFor = 0;
    this.needed = readMs(`${index === 0 ? (card.title ?? '') : ''} ${pages[index] ?? ''} ${last ? (card.effect ?? '') : ''}`) + (shown.flipped ? 0 : FLIP_MS);
    this.hint(shown);
    if (index > 0) playNoticeSound('page');
  }

  /** A postcard's picture side turns to the writing. */
  private flip(shown: Shown): void {
    shown.flipped = true;
    shown.parts.el.classList.add('reading--flipped');
    this.hint(shown);
  }

  private hint(shown: Shown): void {
    setDismissVerb(shown.parts.hint, !shown.flipped || shown.page < shown.pages.length - 1 ? 'turn over' : 'put down');
  }

  /** No card up and none coming: the room is bright again. */
  private clearDim(): void {
    this.dim.classList.remove('reading-dim--on');
    document.body.classList.remove('reading-up');
  }

  private close(): void {
    const shown = this.current;
    if (!shown) return;
    this.current = null;
    const el = shown.parts.el;
    el.classList.add('reading--out');
    window.setTimeout(() => el.remove(), FADE_MS);
    const next = this.queue.shift();
    if (!next) {
      this.clearDim();
      return;
    }
    this.opening = true;
    this.pending = window.setTimeout(() => {
      this.opening = false;
      this.pending = 0;
      this.open(next);
    }, FADE_MS);
  }
}
