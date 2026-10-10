import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';
import type { TipOptions } from './types';
import { hudSlot } from '@/ui/hudSlot';
import { closeOnPress } from './dismissHint';
import { writeWithCaps } from './keyCaps';

const MIN_MS = 12000;
/** Handwritten slips top left (the first day's to-do steps), and pills in the hint tray, at most. */
const MAX_NOTES = 3;
const MAX_TRAY = 3;
const FADE_MS = 300;
/** The crosshair's pulse (`crosshair--pulse`, styles.css) is over by then. */
const PULSE_MS = 600;

/** Where a tip is: a handwritten `note` top left, a `card` under the crosshair being read, a pill in the hint `tray`. */
type Stage = 'note' | 'card' | 'tray';

interface Tip {
  id: string;
  text: string;
  el: HTMLElement;
  stage: Stage;
  until?: () => boolean;
  /** Until it goes, ms of play. */
  left: number;
  /** A card: ms of play before it folds into the tray. */
  cardLeft: number;
  /** A card: ms it has been up (`foldCard` spares one just come in). */
  cardAge: number;
}

let serial = 0;

/**
 * THE TIPS: how to do something. A tip comes in as a card right under the crosshair, where the eyes are, for its
 * reading time (the crosshair pulses once to say so), then folds into a pill in the hint tray at the bottom left,
 * where it stays until it is done (`until`), replaced by a tip of the same id, taken down by its caller or by hand,
 * or after a long while. The first day's steps ("To do", `look: 'note'`) are handwritten slips pinned top left under
 * the wallet instead, as before. One card at a time (a new one folds the last), three pills, three slips.
 */
export class TipBoard {
  /** The slips' column, top left under the wallet. */
  private readonly notes: HTMLDivElement;
  /** Under the crosshair: the card goes there. */
  private readonly column: HTMLDivElement;
  /** Bottom left: the pills. */
  private readonly tray: HTMLDivElement;
  private readonly tips: Tip[] = [];
  /** Settings > Game > Show tips. */
  private shown = true;

  constructor(private readonly container: HTMLElement) {
    this.notes = document.createElement('div');
    this.notes.className = 'tip-board';
    this.notes.setAttribute('role', 'status');
    // Under the wallet chip, in one column with it: the chip coming and going moves the slips, never leaves a gap.
    hudSlot(container, 'top-left').appendChild(this.notes);
    this.column = hudSlot(container, 'crosshair');
    this.tray = document.createElement('div');
    this.tray.className = 'hint-tray';
    this.tray.setAttribute('role', 'status');
    container.appendChild(this.tray);
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
    const stay = options.ms ?? Math.max(MIN_MS, readMs(text) * 2);
    if (same && same.text === text) {
      same.left = stay;
      same.until = options.until;
      return () => this.remove(same);
    }
    // The same step, new words: the card is replaced where it is, without the chime.
    if (same) this.remove(same, true);
    const look = options.look ?? (options.head === 'To do' ? 'note' : 'card');
    const tip: Tip = { id, text, el: look === 'note' ? this.noteEl(text, options.head) : this.cardEl(text, options.head), stage: look, until: options.until, left: stay, cardLeft: readMs(text), cardAge: 0 };
    closeOnPress(tip.el, () => this.remove(tip));
    if (look === 'note') {
      this.notes.appendChild(tip.el);
      this.evict('note', MAX_NOTES - 1);
    } else {
      for (const other of this.tips) if (other.stage === 'card') this.fold(other);
      this.column.appendChild(tip.el);
      this.pulseCrosshair();
    }
    this.tips.push(tip);
    if (!same) playNoticeSound('tip');
    return () => this.remove(tip);
  }

  /** Put away by hand (docs/notices.md): the newest tip, wherever it is, or with `all` every one. False when none was up. */
  dismiss(all = false): boolean {
    if (!this.tips.length) return false;
    if (all) for (const tip of [...this.tips]) this.remove(tip);
    else this.remove(this.tips[this.tips.length - 1]!);
    return true;
  }

  update(dt: number, attending: boolean): void {
    for (const tip of [...this.tips]) {
      if (attending) {
        tip.left -= dt * 1000;
        tip.cardLeft -= dt * 1000;
        tip.cardAge += dt * 1000;
      }
      if (tip.left <= 0 || tip.until?.()) this.remove(tip);
      else if (tip.stage === 'card' && tip.cardLeft <= 0) this.fold(tip);
    }
  }

  /** Whether a card is up under the crosshair. */
  get cardUp(): boolean {
    return this.tips.some((tip) => tip.stage === 'card');
  }

  /**
   * The player moved on (walked away, did something else): the card under the crosshair folds into the tray now
   * instead of its reading time, so the column under the crosshair holds the caption and one notice. A card up for
   * less than `minAgeMs` stays (it came with the very click that is being answered).
   */
  foldCard(minAgeMs: number): void {
    for (const tip of this.tips) if (tip.stage === 'card' && tip.cardAge >= minAgeMs) this.fold(tip);
  }

  /** A handwritten slip of squared paper (the first day's steps). */
  private noteEl(text: string, head?: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tip tip--note';
    const h = document.createElement('div');
    h.className = 'tip__head';
    h.textContent = head ?? 'Tip';
    const body = document.createElement('div');
    body.className = 'tip__text';
    body.textContent = text;
    el.append(h, body);
    return el;
  }

  /** The card under the crosshair: the head, the text with its key caps. */
  private cardEl(text: string, head?: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tip-card';
    const h = document.createElement('div');
    h.className = 'tip-card__head';
    h.textContent = head ?? 'Tip';
    const body = document.createElement('div');
    body.className = 'tip-card__text';
    writeWithCaps(body, text);
    el.append(h, body);
    return el;
  }

  /** Read: the card leaves the crosshair's column for a pill in the tray (no sound). */
  private fold(tip: Tip): void {
    if (tip.stage !== 'card') return;
    this.fade(tip.el, 'tip-card--out');
    const pill = document.createElement('div');
    pill.className = 'hint';
    writeWithCaps(pill, tip.text);
    closeOnPress(pill, () => this.remove(tip));
    this.tray.appendChild(pill);
    tip.el = pill;
    tip.stage = 'tray';
    this.evict('tray', MAX_TRAY);
  }

  /** Past `max` tips in `stage`, the oldest go at once. */
  private evict(stage: Stage, max: number): void {
    const staged = this.tips.filter((t) => t.stage === stage);
    for (const tip of staged.slice(0, Math.max(0, staged.length - max))) this.remove(tip, true);
  }

  /** The crosshair rings once so the eye drops to the card (reduced motion clamps it to nothing, styles.css). */
  private pulseCrosshair(): void {
    const crosshair = this.container.querySelector<HTMLElement>('.crosshair');
    if (!crosshair) return;
    crosshair.classList.remove('crosshair--pulse');
    void crosshair.offsetWidth;
    crosshair.classList.add('crosshair--pulse');
    window.setTimeout(() => crosshair.classList.remove('crosshair--pulse'), PULSE_MS);
  }

  private remove(tip: Tip, now = false): void {
    const i = this.tips.indexOf(tip);
    if (i < 0) return;
    this.tips.splice(i, 1);
    if (now) {
      tip.el.remove();
      return;
    }
    this.fade(tip.el, tip.stage === 'note' ? 'tip--out' : tip.stage === 'card' ? 'tip-card--out' : 'hint--out');
  }

  private fade(el: HTMLElement, outClass: string): void {
    el.classList.add(outClass);
    el.style.pointerEvents = 'none';
    window.setTimeout(() => el.remove(), FADE_MS);
  }
}
