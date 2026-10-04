/**
 * How amounts of money read everywhere (the wallet chip, the pause menu, the reward chips): grouped
 * digits, a true minus sign, the unit pluralised. One place, so "1,250" and "−5" look the same all over.
 */
type MoneyUnit = 'coin' | 'ticket';

/** `1250` → "1,250"; `-5` → "−5" (with `sign`, `12` → "+12"). */
export function formatCount(n: number, sign = false): string {
  const digits = Math.abs(Math.round(n)).toLocaleString('en-US');
  if (n < 0) return `−${digits}`;
  return sign && n > 0 ? `+${digits}` : digits;
}

/** `12` → "12 coins", `1` → "1 coin"; with `sign`, "+12 coins" / "−5 coins". */
export function formatCoins(n: number, options: { sign?: boolean; unit?: MoneyUnit } = {}): string {
  const unit = options.unit ?? 'coin';
  const one = Math.abs(Math.round(n)) === 1;
  return `${formatCount(n, options.sign)} ${unit}${one ? '' : 's'}`;
}
