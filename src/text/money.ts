/*
 * Amounts of money as the player reads them (the wallet chip, the pause menu, the reward chips, every price line):
 * `formatCount`'s digits with the unit pluralised, so "1,250 coins", "1 coin", "−5 coins" and "+12 tickets" look the
 * same in a panel, a speech bubble and a notice.
 */
import { formatCount } from './count';

type MoneyUnit = 'coin' | 'ticket';

/** `12` → "12 coins", `1` → "1 coin", `0` → "0 coins"; with `sign`, "+12 coins" / "−5 coins". */
export function formatCoins(n: number, options: { sign?: boolean } = {}): string {
  return formatCount(n, 'coin', options);
}

/** `12` → "12 tickets", `1` → "1 ticket"; with `sign`, "+12 tickets". */
export function formatTickets(n: number, options: { sign?: boolean } = {}): string {
  return formatCount(n, 'ticket', options);
}

/** `formatCoins` or `formatTickets` by `unit` (a reward of either kind). */
export function formatMoney(n: number, unit: MoneyUnit, options: { sign?: boolean } = {}): string {
  return formatCount(n, unit, options);
}
