import type { PersonId } from '@/social/types';
import { FACE_PAPER, portrait } from '../social/portrait';
import { strangerFace } from '../social/strangerFace';
import type { Expression } from '../social/face';
import { html, paint } from './html';
import './speaker.css';

/** Who speaks: a person of the social roster draws their painted face; anyone else (Raymond, a quizmaster, a driver) a silhouette. */
interface SpeakerWho {
  /** The name on the tag under the face. */
  name: string;
  /** A roster person: their portrait (`ui/social/portrait`). Absent: a drawn silhouette tinted from the name. */
  person?: PersonId;
  /** Someone with no card but a walker in the street: the look seed it wears, painted the same (`ui/social/strangerFace`). */
  seed?: number;
  /** The portrait's backdrop (default: the market's cream). */
  backdrop?: string;
}

interface SpeakerOptions {
  /** Extra class on the strip (a panel's theme: `ui-speaker--paper`, its own). */
  className?: string;
  /** The face's size in CSS pixels (default 56). */
  face?: number;
}

/** Tints for the silhouette, picked by the name so the same stranger keeps the same colour. */
const TINTS = ['#c96f4a', '#5b7fa6', '#7a9a5a', '#a46aa0', '#c9a24a', '#4f8f8a'];

function tintOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/**
 * The person a panel deals with, at the top of it: their face (painted, or a silhouette for someone with no
 * record), the name tag, and what they say in a comic balloon (the speech notices' paper and ink). The strip keeps
 * its height (two lines) whatever the line, so a new line never moves the panel; each `say` pops the balloon in.
 * It owns its element: a panel puts it once at its top (`mountAbove(this.body)`) and calls `say` where
 * it used to write the person's words into the status line.
 */
export class Speaker {
  readonly el: HTMLElement;
  private readonly faceEl: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly lineEl: HTMLElement;
  private who: SpeakerWho;
  private expression: Expression = 'rest';
  private readonly size: number;

  constructor(who: SpeakerWho, options: SpeakerOptions = {}) {
    this.who = who;
    this.size = options.face ?? 56;
    this.el = document.createElement('div');
    this.el.className = `ui-speaker${options.className ? ` ${options.className}` : ''}`;
    this.el.style.setProperty('--speaker-face', `${this.size}px`);
    paint(
      this.el,
      html`<figure class="ui-speaker__who"><span class="ui-speaker__face"></span><figcaption class="ui-speaker__name"></figcaption></figure>
        <p class="ui-speaker__balloon ui-speaker__balloon--quiet" aria-live="polite"></p>`,
    );
    this.faceEl = this.el.querySelector('.ui-speaker__face')!;
    this.nameEl = this.el.querySelector('.ui-speaker__name')!;
    this.lineEl = this.el.querySelector('.ui-speaker__balloon')!;
    this.drawFace();
  }

  /**
   * Puts the strip at the top of a kit panel: above the status line beside `body` (a `SheetPanel`'s or a
   * `CardPanel`'s), else right above `body`. Once, in the panel's constructor: repaints of the body leave it be.
   */
  mountAbove(body: HTMLElement): void {
    const status = body.parentElement?.querySelector(':scope > .catalogue__status, :scope > .ui-panel__status');
    (status ?? body).before(this.el);
  }

  /** Says `line` (null: the balloon goes, the face stays); `expression` repaints a roster face (a smile on a deal). */
  say(line: string | null, expression: Expression = 'rest'): void {
    if (expression !== this.expression) {
      this.expression = expression;
      if (this.who.person || this.who.seed !== undefined) this.drawFace();
    }
    if (!line) {
      this.lineEl.classList.add('ui-speaker__balloon--quiet');
      this.lineEl.textContent = '';
      return;
    }
    this.lineEl.classList.remove('ui-speaker__balloon--quiet');
    this.lineEl.textContent = line;
    // Restart the pop: drop the class, force a style read, put it back.
    this.lineEl.classList.remove('ui-speaker__balloon--pop');
    void this.lineEl.offsetWidth;
    this.lineEl.classList.add('ui-speaker__balloon--pop');
  }

  /** Another person at the same spot (the party's buyers, a stall's keeper changing). */
  setWho(who: SpeakerWho): void {
    this.who = who;
    this.drawFace();
  }

  private drawFace(): void {
    const { person, seed, name } = this.who;
    this.nameEl.textContent = name;
    this.faceEl.replaceChildren();
    if (person) {
      this.faceEl.append(portrait(person, this.size, this.who.backdrop ?? FACE_PAPER, this.expression));
      return;
    }
    if (seed !== undefined) {
      this.faceEl.append(strangerFace(seed, this.size, this.who.backdrop ?? FACE_PAPER, this.expression));
      return;
    }
    this.faceEl.style.setProperty('--speaker-tint', tintOf(name));
    paint(
      this.faceEl,
      html`<svg class="ui-speaker__silhouette" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5"/><path d="M6 40c0-9 6.5-14.5 14-14.5S34 31 34 40z"/></svg>`,
    );
  }
}
