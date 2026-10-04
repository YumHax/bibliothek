/*
 * Words as the player reads and searches them: a capital on a line's first letter, the key a title is searched and
 * matched under (accents folded, case and punctuation dropped), and the one order titles stand in, on the shelves and
 * in every panel alike (docs/consistency-audit.md §3.9-G1/G2: four normalisers and two title orders once disagreed).
 */

/** "the shop" → "The shop" (the rest untouched). */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The text with its accents folded away ("Pokémon" → "Pokemon"), case and punctuation kept. */
export function foldAccents(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** The key a title is searched under: accents folded, lower case, anything but letters and digits a single space. */
export function searchKey(text: string): string {
  return foldAccents(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Whether `text` holds `query` as the player typed it, accents and case aside ("pokemon" finds "Pokémon"). */
export function matchesSearch(text: string, query: string): boolean {
  const key = searchKey(query);
  return !key || searchKey(text).includes(key);
}

/** A title without its leading article, so "The Legend of Zelda" files under L (English and French articles). */
function sortTitle(title: string): string {
  return title.replace(/^(the|a|an|le|la|les)\s+/i, '');
}

/**
 * The one order titles stand in: articles dropped, accents and case ignored, numbers by value ("Mega Man 2" before
 * "Mega Man 10"). The shelves sorted this way first; the panels follow them.
 */
export function compareTitles(a: string, b: string): number {
  return sortTitle(a).localeCompare(sortTitle(b), undefined, { sensitivity: 'base', numeric: true });
}
