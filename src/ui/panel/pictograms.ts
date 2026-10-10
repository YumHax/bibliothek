import { raw, type Html } from './html';

/*
 * The pictograms the paper panels draw their lines with (the journal's lines and counters, the to-do note's route):
 * one `<symbol>` each, 16 × 16, in strokes of `currentColor`, so a page's CSS inks them. A panel paints the sprite
 * once (`pictogramSprite`) and refers to it with `pictogram(name, className)`.
 */

const SYMBOLS: readonly (readonly [string, string])[] = [
  ['box', '<path d="M2.5 4.5h11v9h-11z"/><path d="M2.5 7.5h11M8 4.5v3"/>'],
  ['tag', '<path d="M2 2h5l7 7-5 5-7-7z"/><circle cx="5" cy="5" r="1"/>'],
  ['star', '<path d="M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4l-3.9 2.2.9-4.3-3.2-3 4.3-.5z"/>'],
  ['cup', '<path d="M4.5 2h7v4a3.5 3.5 0 0 1-7 0z"/><path d="M4.5 3h-2v1.5a2 2 0 0 0 2 2M11.5 3h2v1.5a2 2 0 0 1-2 2M8 9.5V13M5 14h6"/>'],
  ['medal', '<path d="M5 1.5h6l-1.5 4.5h-3z"/><circle cx="8" cy="10.2" r="3.8"/><path d="M8 8.4v2l1.2.8"/>'],
  ['door', '<path d="M4 1.5h8v13H4z"/><circle cx="10" cy="8" r=".8"/>'],
  ['gift', '<path d="M2 7h12v7H2zM2 10.5h12M8 7v7"/><path d="M8 7c-2 0-4-1-4-2.5S6 2 8 4c2-2 4-1 4 .5S10 7 8 7z"/>'],
  ['house', '<path d="M2 8l6-5 6 5v6H2z"/><path d="M6.5 14V9.5h3V14"/>'],
  ['pen', '<path d="M3 13l1-4 7-7 3 3-7 7-4 1z"/><path d="M10 3l3 3"/>'],
  ['magnifier', '<circle cx="6.5" cy="6.5" r="4"/><path d="M9.5 9.5L14 14"/>'],
  ['heart', '<path d="M8 14s-5-3.3-5-7a3 3 0 0 1 5-2 3 3 0 0 1 5 2c0 3.7-5 7-5 7z"/>'],
  ['joystick', '<path d="M8 9V3"/><circle cx="8" cy="3" r="1.8"/><rect x="3" y="9" width="10" height="4" rx="1"/>'],
  ['stall', '<path d="M2 6.5l1.5-4h9l1.5 4"/><path d="M2 6.5c1 1.4 2 1.4 3 0c1 1.4 2 1.4 3 0c1 1.4 2 1.4 3 0c1 1.4 2 1.4 3 0"/><path d="M3.5 8v6h9V8M6.5 14v-3.5h3V14"/>'],
  ['coin', '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.6"/>'],
  ['ticket', '<path d="M2 5h12v2.3a1.7 1.7 0 0 0 0 3.4V13H2v-2.3a1.7 1.7 0 0 0 0-3.4z"/><path d="M6 5.5v7" stroke-dasharray="1.4 1.4"/>'],
  ['keys', '<circle cx="5" cy="5" r="3"/><path d="M7.2 7.2L14 14M10.8 10.8l1.6-1.6M12.6 12.6l1.6-1.6"/>'],
  ['parcel', '<path d="M2 5l6-3 6 3v7l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v7"/>'],
  ['tv', '<rect x="2" y="3.5" width="12" height="8.5" rx="1"/><path d="M5.5 14.5h5M6 1.5l2 2 2-2"/>'],
  ['check', '<path d="M3 8.5l3.2 3L13 4.5"/>'],
  ['dot', '<circle cx="8" cy="8" r="1.6" fill="currentColor"/>'],
];

const SPRITE = SYMBOLS.map(([id, body]) => `<symbol id="pg-${id}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${body}</symbol>`).join('');

const NAMES = new Set(SYMBOLS.map(([id]) => id));

/** The hidden sprite every pictogram on the page refers to: painted once at the top of a panel's body. */
export function pictogramSprite(): Html {
  return raw(`<svg class="ui-pictogram-sprite" aria-hidden="true">${SPRITE}</svg>`);
}

/** The pictogram `name` (one nobody drew gets the dot), sized and inked by `className`. */
export function pictogram(name: string, className: string): Html {
  return raw(`<svg class="${className}" aria-hidden="true"><use href="#pg-${NAMES.has(name) ? name : 'dot'}"/></svg>`);
}
