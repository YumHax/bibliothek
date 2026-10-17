import { createCanvas } from '@/graphics/canvas';
import { randomLook, type PersonLook } from '@/world/people/looks';
import { findPerson } from '@/social/people';
import { rememberedLook } from '@/social/lookBook';
import type { PersonId } from '@/social/types';
import { paintFace, type Expression } from './face';

/*
 * A person's portrait for the conversation panel, the People book and the phone: the painted head and shoulders
 * (`face.ts`) from the look their body was built with, on a backdrop of their tier's colour, drawn at the screen's
 * pixel density so it stays sharp. The painting is cached per person, size, colour and expression; each call hands back a copy
 * (a canvas can only stand in one place in the page).
 */

const cache = new Map<string, HTMLCanvasElement>();

/** The look `id` is drawn with: their body's if built, else their card's seed. */
function lookOf(id: PersonId): PersonLook {
  const remembered = rememberedLook(id);
  if (remembered) return remembered;
  const card = findPerson(id);
  return randomLook(card?.look.seed ?? 1, card?.look.role ?? 'shopper');
}

/** A canvas `size` CSS pixels square with `id`'s face on `backdrop` (their tier's colour), with `expression` (a voice's answer). */
export function portrait(id: PersonId, size: number, backdrop: string, expression: Expression = 'rest'): HTMLCanvasElement {
  const density = Math.min(3, Math.max(1, Math.round((globalThis.devicePixelRatio ?? 1) * 2) / 2));
  const px = Math.round(size * density);
  const look = lookOf(id);
  const key = `${id}:${px}:${backdrop}:${expression}:${look.skin}:${look.hair}:${look.topColor}`;
  let painted = cache.get(key);
  if (!painted) {
    const [canvas, g] = createCanvas(px, px);
    paintFace(g, px, look, backdrop, expression);
    painted = canvas;
    cache.set(key, painted);
  }
  const [copy, g] = createCanvas(px, px);
  g.drawImage(painted, 0, 0);
  copy.className = 'social-portrait';
  copy.style.setProperty('--size', `${size}px`);
  copy.setAttribute('aria-hidden', 'true');
  return copy;
}
