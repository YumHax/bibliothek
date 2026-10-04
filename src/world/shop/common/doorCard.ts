import type { ShopKind } from '../../street/streetPlan';
import { SHOP_HOURS, clockTime } from '../../street/shops/shopHours';
import { HAND, POSTER, setLines } from './lettering';

/*
 * The OPEN / CLOSED card on a shop's door, painted one way for both sides of the glass: the card hung inside
 * (`common/OpenSign`, read from the shop) and the same card seen from the pavement (`street/shopfronts`' atlas).
 * The OPEN side in the shop's accent, the CLOSED side in red with the shop's own hours (`SHOP_HOURS`).
 */

export interface DoorCardLook {
  /** The card and the OPEN side's ink (the shop's accent), the CLOSED side's ink. */
  card: string;
  ink: string;
  closedInk: string;
}

/** A cream card, the closed side's dark red. */
export const DOOR_CARD_LOOK = { card: '#f4eedc', closedInk: '#9a2a22' } as const;

/** The CLOSED side's small print: the hours the shop keeps, or nothing for a shop that never shuts. */
function hoursNote(kind: ShopKind): string {
  const hours = SHOP_HOURS[kind];
  return hours ? `open ${clockTime(hours.open)} – ${clockTime(hours.close % 24)}` : '';
}

/** Paints one side of `kind`'s door card into (0, 0, w, h) of `ctx`: OPEN ("come in!") or SORRY, WE'RE CLOSED and the hours. */
export function paintDoorCard(ctx: CanvasRenderingContext2D, w: number, h: number, side: 'open' | 'closed', kind: ShopKind, look: DoorCardLook): void {
  const open = side === 'open';
  const ink = open ? look.ink : look.closedInk;
  ctx.fillStyle = look.card;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.lineWidth = h * 0.04;
  ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  const lines = open ? ['OPEN', 'come in!'] : ['SORRY', "WE'RE CLOSED", hoursNote(kind)];
  setLines(ctx, { lines: lines.filter(Boolean), x: w * 0.08, y: h * 0.12, w: w * 0.84, h: h * 0.76, family: open ? POSTER : HAND, color: ink, weight: '800', firstScale: lines.length > 2 ? 1.2 : 2.2 });
}
