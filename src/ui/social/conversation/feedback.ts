import { playUiSound } from '@/audio/uiSounds';
import type { Reaction } from '@/social/conversation';
import { reduceMotion } from '@/settings/motion';
import type { Expression } from '../face';
import { icon } from '../icons';
import { html, paint } from '../../panel/html';

/*
 * What shows on the person after a choice (docs/social.md "After a choice"), all at their balloon: one to three hearts
 * bursting from its tail (warmer) or a cracked one falling (cooler) with a chime or a low note; a small face of the
 * player's by the name tag when they will remember it; a card with the fact learned flying from the balloon into the
 * tag's book. Before it, the player's own balloon flies up to them: it was said. And the same in words for a screen
 * reader.
 */

/** How long the hearts stay (ms; social.css's animation is `--dur-shimmer`, the rest is the fade). */
const BURST_MS = 1800;
/** How long the "they will remember" face stays (ms). */
const REMEMBER_MS = 1400;
/** The fact card's flight to the book (ms). */
const FLIGHT_MS = 600;
/** The player's balloon's flight up to them (ms). */
const FLY_MS = 420;

/** Hearts by how much warmth moved (none under a twentieth of a point). Returns whether any showed. */
export function hearts(over: HTMLElement, warmth: number): boolean {
  if (Math.abs(warmth) < 0.05) return false;
  const up = warmth > 0;
  const n = Math.abs(warmth) < 3 ? 1 : Math.abs(warmth) < 7 ? 2 : 3;
  const burst = document.createElement('div');
  burst.className = `social-burst social-burst--${up ? 'up' : 'down'}`;
  paint(burst, html`${Array.from({ length: n }, (_, i) => html`<span style="--i:${i}">${icon(up ? 'heart' : 'heartCrack', 1.2)}</span>`)}`);
  over.appendChild(burst);
  window.setTimeout(() => burst.remove(), BURST_MS);
  playUiSound(up ? 'warm' : 'cool');
  return true;
}

/** The player's small face over theirs, a second: they will remember this. */
export function rememberMark(over: HTMLElement): void {
  const mark = document.createElement('div');
  mark.className = 'social-remember';
  paint(mark, html`${icon('moodFine', 1.35)}`);
  over.appendChild(mark);
  window.setTimeout(() => mark.remove(), REMEMBER_MS);
  playUiSound('remember');
}

/** A card with `text` flies from `from` (screen px) into `to` (the tag's book); reduced motion: it fades in there. */
export function flyFact(layer: HTMLElement, from: { x: number; y: number } | null, to: Element | null, text: string): void {
  const target = to?.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = 'social-fact';
  card.textContent = text;
  layer.appendChild(card);
  const end = target ? { x: target.left + target.width / 2, y: target.top + target.height / 2 } : null;
  const start = from ?? end;
  if (!start || !end) {
    card.remove();
    return;
  }
  if (reduceMotion()) {
    card.style.translate = `${end.x}px ${end.y}px`;
    card.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: FLIGHT_MS * 2 }).finished.then(() => card.remove(), () => card.remove());
  } else {
    // An arc: up a little from the bubble, then down into the book, shrinking as it lands.
    const mid = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 48 };
    card
      .animate(
        [
          { translate: `${start.x}px ${start.y}px`, scale: '0.6', opacity: 0 },
          { translate: `${start.x}px ${start.y - 16}px`, scale: '1', opacity: 1, offset: 0.25 },
          { translate: `${mid.x}px ${mid.y}px`, scale: '0.85', opacity: 1, offset: 0.6 },
          { translate: `${end.x}px ${end.y}px`, scale: '0.2', opacity: 0.2 },
        ],
        { duration: FLIGHT_MS * 1.8, easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)', fill: 'forwards' },
      )
      .finished.then(
        () => card.remove(),
        () => card.remove(),
      );
  }
  const book = to as HTMLElement | null;
  if (book) {
    window.setTimeout(() => {
      book.classList.remove('social-tag__book--fed');
      void book.offsetWidth;
      book.classList.add('social-tag__book--fed');
    }, FLIGHT_MS * 1.5);
  }
  playUiSound('remember');
}

/**
 * The player's balloon `el` flies up to `to` (their balloon's tail, screen px) and fades: it was said. A copy flies (the
 * stage repaints under it at once); reduced motion: the copy only fades where it was.
 */
export function flyBalloon(layer: HTMLElement, el: HTMLElement, to: { x: number; y: number } | null): void {
  const from = el.getBoundingClientRect();
  const copy = el.cloneNode(true) as HTMLElement;
  copy.classList.add('social-balloon--flying');
  copy.removeAttribute('data-action');
  copy.setAttribute('aria-hidden', 'true');
  copy.style.translate = `${from.left}px ${from.top}px`;
  copy.style.width = `${from.width}px`;
  layer.appendChild(copy);
  const dx = to ? to.x - (from.left + from.width / 2) : 0;
  const dy = to ? to.y - from.top : -from.height;
  const frames = reduceMotion()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.55}px) scale(0.8)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
      ];
  copy.animate(frames, { duration: reduceMotion() ? 200 : FLY_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).finished.then(
    () => copy.remove(),
    () => copy.remove(),
  );
}

/** What a reaction looks like, in words (the screen reader's account of their body). */
export const REACTION_WORDS: Record<Reaction, string> = {
  delighted: 'lights up',
  pleased: 'smiles',
  laugh: 'laughs',
  thanks: 'thanks you',
  nod: 'nods',
  bored: 'looks away',
  shrug: 'shrugs',
  annoyed: 'frowns',
  hurt: 'looks hurt',
  restless: 'looks at their watch',
  bye: 'waves',
};

/** The painted face a voice's portrait takes for a reaction. */
export function expressionOf(reaction: Reaction): Expression {
  switch (reaction) {
    case 'delighted':
      return 'surprise';
    case 'pleased':
    case 'laugh':
    case 'thanks':
    case 'bye':
      return 'smile';
    case 'annoyed':
    case 'hurt':
      return 'frown';
    default:
      return 'rest';
  }
}

/** How long (ms) they take to say `line` before their body reacts: the reaction comes at the end of the line. */
export function speakingMs(line: string): number {
  return Math.max(500, Math.min(2400, 300 + line.length * 28));
}
