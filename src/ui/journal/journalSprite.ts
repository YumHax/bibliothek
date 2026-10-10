import type { Html } from '../panel/html';
import { pictogram, pictogramSprite } from '../panel/pictograms';

/** The pictogram each kind of line (and each "to watch" kind) takes; a kind nobody drew gets the dot. */
const ICONS: Record<string, string> = {
  bought: 'box',
  unpacked: 'box',
  sold: 'tag',
  wished: 'star',
  prize: 'cup',
  medal: 'medal',
  visit: 'door',
  gift: 'gift',
  home: 'house',
  story: 'pen',
  hunt: 'magnifier',
  social: 'heart',
  arcade: 'joystick',
  market: 'stall',
  seller: 'door',
  building: 'house',
  collection: 'star',
  coins: 'coin',
  tickets: 'ticket',
  games: 'box',
};

/** The hidden sprite every page's icons refer to, painted once at the top of the book. */
export function spriteHtml(): Html {
  return pictogramSprite();
}

/** A kind's pictogram, from the sprite. */
export function icon(kind: string): Html {
  return pictogram(ICONS[kind] ?? 'dot', 'journal-icon');
}
