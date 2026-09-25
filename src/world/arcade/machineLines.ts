/** The hover lines and hints every paid machine shares (a machine's own lines are its attract and playing labels). */

import { actionKeyLabel } from '@/ui/keys';

export { TAKEN_LINE } from './Station';

export const OUT_OF_ORDER_LINE = 'OUT OF ORDER. Sorry. — the management';

/** Key names follow the bindings and the layout (`ui/keys`), so these are built when shown. */
export function initialsLine(): string {
  return `Sign the hall of fame · ${actionKeyLabel('walkAway')} to walk away`;
}

export function walkAwayLine(): string {
  return `Press ${actionKeyLabel('walkAway')} or click to walk away (the play is lost)`;
}

/** The end card's label: another go, and what it costs. */
export function againLine(price: string): string {
  return `${actionKeyLabel('fire')} or click to play again (${price}) · ${actionKeyLabel('walkAway')} to walk away`;
}

/** "free play", "1 coin", "2 coins". */
export function priceText(cost: number): string {
  return cost === 0 ? 'free play' : `${cost} coin${cost > 1 ? 's' : ''}`;
}
