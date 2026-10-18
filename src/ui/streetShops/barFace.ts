import { strangerFace } from '../social/strangerFace';
import type { Expression } from '../social/face';

/**
 * THE LOCAL's staff, painted like the town's faces (`social/face`) though nobody keeps a card on them: the quizmaster
 * and the barman, each from a fixed look seed so they are the same every night (`social/strangerFace`).
 */
export const BAR_STAFF = {
  quizmaster: { seed: 4821, name: 'Dennis', role: 'the quizmaster' },
  barman: { seed: 1907, name: 'Sean', role: 'behind the bar' },
} as const;

/** A canvas `size` CSS pixels square: `who`'s face on `backdrop`, with `expression`. */
export function barFace(who: keyof typeof BAR_STAFF, size: number, backdrop: string, expression: Expression = 'rest'): HTMLCanvasElement {
  const face = strangerFace(BAR_STAFF[who].seed, size, backdrop, expression);
  face.className = 'bar-face';
  return face;
}
