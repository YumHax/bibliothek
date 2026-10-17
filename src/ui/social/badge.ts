import { tierInfo, tierName } from '@/social/tiers';
import type { PersonId, TierId } from '@/social/types';
import { html, type Html } from '../panel/html';

/*
 * The one tier badge (docs/ui.md "Social pieces"), the same in the conversation, the People book, the phone, the
 * hover caption and the banners: a pastille edged in the tier's colour, a ring of it before the word, the word in
 * neutral ink (the colour never carries the text, so every tier reads at 4.5:1 or better). A light person (a clerk, a
 * stallholder) reads on the short ladder (`tiers.tierName`: New face, Regular, Old friend).
 */

/** The badge for `tier` (`person` for the word their depth reads it by); `paper`: on a cream page (dark ink). */
export function tierBadge(tier: TierId, person?: PersonId, options: { paper?: boolean; small?: boolean } = {}): Html {
  const t = tierInfo(tier);
  const kind = `${options.paper ? ' social-badge--paper' : ''}${options.small ? ' social-badge--small' : ''}`;
  return html`<span class="social-badge${kind}" style="--tier:${t.colour}"><i class="social-badge__ring" aria-hidden="true"></i><span class="social-badge__word">${tierName(tier, person)}</span></span>`;
}
