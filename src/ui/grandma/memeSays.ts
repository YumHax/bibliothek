import { MEME_ID } from '@/social/people/family';
import { findPerson } from '@/social/people';
import { reduceMotion } from '@/settings/motion';
import { html, type Html } from '../panel/html';
import type { Expression } from '../social/face';
import { portrait } from '../social/portrait';

/*
 * Mémé at the top of each of her pastimes (the quiz, the crossword, the cards, the wool): her painted face in its
 * frame, and what she says in a comic balloon whose tail points at her, the game's way of showing a person speak.
 * The balloon keeps its height whatever the line, so a longer one never pushes the game under it. A line said while
 * the game runs changes in place (`memeSay`), with the balloon's small pop and her face's expression.
 */

/** Her face's size (CSS px) and the wallpaper of her parlour behind it. */
const FACE = 64;
const PARLOUR = '#ead9bd';

/** Her face and her balloon. `thinking`: the balloon is a thought's cloud (her turn, the word she can't find). */
export function memeSaysHtml(line: string, options: { thinking?: boolean } = {}): Html {
  return html`<div class="meme-says">
    <span class="meme-says__face" aria-hidden="true"></span>
    <p class="meme-says__balloon${options.thinking ? ' meme-says__balloon--thinking' : ''}"><span class="meme-says__name">Mémé</span><span class="meme-says__line">${line}</span></p>
  </div>`;
}

/** Paints her face into the markup `memeSaysHtml` laid (after each repaint: a canvas cannot go through the markup). */
export function paintMemeFace(root: ParentNode, expression: Expression = 'rest'): void {
  const slot = root.querySelector<HTMLElement>('.meme-says__face');
  if (!slot || !findPerson(MEME_ID)) return;
  if (slot.dataset.expression === expression && slot.firstChild) return;
  slot.dataset.expression = expression;
  slot.replaceChildren(portrait(MEME_ID, FACE, PARLOUR, expression));
}

/** Changes her line (and face) in place, the balloon popping as it does; `thinking` turns it into a thought's cloud. */
export function memeSay(root: ParentNode, line: string, expression: Expression = 'rest', thinking = false): void {
  const balloon = root.querySelector<HTMLElement>('.meme-says__balloon');
  const text = balloon?.querySelector('.meme-says__line');
  if (!balloon || !text) return;
  const changed = text.textContent !== line || balloon.classList.contains('meme-says__balloon--thinking') !== thinking;
  text.textContent = line;
  balloon.classList.toggle('meme-says__balloon--thinking', thinking);
  paintMemeFace(root, expression);
  if (changed && !reduceMotion() && typeof balloon.animate === 'function') {
    balloon.animate([{ transform: 'scale(0.94)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' });
  }
}

/** A short shake of `el` (a wrong word, a snapped yarn): skipped under reduced motion. */
export function shake(el: Element | null, strength = 6): void {
  if (!el || reduceMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(-${strength}px)` }, { transform: `translateX(${strength}px)` }, { transform: `translateX(-${strength / 2}px)` }, { transform: 'translateX(0)' }],
    { duration: 320, easing: 'ease-out' },
  );
}
