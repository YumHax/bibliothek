import { formatMoney } from '@/text/money';

/**
 * The coin and ticket chips on a reward banner and a slip: the amount with its sign and the icon, the spent ones
 * greyed (`.notice-chip--spent`, notices.css). Null for no amount.
 */
function moneyChip(amount: number | undefined, kind: 'coin' | 'ticket'): HTMLSpanElement | null {
  if (!amount) return null;
  const el = document.createElement('span');
  el.className = `notice-chip notice-chip--${kind}${amount < 0 ? ' notice-chip--spent' : ''}`;
  const icon = document.createElement('span');
  icon.className = `notice-chip__icon notice-chip__icon--${kind}`;
  el.append(icon, formatMoney(amount, kind, { sign: true }));
  return el;
}

/** The chips row for `coins` and `tickets`, or null when there is nothing to show. */
export function moneyChips(coins: number | undefined, tickets: number | undefined, className: string): HTMLDivElement | null {
  const chips = [moneyChip(coins, 'coin'), moneyChip(tickets, 'ticket')].filter((c): c is HTMLSpanElement => c !== null);
  if (!chips.length) return null;
  const row = document.createElement('div');
  row.className = className;
  row.append(...chips);
  return row;
}
