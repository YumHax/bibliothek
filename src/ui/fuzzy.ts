import { escapeHtml } from './html';

/** Lower-case, strip diacritics and collapse whitespace so "Pokémon" matches "pokemon". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FuzzyMatch {
  /** Higher is better; 0 means no match. */
  score: number;
  /** Indices of the matched characters in the *original* text (for highlighting). */
  positions: number[];
}

/**
 * Subsequence match of `query` inside `text`, in order, with bonuses for consecutive
 * characters, word starts and an exact prefix. Returns null when some character is missing.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return { score: 0, positions: [] };
  if (t.length !== text.length) return fuzzyMatchLoose(q, t); // diacritics shifted indices; skip highlighting

  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const wordStart = found === 0 || /[\s\-_:.,'(]/.test(t[found - 1]!);
    streak = found === ti && positions.length ? streak + 1 : 0;
    score += 1 + streak * 2 + (wordStart ? 3 : 0);
    positions.push(found);
    ti = found + 1;
  }
  if (t.startsWith(q)) score += 10;
  if (t.includes(q)) score += 5;
  score -= (positions[positions.length - 1]! - positions[0]!) * 0.05; // prefer compact matches
  return { score, positions };
}

function fuzzyMatchLoose(q: string, t: string): FuzzyMatch | null {
  let ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    ti = found + 1;
  }
  return { score: t.includes(q) ? 8 : 1, positions: [] };
}

/** Wraps matched characters of `text` in `<mark>` after HTML-escaping everything. */
export function highlightHtml(text: string, positions: number[]): string {
  const set = new Set(positions);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = escapeHtml(text[i]!);
    out += set.has(i) ? `<mark>${ch}</mark>` : ch;
  }
  return out;
}
