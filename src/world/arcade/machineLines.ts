/** The hover lines and hints every paid machine shares (a machine's own lines are its attract and playing labels). */

import { actionKeyLabel } from '@/ui/keys';
import { formatCoins } from '@/text/money';

export { TAKEN_LINE } from './Station';

export const OUT_OF_ORDER_LINE = 'OUT OF ORDER. Sorry. — the management';

/** Key names follow the bindings and the layout (`ui/keys`), so these are built when shown. */
export function initialsLine(): string {
  return `Hall of fame · sign it · ${actionKeyLabel('walkAway')} walks away`;
}

export function walkAwayLine(): string {
  return `Playing · ${actionKeyLabel('walkAway')} or a click walks away (the play is lost)`;
}

/** The end card's label: another go, and what it costs. */
export function againLine(price: string): string {
  return `Game over · ${actionKeyLabel('fire')} or a click plays again (${price}) · ${actionKeyLabel('walkAway')} walks away`;
}

/** "free play", "1 coin", "2 coins". */
export function priceText(cost: number): string {
  return cost === 0 ? 'free play' : `${formatCoins(cost)}`;
}
