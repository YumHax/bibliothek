/*
 * Numbers and counts as the player reads them: grouped digits, a true minus sign, the noun pluralised, the
 * ordinal's suffix. One place, so "1,250 coins", "1 game" and "21st" read the same all over (docs/consistency-audit.md
 * §3.9-D1/D2: a hundred hand-made "N coins" once disagreed on zero, on one and on grouping).
 */

/** `1250` → "1,250"; `-5` → "−5"; with `sign`, `12` → "+12" (0 stays "0"). */
export function formatNumber(n: number, options: { sign?: boolean } = {}): string {
  const digits = Math.abs(Math.round(n)).toLocaleString('en-US');
  if (n < 0) return `−${digits}`;
  return options.sign && n > 0 ? `+${digits}` : digits;
}

/** The noun for `n` of something: `plural(1, 'game')` → "game", `plural(0, 'game')` → "games", `plural(2, 'box', 'boxes')`. */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return Math.abs(Math.round(n)) === 1 ? word : pluralWord;
}

/** `formatCount(3, 'game')` → "3 games", `(1, 'game')` → "1 game", `(0, 'game')` → "0 games"; with `sign`, "+3 games". */
export function formatCount(n: number, word: string, options: { sign?: boolean; plural?: string } = {}): string {
  return `${formatNumber(n, { sign: options.sign })} ${plural(n, word, options.plural)}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st" (upper-case it for a board). */
export function ordinal(n: number): string {
  const tens = Math.abs(n) % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][Math.abs(n) % 10] ?? 'th');
  return `${n}${suffix}`;
}
